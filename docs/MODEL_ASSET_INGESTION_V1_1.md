# V1.1 — External Orvalis Model Asset Ingestion

Updated: 2026-10-05

Status: **VALIDATED**

## Status

V1.1 introduces the first real external model ingestion path for Orvalis.

The goal is deliberately narrow: prove that a model stored outside TypeScript source code can travel through the existing `AssetManager`, decode into the current model runtime contracts, animate, and render through the existing `ModelRenderer` without importing any Blizzard/WoW proprietary asset.

The procedural tree, mannequin, swatches and Vanguard equipment remain deterministic fixtures. They are not converted into production assets by this checkpoint.

## Files

- `engine/src/model/externalAsset.ts`
- `engine/public/assets/models/v1-1-crystal.orvmodel.json`
- `engine/tests/assets/modelAsset.integration.test.ts`
- exports in `engine/src/model/index.ts`

## Format

The first Orvalis-owned external model package is:

```text
format = "orvalis-model-1"
```

It is JSON on disk for inspectability and typed arrays after decoding.

This is an Orvalis interchange format, **not** an M2/WoW container.

The V1.1 package contains:

- mesh name;
- positions;
- normals;
- UVs;
- four bone weights and indices per vertex;
- 16-bit triangle indices;
- bone count;
- model materials;
- geoset/submesh ranges;
- skeleton hierarchy and pivots;
- animation sequences;
- translation/rotation/scale tracks;
- global sequence lengths;
- one diffuse texture for the self-contained proof asset.

The decoded runtime object is:

```text
ExternalModelAsset
  mesh       -> ModelMesh
  skeleton   -> Skeleton
  animation  -> ModelAnimation
  texture    -> ModelTexture
```

Therefore the renderer-facing runtime remains the P4 model pipeline; V1.1 does not add a parallel renderer.

## AssetManager boundary

`externalModelAssetLoader()` implements the existing `AssetLoader` contract.

Lifecycle:

```text
HTTP/file bytes
    ↓
AssetManager download
    ↓
decodeExternalModelAsset()
    ↓
strict validation
    ↓
Decoded
    ↓
AssetManager pump()
    ↓
Ready ExternalModelAsset
    ↓
ModelRenderer.addModel(mesh, texture)
```

The AssetManager upload phase is intentionally identity for this resource. The decoded package is CPU model data; `ModelRenderer` remains responsible for creating its GPU buffers and texture.

## Validation

The decoder refuses malformed data instead of repairing it silently.

It validates:

- supported format id;
- finite numeric geometry;
- matching vertex-array lengths;
- unit normals;
- valid 16-bit indices;
- exactly four stored bone weights/indices per vertex;
- weights adding to 255;
- valid bone indices and bone count;
- materials and geoset/submesh ranges;
- skeleton hierarchy/order/pivots/billboards;
- mesh ↔ skeleton bone-count compatibility;
- sequence timing;
- animation-track shapes and interpolation modes;
- global sequence references;
- diffuse texture dimensions and RGBA byte count.

Existing validators are reused:

- `validateModelMesh()`;
- `validateSkinning()`;
- `validateModelAnimation()`.

The decoder is only the external-data boundary; it does not duplicate runtime validation rules.

## Proof asset

`engine/public/assets/models/v1-1-crystal.orvmodel.json` is a tiny original Orvalis crystal used only as the V1.1 ingestion canary.

It contains:

- 6 vertices;
- 8 triangles;
- one root bone;
- one looping idle rotation sequence;
- one opaque material/submesh;
- a tiny original diffuse texture.

It is intentionally not production art and is unrelated to the rejected procedural character mannequin.

## End-to-end proof

`engine/tests/assets/modelAsset.integration.test.ts` starts the real Vite development server so `engine/public` is served over HTTP.

The test then performs:

```text
public asset file
→ real HTTP fetch
→ AssetManager
→ external model decoder
→ runtime ModelMesh / Skeleton / ModelAnimation
→ AnimationPlayer
→ computeBoneMatrices
→ ModelRenderer
→ NullBackend draw
```

Expected render result for the canary:

```text
1 instance
1 draw call
8 triangles
2 GPU buffers
1 GPU texture
```

A second test feeds malformed external data and requires the AssetManager entry to become `failed` rather than producing a partial resource.

## Validation result

V1.1 is closed by the combined V1.2 validation gate, GitHub Actions run **#16** (`37376655789`) on commit `f3872014a9feb0f0076b0a86af1761336df390a8`.

That run proved the V1.1 surface together with its character consumer:

- engine typecheck: green;
- targeted lint: green;
- `tests/assets/modelAsset.integration.test.ts`: 2/2 green;
- complete targeted V0.1/V1.1/V1.2 group: 4 files, 20/20 tests green;
- production build: green;
- browser model fixture: WebGL2 green;
- browser model fixture: WebGPU green using the CI SwiftShader adapter.

The temporary `.github/workflows/v1-1-validation.yml` was removed after this combined superset gate passed. `.github/workflows/v1-2-validation.yml` remains the regression guard for the external-model → production-character boundary.

## Why JSON first

V1.1 optimizes for a stable semantic boundary, not file-size perfection.

A binary `.orvmodel` can be introduced later without changing `ModelMesh`, `Skeleton`, `ModelAnimation`, character contracts, or `ModelRenderer`. The decoder is the replaceable layer.

This keeps authoring/export tooling easy to inspect while the first real bodies and environment assets are still being developed.

## What V1.1 deliberately does not do

- It does not import M2/WMO/Blizzard assets.
- It does not convert the mannequin into a production character.
- It does not define the final eight character bodies; that belongs to V1.2/V3.
- It does not add modern PBR material stacks.
- It does not start P9 gameplay/static-data work.

## Closure

V1.2 now consumes this external model boundary for production character bodies, semantic sockets, external composite sections, geosets and attached equipment. V1.1 therefore has no remaining implementation gate.

P8.7 remains separately open before P9.
