# CURRENT_CHECKPOINT

Updated: 2026-10-09

## Mandatory first read
Read `AGENT_RULES.md` before doing anything in a new chat/session. Its execution/CI/commit/stop rules are binding unless the user explicitly reprioritizes the project in the current conversation.

## Product / references
- Product: Orvalis web MMORPG, original world/assets/content.
- Visual target: dense stylized browser MMO with Hordes.io-like readability/density and WoW-Vanilla-like gameplay depth, without copying proprietary assets/content.
- Primary technical truth for Vanilla mechanics/data behaviour: `docs/WoW_Vanilla_1.12.1_RE_Master.md`.
- Secondary implementation reference: `World0fWarcraft/OpenWow`.

# CANONICAL RELEASE / ACT STRUCTURE — READ FIRST
1. `docs/RELEASE_SCOPE_AND_LONG_TERM_CAP.md`
2. `docs/ACT_I_LAUNCH_SCOPE_1_50.md`
3. `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`

Locked:
- **ACTE I = levels 1–50 = full launch/base game.**
- **Level 50 endgame concludes ACTE I.**
- Level 30 is only a major internal turning point.
- **ACTE II = future 50–75** and **ACTE III = future 75–100**; do not design them in detail now.
- Long-term final character level target = **100**.
- Runic progression remains **unbounded** regardless of conventional character level.
- Runtime `LEVEL_CAP = 30` is design-obsolete but must later be migrated coherently with XP/items/professions/content rather than changed alone.

# CANONICAL LORE + CAMPAIGN
Read as needed:
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
Nine major regions:
1. Val d'Azur
2. Terres de Braise
3. Bois-Murmure
4. Canyon des Scories
5. Marais de Vasegrise
6. Cœur d'Orvalis
7. Pics Gelés
8. Désolation Cendrée
9. Cime des Tempêtes

The existing 74 regional quests remain an audit baseline only. Target is a much denser MMO world with new chains, hubs, interiors, events and cultural content.

Level 30 remains a campaign turning point:
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
- build reusable **asset families**, not isolated one-off models;
- generic rocks/vegetation/small props may start from vetted CC0/free assets and be normalized into Orvalis style;
- identity-critical content must be original/custom: player bodies/equipment, Havrebleu, Forge-Cendre, Graveur/Grand-Glyphe architecture, Huit Ordres/runes/Ancrages, intelligent peoples, signature bosses/raids and major monuments;
- use modular architecture kits for Azur, Braise, Ancient Orvalis, Graveurs, Nacrebrume, Silex/Marches, Sous-Trame occupation and Orée;
- launch target stays approximately 13 major persistent regions with many subzones/interiors instead of empty extra maps;
- production target remains about 10 strong dungeons rather than quota-driven expansion;
- regional kits must be recognizable from a HUD-less screenshot.

## Intelligent peoples requiring original visual families
- Gobelins
- Kobolds
- Crapoussins
- Trolls
- Drakônides

## Character/equipment production target
- controlled original male + female base body on shared skeleton/contract;
- modular customization;
- four armor families (cloth/leather/mail/plate);
- roughly six visual progression tiers from low level through level-50 endgame;
- shared weapon library;
- eight Order/class signatures.

# FIRST PRODUCTION VERTICAL SLICE — LOCKED

## Slice A — Val d'Azur + edge of Havrebleu
This is now the first integrated production-art target.

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

This slice must prove in one integrated player-facing scene:
- terrain;
- dense vegetation;
- architecture;
- player character;
- equipment;
- creatures;
- roads/props;
- landmark composition;
- capital sightline;
- browser performance;
- unmistakable Orvalis visual identity.

Do **not** broadly acquire assets for all 13 regions before this slice validates the art direction.

# ART PIPELINE
Canonical rules: `docs/ART_ASSET_PIPELINE.md`.

Asset states:
candidate → vetted → local → normalized → runtime → approved.

Nothing enters production without provenance: asset id, author, licence, source, local path and modifications.

Prefer CC0 for generic environment seeds. No NC, ND, ripped-game or unclear-licence assets.

# ACTIVE PRIORITY — WORLD PRODUCTION SKELETON
Do NOT jump to future Acts II/III and do NOT yet mass-import assets.

Exact next coherent blocks available, in order:
1. derive **technical map/streaming boundaries** for the 13 major regions, subzones, interiors, dungeons and raids;
2. then resume **A0.1/A0.2 targeted asset review/acquisition only for Slice A (Val + Havrebleu edge)**;
3. normalize/import the selected local seed assets through the existing production asset path;
4. build and visually validate Slice A before expanding acquisition to Braise or other regions;
5. only after the production-world skeleton is coherent should runtime quest/NPC/mob/progression migration begin in small blocks.

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
- V2.1 terrain blend implemented; one WebGPU closure proof remains deferred due runner limitation. Do NOT restart V2.1 from zero.
- A0 production asset work remains valid.
- Broad acquisition was paused until this Master Asset List existed; it may now resume **only in targeted Slice-A scope** after map/streaming boundaries are defined.

# CI rules
- No checkpoint-specific GitHub Actions workflows.
- Permanent `.github/workflows/pages.yml` is deployment/build confirmation only.
- Use targeted tests/smokes when runtime code changes.

# Chat continuity
Read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `docs/RELEASE_SCOPE_AND_LONG_TERM_CAP.md`
4. `docs/ACT_I_LAUNCH_SCOPE_1_50.md`
5. `docs/CAMPAIGN_03_ACT_I_LEVELS_30_50.md`
6. `docs/ACT_I_MASTER_ASSET_LIST.md`
7. `docs/ART_ASSET_PIPELINE.md`
8. only files/docs needed for the exact active block.
