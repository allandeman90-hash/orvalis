import { describe, expect, it } from 'vitest';
import {
  backendOrder,
  createRendererBackend,
  parseRendererRequest,
  type RendererRequest,
  RendererUnavailableError,
  type SelectionEnvironment,
} from '../../src/renderer';

describe('parseRendererRequest', () => {
  it('defaults to automatic selection', () => {
    for (const q of ['', '?', '?foo=bar', '?renderer=', '?renderer=auto']) {
      expect(parseRendererRequest(q)).toEqual({ preference: 'auto', forceWebGPU: false });
    }
  });
  it('reads a manual choice, case-insensitively', () => {
    expect(parseRendererRequest('?renderer=webgpu')).toEqual({ preference: 'webgpu', forceWebGPU: false });
    expect(parseRendererRequest('?renderer=WebGL2')).toEqual({ preference: 'webgl2', forceWebGPU: false });
    expect(parseRendererRequest('?a=1&renderer=webgl2&b=2')).toEqual({ preference: 'webgl2', forceWebGPU: false });
  });
  it('forceWebGPU wins over any renderer value', () => {
    for (const q of ['?forceWebGPU=true', '?forceWebGPU=1', '?forceWebGPU=TRUE', '?renderer=webgl2&forceWebGPU=true']) {
      expect(parseRendererRequest(q)).toEqual({ preference: 'webgpu', forceWebGPU: true });
    }
  });
  it('forceWebGPU=false or junk does not force', () => {
    expect(parseRendererRequest('?forceWebGPU=false').forceWebGPU).toBe(false);
    expect(parseRendererRequest('?forceWebGPU=yes').forceWebGPU).toBe(false);
    expect(parseRendererRequest('?forceWebGPU').forceWebGPU).toBe(false);
  });
  it('reports an unknown renderer value instead of guessing', () => {
    expect(parseRendererRequest('?renderer=vulkan')).toEqual({ preference: 'auto', forceWebGPU: false, ignoredValue: 'vulkan' });
  });
});

describe('backendOrder', () => {
  it('prefers WebGPU and keeps WebGL2 as fallback', () => {
    expect(backendOrder({ preference: 'auto', forceWebGPU: false })).toEqual(['webgpu', 'webgl2']);
    expect(backendOrder({ preference: 'webgpu', forceWebGPU: false })).toEqual(['webgpu', 'webgl2']);
  });
  it('WebGL2 requested: WebGPU is not tried', () => {
    expect(backendOrder({ preference: 'webgl2', forceWebGPU: false })).toEqual(['webgl2']);
  });
  it('forced WebGPU has no fallback', () => {
    expect(backendOrder({ preference: 'webgpu', forceWebGPU: true })).toEqual(['webgpu']);
  });
});

/** Fake host: backends are plain strings, canvases are numbered. */
function fakeEnv(outcome: { webgpu: 'ok' | Error | string; webgl2: 'ok' | Error | string }) {
  const calls: string[] = [];
  const logs: string[] = [];
  let canvasId = 0;
  let resets = 0;
  const make = (kind: 'webgpu' | 'webgl2') => async (canvas: number) => {
    calls.push(`${kind}@canvas${canvas}`);
    const o = outcome[kind];
    if (o === 'ok') return `${kind}-backend`;
    throw o;
  };
  const env: SelectionEnvironment<number, string> = {
    canvas: () => canvasId,
    resetCanvas: () => {
      resets++;
      canvasId++;
    },
    log: (m) => logs.push(m),
    factories: { webgpu: make('webgpu'), webgl2: make('webgl2') },
  };
  return { env, calls, logs, resets: () => resets };
}

const AUTO: RendererRequest = { preference: 'auto', forceWebGPU: false };
const FORCE: RendererRequest = { preference: 'webgpu', forceWebGPU: true };

describe('createRendererBackend', () => {
  it('uses WebGPU when it works, without touching WebGL2', async () => {
    const f = fakeEnv({ webgpu: 'ok', webgl2: 'ok' });
    const r = await createRendererBackend(AUTO, f.env);
    expect(r).toEqual({ backend: 'webgpu-backend', kind: 'webgpu', fellBack: false, attempts: [{ kind: 'webgpu', ok: true }] });
    expect(f.calls).toEqual(['webgpu@canvas0']);
    expect(f.logs).toEqual([]);
    expect(f.resets()).toBe(0);
  });

  it('falls back to WebGL2 with a clear log and a fresh canvas', async () => {
    const f = fakeEnv({ webgpu: new Error('no adapter'), webgl2: 'ok' });
    const r = await createRendererBackend(AUTO, f.env);
    expect(r.kind).toBe('webgl2');
    expect(r.backend).toBe('webgl2-backend');
    expect(r.fellBack).toBe(true);
    expect(r.attempts).toEqual([
      { kind: 'webgpu', ok: false, reason: 'no adapter' },
      { kind: 'webgl2', ok: true },
    ]);
    expect(f.calls).toEqual(['webgpu@canvas0', 'webgl2@canvas1']); // fallback gets the new canvas
    expect(f.resets()).toBe(1);
    expect(f.logs).toEqual(['[renderer] WebGPU unavailable (no adapter) — falling back to WebGL2']);
  });

  it('explicit ?renderer=webgpu still falls back', async () => {
    const f = fakeEnv({ webgpu: new Error('nope'), webgl2: 'ok' });
    const r = await createRendererBackend({ preference: 'webgpu', forceWebGPU: false }, f.env);
    expect(r.kind).toBe('webgl2');
    expect(r.fellBack).toBe(true);
  });

  it('forceWebGPU: the failure is visible, WebGL2 is never tried', async () => {
    const f = fakeEnv({ webgpu: new Error('no adapter'), webgl2: 'ok' });
    const error = await createRendererBackend(FORCE, f.env).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RendererUnavailableError);
    expect((error as RendererUnavailableError).attempts).toEqual([{ kind: 'webgpu', ok: false, reason: 'no adapter' }]);
    expect((error as RendererUnavailableError).message).toContain('WebGPU: no adapter');
    expect(f.calls).toEqual(['webgpu@canvas0']);
    expect(f.resets()).toBe(0);
    expect(f.logs).toEqual(['[renderer] WebGPU unavailable (no adapter) — forceWebGPU is set, no fallback']);
  });

  it('forceWebGPU succeeds normally when WebGPU works', async () => {
    const f = fakeEnv({ webgpu: 'ok', webgl2: 'ok' });
    expect((await createRendererBackend(FORCE, f.env)).kind).toBe('webgpu');
  });

  it('WebGL2 requested: WebGPU factory is never called', async () => {
    const f = fakeEnv({ webgpu: 'ok', webgl2: 'ok' });
    const r = await createRendererBackend({ preference: 'webgl2', forceWebGPU: false }, f.env);
    expect(r).toMatchObject({ kind: 'webgl2', fellBack: false });
    expect(f.calls).toEqual(['webgl2@canvas0']);
  });

  it('everything failing reports every attempt', async () => {
    const f = fakeEnv({ webgpu: new Error('no adapter'), webgl2: new Error('no context') });
    const error = (await createRendererBackend(AUTO, f.env).catch((e: unknown) => e)) as RendererUnavailableError;
    expect(error).toBeInstanceOf(RendererUnavailableError);
    expect(error.attempts.map((a) => [a.kind, a.ok, a.reason])).toEqual([
      ['webgpu', false, 'no adapter'],
      ['webgl2', false, 'no context'],
    ]);
    expect(error.message).toContain('WebGPU: no adapter');
    expect(error.message).toContain('WebGL2: no context');
    expect(f.resets()).toBe(1); // only between attempts, not after the last one
    expect(f.logs).toHaveLength(2);
  });

  it('non-Error rejections are reported as text', async () => {
    const f = fakeEnv({ webgpu: 'plain string failure', webgl2: 'ok' });
    const r = await createRendererBackend(AUTO, f.env);
    expect(r.attempts[0]).toEqual({ kind: 'webgpu', ok: false, reason: 'plain string failure' });
  });

  it('an unknown renderer value is logged', async () => {
    const f = fakeEnv({ webgpu: 'ok', webgl2: 'ok' });
    await createRendererBackend(parseRendererRequest('?renderer=vulkan'), f.env);
    expect(f.logs).toEqual(['[renderer] unknown value renderer="vulkan" ignored, using automatic selection']);
  });
});
