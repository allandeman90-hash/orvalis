# CURRENT_CHECKPOINT

Updated: 2026-10-06

## Mandatory first read
Read `AGENT_RULES.md` before doing anything in a new chat/session. Its execution/CI/commit/stop rules are binding.

## Product / references
- Product: Orvalis web MMORPG, original world/assets/content.
- Primary technical truth: `docs/WoW_Vanilla_1.12.1_RE_Master.md`.
- Secondary implementation reference: `World0fWarcraft/OpenWow`.
- Do not copy proprietary Blizzard assets or blindly port native/WotLK-specific OpenWow paths.

## Stable engine state
- P0–P7 substantially implemented/validated.
- P8.1–P8.6 implemented/validated.
- P8.7 walk-on-water / levitation remains open before P9.
- P9 must NOT start yet.
- GitHub Pages: `https://allandeman90-hash.github.io/orvalis/`.
- Current mannequin/Vanguard and generated environment art are TEST FIXTURES only, never production visual targets.

## Visual convergence state
### V0 — COMPLETE
Reference/production contracts for character, terrain and environment exist.

### V1 — COMPLETE
- V1.1 external model ingestion validated.
- V1.2 production character asset adapter validated on WebGL2 + WebGPU.
- V1.3 equipment appearance/transmog contract validated.
- Gameplay item stats remain separate from visual appearance/transmog state.

### V2.1 — IMPLEMENTED, CLOSURE PENDING
A previous session over-ran badly (72 commits / excessive GitHub Actions polling). Do NOT repeat that process.

Useful V2.1 work already present in the repo includes:
- external terrain texture/alpha asset support;
- production terrain layer adapter;
- 1–4 layer material path work;
- palette/material integration through TerrainRenderer;
- targeted terrain production tests/integration proof.

V2.1 is NOT to be restarted from zero.

## Exact next technical block
Do ONE short closure block for V2.1:
1. inspect the current targeted terrain smoke / last demonstrated V2.1 failure once;
2. if it is a stale expectation, fix only that stale smoke/test — do not change correct runtime behavior merely to satisfy old UI assumptions;
3. run targeted terrain tests + typecheck/lint for affected files;
4. run ONE relevant WebGPU terrain smoke (and WebGL2 only if the runtime code changed in a backend-sensitive way or the previous proof is no longer valid);
5. if green, mark V2.1 closed and advance `ROADMAP.md` / this file to V2.2;
6. stop and report. Do not autonomously continue into V2.2 in the same block.

## CI cleanup already performed
Temporary checkpoint workflows have been removed:
- `v1-2-validation.yml` removed;
- `v1-3-validation.yml` removed;
- `v2-1-validation.yml` removed.

Do NOT recreate checkpoint-specific GitHub Actions workflows.
Use the permanent Pages workflow only as deployment/build confirmation, not as a development loop.

## Visual target
Production characters must already look intentional without armor:
- heroic old-school stylized silhouette;
- exaggerated coherent proportions;
- readable faces;
- expressive larger hands/feet;
- distinct male/female base shapes;
- fitted armor with correct shoulder/helmet anchoring;
- hand-painted/non-PBR material language;
- clear level-1 → endgame progression;
- transmog supported across the eventual 8 base archetypes.

## Chat continuity
New-chat read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `ROADMAP.md`
4. only the docs/code needed for the exact active block

Do not read all of `PROJECT_STATUS.md` unless a precise historical fact is needed.
Do not run autonomously for hours. A normal `go` = one small block, validation, report, stop.
