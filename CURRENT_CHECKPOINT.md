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
### V0.1 — OpenWow × Orvalis Character Pipeline Audit
Before creating real final characters:
1. inspect the relevant OpenWow character/M2/equipment/compositing/attachment implementation;
2. compare with the master 1.12.1 spec;
3. map what Orvalis already supports vs what is missing;
4. define a production-ready character asset contract for 8 base archetypes;
5. define how one appearance fits different body types;
6. keep Item stats separate from ItemAppearance / transmog override;
7. produce the smallest implementation delta required before importing/authoring real character assets.

Then proceed to V1/V3 character visual prototypes: first original male + female base bodies, then simple/mid/endgame outfits.

## Validation policy
Use the permanent validation strategy in `PROJECT_STATUS.md`:
- micro change → targeted tests + typecheck/lint affected + relevant smoke only;
- checkpoint end → full check + affected WebGL2/WebGPU smokes;
- major phase/release → full verify.
Do not burn time/quota by running every smoke after every tiny edit.

## Chat/context rule
Start new chats from this file. Read only the relevant part of `PROJECT_STATUS.md` after this file and `ROADMAP.md`.
Change chat after ~3–5 substantial checkpoints, after a major phase boundary, or when logs/debug history become large enough to obscure the current task.
