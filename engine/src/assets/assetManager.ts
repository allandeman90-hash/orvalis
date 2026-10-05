/**
 * Asset manager (spec §278–§279): world elements hold handles and poll their
 * state; rendering code never awaits a network request.
 *
 * Lifecycle, as listed in spec §279:
 *   Unrequested → Requested → Downloading → Decoded → GPUUploading → Ready → Evictable
 * plus `Failed`, an engineering addition (the spec has no error state): a
 * failed asset keeps its error so the cause can be shown instead of hanging.
 */
export type AssetState =
  | 'unrequested'
  | 'requested'
  | 'downloading'
  | 'decoded'
  | 'gpu-uploading'
  | 'ready'
  | 'evictable'
  | 'failed';

declare const assetBrand: unique symbol;
/** Opaque handle to an asset of resource type T. */
export type AssetHandle<T> = number & { readonly [assetBrand]: T };

/**
 * How one kind of asset is loaded. `TDecoded` is the CPU-side result of
 * decoding; `TResource` is what users finally get (often GPU handles).
 */
export interface AssetLoader<TDecoded, TResource> {
  /** CPU work, may be asynchronous (parsing, decompression…). */
  decode(bytes: ArrayBuffer, url: string): TDecoded | Promise<TDecoded>;
  /** Final step, run synchronously on the main loop by pump() (GPU uploads). */
  upload(decoded: TDecoded, url: string): TResource;
  /** Frees what upload() created. Called when the asset is evicted. */
  dispose?(resource: TResource): void;
}

/** Token identifying a registered loader; carries the resource type. */
export interface AssetType<TResource> {
  readonly name: string;
  readonly __resource?: TResource;
}

export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

interface Entry {
  readonly handle: number;
  readonly typeName: string;
  readonly url: string;
  state: AssetState;
  refCount: number;
  decoded?: unknown;
  resource?: unknown;
  error?: Error;
}

export interface AssetCounts {
  readonly total: number;
  readonly byState: Readonly<Record<AssetState, number>>;
}

export class AssetManager {
  private nextHandle = 1;
  private readonly loaders = new Map<string, AssetLoader<unknown, unknown>>();
  private readonly entries = new Map<number, Entry>();
  private readonly byKey = new Map<string, Entry>();
  /** Decoded assets waiting for their GPU upload, in arrival order. */
  private readonly uploadQueue: Entry[] = [];

  constructor(private readonly fetchBytes: FetchBytes) {}

  registerLoader<TDecoded, TResource>(name: string, loader: AssetLoader<TDecoded, TResource>): AssetType<TResource> {
    if (this.loaders.has(name)) throw new Error(`assets: loader "${name}" is already registered`);
    this.loaders.set(name, loader);
    return { name };
  }

  /**
   * Asks for an asset and returns its handle immediately. Asking again for the
   * same type + url returns the same handle and adds a reference; every
   * request() must be matched by one release().
   */
  request<T>(type: AssetType<T>, url: string): AssetHandle<T> {
    if (!this.loaders.has(type.name)) throw new Error(`assets: no loader registered for "${type.name}"`);
    const key = `${type.name}\n${url}`;
    let entry = this.byKey.get(key);
    if (entry) {
      entry.refCount++;
      // Still in memory: an evictable asset is simply taken back into use.
      if (entry.state === 'evictable') entry.state = 'ready';
      return entry.handle as AssetHandle<T>;
    }
    entry = { handle: this.nextHandle++, typeName: type.name, url, state: 'requested', refCount: 1 };
    this.entries.set(entry.handle, entry);
    this.byKey.set(key, entry);
    void this.load(entry);
    return entry.handle as AssetHandle<T>;
  }

  /** State of a handle; 'unrequested' for a handle that is unknown or already evicted. */
  state(handle: AssetHandle<unknown>): AssetState {
    return this.entries.get(handle)?.state ?? 'unrequested';
  }

  /** The resource when the asset is ready (or evictable but still in memory), otherwise undefined. */
  get<T>(handle: AssetHandle<T>): T | undefined {
    const entry = this.entries.get(handle);
    if (!entry || (entry.state !== 'ready' && entry.state !== 'evictable')) return undefined;
    return entry.resource as T;
  }

  /** Why a 'failed' asset failed; undefined otherwise. */
  error(handle: AssetHandle<unknown>): Error | undefined {
    return this.entries.get(handle)?.error;
  }

  /**
   * Drops one reference. At zero the asset becomes evictable: it stays usable
   * in memory until evict() removes it. Assets still loading are cancelled.
   */
  release(handle: AssetHandle<unknown>): void {
    const entry = this.entries.get(handle);
    if (!entry) throw new Error(`assets: release of unknown or evicted handle ${handle}`);
    if (entry.refCount <= 0) throw new Error(`assets: handle ${handle} (${entry.url}) released more times than requested`);
    entry.refCount--;
    if (entry.refCount > 0) return;
    if (entry.state === 'ready') entry.state = 'evictable';
    else if (entry.state === 'failed') this.forget(entry);
    else if (entry.state === 'decoded') {
      // Decoded but never uploaded: nothing on the GPU to free.
      this.uploadQueue.splice(this.uploadQueue.indexOf(entry), 1);
      this.forget(entry);
    }
    // requested / downloading: load() notices refCount 0 when it resumes and drops the result.
  }

  /**
   * Runs pending GPU uploads, at most `maxUploads` per call, so a burst of
   * finished downloads cannot stall a frame. Call once per frame.
   * Returns the number of uploads performed.
   */
  pump(maxUploads = Number.POSITIVE_INFINITY): number {
    let done = 0;
    while (done < maxUploads && this.uploadQueue.length > 0) {
      const entry = this.uploadQueue.shift()!;
      const loader = this.loaders.get(entry.typeName)!;
      entry.state = 'gpu-uploading';
      try {
        entry.resource = loader.upload(entry.decoded, entry.url);
        entry.state = 'ready';
      } catch (e) {
        this.fail(entry, e);
      }
      entry.decoded = undefined; // the CPU copy is no longer needed
      done++;
    }
    return done;
  }

  /** Frees every evictable asset. Returns how many were removed. */
  evict(): number {
    let removed = 0;
    for (const entry of [...this.entries.values()]) {
      if (entry.state !== 'evictable') continue;
      this.loaders.get(entry.typeName)!.dispose?.(entry.resource);
      this.forget(entry);
      removed++;
    }
    return removed;
  }

  counts(): AssetCounts {
    const byState: Record<AssetState, number> = {
      unrequested: 0, requested: 0, downloading: 0, decoded: 0, 'gpu-uploading': 0, ready: 0, evictable: 0, failed: 0,
    };
    for (const e of this.entries.values()) byState[e.state]++;
    return { total: this.entries.size, byState };
  }

  private async load(entry: Entry): Promise<void> {
    const loader = this.loaders.get(entry.typeName)!;
    try {
      entry.state = 'downloading';
      const bytes = await this.fetchBytes(entry.url);
      if (this.cancelled(entry)) return;
      const decoded = await loader.decode(bytes, entry.url);
      if (this.cancelled(entry)) return;
      entry.decoded = decoded;
      entry.state = 'decoded';
      this.uploadQueue.push(entry);
    } catch (e) {
      if (this.cancelled(entry)) return;
      this.fail(entry, e);
    }
  }

  /** True when every reference was released while the asset was still loading. */
  private cancelled(entry: Entry): boolean {
    if (entry.refCount > 0) return false;
    this.forget(entry);
    return true;
  }

  private fail(entry: Entry, cause: unknown): void {
    entry.state = 'failed';
    entry.error = cause instanceof Error ? cause : new Error(String(cause));
    entry.decoded = undefined;
  }

  private forget(entry: Entry): void {
    this.entries.delete(entry.handle);
    this.byKey.delete(`${entry.typeName}\n${entry.url}`);
  }
}

/**
 * FetchBytes backed by fetch(). Anything that is not the requested file becomes
 * a rejection, so the asset ends up `failed` instead of decoding garbage:
 * - HTTP errors (404, 500…);
 * - an HTML page answered in place of the file. Dev servers and many static
 *   hosts reply to a missing path with their index page and status 200
 *   ("SPA fallback"); engine assets are never HTML, so that is always an error.
 */
export function httpFetchBytes(baseUrl = ''): FetchBytes {
  return async (url) => {
    // Asking for binary data keeps Vite's dev server from applying its HTML fallback.
    const response = await fetch(baseUrl + url, { headers: { Accept: 'application/octet-stream' } });
    if (!response.ok) throw new Error(`assets: HTTP ${response.status} for ${url}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().startsWith('text/html')) {
      throw new Error(`assets: HTTP ${response.status} for ${url} but the server answered an HTML page (missing file replaced by a page fallback?)`);
    }
    return response.arrayBuffer();
  };
}
