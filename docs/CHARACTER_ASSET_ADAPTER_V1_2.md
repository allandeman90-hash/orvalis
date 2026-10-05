# V1.2 — Production character asset adapter

Status: **IMPLEMENTED — TARGETED VALIDATION PENDING**

This checkpoint connects the production contracts from V0.1 to the external asset path introduced in V1.1, while preserving the deterministic P5 mannequin/equipment fixtures.

## Scope

V1.2 is an adapter layer. It does not replace `ModelRenderer`, `CharacterComposite`, the P5 geoset rules, or the gameplay-facing item model.

The production path is now:

```text
CharacterBodyContract
        +
external `orvalis-model-1`
        ↓
bindCharacterBodyAsset()
        ↓
BoundCharacterBodyAsset
        ├─ real ModelMesh / Skeleton / Animation
        ├─ semantic socket → real bone index
        └─ semantic geoset group → variants present in the real mesh

Item stats ── appearanceId ──┐
transmog override ───────────┤
                             ↓
                  ResolvedItemAppearance
                   ├─ external RGBA sections
                   ├─ geoset requests
                   └─ attached external models
                             ↓
                 existing P5 runtime systems
```

Gameplay item stats remain separate from visual appearance. V1.2 consumes `ResolvedItemAppearance`; it does not introduce item stats into the renderer.

## External model ↔ body contract

`ExternalModelAsset` now optionally carries a stable `rigId`.

Generic props may omit it. A production character body may not: `bindCharacterBodyAsset()` requires the loaded asset to match both:

- the exact `modelAsset` URL declared by the body contract;
- the exact `rigId` declared by the body contract.

The adapter also rejects:

- missing or duplicate skeleton bone names;
- semantic sockets pointing at missing bones;
- a character mesh without always-visible geoset `0`.

Every required semantic socket is resolved to a real bone index before rendering.

## External composite sections

V1.2 introduces `orvalis-character-section-1`.

A section contains one authored RGBA source for the existing 256×256 character composite. The decoder validates:

- known composite region;
- exact region dimensions from `CHARACTER_REGIONS`;
- exact RGBA byte count;
- alpha mode (`opaque`, `key`, `blend4`).

The section is loaded through `AssetManager`. GPU upload still belongs to the existing `CharacterComposite` / model rendering path.

`bindCharacterTextureAppearancePart()` additionally proves that the loaded asset URL, region and alpha mode are exactly those declared by the resolved appearance.

## Appearance textures → existing P5 composite

`applyResolvedAppearanceTextures()` reuses the existing P5 equipment layer ordering (`EQUIPMENT_LAYER_OF_SLOT`).

It does not create a second compositing system.

Important behavior:

- changing equipment repaints only the appropriate equipment layers;
- unequipping clears stale regions from that layer;
- unloaded texture assets fail explicitly;
- slots that are not allowed to paint the body composite fail explicitly.

## Appearance geosets → existing P5 geoset selection

`resolvedAppearanceGeosetSelection()` reuses the P5 rule that the highest requested variant of a group wins.

The adapter validates requests against variants that actually exist in the externally loaded body mesh.

Variant `1` remains the special baseline / “show nothing” choice and may legitimately have no geometry. Authored variants above baseline must exist in the mesh.

## Attached equipment

`bindResolvedCharacterAttachment()` binds an externally loaded child model to the body-specific semantic socket selected during V0.1 appearance resolution.

`characterAttachmentMatrix()` composes:

```text
animated body bone
    × body-specific socket transform
    × appearance-specific item transform
```

This lets one shared appearance fit different body types through body socket offsets plus exceptional appearance overrides, instead of authoring eight unrelated copies of every item.

### Current scale constraint

The current `ModelRenderer` assumes model matrices contain translation, rotation and **uniform scale**. V1.2 therefore rejects non-uniform attachment scale instead of silently producing incorrect transformed normals.

The production contract may store a 3-component scale so the data format does not need another migration if the renderer later gains a normal-matrix path.

## Files

Runtime:

- `engine/src/model/externalAsset.ts`
- `engine/src/character/externalSection.ts`
- `engine/src/character/assetAdapter.ts`
- `engine/src/character/index.ts`

Tests:

- `engine/tests/assets/modelAsset.integration.test.ts`
- `engine/tests/character/productionContract.test.ts`
- `engine/tests/character/externalSection.test.ts`
- `engine/tests/character/assetAdapter.test.ts`

Validation workflow:

- `.github/workflows/v1-2-validation.yml`

## Fixture policy

The procedural mannequin, Vanguard equipment and generated P5 texture sections remain deterministic technical fixtures. They are not the production visual target and should not be polished into final art.

V1.2 exists so authored original body meshes, painted sections and equipment assets can replace those fixtures without replacing the renderer architecture.

## Validation gate

The checkpoint is not considered validated until the targeted workflow is green for the current tree:

1. engine typecheck;
2. lint of V1.1/V1.2 files;
3. V1.1 external-model integration test;
4. V0.1 production-contract test;
5. V1.2 body/texture/attachment adapter tests;
6. engine build.

After that, run the relevant model/character browser smoke on WebGL2 and WebGPU before declaring the checkpoint closed.
