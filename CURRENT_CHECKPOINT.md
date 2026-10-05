# CURRENT_CHECKPOINT

Updated: 2026-10-05

## Product
Orvalis is the only target product: a web MMORPG with an original world/assets/content, using WoW Vanilla 1.12.1 technical principles as reference.

## Reference priority
1. `docs/WoW_Vanilla_1.12.1_RE_Master.md` = primary technical truth.
2. `World0fWarcraft/OpenWow` = implementation reference to inspect subsystem-by-subsystem.
3. If OpenWow contradicts the 1.12.1 spec or contains WotLK/native-specific paths, verify before porting.
4. Never import proprietary Blizzard assets. Reuse ideas/algorithms/structure; port code only when appropriate and license-compatible.

## Engine state
- P0–P7 are substantially implemented and validated.
- P8.1–P8.6 are implemented/validated.
- P8.7 (walk-on-water / levitation movement behavior) remains the technical closure item before P9.
- DO NOT start P9 data/combat/network yet.
- GitHub Pages preview: `https://allandeman90-hash.github.io/orvalis/`.
- Root starts the new engine by default; legacy remains available with `?engine=legacy` / bundled legacy page.
- Debug statistics: F3 and visible Show/Hide Stats button; panel starts closed.

## V0 visual-convergence audit
V0.1–V0.3 are implemented.

### V0.1 — Character pipeline
- `engine/src/character/productionContract.ts`
- `engine/tests/character/productionContract.test.ts`
- `docs/CHARACTER_PIPELINE_V0_1.md`

Result:
- 256×256 composite/geoset/attachment runtime retained;
- production body contract for 8 base archetypes;
- semantic sockets and body-specific fit;
- shared `ItemAppearance` with exceptional body overrides;
- gameplay item stats kept separate from appearance/transmog;
- mannequin/Vanguard remain fixtures only.

### V0.2 — Terrain/material pipeline
- `engine/src/terrain/productionContract.ts`
- `engine/tests/terrain/productionContract.test.ts`
- `docs/TERRAIN_PIPELINE_V0_2.md`

Result:
- existing 145-vertex chunk / 16×16 tile / 64×64 mask runtime retained;
- production texture library plus 256 independent chunk-material records per tile;
- 1–4 texture layers with N−1 alpha sources;
- baked shadow and optional MCCV preserved as production data concepts;
- synthetic `TerrainPaint` and generated palettes remain fixtures.

### V0.3 — WMO/doodad/material pipeline
- `engine/src/building/productionContract.ts`
- `engine/tests/building/productionContract.test.ts`
- `docs/ENVIRONMENT_PIPELINE_V0_3.md`

Result:
- root/group/portal/collision/fog/liquid/doodad runtime retained;
- production external texture/material/group/doodad/portal/fog/light contract;
- independently streamable/cullable groups;
- stable ids before runtime index resolution;
- sampler clamp, second texture and SIDN/window behavior preserved for V2.4;
- procedural Cottage/Basin/props remain fixtures.

## V0 gate result
A previous typecheck failure was only a V0.1 test attempting `delete` on a readonly socket (`TS2704`). It was corrected without weakening the readonly contract.

The later Pages build job for the V0 tree completed successfully through:
- legacy install/build;
- engine install;
- engine typecheck;
- engine build;
- Pages artifact upload.

The workflow-level `failure`/`cancelled` state came from the deploy job being cancelled. `pages.yml` uses `concurrency: { group: pages, cancel-in-progress: true }`, so newer pushes cancel older deployments. Treat build/typecheck as green; do not interpret that deployment cancellation as an engine regression.

## V1.1 — External model asset ingestion — IMPLEMENTED, TARGETED VALIDATION QUEUED
Files:
- `engine/src/model/externalAsset.ts`
- `engine/src/model/index.ts`
- `engine/public/assets/models/v1-1-crystal.orvmodel.json`
- `engine/tests/assets/modelAsset.integration.test.ts`
- `docs/MODEL_ASSET_INGESTION_V1_1.md`

### What V1.1 adds
- Orvalis-owned external model package format: `orvalis-model-1`;
- JSON on disk, typed arrays after decode;
- mesh → existing `ModelMesh`;
- skeleton → existing `Skeleton`;
- animation → existing `ModelAnimation`;
- one diffuse texture for the self-contained V1.1 proof;
- `externalModelAssetLoader()` for the existing `AssetManager`;
- strict failure on malformed external data;
- no alternate renderer: decoded assets go to the existing `ModelRenderer`.

The decoder reuses existing validators:
- `validateModelMesh()`;
- `validateSkinning()`;
- `validateModelAnimation()`.

### External proof asset
`engine/public/assets/models/v1-1-crystal.orvmodel.json` is a tiny original Orvalis ingestion canary, not production art:
- 6 vertices;
- 8 triangles;
- one root bone;
- one looping idle rotation;
- one material/submesh;
- tiny original diffuse texture.

It is unrelated to the rejected character mannequin.

### End-to-end targeted test
`engine/tests/assets/modelAsset.integration.test.ts` starts the real Vite HTTP server and proves:

```text
public asset file
→ real HTTP fetch
→ AssetManager
→ external decoder
→ ModelMesh / Skeleton / ModelAnimation
→ AnimationPlayer
→ computeBoneMatrices
→ ModelRenderer
→ NullBackend draw
```

Expected proof result:
- 1 instance;
- 1 draw call;
- 8 triangles;
- 2 GPU buffers;
- 1 GPU texture;
- resources freed on renderer disposal.

Malformed external data must put the AssetManager entry into `failed` instead of producing a partial resource.

## V1.1 validation gate
Because the regular Pages workflow only typechecks/builds and does not execute tests, a temporary targeted checkpoint workflow was added:

- `.github/workflows/v1-1-validation.yml`

It runs once for this V1.1 surface:
1. `npm ci`;
2. engine typecheck;
3. lint of the V1.1 loader/test;
4. `vitest` for `tests/assets/modelAsset.integration.test.ts`;
5. engine build;
6. install Chromium;
7. model smoke suites on WebGL2 + WebGPU.

Current GitHub state at this checkpoint update:
- Pages run for the latest code is queued;
- V1.1 targeted validation run is queued;
- both are waiting for GitHub-hosted runners;
- no V1.1 validation failure has been observed yet.

Do NOT mark V1.1 validated and do NOT start V1.2 until the targeted validation run completes green (or any failure is fixed).

## Important visual finding
The current P7/P8 camera character and `model=character` mannequin are ENGINE TEST FIXTURES, not final art. Do not spend serious time polishing them.

The temporary Vanguard fixture proves support for:
- head item;
- separate left/right shoulders;
- cape/back attachment;
- main/off-hand models;
- texture-composited clothing;
- geosets;
- appearance/transmog-style swapping.

## Visual target
WoW Vanilla/Classic-like FEEL while remaining original:
- heroic silhouettes even without gear;
- exaggerated coherent proportions;
- readable stylized faces;
- larger expressive hands/feet;
- intentional male/female base shapes before armor;
- fitted armor and correctly anchored shoulders;
- intentional helmet framing/coverage;
- hand-painted/non-PBR material language;
- dramatic level-1 → endgame visual progression;
- transmog as a first-class separation of stats and appearance.

## Next exact checkpoint
### Gate V1.1 → V1.2
1. Inspect GitHub Actions run `V1.1 External Model Validation`.
2. If any step fails, fix only the demonstrated regression and rerun the targeted gate.
3. Once green, remove the temporary validation workflow if it is no longer useful and mark V1.1 validated.
4. Begin **V1.2 — production character asset adapter**.
5. Do not start P9; P8.7 remains separately open before P9.

### V1.2 target after the gate is green
Connect the V0.1 character production contract to the V1.1 external asset boundary:
- resolve `CharacterBodyContract.modelAsset` through `AssetManager`;
- validate rig/skeleton compatibility and semantic sockets against the loaded body;
- resolve original external customization/composite source assets;
- adapt `CharacterBodyContract` + resolved `ItemAppearanceDefinition` into the existing P5 composite/geoset/attachment runtime;
- preserve Item vs ItemAppearance/transmog separation;
- only then author/import the first original male and female production body manifests.

## Validation policy
- micro change → targeted tests + affected typecheck/lint + relevant smoke only;
- checkpoint end → full/appropriate check + affected WebGL2/WebGPU smokes;
- major phase/release → full verify.
Do not burn time/quota by running every smoke after every tiny edit.

## Chat/context rule
Start new chats from this file, then `ROADMAP.md`, then only the relevant docs/status sections.
Change chat after ~3–5 substantial checkpoints, major phase boundaries, or when debug/log history obscures the current task.
