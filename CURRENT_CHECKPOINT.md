# CURRENT_CHECKPOINT

Updated: 2026-10-09

## Mandatory first read
Read `AGENT_RULES.md` before doing anything in a new chat/session. Its execution/CI/commit/stop rules are binding unless the user explicitly reprioritizes the project in the current conversation.

# PRODUCT / DIRECTION
- Product: Orvalis web MMORPG, original world/assets/content.
- Visual target: dense stylized browser MMO with Hordes.io-like readability/density and WoW-Vanilla-like gameplay depth, without copying proprietary assets/content.
- Primary Vanilla mechanics/data reference: `docs/WoW_Vanilla_1.12.1_RE_Master.md`.
- Secondary implementation reference: `World0fWarcraft/OpenWow`.

# RELEASE / ACT STRUCTURE — LOCKED
Read first:
1. `docs/RELEASE_SCOPE_AND_LONG_TERM_CAP.md`
2. `docs/ACT_I_LAUNCH_SCOPE_1_50.md`

- **ACTE I = levels 1–50 = full launch/base game.**
- Level 30 = major internal turning point, not act ending.
- **Level 50 endgame concludes ACTE I.**
- Future ACTE II = 50–75 and ACTE III = 75–100; do not detail them before launch.
- Long-term conventional character cap target = 100.
- Runic progression remains unbounded.
- Runtime `LEVEL_CAP = 30` is design-obsolete but must later be migrated coherently with XP/items/professions/content rather than changed alone.

# CANONICAL LORE / CAMPAIGN
Read only as needed:
1. `docs/LORE_FOUNDATION.md`
2. `docs/LORE_01_CHRONOLOGY.md`
3. `docs/LORE_02_PEOPLES_CULTURES.md`
4. `docs/LORE_03_FACTIONS_CAPITALS.md`
5. `docs/LORE_04_EIGHT_ORDERS.md`
6. `docs/LORE_05_NINE_REGIONS.md`
7. `docs/LORE_06_BELIEFS_AND_TRUTHS.md`
8. `docs/CAMPAIGN_01_LEVELING_1_30.md`
9. `docs/CAMPAIGN_02_QUEST_AUDIT.md`
10. `docs/CAMPAIGN_02B_EXPANDED_CONTENT_1_50.md`
11. `docs/ACT_I_LAUNCH_SCOPE_1_50.md`
12. `docs/CAMPAIGN_03_ACT_I_LEVELS_30_50.md`
13. `docs/ACT_I_MASTER_ASSET_LIST.md`

Central pillar: **unbounded runic ascension**. Runes are fragments of reality's laws; fusion reconstructs increasingly exact versions of those laws; Ascendants can continue accepting runic modification without a known ceiling.

Narrative rule: **never default to “everything you knew was false.” Prefer “what you knew was true, but you did not yet know what it meant.”**

# ACTE I — WORLD / CONTENT STATE

## Levels 1–30 — Noyau d'Orvalis
Nine major regions remain canonically named:
1. Val d'Azur
2. Terres de Braise
3. Bois-Murmure
4. Canyon des Scories
5. Marais de Vasegrise
6. Cœur d'Orvalis
7. Pics Gelés
8. Désolation Cendrée
9. Cime des Tempêtes

Level 30 remains a major campaign turning point:
- Hérauts defeated;
- Sanctuaire des Tempêtes + Trône de Cendre-Noire = mid-Acte-I campaign/palier raids;
- Nyxaroth Incarnation defeat is real but partial;
- `VOUS APPRENEZ ENCORE À LIRE.` remains the stinger.

## Levels 30–50 — campaign blueprint complete
Detailed in `docs/CAMPAIGN_03_ACT_I_LEVELS_30_50.md`.

Four additional major regions:
10. Archipel de Nacrebrume — ~30–35
11. Marches de Verre — ~30–40, with Plateaux/Haut-Silex as subzone/hub
12. Sous-Trame — ~37–45, Relais Sept, Graveur network
13. Territoires d'Orée — ~43–50, Cités d'Orée, Lisière Blanche, Confluence

Level 50 opens the true launch endgame; completing the endgame story concludes Acte I.

# WORLD GEOGRAPHY — CRITICAL OVERRIDE
Read:
- `docs/ACT_I_ORGANIC_WORLD_GEOGRAPHY_OVERRIDE.md`
- `docs/ACT_I_WORLD_MAP_STREAMING_PLAN.md`

## Absolute rule
The final playable world must **NOT** preserve the current prototype's 3×3 square geography.

The current runtime `src/data/zones.js` is explicitly legacy/prototype geography:
- `col` / `row`;
- `ZONE_GRID` 3×3;
- `BORDER`;
- straight vertical/horizontal region boundaries;
- passes placed on those fixed lines.

These are **NOT CANONICAL PRODUCTION GEOGRAPHY** and must be removed/replaced during world migration.

What survives:
- region names and lore;
- broad compass relationships only;
- useful hubs/landmarks/connections.

What does NOT survive as production truth:
- exact current x/z positions;
- square region shapes;
- equal-sized regions;
- old pass coordinates;
- rectangular borders;
- grid-derived roads;
- minimap/world map based on the 3×3.

## Organic-map target
The world must feel like an organic MMORPG continent:
- irregular coastline;
- asymmetric mountain ranges;
- valleys/basins/rivers shaping travel;
- winding roads;
- region boundaries following terrain/ecology/history;
- regions with irregular shapes, protrusions and transition bands;
- no visible relationship between biome boundaries and terrain tiles.

The old 3×3 remains only a rough lore mnemonic for general direction (west/east/north/etc.), never a physical map template.

Validation rule:
> **If a screenshot of the world map lets the player infer a 3×3 grid or the streaming tile grid, the geography has failed.**

# TECHNICAL MAP / STREAMING PLAN — LOCKED BLUEPRINT
Canonical technical blueprint: `docs/ACT_I_WORLD_MAP_STREAMING_PLAN.md`.

Existing engine facts:
- cell = 4 m;
- chunk = 32 m;
- terrain tile = 512 m;
- TerrainMap is sparse;
- coordinates are effectively unbounded integers;
- multiple TerrainMaps can coexist;
- TerrainStreamer already supports load/unload radii, hysteresis and time-sliced building;
- far terrain already exists.

Production organization:
- `orvalis_mainland` = seamless main continent for surface regions;
- `nacrebrume` = separate offshore map;
- `sous_trame` = separate large underground map;
- dungeons/raids/special scenarios = instanced maps.

Important: **a lore region is not a TerrainMap and is not a terrain tile.** Region volumes/polygons will cross tile boundaries freely.

Logical content-sector plan:
- terrain tile = 512 × 512 m;
- future content sector = 128 × 128 m for object/spawn/event organization;
- this sector is a data/streaming unit only and must also remain invisible to players.

Initial streaming profile to profile later:
- detailed terrain load radius ≈ 1 tile;
- unload radius ≈ 2 tiles;
- far terrain radius ≈ 3 tiles;
- landmarks survive farther via lightweight proxies.

# DUNGEONS / RAIDS — LAUNCH TARGET
Primary dungeon target = **10 strong dungeons**:
1. Mèchenoire
2. Sanctuaire Englouti
3. Catacombes du Roi Oublié
4. Givre-Écaille
5. Creuset Écarlate
6. Phare des Marées Muettes
7. Fort de la Route Brisée
8. Atelier des Formes
9. Prison des Ancrés
10. Bibliothèque des Noms Absents

Raids:
- lvl ~30 campaign/palier: Sanctuaire des Tempêtes + Trône de Cendre-Noire;
- lvl 50 endgame: **Conclave Brisé** then **Chambre de la Neuvième Lecture**.

Endgame loops:
- Heroic dungeons;
- Abîme sans fin;
- runic hunting/fusion/socket progression;
- advanced Ancrage/profession crafting;
- rotating world bosses/events;
- optional max-level PvP;
- Possibles Brisés events;
- raid progression.

# MASTER ASSET LIST — COMPLETE
Canonical production blueprint: `docs/ACT_I_MASTER_ASSET_LIST.md`.

Locked production principles:
- build reusable asset families, not isolated one-off models;
- generic rocks/vegetation/small props may start from vetted CC0/free assets and be normalized into Orvalis style;
- identity-critical content must be original/custom: player bodies/equipment, Havrebleu, Forge-Cendre, Graveur/Grand-Glyphe architecture, Huit Ordres/runes/Ancrages, intelligent peoples, signature bosses/raids and major monuments;
- use modular architecture kits;
- regional kits must be recognizable from a HUD-less screenshot.

# FIRST PRODUCTION VERTICAL SLICE — LOCKED
## Slice A — Val d'Azur + edge of Havrebleu
This is the first integrated production-art target.

P0 needs include:
- player M/F production bodies;
- initial light/heavy equipment;
- temperate terrain layers;
- deciduous trees/bushes/grass/flowers;
- limestone rock family;
- farm/grange/fence/bridge/mill assets;
- carts/signs/lanterns/common props;
- wolf, boar, slime;
- civilian NPCs;
- first Azur modular kit;
- recognizable Havrebleu edge/silhouette;
- base rune VFX.

Technical authoring window may cover about 2×2 terrain tiles, but the **visible geography inside it must be organic**: winding roads, irregular fields, natural water, non-grid forest edges and sightlines that continue beyond the tile window.

The slice is part of the final mainland coordinates, not a disposable square test map.

# ART PIPELINE
Canonical rules: `docs/ART_ASSET_PIPELINE.md`.

Asset states:
candidate → vetted → local → normalized → runtime → approved.

Nothing enters production without provenance: asset id, author, licence, source, local path and modifications.

Prefer CC0 for generic environment seeds. No NC, ND, ripped-game or unclear-licence assets.

# ACTIVE PRIORITY
World/streaming boundaries are now sufficiently defined and the 3×3 prototype has been explicitly rejected for production.

Do NOT jump to Acts II/III and do NOT yet migrate quest/progression runtime.

Next coherent block:
1. resume **A0.1/A0.2 targeted asset review/acquisition only for Slice A — Val + Havrebleu edge**;
2. select a tiny coherent set of CC0/free generic environment seeds;
3. identify the mandatory custom-Orvalis gaps for the slice;
4. localize + record provenance for approved candidates;
5. then normalize/import the seed set and build the first organic production slice;
6. use that slice to validate art direction, density and browser performance before expanding world production.

# Stable engine state
- P0–P7 substantially implemented/validated.
- P8.1–P8.6 implemented/validated.
- P8.7 walk-on-water / levitation remains open before P9.
- P9 must NOT start yet.
- GitHub Pages: `https://allandeman90-hash.github.io/orvalis/`.
- Current mannequin/Vanguard and generated environment art are TEST FIXTURES only.

# Visual convergence / assets
- V0 complete.
- V1 complete.
- V2.1 terrain blend implemented; one WebGPU closure proof remains deferred due runner limitation. Do NOT restart V2.1.
- A0 production asset work remains valid.

# CI rules
- No checkpoint-specific GitHub Actions workflows.
- Permanent `.github/workflows/pages.yml` is deployment/build confirmation only.
- Use targeted tests/smokes when runtime code changes.

# Chat continuity
Read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `docs/ACT_I_ORGANIC_WORLD_GEOGRAPHY_OVERRIDE.md`
4. `docs/ACT_I_WORLD_MAP_STREAMING_PLAN.md`
5. `docs/ACT_I_MASTER_ASSET_LIST.md`
6. `docs/ART_ASSET_PIPELINE.md`
7. only files/docs needed for the exact active block.
