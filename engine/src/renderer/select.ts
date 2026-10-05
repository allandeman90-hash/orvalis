import { BACKEND_DISPLAY_NAME, type BackendKind } from './backend';

/** What the user (or a test) asked for. */
export type RendererPreference = 'auto' | 'webgpu' | 'webgl2';

export interface RendererRequest {
  readonly preference: RendererPreference;
  /** When true, a WebGPU failure is reported instead of falling back to WebGL2. */
  readonly forceWebGPU: boolean;
  /** Set when the URL carried a `renderer` value we do not know. */
  readonly ignoredValue?: string;
}

/**
 * Reads the request from a URL query string:
 *   ?renderer=webgpu | ?renderer=webgl2   manual choice (WebGPU still falls back if it fails)
 *   ?forceWebGPU=true                     WebGPU or a visible failure, no fallback
 * Anything else means automatic selection.
 */
export function parseRendererRequest(search: string): RendererRequest {
  const params = new URLSearchParams(search);
  const forceRaw = (params.get('forceWebGPU') ?? '').toLowerCase();
  const forceWebGPU = forceRaw === 'true' || forceRaw === '1';
  if (forceWebGPU) return { preference: 'webgpu', forceWebGPU: true };
  const raw = params.get('renderer');
  if (raw === null || raw === '') return { preference: 'auto', forceWebGPU: false };
  const value = raw.toLowerCase();
  if (value === 'webgpu' || value === 'webgl2' || value === 'auto') return { preference: value, forceWebGPU: false };
  return { preference: 'auto', forceWebGPU: false, ignoredValue: raw };
}

type RealBackendKind = Exclude<BackendKind, 'null'>;

/** Backends to try, in order. WebGPU first unless WebGL2 was requested. */
export function backendOrder(request: RendererRequest): RealBackendKind[] {
  if (request.forceWebGPU) return ['webgpu'];
  if (request.preference === 'webgl2') return ['webgl2'];
  return ['webgpu', 'webgl2'];
}

export interface BackendAttempt {
  readonly kind: RealBackendKind;
  readonly ok: boolean;
  /** Why it failed; absent on success. */
  readonly reason?: string;
}

/** Thrown when no backend could be created. Carries every attempt for display. */
export class RendererUnavailableError extends Error {
  constructor(readonly attempts: readonly BackendAttempt[]) {
    super(
      'renderer: no graphics backend available — ' +
        attempts.map((a) => `${BACKEND_DISPLAY_NAME[a.kind]}: ${a.reason ?? 'unknown error'}`).join(' ; '),
    );
    this.name = 'RendererUnavailableError';
  }
}

export interface SelectionEnvironment<TCanvas, TBackend> {
  /** Canvas to hand to the next factory. */
  canvas(): TCanvas;
  /**
   * Called after a failed attempt when another backend will be tried: a canvas
   * that already handed out one kind of context cannot provide another, so the
   * host must supply a fresh one.
   */
  resetCanvas(): void;
  /** Receives one clear line per failed attempt and per fallback. */
  log(message: string): void;
  readonly factories: Readonly<Record<RealBackendKind, (canvas: TCanvas) => Promise<TBackend>>>;
}

export interface SelectionResult<TBackend> {
  readonly backend: TBackend;
  readonly kind: RealBackendKind;
  readonly attempts: readonly BackendAttempt[];
  /** True when the backend in use is not the first one tried. */
  readonly fellBack: boolean;
}

/** Creates the first backend that works, following backendOrder(). */
export async function createRendererBackend<TCanvas, TBackend>(
  request: RendererRequest,
  env: SelectionEnvironment<TCanvas, TBackend>,
): Promise<SelectionResult<TBackend>> {
  const order = backendOrder(request);
  const attempts: BackendAttempt[] = [];
  if (request.ignoredValue !== undefined) {
    env.log(`[renderer] unknown value renderer=${JSON.stringify(request.ignoredValue)} ignored, using automatic selection`);
  }
  for (let i = 0; i < order.length; i++) {
    const kind = order[i]!;
    try {
      const backend = await env.factories[kind](env.canvas());
      attempts.push({ kind, ok: true });
      return { backend, kind, attempts, fellBack: i > 0 };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      attempts.push({ kind, ok: false, reason });
      const next = order[i + 1];
      if (next) {
        env.log(`[renderer] ${BACKEND_DISPLAY_NAME[kind]} unavailable (${reason}) — falling back to ${BACKEND_DISPLAY_NAME[next]}`);
        env.resetCanvas();
      } else {
        env.log(
          `[renderer] ${BACKEND_DISPLAY_NAME[kind]} unavailable (${reason})` +
            (request.forceWebGPU ? ' — forceWebGPU is set, no fallback' : ' — no backend left to try'),
        );
      }
    }
  }
  throw new RendererUnavailableError(attempts);
}
