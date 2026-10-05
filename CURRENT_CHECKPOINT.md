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

## V0 — reference/pipeline audit — COMPLETE
V0.1–V0.3 are implemented:
- V0.1 character production contract: `engine/src/character/productionContract.ts`, tests and `docs/CHARACTER_PIPELINE_V0_1.md`;
- V0.2 terrain/material production contract: `engine/src/terrain/productionContract.ts`, tests and `docs/TERRAIN_PIPELINE_V0_2.md`;
- V0.3 WMO/doodad/material production contract: `engine/src/building/productionContract.ts`, tests and `docs/ENVIRONMENT_PIPELINE_V0_3.md`.

Permanent conclusions:
- keep the existing composite/geoset/attachment runtime rather than replacing it;
- keep gameplay Item stats separate from ItemAppearance/transmog;
- terrain and environment production data must reference external assets rather than procedural fixture pixels;
- mannequin/Vanguard, generated terrain palettes and Cottage/Basin remain deterministic technical fixtures only.

## V1.1 — External model asset ingestion — VALIDATED
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
- loader through the existing `AssetManager`;
- render through the existing `ModelRenderer`;
- strict malformed-data failure;
- optional `ExternalModelAsset.rigId` for generic props, mandatory match when used as a production character body.

The proof crystal is only an ingestion canary, not production art.

The temporary `.github/workflows/v1-1-validation.yml` was removed after V1.2's combined validation gate superseded it.

## V1.2 — Production character asset adapter — VALIDATED
Documentation:
- `docs/CHARACTER_ASSET_ADAPTER_V1_2.md`

Runtime:
- `engine/src/character/assetAdapter.ts`
- `engine/src/character/externalSection.ts`
- `engine/src/character/index.ts`
- V1.1 `engine/src/model/externalAsset.ts` with optional `rigId`.

Tests:
- `engine/tests/character/assetAdapter.test.ts`
- `engine/tests/character/externalSection.test.ts`
- `engine/tests/character/productionContract.test.ts`
- `engine/tests/assets/modelAsset.integration.test.ts`.

### Production path now proven
`CharacterBodyContract` can be bound against a genuinely loaded `ExternalModelAsset`:
- exact external model URL;
- exact character `rigId`;
- unique named skeleton bones;
- every semantic socket resolved to a real bone index;
- required always-visible body geoset `0`;
- semantic geoset groups checked against variants actually present in the loaded mesh.

Character composite sources use external `orvalis-character-section-1` assets with strict region, dimensions, RGBA byte count and alpha mode validation.

Resolved production appearances reuse the existing P5 runtime:
- appearance texture sections → `CharacterComposite` using existing equipment-layer order;
- unequipping clears stale layers;
- appearance geosets → existing highest-variant rule;
- attached models → body-specific semantic sockets;
- attachment placement = `animated body bone × body socket TRS × item-local TRS`.

Current renderer limitation remains explicit: attachment scale must be uniform. Non-uniform scale fails instead of silently producing bad normals.

### Item/transmog separation
V1.2 consumes `ResolvedItemAppearance`; gameplay stats never enter the renderer adapter. Effective visual lookup remains:

```text
appearanceOverride ?? item.appearanceId
```

### Validation evidence
Combined gate: **V1.2 Character Asset Validation #16**, run `37376655789`, commit `f3872014a9feb0f0076b0a86af1761336df390a8`.

Green:
- engine typecheck;
- targeted lint;
- V1.1 external-model HTTP integration test;
- V0.1 production-contract tests;
- V1.2 body/texture/geoset/attachment tests;
- **4 test files, 20/20 tests passed**;
- production Vite build;
- locked Chromium install;
- targeted model + character browser smoke on **WebGL2**;
- targeted model + character browser smoke on **WebGPU**, adapter `google/swiftshader`.

Browser smoke: `engine/scripts/v1-2-character-assets-smoke.mjs`.
Regression workflow: `.github/workflows/v1-2-validation.yml` with latest-only concurrency.

The broad historical `smoke:model` still contains stale assumptions that the hidden debug overlay is continuously populated. Runtime intentionally does not rewrite the hidden overlay; the V1.2 smoke uses the real UI contract (panel closed by default, F3 opens it). This maintenance issue is not a V1.2 blocker and the runtime was not weakened to satisfy the old test.

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
### V1.3 — Equipment appearance contract
Do this before V2/V3 and before authoring the first production body as a declared checkpoint.

Audit the V0.1/V1.2 appearance surface against the roadmap instead of rewriting what already exists.

Already present and expected to be retained:
- `ItemAppearanceDefinition` is visual-only;
- gameplay item → `itemAppearanceId` bridge only;
- `appearanceOverrideId` changes appearance without changing item power;
- body compatibility and exceptional `bodyOverrides`;
- shared textures/geosets/attachments/hide rules;
- resolved appearance feeds the V1.2 adapter/P5 renderer path.

V1.3 must identify and implement only the missing production-facing pieces, especially:
1. explicit unlocked-appearance / appearance-collection semantics suitable for later persistence without implementing P9/P12;
2. validation that an override can only resolve to a known/unlocked appearance at the appropriate boundary;
3. a small production-facing equipment/appearance state contract that does not import gameplay stats into the renderer;
4. tests for normal appearance, override/transmog, locked/unknown appearance and body-specific resolution;
5. documentation of the exact persistence handoff for later systems.

Do not build inventory/combat/static-data tables here. Do not start P9.

After V1.3 is green, follow `ROADMAP.md`: V2 material/rendering convergence precedes V3.1 first original male body unless the roadmap is explicitly changed.

P8.7 remains separately open and must be green before P9.

## Validation policy
- micro change → targeted tests + affected typecheck/lint + relevant smoke only;
- checkpoint end → full/appropriate check + affected WebGL2/WebGPU smokes;
- major phase/release → full verify.
Do not burn time/quota by running every smoke after every tiny edit.

## Chat/context rule
Start new chats from this file, then `ROADMAP.md`, then only the relevant docs/status sections.
Change chat after ~3–5 substantial checkpoints, major phase boundaries, or when debug/log history obscures the current task.
