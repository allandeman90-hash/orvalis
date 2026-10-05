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
- GitHub Pages preview is live at `https://allandeman90-hash.github.io/orvalis/`.
- Root now starts the new engine by default; legacy remains available with `?engine=legacy` / bundled legacy page.
- Debug statistics: F3 and visible Show/Hide Stats button; panel starts closed.
- Pages bootstrap was changed to statically import `main.ts` to avoid stale dynamic chunk failures after deploys.

## Visual-convergence V0 status
The OpenWow/reference audit phase has now been IMPLEMENTED in three checkpoints. Final CI is still waiting for a GitHub-hosted runner; do not mark the phase validated until the latest workflow is green.

### V0.1 — Character pipeline audit — IMPLEMENTED, CI FINAL PENDING
Files:
- `engine/src/character/productionContract.ts`
- `engine/tests/character/productionContract.test.ts`
- `docs/CHARACTER_PIPELINE_V0_1.md`

Result:
- existing 256×256 composite/geoset/attachment runtime retained;
- production body contract for 8 base archetypes;
- semantic sockets + body-specific fitting;
- shared ItemAppearance with exceptional per-body overrides;
- gameplay item stats separated from visual appearance/transmog override;
- fixture mannequin/Vanguard remains fixture-only.

### V0.2 — Terrain/material pipeline audit — IMPLEMENTED, CI FINAL PENDING
Files:
- `engine/src/terrain/productionContract.ts`
- `engine/tests/terrain/productionContract.test.ts`
- `docs/TERRAIN_PIPELINE_V0_2.md`

Result:
- existing 145-vertex chunk / 16×16 tile / 64×64 mask renderer retained;
- production texture library + 256 independent chunk-material records per tile;
- 1–4 terrain layers with exactly N−1 authored alpha sources;
- baked shadow and optional future MCCV source kept as distinct production concepts;
- decoded `ChunkMaterial` boundary validated;
- synthetic `TerrainPaint` / procedural palette remain fixtures.

### V0.3 — WMO/doodad/material pipeline audit — IMPLEMENTED, CI FINAL PENDING
Files:
- `engine/src/building/productionContract.ts`
- `engine/tests/building/productionContract.test.ts`
- `docs/ENVIRONMENT_PIPELINE_V0_3.md`

Result:
- existing root/group/portal/collision/fog/liquid/doodad runtime retained;
- production external texture/material/group/doodad/portal/fog/light contract added;
- groups remain independently streamable/cullable;
- material references use stable ids before runtime index resolution;
- sampler clamp, second texture, SIDN/night-window behavior are preserved in data but remain V2.4 renderer work;
- procedural Cottage/Basin/props remain fixtures.

## CI note
A previous workflow failure was traced to the V0.1 test itself attempting `delete` on a readonly socket property (`TS2704`), not to production code. That test was corrected without weakening the readonly contract.

The latest workflow for the V0.1–V0.3 tree is queued on GitHub Actions. No runner is currently in progress; this is an external runner wait. The local container cannot resolve github.com, so GitHub Actions remains the authoritative full-tree validation.

## Important visual finding
The current P7/P8 camera scene and the current `model=character` mannequin are ENGINE TEST FIXTURES, not final art. The user explicitly rejects the mannequin as a visual target.

The temporary `preset=vanguard` proves that Orvalis can support:
- head item;
- separate left/right shoulder models;
- cape/back attachment;
- main-hand/off-hand models;
- texture-composited clothing;
- geoset changes;
- equipment/transmog-style appearance swapping.

It is NOT final art. Do not spend serious time polishing this mannequin.

## Visual target
The desired character language is WoW Vanilla/Classic-like in FEEL, while remaining original:
- strong heroic silhouettes even without gear;
- exaggerated but coherent proportions;
- readable stylized faces;
- larger, expressive hands/feet;
- male/female body shapes that already look intentional before armor;
- armor that follows the body instead of floating;
- shoulders that expand the silhouette but are anchored correctly;
- helmets that frame/cover the head intentionally without accidental face clipping;
- hand-painted/non-PBR look, simple lighting, strong value/color separation;
- level-max gear should look dramatically more powerful than level-1 gear;
- transmog must be a first-class system: stats and appearance remain separate.

## User-supplied visual references
The current chat contains Wowhead Classic Dressing Room screenshots of:
- Human male base/no armor;
- Human female base/no armor;
- Human male equipped in a heavy/endgame-looking set;
- Human female equipped in the same/similar set.
These are visual references only. Do not copy meshes/textures/assets.

## Current prototype issues already observed
- mannequin proportions are too generic/thin and read as a technical dummy;
- Vanguard shoulder pieces initially clipped the torso, then were moved outward/upward;
- Vanguard helmet initially covered the eyes; it was opened around the face;
- procedural flat gear textures lack proper hand-painted material definition;
- fixture armor can demonstrate sockets/transmog, but should not become production art.

## Next exact checkpoint
### Gate V0 → V1
1. Read the latest GitHub Actions run.
2. If red: fix every V0.1/V0.2/V0.3 typecheck/build regression first.
3. If green: mark V0.1–V0.3 validated and begin **V1.1 — real model asset ingestion**.
4. Do not start P9.
5. P8.7 remains a separate technical closure item before P9.

### V1.1 target once the gate is green
Build the smallest real external model ingestion path through the existing `AssetManager`:
- original Orvalis model asset only;
- decode → runtime `ModelMesh`/skeleton/animations/material refs;
- no proprietary WoW assets;
- preserve the existing procedural fixtures for deterministic tests;
- prove one externally loaded original model can render through the current model renderer.

## Validation policy
Use the permanent validation strategy in `PROJECT_STATUS.md`:
- micro change → targeted tests + typecheck/lint affected + relevant smoke only;
- checkpoint end → full check + affected WebGL2/WebGPU smokes;
- major phase/release → full verify.
Do not burn time/quota by running every smoke after every tiny edit.

## Chat/context rule
Start new chats from this file. Read only the relevant part of `PROJECT_STATUS.md` after this file and `ROADMAP.md`.
Change chat after ~3–5 substantial checkpoints, after a major phase boundary, or when logs/debug history become large enough to obscure the current task.
