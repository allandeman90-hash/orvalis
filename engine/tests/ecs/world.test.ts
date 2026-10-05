import { describe, expect, it } from 'vitest';
import { defineComponent, entityGeneration, entityIndex, World } from '../../src/ecs';

const Position = defineComponent<{ x: number; y: number; z: number }>('Position');
const Health = defineComponent<{ hp: number }>('Health');
const Name = defineComponent<string>('Name');

describe('ECS entities', () => {
  it('creates distinct live entities and counts them', () => {
    const w = new World();
    const a = w.createEntity(), b = w.createEntity();
    expect(a).not.toBe(b);
    expect(w.isAlive(a) && w.isAlive(b)).toBe(true);
    expect(w.entityCount).toBe(2);
  });
  it('destroy kills the entity, drops its components and is idempotent', () => {
    const w = new World();
    const e = w.createEntity();
    w.add(e, Health, { hp: 10 });
    expect(w.destroyEntity(e)).toBe(true);
    expect(w.isAlive(e)).toBe(false);
    expect(w.get(e, Health)).toBeUndefined();
    expect(w.entityCount).toBe(0);
    expect(w.destroyEntity(e)).toBe(false);
    expect(w.entityCount).toBe(0);
  });
  it('a stale handle never aliases the entity that reuses its slot', () => {
    const w = new World();
    const old = w.createEntity();
    w.add(old, Name, 'old');
    w.destroyEntity(old);
    const fresh = w.createEntity();
    expect(entityIndex(fresh)).toBe(entityIndex(old)); // slot reused
    expect(entityGeneration(fresh)).toBe(entityGeneration(old) + 1);
    expect(fresh).not.toBe(old);
    w.add(fresh, Name, 'fresh');
    expect(w.isAlive(old)).toBe(false);
    expect(w.get(old, Name)).toBeUndefined();
    expect(w.has(old, Name)).toBe(false);
    expect(w.remove(old, Name)).toBe(false);
    expect(w.get(fresh, Name)).toBe('fresh');
    expect(w.destroyEntity(old)).toBe(false);
    expect(w.isAlive(fresh)).toBe(true);
  });
  it('the reused slot does not inherit components', () => {
    const w = new World();
    const old = w.createEntity();
    w.add(old, Health, { hp: 1 });
    w.destroyEntity(old);
    expect(w.has(w.createEntity(), Health)).toBe(false);
  });
});

describe('ECS components', () => {
  it('add / get / has / remove', () => {
    const w = new World();
    const e = w.createEntity();
    expect(w.has(e, Position)).toBe(false);
    const p = w.add(e, Position, { x: 1, y: 2, z: 3 });
    expect(w.get(e, Position)).toBe(p); // same object: components are mutated in place
    expect(w.has(e, Position)).toBe(true);
    expect(w.remove(e, Position)).toBe(true);
    expect(w.get(e, Position)).toBeUndefined();
    expect(w.remove(e, Position)).toBe(false);
  });
  it('add replaces an existing component', () => {
    const w = new World();
    const e = w.createEntity();
    w.add(e, Health, { hp: 1 });
    w.add(e, Health, { hp: 9 });
    expect(w.get(e, Health)).toEqual({ hp: 9 });
    expect(w.query(Health)).toHaveLength(1);
  });
  it('components are independent per entity and per type', () => {
    const w = new World();
    const a = w.createEntity(), b = w.createEntity();
    w.add(a, Health, { hp: 5 });
    w.add(b, Health, { hp: 7 });
    w.add(a, Name, 'a');
    w.remove(a, Health);
    expect(w.get(b, Health)).toEqual({ hp: 7 });
    expect(w.get(a, Name)).toBe('a');
  });
  it('falsy component data is still present', () => {
    const w = new World();
    const e = w.createEntity();
    const Flag = defineComponent<number>('Flag');
    w.add(e, Flag, 0);
    w.add(e, Name, '');
    expect(w.has(e, Flag) && w.has(e, Name)).toBe(true);
    expect(w.query(Flag, Name)).toEqual([[e, 0, '']]);
  });
  it('adding to a dead entity throws', () => {
    const w = new World();
    const e = w.createEntity();
    w.destroyEntity(e);
    expect(() => w.add(e, Health, { hp: 1 })).toThrow(/dead entity/);
  });
  it('two worlds do not share data', () => {
    const w1 = new World(), w2 = new World();
    const e1 = w1.createEntity();
    w2.createEntity();
    w1.add(e1, Health, { hp: 3 });
    expect(w2.query(Health)).toEqual([]);
  });
});

describe('ECS queries', () => {
  function setup() {
    const w = new World();
    const a = w.createEntity(), b = w.createEntity(), c = w.createEntity();
    w.add(a, Position, { x: 1, y: 0, z: 0 });
    w.add(a, Health, { hp: 10 });
    w.add(b, Position, { x: 2, y: 0, z: 0 });
    w.add(c, Health, { hp: 30 });
    return { w, a, b, c };
  }
  it('single component', () => {
    const { w, a, b } = setup();
    expect(w.query(Position).map(([e]) => e)).toEqual([a, b]);
  });
  it('several components: only entities owning all of them, data in argument order', () => {
    const { w, a } = setup();
    const rows = w.query(Health, Position);
    expect(rows).toHaveLength(1);
    const [e, health, pos] = rows[0]!;
    expect(e).toBe(a);
    expect(health.hp).toBe(10); // typed as { hp: number }
    expect(pos.x).toBe(1); // typed as { x, y, z }
  });
  it('unknown component, empty store or no argument give an empty result', () => {
    const { w, a, c } = setup();
    expect(w.query(Name)).toEqual([]);
    expect(w.query(Position, Name)).toEqual([]);
    expect(w.query()).toEqual([]);
    w.remove(a, Health);
    w.remove(c, Health);
    expect(w.query(Health)).toEqual([]);
  });
  it('mutating through a query row changes the stored component', () => {
    const { w, a } = setup();
    for (const [, h] of w.query(Health)) h.hp -= 1;
    expect(w.get(a, Health)).toEqual({ hp: 9 });
  });
  it('destroying, removing and adding while iterating is safe', () => {
    const { w, a, b, c } = setup();
    const visited: number[] = [];
    for (const [e] of w.query(Position)) {
      visited.push(e);
      w.destroyEntity(b);
      w.remove(a, Position);
      w.add(c, Position, { x: 9, y: 9, z: 9 });
    }
    expect(visited).toEqual([a, b]); // snapshot taken before the loop
    expect(w.query(Position).map(([e]) => e)).toEqual([c]);
  });
  it('destroyed entities disappear from queries', () => {
    const { w, a, b } = setup();
    w.destroyEntity(a);
    expect(w.query(Position).map(([e]) => e)).toEqual([b]);
    expect(w.query(Position, Health)).toEqual([]);
  });
  it('results come in stable ascending slot order whatever the insertion order', () => {
    const w = new World();
    const es = Array.from({ length: 5 }, () => w.createEntity());
    for (const i of [3, 0, 4, 1, 2]) w.add(es[i]!, Health, { hp: i });
    expect(w.query(Health).map(([e]) => e)).toEqual(es);
  });
  it('handles 10 000 entities', () => {
    const w = new World();
    for (let i = 0; i < 10_000; i++) {
      const e = w.createEntity();
      w.add(e, Position, { x: i, y: 0, z: 0 });
      if (i % 2 === 0) w.add(e, Health, { hp: i });
    }
    expect(w.query(Position, Health)).toHaveLength(5000);
    expect(w.entityCount).toBe(10_000);
  });
});
