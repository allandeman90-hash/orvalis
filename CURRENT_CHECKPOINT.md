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
2. `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`

Locked after user correction on 2026-10-09:
- **ACTE I = levels 1–50.** This is the entire launch/base game.
- **The launch endgame at level 50 is the end of ACTE I.**
- Level 30 is only a major internal turning point, NOT an act ending.
- **ACTE II = future levels 50–75**, post-launch; do not design it in detail now.
- **ACTE III = future levels 75–100**, possibly the final main act, but that finality is not locked.
- **Long-term final character cap target = 100.**
- **Runic progression remains unbounded** at level 50, 75, 100 and beyond conventional character leveling.
- Content currently planned for 30–40 and 40–50 belongs to ACTE I / the launch game, not to future expansions.
- Any older text saying `Arc/Act I = 1–30`, `Arc/Act II = 30–40`, `Arc/Act III = 40–50`, or `level 50 = permanent final cap` is obsolete.
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
The current design work is all part of ACTE I.

## Levels 1–30 — opening and Ascendance discovery
- current nine regions = Noyau d'Orvalis;
- existing 74 regional quests are only an audit baseline, not target count;
- target roughly 140–170 regional quests for this portion plus Order chapters, dungeon quests, professions, events and secret chains;
- five current dungeons recontextualized boss-by-boss as lore evidence;
- Mère Vase remains living memory; healthy form is protected;
- neutral/hostile internal factions exist for Goblins, Kobolds, Crapoussins, Trolls and Drakônides;
- Maëlys Varenne / Darek Cendre-Libre are recurring opposite-faction Ascendant rivals;
- class differentiation uses shared campaign + Order-specific observations/interactions rather than eight fully duplicated campaigns.

Level 30 remains a major climax/turning point:
- Hérauts defeated;
- Sanctuaire des Tempêtes and Trône de Cendre-Noire remain major raids/events;
- Nyxaroth Incarnation defeat is real but partial;
- stinger remains `VOUS APPRENEZ ENCORE À LIRE.`

But the player is NOT at the end of Acte I yet.

## Levels 30–50 — second half of ACTE I
`docs/CAMPAIGN_02B_EXPANDED_CONTENT_1_50.md` currently contains a macro blueprint for this half of the launch game.

Existing working map concepts include:
- Archipel de Nacrebrume;
- Marches de Verre;
- Sous-Trame;
- Plateaux de Silex;
- Lisière Blanche;
- Cités d'Orée;
- La Confluence;
- Les Possibles Brisés.

These are NOT post-launch expansions. They are launch-game candidates and may still be reduced, merged, renamed or restructured if the full launch scope becomes too large.

Existing working instance concepts include:
- Phare des Marées Muettes;
- Fort de la Route Brisée;
- Atelier des Formes;
- Prison des Ancrés;
- Jardin des Lois;
- Bibliothèque des Noms Absents;
- Relais des Horizons;
- Conclave Brisé;
- Chambre de la Neuvième Lecture.

Again: these are launch Acte-I candidates, not future Acte-II/III content.

## ACTE I endgame — level 50
The true launch endgame belongs here and must conclude ACTE I strongly.

Required design goals:
- true level-50 endgame loop;
- final launch raids/encounters;
- runic progression continues indefinitely despite XP cap;
- Abîme sans fin becomes a major post-cap activity;
- final Acte-I story resolves the launch conflict while preserving enough mysteries for future Acte II 50–75;
- level 50 must feel like a major ending, not merely an XP stop.

# FUTURE ACTS — DO NOT DETAIL NOW
## ACTE II — levels 50–75
Post-launch future content. Preserve room only.

## ACTE III — levels 75–100
Post-launch future content. May be the final main act, but this is deliberately undecided.

No detailed maps, raids, boss roster, civilizations or expansion campaign should be designed for 51–100 until the launch game is much further along / shipped.

# ACTIVE PRIORITY — FINISH ACTE I 1–50 BEFORE RUNTIME MIGRATION
Do **not** jump to future Acts II/III.

Exact next design block:
1. reframe `CAMPAIGN_02B_EXPANDED_CONTENT_1_50.md` mentally as the second half of Acte I, not Arc II/III;
2. sanity-check launch scope so 30–50 is ambitious but buildable rather than behaving like two separate expansions;
3. define the 30–50 narrative progression and level-50 endgame as one continuous conclusion to Acte I;
4. decide which proposed new zones should remain full zones, which should become subzones/maps, and which can be postponed to future acts;
5. after Acte-I content skeleton is coherent, derive the production world/environment + creature/character Master Asset List and map-streaming requirements;
6. only then migrate runtime in small blocks.

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
4. `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`
5. only lore/campaign/code needed for the exact active block.
