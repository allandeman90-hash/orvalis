/**
 * Minimal ECS (spec §276: game logic reads typed components; the network layer
 * will later map components to replication schemas).
 *
 * - Entity: opaque numeric handle = slot index + generation, so a stale handle
 *   to a destroyed entity can never alias the entity that reuses its slot.
 * - Component: typed token created by defineComponent<T>(); data lives in one
 *   store per component type.
 * - Query: iterate the entities owning every requested component.
 */

/** Opaque entity handle. Do not do arithmetic on it. */
export type Entity = number & { readonly __entity: unique symbol };

const INDEX_BITS = 20;
const INDEX_LIMIT = 2 ** INDEX_BITS; // 1 048 576 live entities
const GENERATION_LIMIT = 2 ** 32;

export function entityIndex(e: Entity): number {
  return e % INDEX_LIMIT;
}

export function entityGeneration(e: Entity): number {
  return Math.floor(e / INDEX_LIMIT);
}

function makeEntity(index: number, generation: number): Entity {
  return (generation * INDEX_LIMIT + index) as Entity;
}

/** Typed identity of a component kind. `T` is the shape of its data. */
export interface ComponentType<T> {
  readonly id: number;
  readonly name: string;
  /** Phantom field: carries T for inference, never set at runtime. */
  readonly __type?: T;
}

let nextComponentId = 0;

export function defineComponent<T>(name: string): ComponentType<T> {
  return { id: nextComponentId++, name };
}

type ComponentData<C> = C extends ComponentType<infer T> ? T : never;
type QueryRow<Cs extends readonly ComponentType<unknown>[]> = [Entity, ...{ [K in keyof Cs]: ComponentData<Cs[K]> }];

export class World {
  /** generation per slot; a slot is alive when alive[index] is true. */
  private readonly generations: number[] = [];
  private readonly alive: boolean[] = [];
  private readonly freeSlots: number[] = [];
  /** component id → (slot index → data) */
  private readonly stores = new Map<number, Map<number, unknown>>();
  private liveCount = 0;

  get entityCount(): number {
    return this.liveCount;
  }

  createEntity(): Entity {
    let index = this.freeSlots.pop();
    if (index === undefined) {
      index = this.generations.length;
      if (index >= INDEX_LIMIT) throw new Error(`ecs: entity limit reached (${INDEX_LIMIT})`);
      this.generations.push(0);
      this.alive.push(false);
    }
    this.alive[index] = true;
    this.liveCount++;
    return makeEntity(index, this.generations[index]!);
  }

  isAlive(e: Entity): boolean {
    const index = entityIndex(e);
    return this.alive[index] === true && this.generations[index] === entityGeneration(e);
  }

  /** Destroys the entity and all its components. Returns false if it was already dead. */
  destroyEntity(e: Entity): boolean {
    if (!this.isAlive(e)) return false;
    const index = entityIndex(e);
    for (const store of this.stores.values()) store.delete(index);
    this.alive[index] = false;
    this.liveCount--;
    const next = this.generations[index]! + 1;
    this.generations[index] = next;
    // A slot whose generation counter is exhausted is retired instead of reused.
    if (next < GENERATION_LIMIT) this.freeSlots.push(index);
    return true;
  }

  /** Adds or replaces a component. Throws on a dead entity: that is always a logic bug. */
  add<T>(e: Entity, type: ComponentType<T>, data: T): T {
    this.assertAlive(e, `add ${type.name}`);
    let store = this.stores.get(type.id);
    if (!store) {
      store = new Map();
      this.stores.set(type.id, store);
    }
    store.set(entityIndex(e), data);
    return data;
  }

  /** Returns the component, or undefined if the entity is dead or lacks it. */
  get<T>(e: Entity, type: ComponentType<T>): T | undefined {
    if (!this.isAlive(e)) return undefined;
    return this.stores.get(type.id)?.get(entityIndex(e)) as T | undefined;
  }

  has(e: Entity, type: ComponentType<unknown>): boolean {
    return this.isAlive(e) && (this.stores.get(type.id)?.has(entityIndex(e)) ?? false);
  }

  /** Removes a component. Returns false if the entity is dead or did not have it. */
  remove(e: Entity, type: ComponentType<unknown>): boolean {
    if (!this.isAlive(e)) return false;
    return this.stores.get(type.id)?.delete(entityIndex(e)) ?? false;
  }

  /**
   * Entities owning every listed component, with their data, in ascending slot order.
   * The result is a snapshot: adding, removing or destroying while looping over it is safe.
   */
  query<const Cs extends readonly ComponentType<unknown>[]>(...types: Cs): QueryRow<Cs>[] {
    if (types.length === 0) return [];
    const stores: Map<number, unknown>[] = [];
    for (const t of types) {
      const s = this.stores.get(t.id);
      if (!s || s.size === 0) return [];
      stores.push(s);
    }
    // Drive the loop from the smallest store.
    let smallest = stores[0]!;
    for (const s of stores) if (s.size < smallest.size) smallest = s;
    const indices = [...smallest.keys()].sort((a, b) => a - b);
    const rows: QueryRow<Cs>[] = [];
    outer: for (const index of indices) {
      const row: unknown[] = [makeEntity(index, this.generations[index]!)];
      for (const s of stores) {
        if (!s.has(index)) continue outer;
        row.push(s.get(index));
      }
      rows.push(row as QueryRow<Cs>);
    }
    return rows;
  }

  private assertAlive(e: Entity, action: string): void {
    if (!this.isAlive(e)) throw new Error(`ecs: cannot ${action} on dead entity ${e}`);
  }
}
