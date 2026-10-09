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

## CANONICAL DESIGN SCOPE — LEVEL 1–50
Read this before the campaign files:
- `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`

This is a canonical override where older campaign docs imply that level 30 or the current 9-region map is the full game.

Locked scope:
- **Level cap target = 50.**
- **Level 30 is the end of Arc I, not the end of the base game.**
- The current nine regions are the **Noyau d'Orvalis**, not the whole world.
- Existing quests/zones/dungeons are a foundation, not a content ceiling.
- New quests, quest chains, NPCs, hubs, landmarks, caves, interiors, zones, maps, dungeons, raids, peoples and cultures may and should be created when the lore/game quality justifies them.
- Preserve existing IDs/systems only when useful; never keep weak content merely because it already exists.
- Runtime `LEVEL_CAP = 30` is now design-obsolete but must later be migrated together with XP/item/profession/dungeon/endgame progression rather than changed in isolation.

## CANONICAL LORE + CAMPAIGN
Read these in order:
1. `docs/LORE_FOUNDATION.md`
2. `docs/LORE_01_CHRONOLOGY.md`
3. `docs/LORE_02_PEOPLES_CULTURES.md`
4. `docs/LORE_03_FACTIONS_CAPITALS.md`
5. `docs/LORE_04_EIGHT_ORDERS.md`
6. `docs/LORE_05_NINE_REGIONS.md`
7. `docs/LORE_06_BELIEFS_AND_TRUTHS.md`
8. `docs/CAMPAIGN_01_LEVELING_1_30.md`
9. `docs/CAMPAIGN_02_QUEST_AUDIT.md`

Central pillar: **unbounded runic ascension**. Runes are fragments of reality's laws; fusion reconstructs more exact versions of those laws; Ascendants can continue accepting runic modification without a known ceiling. Two initially identical individuals can therefore become incomparably different in power.

Core canon includes:
- Informe, Première Rune, Écriture Première and Trame;
- runes as world-law fragments and equipment as Ancrages;
- Voile and Nyxaroth / Celle-qui-n'a-pas-de-Nom;
- Graveurs and Grand Glyphe beneath ancient Valcœur;
- Morvhal, Elyra, Grande Réécriture and Fracture in year 0 AF;
- Eight founders, Eight Orders and Eight Seals;
- modern Ascendants / Inachevés and the Voilés;
- game beginning in year 1000 AF;
- Pacte d'Azur and Clans de Braise as political cultures, not good/evil races;
- Havrebleu and Forge-Cendre as lore-derived capitals;
- intelligent Crapoussins, Kobolds, Goblins, Trolls and Drakônides with internal factions/cultures;
- Eight playable classes as living runic grammars;
- each Order itself being part of its Seal;
- hidden Neuvième Lecture hypothesis;
- nine current regions as Fracture scars: Continuity, Transformation, Memory, Depth, Boundary, Contradiction, Stillness, Dissolution and Potential;
- Morvhal guilty while having identified a pre-existing Grand Glyph failure;
- Elyra's residual pattern possibly embedded in the Grand Glyph;
- Nyxaroth as an Informe-origin presence forced into a Trame-compatible wyrm identity;
- wyrms as both creatures and runic phenomena;
- Grand Glyph as a coherence-maintenance system rather than merely a lock;
- unbounded Ascendance as a possible future source of Trame instability;
- current nine-region geography potentially being part of a larger inscription;
- Catacombes' Roi Oublié as a fractured portion of Morvhal's Empreinte;
- Trône de Cendre-Noire's Nyxaroth as a true but partial Incarnation;
- Rune Impossible, fate of the Graveurs and true nature of gods intentionally unresolved.

Narrative rule for twists: **never default to “everything you knew was false.” Prefer “what you knew was true, but you did not yet know what it meant.”**

Do NOT redesign quests, dungeons, raids, capitals, zones, landmarks or production art independently of this canon and campaign.

## CAMPAIGN STRUCTURE

### ARC I — L'ASCENDANCE — levels 1–30
Blueprint: `docs/CAMPAIGN_01_LEVELING_1_30.md`

Current plan:
- preserve useful parts of the existing 16 class-story chapter structure at levels `1,1,2,3,5,6,8,11,13,16,19,22,25,28,30,30`;
- faction paths start separately, then converge narratively in Vasegrise and later contested regions;
- opposite-faction Ascendant rivals: Maëlys Varenne / Darek Cendre-Libre;
- dungeons provide strong lore proof without becoming mandatory solo blockers;
- Azhkar becomes a recurring Potential phenomenon;
- Sanctuaire des Tempêtes reveals the geography/Grand Glyph relation;
- Trône de Cendre-Noire ends Arc I by destroying a true but partial Nyxaroth Incarnation;
- end stinger: `VOUS APPRENEZ ENCORE À LIRE.`

### ARC II — levels 30–40
Status: **TO DESIGN**.

Hard requirement: physically expand the game beyond the current nine-region core. Add several genuinely new maps/zones rather than recycling the same regions with higher-level mobs.

Possible lore axes to explore later:
- territories beyond modern Azur/Braise borders;
- maritime routes/archipelagos from Havrebleu;
- deeper Graveur networks;
- destination of the diverted Fracture relief convoys;
- external cultures/powers;
- political response to mass Ascendants;
- first serious clues about the Graveurs;
- Rune Impossible developments.

Arc II should have its own hubs, dungeons and at least one major raid.

### ARC III — levels 40–50
Status: **TO DESIGN**.

Purpose: make Ascendance itself a social/cosmic problem. The player should move from “I have no known ceiling” to “what does a near-unbounded individual do to society and reality?”

Potential later axes:
- high-level Ascendant instability;
- competing philosophies of infinite progression;
- Neuvième Lecture consequences;
- larger-scale Grand Glyph structure;
- possible Informe response to the Ascendant generation;
- political control of ultra-high-rank runes;
- repair vs rewrite vs evolution of the Trame.

Level 50 should conclude a complete base-game story while preserving extension-scale mysteries.

## CAMPAIGN 2A — EXISTING QUEST AUDIT
`docs/CAMPAIGN_02_QUEST_AUDIT.md`

This audit remains valid **only as an audit of existing content**.

- 74 current regional quests audited.
- Existing quest slots mapped to KEEP / REWRITE / REPLACE; no pure deletion required yet.
- Current IDs/levels/reward hooks/objective primitives may be reused where practical.
- This is **not** the target quest count and **not** an exhaustive future content list.
- Every zone design pass must additionally ask: **what new content is missing for this to feel like a real MMO?**
- New chains/events/exploration/story quests may be added freely when justified.
- Generic species-kill premises are non-canon for Goblins, Kobolds, Crapoussins, Trolls and Drakônides.
- Healthy Mère Vase is protected living memory; any encounter targets corruption/parasite/echo instead.
- Cime guardians are repaired/reactivated rather than killed for runes.
- PvP remains optional to main-story comprehension.

## ACTIVE PRIORITY — EXPANDED CONTENT PLAN BEFORE RUNTIME MIGRATION
Do **not** proceed directly to rewriting runtime data from the old 1–30-only assumption.

### Exact next design block
Re-scope **CAMPAIGN 2B** around the new 1–50 target:
1. finish boss-by-boss + entrance/fallback/follow-up design for the existing 5 dungeons and 2 Arc-I raids;
2. define Maëlys/Darek and class-Order beats through Arc I;
3. identify **new quests, subzones, caves/interiors/events and optional chains missing from each current region** rather than merely rewriting existing quests;
4. then design the macro geography/content requirements for **Arc II (30–40)** and **Arc III (40–50)**, including genuinely new zones/maps, new hubs, new dungeons and new raids;
5. only after the full 1–50 content skeleton is coherent should runtime quest/NPC/mob/progression data be migrated.

After the 1–50 content skeleton:
- derive the production world/environment + creature/character Master Asset List;
- derive scenic/environment briefs for existing and newly created regions;
- resume broad production asset acquisition only from those lists.

## Stable engine state
- P0–P7 substantially implemented/validated.
- P8.1–P8.6 implemented/validated.
- P8.7 walk-on-water / levitation remains open before P9.
- P9 must NOT start yet.
- GitHub Pages: `https://allandeman90-hash.github.io/orvalis/`.
- Current mannequin/Vanguard and generated environment art are TEST FIXTURES only, never production visual targets.

## Visual convergence state
- V0 complete.
- V1 complete.
- V2.1 terrain blend implemented; one WebGPU closure proof remains deferred due runner limitation. Do NOT restart V2.1 from zero.

## Asset foundation — PAUSED BEHIND 1–50 CONTENT PLAN
A0 production asset work remains valid but is not the current design priority.

A0.1 art review/provenance already includes Quaternius Pine Trees, Quaternius Rocks and Kay Lousberg Lantern. See `docs/ART_ASSET_PIPELINE.md`.

Do not perform broad asset acquisition until the lore-derived asset lists for the expanded 1–50 world exist.

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
- environments whose terrain, architecture, settlements, water, props and scenic compositions visibly follow history and culture;
- each region identifiable from a UI-free screenshot through terrain, architecture, water, vegetation, atmosphere and its specific runic/history identity.

## Chat continuity
Read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`
4. `docs/LORE_FOUNDATION.md`
5. `docs/LORE_01_CHRONOLOGY.md`
6. `docs/LORE_02_PEOPLES_CULTURES.md`
7. `docs/LORE_03_FACTIONS_CAPITALS.md`
8. `docs/LORE_04_EIGHT_ORDERS.md`
9. `docs/LORE_05_NINE_REGIONS.md`
10. `docs/LORE_06_BELIEFS_AND_TRUTHS.md`
11. `docs/CAMPAIGN_01_LEVELING_1_30.md`
12. `docs/CAMPAIGN_02_QUEST_AUDIT.md`
13. `ROADMAP.md`
14. only files/docs needed for the exact active block.
