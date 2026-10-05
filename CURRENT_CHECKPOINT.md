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

## V1 — real asset pipeline — COMPLETE

### V1.1 — External model asset ingestion — VALIDATED
Documentation: `docs/MODEL_ASSET_INGESTION_V1_1.md`.

Result:
- Orvalis-owned `orvalis-model-1` external package;
- JSON on disk → typed runtime arrays;
- mesh/skeleton/animation through existing P4 contracts;
- loader through existing `AssetManager`;
- renderer remains existing `ModelRenderer`;
- strict malformed-data failure;
- optional `ExternalModelAsset.rigId` for generic props, exact match required for production character bodies.

The proof crystal is only an ingestion canary, not production art.

### V1.2 — Production character asset adapter — VALIDATED
Documentation: `docs/CHARACTER_ASSET_ADAPTER_V1_2.md`.

Runtime:
- `engine/src/character/assetAdapter.ts`;
- `engine/src/character/externalSection.ts`;
- `engine/scripts/v1-2-character-assets-smoke.mjs`.

Proven path:
- `CharacterBodyContract` ↔ real external model + exact rig;
- semantic sockets → real named bone indices;
- semantic geosets → variants actually present in the mesh;
- external `orvalis-character-section-1` RGBA composite sources;
- resolved appearance textures/geosets/attachments → existing P5 runtime;
- attachment placement = `animated body bone × body socket TRS × item-local TRS`;
- uniform attachment scale enforced until `ModelRenderer` gains proper non-uniform normal handling.

Validation: **V1.2 Character Asset Validation #16**, run `37376655789`, commit `f3872014a9feb0f0076b0a86af1761336df390a8`:
- typecheck green;
- lint green;
- 4 test files, **20/20 tests passed**;
- production build green;
- model + character targeted smoke green on WebGL2;
- model + character targeted smoke green on WebGPU (`google/swiftshader`).

The broad historical `smoke:model` has stale hidden-overlay assumptions; runtime intentionally does not rewrite the stats DOM while the panel is hidden. V1.2 uses a dedicated smoke following the actual UI contract (closed by default, F3 opens it). Do not weaken the runtime to satisfy the stale test.

### V1.3 — Equipment appearance / transmog contract — VALIDATED
Documentation: `docs/EQUIPMENT_APPEARANCE_V1_3.md`.

Runtime:
- `engine/src/character/appearanceCollection.ts`;
- exports in `engine/src/character/index.ts`.

New production-facing contract:
- `AppearanceCollectionSnapshot` = serializable list of unlocked appearance ids;
- `EquippedAppearanceState` = visual-only equipment refs by slot;
- `ResolvedAppearanceState` = visual-only resolved appearances by slot;
- native item appearance is allowed whenever it exists in the live registry;
- transmog override must be known **and unlocked**;
- unknown saved collection ids are tolerated structurally so deprecated content does not corrupt a whole save;
- newly unlocking an unknown appearance is rejected;
- unlock operation is pure/idempotent;
- body compatibility and body overrides still resolve through V0.1/V1.2 instead of being duplicated;
- gameplay stats/inventory/durability/requirements never enter this renderer-facing state.

Persistence handoff reserved for P9/P12:
- persist stable `unlockedAppearanceIds`;
- persist/select `appearanceOverrideId` alongside later gameplay equipment state;
- authoritative inventory/account/character ownership and database/network schema are deliberately not implemented here.

Validation: **V1.3 Equipment Appearance Validation #1**, run `37377477971`, commit `a5d061db6cc0af784dd99174527b35ff3dc8cabc`:
- typecheck green;
- targeted lint green;
- `productionContract.test.ts` 6/6;
- `appearanceCollection.test.ts` 6/6;
- total **2 files, 12/12 tests passed**;
- production build green.

No GPU/browser smoke was required for V1.3 because it only adds pure CPU data/policy resolution and changes no renderer/AssetManager/shader/browser path. V1.2 already validates the resolved appearance path on both GPU backends.

## Important visual finding
The current P7/P8 camera character and `model=character` mannequin are ENGINE TEST FIXTURES, not final art. Do not spend serious time polishing them.

The Vanguard fixture only proves runtime support for head, shoulders, cape/back, main/off-hand models, texture-composited clothing, geosets and appearance/transmog-style swapping.

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
### V2.1 — Terrain 4-layer blend + alpha maps

Follow the primary 1.12.1 terrain material model and the already-defined V0.2 production contract. Inspect OpenWow only as secondary implementation evidence.

Goal: replace the current simplified/synthetic terrain-material path with the smallest production-capable runtime delta for Vanilla-like terrain blending while retaining existing terrain topology/streaming.

Required work:
1. inspect current terrain renderer/material/shader and V0.2 `TerrainMaterialContract`;
2. map current support vs the 1.12.1/V0.2 requirement of 1–4 texture layers per chunk;
3. implement layer 0 + up to 3 alpha-controlled overlays without creating unique giant textures per tile;
4. preserve the 64×64 per-chunk mask concept and current chunk boundaries;
5. keep baked shadow/MCCV for V2.2 — do not mix them into V2.1 unless an interface seam is required;
6. keep fixture palettes for tests, but production data must be able to reference external/original textures and alpha assets;
7. add targeted CPU/material tests and the smallest relevant WebGL2/WebGPU terrain smoke at checkpoint end;
8. document any deliberate Orvalis deviations from exact Vanilla 4-bit storage while preserving the visual/data-flow behavior.

Do not begin V2.2 until V2.1 is green.
Do not author the first production character body yet; roadmap places V3.1 after V2 convergence.
Do not start P9; P8.7 remains separately open and must be green before P9.

## Validation policy
- micro change → targeted tests + affected typecheck/lint + relevant smoke only;
- checkpoint end → full/appropriate check + affected WebGL2/WebGPU smokes;
- major phase/release → full verify.
Do not burn time/quota by running every smoke after every tiny edit.

## Chat/context rule
Start new chats from this file, then `ROADMAP.md`, then only the relevant docs/status sections.
Change chat after ~3–5 substantial checkpoints, major phase boundaries, or when debug/log history obscures the current task.
