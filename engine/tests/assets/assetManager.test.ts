import { describe, expect, it } from 'vitest';
import { AssetManager } from '../../src/assets';

/** Fetch whose requests are completed by hand, to observe every intermediate state. */
function manualFetch() {
  const pending = new Map<string, { resolve(b: ArrayBuffer): void; reject(e: unknown): void }>();
  const calls: string[] = [];
  const fetchBytes = (url: string) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      calls.push(url);
      pending.set(url, { resolve, reject });
    });
  return {
    fetchBytes,
    calls,
    deliver: (url: string, text: string) => pending.get(url)!.resolve(new TextEncoder().encode(text).buffer),
    fail: (url: string, error: unknown) => pending.get(url)!.reject(error),
  };
}

/** Lets pending promise continuations run. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup() {
  const net = manualFetch();
  const assets = new AssetManager(net.fetchBytes);
  const log: string[] = [];
  const Text = assets.registerLoader('text', {
    decode: (bytes: ArrayBuffer) => new TextDecoder().decode(bytes),
    upload: (decoded: string, url: string) => {
      log.push(`upload ${url}`);
      return { text: decoded.toUpperCase() };
    },
    dispose: (r: { text: string }) => void log.push(`dispose ${r.text}`),
  });
  return { net, assets, log, Text };
}

describe('AssetManager lifecycle (spec §279)', () => {
  it('walks Unrequested → Downloading → Decoded → Ready, and get() only returns when ready', async () => {
    const { net, assets, Text, log } = setup();
    const h = assets.request(Text, 'a.txt');
    expect(assets.state(h)).toBe('downloading'); // 'requested' is left as soon as the fetch starts
    expect(assets.get(h)).toBeUndefined();
    net.deliver('a.txt', 'hello');
    await settle();
    expect(assets.state(h)).toBe('decoded');
    expect(assets.get(h)).toBeUndefined(); // decoded is not usable yet: the GPU upload is pending
    expect(log).toEqual([]);
    expect(assets.pump()).toBe(1);
    expect(assets.state(h)).toBe('ready');
    expect(assets.get(h)).toEqual({ text: 'HELLO' });
    expect(log).toEqual(['upload a.txt']);
  });

  it('an unknown handle is unrequested', () => {
    const { assets } = setup();
    expect(assets.state(999 as never)).toBe('unrequested');
    expect(assets.get(999 as never)).toBeUndefined();
  });

  it('release makes a ready asset evictable; it stays usable until evict()', async () => {
    const { net, assets, Text, log } = setup();
    const h = assets.request(Text, 'a.txt');
    net.deliver('a.txt', 'x');
    await settle();
    assets.pump();
    assets.release(h);
    expect(assets.state(h)).toBe('evictable');
    expect(assets.get(h)).toEqual({ text: 'X' });
    expect(assets.evict()).toBe(1);
    expect(log).toEqual(['upload a.txt', 'dispose X']);
    expect(assets.state(h)).toBe('unrequested');
    expect(assets.get(h)).toBeUndefined();
    expect(assets.counts().total).toBe(0);
  });

  it('requesting an evictable asset again reuses it without a new download', async () => {
    const { net, assets, Text, log } = setup();
    const h = assets.request(Text, 'a.txt');
    net.deliver('a.txt', 'x');
    await settle();
    assets.pump();
    assets.release(h);
    const again = assets.request(Text, 'a.txt');
    expect(again).toBe(h);
    expect(assets.state(h)).toBe('ready');
    expect(assets.evict()).toBe(0);
    expect(net.calls).toEqual(['a.txt']);
    expect(log).toEqual(['upload a.txt']);
  });

  it('after eviction a new request downloads again under a new handle', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'a.txt');
    net.deliver('a.txt', 'x');
    await settle();
    assets.pump();
    assets.release(h);
    assets.evict();
    const h2 = assets.request(Text, 'a.txt');
    expect(h2).not.toBe(h);
    expect(net.calls).toEqual(['a.txt', 'a.txt']);
    expect(assets.state(h)).toBe('unrequested'); // the stale handle never points at the new asset
  });
});

describe('AssetManager sharing', () => {
  it('same type + url gives one handle, one download, and needs every release', async () => {
    const { net, assets, Text } = setup();
    const a = assets.request(Text, 'a.txt');
    const b = assets.request(Text, 'a.txt');
    expect(a).toBe(b);
    expect(net.calls).toEqual(['a.txt']);
    net.deliver('a.txt', 'x');
    await settle();
    assets.pump();
    assets.release(a);
    expect(assets.state(a)).toBe('ready'); // still referenced once
    assets.release(b);
    expect(assets.state(a)).toBe('evictable');
  });

  it('different urls or different types are separate assets', () => {
    const { net, assets, Text } = setup();
    const Other = assets.registerLoader('other', { decode: (b: ArrayBuffer) => b.byteLength, upload: (n: number) => n });
    const a = assets.request(Text, 'a.txt');
    const b = assets.request(Text, 'b.txt');
    const c = assets.request(Other, 'a.txt');
    expect(new Set<number>([a, b, c]).size).toBe(3);
    expect(net.calls).toEqual(['a.txt', 'b.txt', 'a.txt']);
  });

  it('releasing too many times or an unknown handle is a reported bug', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'a.txt');
    net.deliver('a.txt', 'x');
    await settle();
    assets.pump();
    assets.release(h);
    expect(() => assets.release(h)).toThrow(/more times than requested/);
    expect(() => assets.release(12345 as never)).toThrow(/unknown or evicted/);
  });

  it('rejects an unregistered type and a duplicate loader name', () => {
    const { assets } = setup();
    expect(() => assets.request({ name: 'nope' }, 'a')).toThrow(/no loader registered/);
    expect(() => assets.registerLoader('text', { decode: () => 0, upload: () => 0 })).toThrow(/already registered/);
  });
});

describe('AssetManager upload budget', () => {
  it('pump(n) uploads at most n assets per call, in arrival order', async () => {
    const { net, assets, Text, log } = setup();
    const hs = ['1', '2', '3'].map((n) => assets.request(Text, n));
    for (const n of ['2', '1', '3']) {
      net.deliver(n, n);
      await settle();
    }
    expect(assets.pump(2)).toBe(2);
    expect(log).toEqual(['upload 2', 'upload 1']); // order of decoding, not of request
    expect(hs.map((h) => assets.state(h))).toEqual(['ready', 'ready', 'decoded']);
    expect(assets.pump(2)).toBe(1);
    expect(assets.pump(2)).toBe(0);
  });

  it('pump(0) uploads nothing', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'a');
    net.deliver('a', 'x');
    await settle();
    expect(assets.pump(0)).toBe(0);
    expect(assets.state(h)).toBe('decoded');
  });
});

describe('AssetManager failures', () => {
  it('a failed download is reported, not left hanging', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'missing.txt');
    net.fail('missing.txt', new Error('HTTP 404'));
    await settle();
    expect(assets.state(h)).toBe('failed');
    expect(assets.error(h)?.message).toBe('HTTP 404');
    expect(assets.get(h)).toBeUndefined();
    expect(assets.pump()).toBe(0);
  });

  it('decode and upload errors are caught too, and do not block other assets', async () => {
    const net = manualFetch();
    const assets = new AssetManager(net.fetchBytes);
    const Picky = assets.registerLoader('picky', {
      decode: (bytes: ArrayBuffer) => {
        const text = new TextDecoder().decode(bytes);
        if (text === 'bad-decode') throw new Error('cannot decode');
        return text;
      },
      upload: (text: string) => {
        if (text === 'bad-upload') throw 'gpu refused'; // non-Error throwables are wrapped
        return text;
      },
    });
    const a = assets.request(Picky, 'a'), b = assets.request(Picky, 'b'), c = assets.request(Picky, 'c');
    net.deliver('a', 'bad-decode');
    net.deliver('b', 'bad-upload');
    net.deliver('c', 'fine');
    await settle();
    expect(assets.state(a)).toBe('failed');
    expect(assets.error(a)?.message).toBe('cannot decode');
    expect(assets.pump()).toBe(2);
    expect(assets.state(b)).toBe('failed');
    expect(assets.error(b)?.message).toBe('gpu refused');
    expect(assets.state(c)).toBe('ready');
    expect(assets.get(c)).toBe('fine');
  });

  it('releasing a failed asset forgets it, so a later request retries', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'a.txt');
    net.fail('a.txt', new Error('offline'));
    await settle();
    assets.release(h);
    expect(assets.counts().total).toBe(0);
    const retry = assets.request(Text, 'a.txt');
    expect(retry).not.toBe(h);
    expect(net.calls).toEqual(['a.txt', 'a.txt']);
  });
});

describe('AssetManager cancellation', () => {
  it('released while downloading: the result is dropped, nothing is uploaded', async () => {
    const { net, assets, Text, log } = setup();
    const h = assets.request(Text, 'a.txt');
    assets.release(h);
    net.deliver('a.txt', 'x');
    await settle();
    expect(assets.pump()).toBe(0);
    expect(assets.state(h)).toBe('unrequested');
    expect(assets.counts().total).toBe(0);
    expect(log).toEqual([]);
  });

  it('released while downloading and the download then fails: no stray failed entry', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'a.txt');
    assets.release(h);
    net.fail('a.txt', new Error('offline'));
    await settle();
    expect(assets.counts().total).toBe(0);
  });

  it('released after decoding but before upload: never uploaded, never disposed', async () => {
    const { net, assets, Text, log } = setup();
    const h = assets.request(Text, 'a.txt');
    net.deliver('a.txt', 'x');
    await settle();
    assets.release(h);
    expect(assets.pump()).toBe(0);
    expect(log).toEqual([]);
    expect(assets.counts().total).toBe(0);
  });

  it('re-requested during the download: the single download serves the new reference', async () => {
    const { net, assets, Text } = setup();
    const h = assets.request(Text, 'a.txt');
    assets.release(h);
    const again = assets.request(Text, 'a.txt'); // before the fetch completed
    expect(again).toBe(h);
    net.deliver('a.txt', 'x');
    await settle();
    assets.pump();
    expect(assets.get(again)).toEqual({ text: 'X' });
    expect(net.calls).toEqual(['a.txt']);
  });
});

describe('AssetManager counts', () => {
  it('reports how many assets are in each state', async () => {
    const { net, assets, Text } = setup();
    assets.request(Text, 'loading');
    const ready = assets.request(Text, 'ready');
    const idle = assets.request(Text, 'idle');
    assets.request(Text, 'broken');
    net.deliver('ready', 'r');
    net.deliver('idle', 'i');
    net.fail('broken', new Error('x'));
    await settle();
    assets.pump();
    assets.release(idle);
    const { total, byState } = assets.counts();
    expect(total).toBe(4);
    expect(byState).toMatchObject({ downloading: 1, ready: 1, evictable: 1, failed: 1, decoded: 0 });
    expect(assets.get(ready)).toEqual({ text: 'R' });
  });
});
