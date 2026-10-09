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

Locked after user correction on 2026-10-09:
- **ACTE I = levels 1–50.** This is the entire launch/base game.
- **The launch endgame at level 50 is the end of ACTE I.**
- Level 30 is only a major internal turning point, NOT an act ending and NOT the final endgame.
- **ACTE II = future levels 50–75**, post-launch; do not design it in detail now.
- **ACTE III = future levels 75–100**, possibly the final main act, but that finality is not locked.
- **Long-term final character cap target = 100.**
- **Runic progression remains unbounded** at level 50, 75, 100 and beyond conventional character leveling.
- Future 51–100 content should remain only as narrative/geographic room and unresolved mysteries until after launch.

Runtime `LEVEL_CAP = 30` is design-obsolete, but later migration must update XP/item/profession/dungeon/endgame progression coherently rather than changing the constant alone.

# CANONICAL LORE + CAMPAIGN
Read in order when needed:
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

Central pillar: **unbounded runic ascension**. Runes are fragments of reality's laws; fusion reconstructs increasingly exact versions of those laws; Ascendants can continue accepting runic modification without a known ceiling. Two characters of identical conventional level can therefore become incomparably different in power through runes.

Narrative rule for twists: **never default to “everything you knew was false.” Prefer “what you knew was true, but you did not yet know what it meant.”**

# LORE STATE — LOCKED THROUGH LORE 6
Core canon includes:
- Informe, Première Rune, Écriture Première, Trame and Voile;
- runes as world-law fragments and equipment as Ancrages;
- Graveurs and Grand Glyphe;
- Morvhal, Elyra, Grande Réécriture and Fracture;
- Eight founders, Orders and Seals;
- modern Ascendants / Inachevés and the Voilés;
- Pacte d'Azur and Clans de Braise as political cultures, not good/evil races;
- Havrebleu and Forge-Cendre as lore-derived capitals;
- intelligent Crapoussins, Kobolds, Goblins, Trolls and Drakônides with internal factions/cultures;
- Eight playable classes as living runic grammars;
- the Neuvième Lecture hypothesis;
- nine current regions as Fracture scars;
- Morvhal guilty while having identified a pre-existing Grand Glyph failure;
- Elyra's residual pattern possibly embedded in the Grand Glyph;
- Nyxaroth as an Informe-origin presence forced into a Trame-compatible wyrm identity;
- wyrms as both creatures and runic phenomena;
- Grand Glyph as a coherence-maintenance system;
- current nine-region geography potentially being one cell of a larger structure;
- Catacombes' Roi Oublié as a fractured portion of Morvhal's Empreinte;
- Trône de Cendre-Noire's Nyxaroth as a true but partial Incarnation;
- Rune Impossible, fate of the Graveurs and true nature of gods intentionally unresolved.

# ACTE I — LAUNCH GAME — LEVELS 1–50

## Levels 1–30 — Noyau d'Orvalis
Current nine major regions:
1. Val d'Azur
2. Terres de Braise
3. Bois-Murmure
4. Canyon des Scories
5. Marais de Vasegrise
6. Cœur d'Orvalis
7. Pics Gelés
8. Désolation Cendrée
9. Cime des Tempêtes

Principles:
- existing 74 regional quests are only an audit baseline, not target count;
- target roughly 140–170 regional quests for this portion plus Order chapters, dungeon quests, professions, events and secret chains;
- five current dungeons recontextualized boss-by-boss as lore evidence;
- Mère Vase remains living memory; healthy form is protected;
- neutral/hostile internal factions exist for Goblins, Kobolds, Crapoussins, Trolls and Drakônides;
- Maëlys Varenne / Darek Cendre-Libre are recurring opposite-faction Ascendant rivals;
- class differentiation uses shared campaign + Order-specific observations/interactions rather than eight fully duplicated campaigns.

Level 30 is a major campaign turning point:
- Hérauts defeated;
- Sanctuaire des Tempêtes and Trône de Cendre-Noire are **mid-Acte-I campaign/palier raids**, not final endgame;
- Nyxaroth Incarnation defeat is real but partial;
- stinger remains `VOUS APPRENEZ ENCORE À LIRE.`
- player learns Orvalis is probably only one cell in a larger coherence network.

## Levels 30–50 — consolidated launch world
`docs/ACT_I_LAUNCH_SCOPE_1_50.md` overrides the previous over-expanded map count.

Launch target = approximately **13 major persistent regions total**, not ~17.

Four additional major regions:
10. **Archipel de Nacrebrume** — lvl ~30–35; Port-Nacré; maritime culture; Phare des Marées Muettes.
11. **Marches de Verre** — lvl ~30–40; contains Halte du Dernier Convoi + Route Brisée + **Plateaux de Silex / Haut-Silex as subzone and political hub**, not separate major region; Fort de la Route Brisée.
12. **Sous-Trame** — lvl ~37–45; persistent monumental Graveur underworld; Relais Sept; Atelier des Formes; confirms larger network without resolving the Graveurs.
13. **Territoires d'Orée** — lvl ~43–50; final leveling region; Cités d'Orée hub; contains **Lisière Blanche** and **La Confluence** as subzones; **Les Possibles Brisés** become high-level instanced/event content, not a separate persistent region.

Deferred/merged ideas are not deleted. They can become subzones, optional scenarios, Act-I updates, or later Act II/III material if still useful.

# DUNGEON TARGET — LAUNCH
Primary target = **10 strong dungeons**, not 11+ as a quota.

Levels 1–30:
1. Galeries de Mèchenoire
2. Sanctuaire Englouti
3. Catacombes du Roi Oublié
4. Citadelle de Givre-Écaille
5. Creuset Écarlate

Levels 30–50:
6. Phare des Marées Muettes
7. Fort de la Route Brisée
8. Atelier des Formes
9. Prison des Ancrés
10. Bibliothèque des Noms Absents

`Jardin des Lois` is retained as optional subzone/scenario/possible extra instance only if production scope allows.

A selected subset of launch dungeons should have meaningful **level-50 Heroic variants** for endgame, with changed mechanics/modifiers and loot rather than only more HP.

# TRUE ACTE-I ENDGAME — LEVEL 50
Level 50 is the real launch endgame and the actual conclusion of Acte I.

Required loops:
- Heroic dungeons;
- **Abîme sans fin** as the principal infinite PvE difficulty/runic progression loop;
- rotating world bosses;
- optional max-level PvP / Bastion / renown;
- high-level professions and Ancrage crafting;
- runic hunting/fusion/socket progression;
- raid progression.

## Endgame Raid I — Le Conclave Brisé
- level 50, 10 players;
- political/runic crisis around attempts to control or stabilize Ascendants;
- antagonists must have legitimate motives, not simply be another evil cult;
- opens access to the deeper Neuvième Lecture infrastructure.

## Endgame Final Raid — La Chambre de la Neuvième Lecture
- level 50, 10 players;
- **true conclusion of Acte I**;
- reveals Neuvième Lecture as a coherence relation between the eight grammars, not a ninth class;
- prevents forced synchronization of the Ascendant generation;
- uses a limited reading to stabilize the current crisis;
- does NOT resolve the Graveurs, gods, full Informe, Rune Impossible origin, or ultimate ceiling of runic power.

End-state of Acte I:
- Ascendants are permanently part of world politics;
- neither Azur, Braise nor the Orders own the answer to what Ascendants should become;
- launch story feels complete while leaving room for future Acte II 50–75.

# REALISTIC LAUNCH SCALE TARGET
Ambitious but consolidated target:
- **~13 major persistent regions**;
- many subzones/interiors rather than empty extra maps;
- **~10 dungeons**;
- 2 campaign/palier raids around level 30;
- 2 true level-50 endgame raids;
- Abîme sans fin;
- several world bosses and dynamic events;
- optional PvP;
- professions;
- several hundred total quests when campaign, regional, Order, profession, dungeon and secret content are counted.

Production principle:
> **Density before surface area. Coherence before quantity. One memorable place is worth more than three empty maps.**

# FUTURE ACTS — DO NOT DETAIL NOW
## ACTE II — levels 50–75
Post-launch future content. Preserve room only.

## ACTE III — levels 75–100
Post-launch future content. May be the final main act, but this is deliberately undecided.

No detailed maps, raids, boss roster, civilizations or expansion campaign should be designed for 51–100 until the launch game is shipped / substantially complete.

# ACTIVE PRIORITY — FINISH ACTE I WORLD/CONTENT SKELETON BEFORE RUNTIME MIGRATION
Do **not** jump to future Acts II/III and do not rewrite runtime quest/progression data yet.

Exact next design block:
1. design the **30–50 narrative spine of Acte I** across Nacrebrume → Marches de Verre → Sous-Trame → Territoires d'Orée;
2. define what the player learns at levels ~30, 35, 40, 45 and 50;
3. define the diverted-convoy truth, Ligue de Silex, Relais Sept, Cités d'Orée and the build-up to Conclave Brisé / Neuvième Lecture;
4. keep future Act II 50–75 mysteries open;
5. then derive the production world/environment + creature/character Master Asset List and streaming/map requirements;
6. only after that migrate runtime in small blocks.

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
- A0 production asset work remains valid but broad acquisition stays paused until the launch Acte-I content/world asset list is coherent.

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
5. `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`
6. only lore/campaign/code needed for the exact active block.
