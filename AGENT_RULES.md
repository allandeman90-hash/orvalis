# ORVALIS AGENT RULES — MANDATORY

These rules exist to preserve continuity between ChatGPT sessions and prevent autonomous over-validation / CI loops.

## 0. READ ORDER — ALWAYS
Before modifying code in a new chat/session, read only:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `ROADMAP.md`
4. only the subsystem files/docs required by the current checkpoint

Do NOT read the whole `PROJECT_STATUS.md` unless a specific historical detail is needed.

## 1. SOURCE OF TRUTH
- The exact active checkpoint is whatever `CURRENT_CHECKPOINT.md` says.
- Do not reinterpret the roadmap, skip ahead, invent a replacement phase, or reopen a completed checkpoint without concrete evidence of a regression.
- The 1.12.1 master reverse-engineering spec is primary technical truth.
- `World0fWarcraft/OpenWow` is secondary implementation evidence only.
- Orvalis remains original: no proprietary Blizzard assets.

## 2. SESSION SIZE
A normal user `go` means: execute ONE small technical block of the active checkpoint, then report.
Do not silently continue for hours.

Target per block:
- inspect only relevant files;
- implement one coherent delta;
- run targeted validation;
- commit if green;
- report in a few lines.

If another block is needed, wait for the next `go` unless the user explicitly asked for autonomous completion of the whole checkpoint.

## 3. ABSOLUTE CI RULES
DO NOT create a new GitHub Actions workflow for a checkpoint or sub-checkpoint.
DO NOT edit CI/workflow files merely to validate feature code unless the user explicitly asks for CI work.
DO NOT use GitHub Actions as the development loop.
DO NOT poll a queued/running Action repeatedly for long periods.
DO NOT wait on CI for more than one concise verification cycle in a normal development block.

Existing permanent workflow:
- `.github/workflows/pages.yml` = deployment/build confirmation.

Temporary validation workflows are forbidden unless explicitly approved by the user.

## 4. TEST POLICY
Development loop:
- targeted Vitest for changed subsystem;
- typecheck when useful/required;
- lint only affected files;
- at most ONE relevant smoke while iterating.

Checkpoint closure:
- appropriate broader check once;
- affected WebGL2/WebGPU smoke only if the change actually touches GPU/runtime rendering;
- full `verify` only at major phase/release/shared-renderer boundaries.

Never rerun the same expensive proof after a documentation-only commit.
Never install Chromium repeatedly because a previous smoke already proved the unchanged runtime.
Do not weaken correct runtime behavior to satisfy a stale smoke; update the stale test if appropriate.

## 5. COMMIT DISCIPLINE
- Prefer 1 commit per coherent development block.
- A checkpoint should normally take only a small number of commits, not dozens.
- Do not make one commit per assertion, typo, CI retry, or waiting-state change.
- Documentation should be updated together with the code or once at checkpoint closure, not via repeated status-only commits.

## 6. OPENWOW USAGE
For a subsystem:
1. inspect the relevant Orvalis implementation;
2. inspect the corresponding 1.12.1 spec section;
3. inspect the corresponding OpenWow implementation only where it resolves structure/data-flow questions;
4. adapt the useful idea/algorithm into Orvalis TypeScript/WebGPU/WebGL2 architecture.

Do NOT browse unrelated OpenWow subsystems.
Do NOT copy native DirectX/Windows/auth/WotLK-specific code blindly.

## 7. VISUAL DIRECTION
- Current mannequin/Vanguard, generated terrain palettes, Cottage/Basin and similar code-generated assets are technical fixtures only.
- Do not spend substantial time polishing fixtures into final art.
- Production characters must look intentional and stylized even without equipment.
- Equipment/transmog must later fit all 8 base character archetypes.
- Visual convergence is judged in integrated player-facing scenes, not only isolated technical fixtures.

## 8. STOP CONDITIONS
Stop the current block and report instead of continuing autonomously when any of these occurs:
- validation exposes a new unrelated bug;
- required work expands outside the active checkpoint;
- a test/smoke is stale and would require changing unrelated behavior;
- a CI/tool queue becomes the bottleneck;
- more than ~3 repair iterations are needed for the same small change;
- the task would require a new workflow, broad architecture rewrite, or phase change.

## 9. CHAT HANDOFF
The assistant decides to suggest a new chat only after:
- ~3–5 substantial checkpoints, OR
- a major phase boundary, OR
- context/debug history is materially hurting accuracy.

Before changing chat:
- update `CURRENT_CHECKPOINT.md` with the exact next action and last verified state;
- keep `ROADMAP.md` accurate;
- do NOT dump long conversation history into the prompt.

New-chat prompt should simply instruct the assistant to read `AGENT_RULES.md`, `CURRENT_CHECKPOINT.md`, and `ROADMAP.md` and continue exactly from there.

## 10. USER PREFERENCE
The user values visible progress and short checkpoints over long autonomous runs. A six-hour hidden run is a failure mode, not diligence.
