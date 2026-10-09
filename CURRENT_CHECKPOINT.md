# CURRENT_CHECKPOINT

Updated: 2026-10-09

## Mandatory first read
Read `AGENT_RULES.md` before doing anything in a new chat/session. Its execution/CI/commit/stop rules are binding unless the user explicitly reprioritizes the project in the current conversation.

## Product / references
- Product: Orvalis web MMORPG, original world/assets/content.
- Visual/world target: dense stylized browser MMO world with Hordes.io-like readability/density principles and WoW-Vanilla-like gameplay depth, without copying proprietary assets/content.
- Primary technical truth for Vanilla mechanics/data behaviour: `docs/WoW_Vanilla_1.12.1_RE_Master.md`.
- Secondary implementation reference: `World0fWarcraft/OpenWow`.
- Hordes.io is a rendering/world-density reference only, not an asset/code source.

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

### V2.1 — IMPLEMENTED, CLOSURE DEFERRED
Useful V2.1 work already present includes external terrain texture/alpha support, production terrain layer adapter, 1–4 layer material path work, palette/material integration and targeted terrain production tests.

The last remaining closure proof was one WebGPU terrain smoke. The user explicitly chose not to block visible progress on that runner limitation. Do NOT restart V2.1 from zero. Its closure proof can be completed later when a suitable browser runner is available.

## ACTIVE PRIORITY — A0 production asset foundation
The user explicitly reprioritized visual convergence on 2026-10-09: assets come before further shader/world polish because placeholder geometry cannot meaningfully prove the desired art direction.

### A0.1 — Art review + provenance registry — IN PROGRESS
Goal:
- create `engine/public/art-review.html`;
- compare real legally usable candidate assets under one consistent camera/light/fog setup;
- keep author/licence/original source in `engine/public/assets/art-review-registry.json`;
- keep review URLs temporary: approved production assets must be copied locally before shipping.

Initial candidate seed set:
- Quaternius Pine Trees — CC0;
- Quaternius Rocks — CC0;
- Kay Lousberg Lantern — CC0.

See `docs/ART_ASSET_PIPELINE.md`.

## Exact next technical block after A0.1 lands
Do ONE small A0.2 block:
1. verify the art-review page is present in the Pages build;
2. select/retain a tiny coherent environment seed kit (trees + rocks + one small prop; reject anything visibly incompatible);
3. copy approved source assets locally into Orvalis rather than depending on external CDN mirrors;
4. record exact local paths + provenance;
5. stop/report before building broad world decoration.

After the seed kit exists locally, A0.3 builds the smallest practical static-GLB ingestion/normalization path into the custom renderer. Do not rewrite the renderer and do not import hundreds of assets at once.

## CI rules still apply
- No checkpoint-specific GitHub Actions workflows.
- Permanent `.github/workflows/pages.yml` is deployment/build confirmation only.
- Use targeted tests/smokes when runtime code changes.

## Visual target
The production world must prioritize:
- large streamed world;
- high decoration density without empty plains;
- batching/instancing and distance-aware cost control;
- stylized non-PBR material language;
- strong vertex/baked lighting, fog, foliage, shadows and readable silhouettes;
- coherent assets rather than raw mixed asset packs.

## Chat continuity
Read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `ROADMAP.md`
4. only docs/code needed for the exact active block.
