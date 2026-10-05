import { type Building, doodadMatrix, groupIsInterior, visibleDoodads } from '../building';
import { mat4, type Mat4 } from '../math';
import type { ModelMesh, ModelTexture } from '../model';
import type { ModelId, ModelInstance, ModelRenderer } from '../modelRender';

/** Gives the mesh and texture of a prop model from its name in the building's model table. */
export type DoodadModelSource = (name: string) => { readonly mesh: ModelMesh; readonly texture: ModelTexture };

/**
 * The props of ONE building (P6.2), drawn with the model renderer.
 * Each model NAME is uploaded once, however many doodads use it; only the models that a doodad uses are uploaded.
 * instances() answers, for a placement of the building, the selected set and the visible groups, the model
 * instances to draw — the doodads of invisible groups are not submitted (spec §165).
 */
export class BuildingDoodads {
  private readonly models = new Map<number, ModelId>();
  private readonly local: Mat4[];
  private readonly world: Mat4[];
  /** Per doodad: its flat interior light, or undefined when the sun lights it. */
  private readonly lights: Array<readonly [number, number, number] | undefined>;

  constructor(private readonly renderer: ModelRenderer, readonly building: Building, source: DoodadModelSource) {
    const doodads = building.doodads ?? [];
    for (const doodad of doodads) {
      if (this.models.has(doodad.model)) continue;
      const { mesh, texture } = source(building.doodadModels![doodad.model]!);
      this.models.set(doodad.model, renderer.addModel(mesh, texture));
    }
    this.local = doodads.map((doodad) => doodadMatrix(doodad));
    this.world = doodads.map(() => mat4.create());
    // Lighting (P6.7, OUR CHOICE — the document only says the group relation matters for lighting and that a
    // placement has an authored colour): a prop listed ONLY by true interior groups is lit by its authored colour
    // alone, like the baked walls around it; a prop that an exterior group lists too is lit by the sun.
    this.lights = doodads.map((doodad, index) => {
      const owners = building.groups.filter((group) => group.doodadRefs?.includes(index));
      return owners.length > 0 && owners.every((group) => groupIsInterior(group.flags)) ? ([doodad.color[0] / 255, doodad.color[1] / 255, doodad.color[2] / 255] as const) : undefined;
    });
  }

  /** Models uploaded: one per model name in use. */
  get modelCount(): number {
    return this.models.size;
  }

  get doodadCount(): number {
    return this.local.length;
  }

  /**
   * @param matrix building → world
   * @param visibleGroups absent = every group
   */
  instances(matrix: Mat4, selectedSet: number, visibleGroups?: ReadonlySet<number>): ModelInstance[] {
    return visibleDoodads(this.building, selectedSet, visibleGroups).map((index) => ({
      model: this.models.get(this.building.doodads![index]!.model)!,
      matrix: mat4.multiply(this.world[index]!, matrix, this.local[index]!),
      ...(this.lights[index] ? { light: this.lights[index] } : {}),
    }));
  }

  dispose(): void {
    for (const id of this.models.values()) this.renderer.removeModel(id);
    this.models.clear();
  }
}
