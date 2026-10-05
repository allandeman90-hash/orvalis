import { MODEL_BLEND, type ModelMesh, ModelMeshBuilder, type ModelTexture } from '../model';

/**
 * ORIGINAL prop models for buildings (P6.2), built in code from boxes: fixtures for the doodad pipeline.
 * Each stands on z = 0, centred on its origin in x and y. One bone, one opaque material.
 */
export const PROP_MODELS = ['prop-table', 'prop-stool', 'prop-crate'] as const;
export type PropModelName = (typeof PROP_MODELS)[number];

export const PROP = {
  table: { halfX: 0.6, halfY: 0.35, height: 0.75, top: 0.06, leg: 0.07 },
  stool: { half: 0.18, height: 0.45, top: 0.05, leg: 0.05 },
  crate: { half: 0.3, height: 0.6 },
} as const;

/** Flat colours of the prop texture: four columns, 2 texels wide each. */
export const PROP_COLOURS = { board: [150, 110, 70], leg: [95, 65, 40], crate: [170, 140, 90], band: [70, 70, 75] } as const;
const COLUMNS = ['board', 'leg', 'crate', 'band'] as const;
type PropColour = (typeof COLUMNS)[number];
const ROOT = [[0, 255]] as const;

/** An axis-aligned box: six faces with exact axis normals, all sampling the middle of one colour column. */
function box(b: ModelMeshBuilder, min: readonly [number, number, number], max: readonly [number, number, number], colour: PropColour): void {
  const uv: [number, number] = [(COLUMNS.indexOf(colour) * 2 + 1) / 8, 0.5];
  for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1] as const) {
    const a = (axis + 1) % 3, c = (axis + 2) % 3;
    const normal: [number, number, number] = [0, 0, 0];
    normal[axis] = side;
    const corner = (s: number, t: number): [number, number, number] => {
      const p: [number, number, number] = [0, 0, 0];
      p[axis] = side > 0 ? max[axis]! : min[axis]!;
      p[a] = s ? max[a]! : min[a]!;
      p[c] = t ? max[c]! : min[c]!;
      return p;
    };
    // Counter-clockwise seen from outside: (a, c, axis) is right-handed, so the +axis face goes a then c.
    const order = side > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]];
    const v = order.map(([s, t]) => b.vertex(corner(s!, t!), normal, uv, ROOT));
    b.triangle(v[0]!, v[1]!, v[2]!);
    b.triangle(v[0]!, v[2]!, v[3]!);
  }
}

function legs(b: ModelMeshBuilder, halfX: number, halfY: number, height: number, leg: number): void {
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * (halfX - leg), y = sy * (halfY - leg);
    box(b, [x - leg / 2, y - leg / 2, 0], [x + leg / 2, y + leg / 2, height], 'leg');
  }
}

export function buildPropModel(name: PropModelName): ModelMesh {
  const b = new ModelMeshBuilder();
  b.submesh(0, b.material(0, MODEL_BLEND.opaque));
  if (name === 'prop-table') {
    const t = PROP.table;
    legs(b, t.halfX, t.halfY, t.height - t.top, t.leg);
    box(b, [-t.halfX, -t.halfY, t.height - t.top], [t.halfX, t.halfY, t.height], 'board');
  } else if (name === 'prop-stool') {
    const s = PROP.stool;
    legs(b, s.half, s.half, s.height - s.top, s.leg);
    box(b, [-s.half, -s.half, s.height - s.top], [s.half, s.half, s.height], 'board');
  } else if (name === 'prop-crate') {
    const c = PROP.crate;
    box(b, [-c.half, -c.half, 0], [c.half, c.half, c.height], 'crate');
    // Two iron bands around it, slightly proud of the sides.
    for (const z of [0.12, 0.42]) box(b, [-c.half - 0.01, -c.half - 0.01, z], [c.half + 0.01, c.half + 0.01, z + 0.06], 'band');
  } else throw new Error(`props: no model "${String(name)}"`);
  return b.build(name, 1);
}

/** 8 × 8 texture shared by the props: four flat columns (board, leg, crate, band). */
export function propTexture(): ModelTexture {
  const data = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) data.set([...PROP_COLOURS[COLUMNS[x >> 1]!], 255], (y * 8 + x) * 4);
  return { name: 'props', width: 8, height: 8, data };
}

export function isPropModelName(name: string): name is PropModelName {
  return (PROP_MODELS as readonly string[]).includes(name);
}
