# CURRENT_CHECKPOINT

Updated: 2026-10-05

## Product
Orvalis is the only target product: a web MMORPG with original world/assets/content, using WoW Vanilla 1.12.1 technical principles as reference.

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

## V0 — reference/pipeline audit
V0.1–V0.3 are implemented:
- V0.1 character production contract: `engine/src/character/productionContract.ts`, tests and `docs/CHARACTER_PIPELINE_V0_1.md`;
- V0.2 terrain/material production contract: `engine/src/terrain/productionContract.ts`, tests and `docs/TERRAIN_PIPELINE_V0_2.md`;
- V0.3 WMO/doodad/material production contract: `engine/src/building/productionContract.ts`, tests and `docs/ENVIRONMENT_PIPELINE_V0_3.md`.

Permanent conclusions:
- keep the existing composite/geoset/attachment runtime rather than replacing it;
- keep gameplay Item stats separate from ItemAppearance/transmog;
- terrain and environment production data must reference external assets rather than procedural fixture pixels;
- mannequin/Vanguard, generated terrain palettes and Cottage/Basin remain deterministic technical fixtures only.

## V1.1 — External model asset ingestion — IMPLEMENTED
Files:
- `engine/src/model/externalAsset.ts`
- `engine/src/model/index.ts`
- `engine/public/assets/models/v1-1-crystal.orvmodel.json`
- `engine/tests/assets/modelAsset.integration.test.ts`
- `docs/MODEL_ASSET_INGESTION_V1_1.md`

Result:
- Orvalis-owned `orvalis-model-1` external package;
- JSON on disk → typed runtime arrays;
- mesh → `ModelMesh`;
- skeleton → `Skeleton`;
- animation → `ModelAnimation`;
- self-contained diffuse for the ingestion proof;
- loader runs through the existing `AssetManager`;
- decoded assets render through the existing `ModelRenderer`;
- malformed external data fails explicitly;
- `ExternalModelAsset.rigId` is optional for generic props and required by the production character adapter.

The proof crystal is only an ingestion canary, not production art.

### V1.1 validation evidence
The Pages workflow for commit `b2ff120a73bdf010d4bb2ab374a3ecf822da2100` completed successfully, including engine typecheck and build.

The original V1.1 targeted workflow was affected by the 2026-10-05 GitHub Actions incident that delayed assignment of GitHub-hosted runners. V1.2's targeted workflow includes the V1.1 integration test and therefore acts as the superseding targeted gate once it runs.

## V1.2 — Production character asset adapter — IMPLEMENTED, TARGETED VALIDATION PENDING
Documentation:
- `docs/CHARACTER_ASSET_ADAPTER_V1_2.md`

Runtime:
- `engine/src/character/assetAdapter.ts`
- `engine/src/character/externalSection.ts`
- `engine/src/character/index.ts`
- V1.1 `engine/src/model/externalAsset.ts` extended with optional `rigId`.

Tests:
- `engine/tests/character/assetAdapter.test.ts`
- `engine/tests/character/externalSection.test.ts`
- existing `engine/tests/character/productionContract.test.ts`
- existing V1.1 `engine/tests/assets/modelAsset.integration.test.ts`.

### What V1.2 now connects
`CharacterBodyContract` can be bound against a genuinely loaded `ExternalModelAsset`:
- exact external model URL required;
- exact character `rigId` required;
- named skeleton bones must be unique;
- every semantic character socket is resolved to a real bone index;
- always-visible body geoset `0` is required;
- semantic geoset groups are checked against variants actually present in the loaded mesh.

Character composite sources now have an external format:
- `orvalis-character-section-1`;
- strict composite region;
- exact region dimensions;
- exact RGBA byte count;
- alpha mode `opaque | key | blend4`;
- loaded through the existing `AssetManager`.

Resolved production appearances reuse the existing P5 runtime instead of creating parallel systems:
- appearance texture sections → `CharacterComposite` using the existing equipment-layer order;
- unequipping clears stale equipment layers;
- appearance geosets → existing highest-variant selection rule;
- requested variants above baseline must exist in the loaded body mesh;
- attached appearance models → body-specific semantic sockets.

Attachment placement is:

```text
animated body bone × body socket TRS × item-local TRS
```

Current renderer limitation is explicit: attachment scale must be uniform because `ModelRenderer` currently assumes translation + rotation + uniform scale. Non-uniform scale fails instead of silently producing incorrect normals.

### Item/transmog separation
V1.2 consumes `ResolvedItemAppearance`; gameplay stats never enter the renderer adapter. The effective visual remains:

```text
appearanceOverride ?? item.appearanceId
```

so transmog remains first-class and independent from item power.

### V1.2 validation gate
Targeted workflow:
- `.github/workflows/v1-2-validation.yml`

It validates:
1. engine typecheck;
2. lint of V1.1/V1.2 files;
3. V1.1 external-model HTTP ingestion test;
4. V0.1 production-contract test;
5. V1.2 body/texture/geoset/attachment tests;
6. engine build.

Current state:
- HEAD after implementation: `b2ff120a73bdf010d4bb2ab374a3ecf822da2100` plus documentation commit `e038bf12522a429c90640e912b30d3c0ddf4e0a8`;
- Pages on `b2ff120...` is green for typecheck + build;
- targeted V1.2 run #10 (`37374671941`) is still `queued` waiting for a GitHub-hosted runner;
- no V1.2 test/lint failure has been observed yet.

Do NOT mark V1.2 validated until that targeted workflow (or an equivalent superseding run) is green. After it is green, run the relevant model/character browser smoke on WebGL2 and WebGPU before closing V1.2.

## Important visual finding
The current P7/P8 camera character and `model=character` mannequin are ENGINE TEST FIXTURES, not final art. Do not spend serious time polishing them.

The temporary Vanguard fixture only proves runtime support for:
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
### Gate V1.2 → first real body assets
1. Inspect `V1.2 Character Asset Validation`, prioritizing run #10 (`37374671941`) or any newer superseding run.
2. If red, fix only the demonstrated lint/test/build regression and rerun the targeted gate.
3. Once green, run the relevant model/character browser smoke on WebGL2 + WebGPU.
4. Mark V1.1/V1.2 validated.
5. Then begin the first original production base-body asset/manifests (male first, then female) through the V1.1/V1.2 path.
6. Do not return to polishing the mannequin.
7. Do not start P9; P8.7 remains separately open before P9.

## Validation policy
- micro change → targeted tests + affected typecheck/lint + relevant smoke only;
- checkpoint end → full/appropriate check + affected WebGL2/WebGPU smokes;
- major phase/release → full verify.
Do not burn time/quota by running every smoke after every tiny edit.

## Chat/context rule
Start new chats from this file, then `ROADMAP.md`, then only the relevant docs/status sections.
Change chat after ~3–5 substantial checkpoints, major phase boundaries, or when debug/log history obscures the current task.
