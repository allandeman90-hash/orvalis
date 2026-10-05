import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetManager, type AssetHandle, httpFetchBytes } from '../../src/assets';

/**
 * P1.0 prerequisite: the asset manager against a REAL HTTP server.
 * Vite's own dev server (the engine's vite.config.ts, started from the engine
 * folder) serves engine/public, and the manager downloads through the real
 * fetch() — nothing is simulated.
 */
let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
  server = await createServer({ logLevel: 'silent', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Vite dev server did not report a local URL');
  baseUrl = url;
});

afterAll(async () => {
  await server.close();
});

function setup() {
  const assets = new AssetManager(httpFetchBytes(baseUrl));
  const uploads: string[] = [];
  const Text = assets.registerLoader('text', {
    decode: (bytes: ArrayBuffer) => new TextDecoder().decode(bytes),
    upload: (text: string, url: string) => {
      uploads.push(url);
      return text;
    },
  });
  return { assets, uploads, Text };
}

/** Waits (real time) until the asset leaves the network/decoding stages. */
async function untilSettled(assets: AssetManager, handle: AssetHandle<unknown>): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (assets.state(handle) === 'requested' || assets.state(handle) === 'downloading') {
    if (Date.now() > deadline) throw new Error('asset still downloading after 10 s');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('AssetManager over real HTTP (Vite dev server)', () => {
  it('request → download → decode → pump() → ready', async () => {
    const { assets, uploads, Text } = setup();
    const h = assets.request(Text, 'assets/selftest/hello.txt');
    expect(assets.state(h)).toBe('downloading');
    await untilSettled(assets, h);
    expect(assets.state(h)).toBe('decoded');
    expect(assets.get(h)).toBeUndefined();
    expect(assets.pump()).toBe(1);
    expect(assets.state(h)).toBe('ready');
    expect(assets.get(h)).toBe('orvalis-asset-ok\n');
    expect(uploads).toEqual(['assets/selftest/hello.txt']);
  });

  it('a missing file becomes a failed asset with the HTTP status, never fake content', async () => {
    const { assets, Text } = setup();
    const h = assets.request(Text, 'assets/selftest/does-not-exist.txt');
    await untilSettled(assets, h);
    expect(assets.state(h)).toBe('failed');
    expect(assets.error(h)?.message).toMatch(/HTTP 404/);
    expect(assets.pump()).toBe(0);
    expect(assets.get(h)).toBeUndefined();
  });

  it('an HTML page answered with status 200 is rejected (page-fallback guard)', async () => {
    const { assets, Text } = setup();
    // index.html really is answered with 200 + text/html: the same shape as a
    // host that replaces a missing file with its index page.
    const h = assets.request(Text, 'index.html');
    await untilSettled(assets, h);
    expect(assets.state(h)).toBe('failed');
    expect(assets.error(h)?.message).toMatch(/HTTP 200 .* HTML page/);
  });

  it('two requests for the same file share one download', async () => {
    const { assets, uploads, Text } = setup();
    const a = assets.request(Text, 'assets/selftest/hello.txt');
    const b = assets.request(Text, 'assets/selftest/hello.txt');
    expect(a).toBe(b);
    await untilSettled(assets, a);
    assets.pump();
    expect(uploads).toHaveLength(1);
    expect(assets.get(b)).toBe('orvalis-asset-ok\n');
  });
});
