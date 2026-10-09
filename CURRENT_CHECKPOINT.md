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

## CANONICAL LORE FOUNDATION — LOCKED
The canonical lore foundation is now `docs/LORE_FOUNDATION.md`.

Its central pillar is **unbounded runic ascension**: runes are fragments of the laws of reality, fusion reconstructs increasingly exact versions of those laws, and Ascendants can continue accepting runic modifications without a known ceiling. Two initially identical individuals can therefore become incomparably different in power.

Core canon currently includes:
- the Informe;
- the Première Rune and the Écriture Première;
- the Trame as written reality;
- runes as fragments of world-law rather than ordinary enchantments;
- equipment as runic Ancrages;
- the Voile as the boundary between written reality and the Informe;
- Nyxaroth / Celle-qui-n'a-pas-de-Nom;
- the Grand Glyphe beneath ancient Valcœur;
- Morvhal and his daughter Elyra;
- the Grande Réécriture and the temporary erasure of Death;
- the Fracture into nine regions of resonance;
- the Eight founders, Eight Orders and Eight Seals;
- the modern Ascendants / Inachevés;
- the Voilés and their goal of completing the Grande Réécriture.

Do NOT redesign major quests, dungeons, raids, capitals, zones, landmarks or production art sets independently of this lore. The world, architecture, creatures and assets must become consequences of the canon.

The lore is also intended to become the basis of a future opening cinematic/video, but the cinematic should preserve mysteries and not reveal every hidden truth immediately.

## ACTIVE PRIORITY — LORE-FIRST WORLD DESIGN
The user explicitly reprioritized Orvalis on 2026-10-09: before mass asset acquisition or broad world decoration, build a deep epic lore and then derive quests, dungeons, raids, capitals, environments and asset requirements from it.

### Current next lore block
Build **LORE 1 — historical eras and chronology**, from the earliest known civilizations through the exact present-day moment when the new generation of Ascendants appears.

Then derive:
1. peoples/cultures and political history;
2. the two current factions and their capitals;
3. the Eight Orders and their internal history;
4. the nine regions as consequences of the Fracture;
5. local myths versus hidden truth;
6. quest/dungeon/raid rewrites;
7. world/environment Master Asset List.

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

## Asset foundation — PAUSED BEHIND LORE
A0 production asset work remains valid but is not the current design priority.

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

Do not perform broad asset acquisition until the lore-derived world/environment Master Asset List exists. Existing technical asset pipeline work should be preserved, not restarted.

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
- coherent assets rather than raw mixed asset packs;
- environments whose terrain, architecture, settlements, water, props and scenic compositions visibly follow the world's history and cultures.

## Chat continuity
Read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `docs/LORE_FOUNDATION.md`
4. `ROADMAP.md`
5. only docs/code needed for the exact active block.
