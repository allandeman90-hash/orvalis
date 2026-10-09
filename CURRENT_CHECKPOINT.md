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
Read first:
- `docs/CAMPAIGN_00_SCOPE_LEVEL_50.md`

Locked scope:
- **Character level cap target = 50.**
- **Runic progression remains unbounded in lore/design.** Level 50 is the cap of conventional character mastery, not a cap on eventual power.
- Level 30 is the end of Arc I, not the end of the base game.
- The current nine regions are the **Noyau d'Orvalis**, not the whole world.
- Existing quests/zones/dungeons are a foundation, not a content ceiling.
- New quests, chains, NPCs, hubs, landmarks, caves, interiors, zones, maps, dungeons, raids, peoples and cultures should be created when justified.
- Runtime `LEVEL_CAP = 30` is design-obsolete but must later be migrated together with XP/item/profession/dungeon/endgame progression rather than changed alone.

## CANONICAL LORE + CAMPAIGN
Read in order:
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

Central pillar: **unbounded runic ascension**. Runes are fragments of reality's laws; fusion reconstructs more exact versions of those laws; Ascendants can continue accepting runic modification without a known ceiling. Two level-50 characters that look conventionally identical can therefore become incomparably different in power through runes.

Narrative rule for twists: **never default to “everything you knew was false.” Prefer “what you knew was true, but you did not yet know what it meant.”**

Do NOT redesign quests, dungeons, raids, capitals, zones, landmarks or production art independently of this canon and campaign.

## LORE STATE — LOCKED THROUGH LORE 6
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
- current nine-region geography potentially being one cell of a larger inscription/network;
- Catacombes' Roi Oublié as a fractured portion of Morvhal's Empreinte;
- Trône de Cendre-Noire's Nyxaroth as a true but partial Incarnation;
- Rune Impossible, fate of the Graveurs and true nature of gods intentionally unresolved.

## CAMPAIGN STRUCTURE

### ARC I — L'ASCENDANCE — levels 1–30
Blueprint: `docs/CAMPAIGN_01_LEVELING_1_30.md`
Audit: `docs/CAMPAIGN_02_QUEST_AUDIT.md`
Expanded content: `docs/CAMPAIGN_02B_EXPANDED_CONTENT_1_50.md`

Locked principles:
- current 16 class-story structure can be reused where useful;
- faction starts remain distinct then converge;
- Maëlys Varenne / Darek Cendre-Libre are recurring opposite-faction Ascendant rivals;
- five current dungeons are recontextualized boss-by-boss as lore evidence;
- Sanctuaire des Tempêtes reveals the nine-region geography as part of the Grand Glyph;
- Trône de Cendre-Noire destroys a true but partial Nyxaroth Incarnation;
- stinger: `VOUS APPRENEZ ENCORE À LIRE.`
- the 74 current regional quests are only an audit baseline, not the target count;
- Arc I regional content target is roughly **140–170 quests** total, plus Order chapters, dungeon quests, professions, events and secret chains;
- every current zone receives additional chains/subzones/events where needed;
- Mère Vase remains living memory; healthy form is protected;
- neutral/hostile internal factions exist for Goblins, Kobolds, Crapoussins, Trolls and Drakônides;
- class differentiation uses **Lentilles d'Ordre**: shared quests with class-specific observations/interactions instead of eight completely duplicated campaigns.

New Arc-I environment/content additions include, as blueprint:
- Val: Millennial festival, returning roads, Havrebleu cliffs, interior under Old Mill, convoy event;
- Terres: Cendre des Noms, Oasis investigation, lower forges, Rougeverre caves, caravan event;
- Bois: pacified Souche-Creuse hub, memory glades, Under-Roots, Goblin succession and memory stories;
- Canyon: neutral Fouille-Suie, Galerie du Battement, gallery-right disputes, minecart event;
- Marais: Bourg-Crapoussin neutral hub, Chant des Neuf, Gens des Roseaux, Dômes Noyés, wounded-memory event;
- Cœur: Avenue Blanche, Quartier des Cartographes, Jardins du Dernier Jour, Sous-Valcœur, Elyra map chain, Contradiction event;
- Pics: neutral Troll refuge, ancestor route, frozen convoy chain, under-lake map, white-storm event;
- Désolation: Refuge Sans-Écaille, Cendres-Liées chain, Empreinte weapons, Obsidian veins, eastern Black-Glass frontier;
- Cime: Chemin des Serments, Eight Stations, Sky Bridges, recurring Azhkar event.

### ARC II — LES ROUTES PERDUES — levels 30–40
Status: **MACRO SKELETON LOCKED; detailed lore next.**

New major maps:
1. **Archipel de Nacrebrume** (30–34) — maritime route from Havrebleu; Port-Nacré; outside the strongest Fracture scars.
2. **Marches de Verre** (30–34) — beyond eastern Désolation; Halte du Dernier Convoi; diverted year-0 convoy trail.
3. **Sous-Trame** (34–38) — enormous Graveur maintenance network; Relais Sept; Battement as synchronization signal.
4. **Plateaux de Silex** (37–40) — independent Ligue de Silex; Haut-Silex; first external government treating Ascendants as geopolitical weapons.

New dungeons minimum:
- Phare des Marées Muettes;
- Fort de la Route Brisée;
- Atelier des Formes.

Arc-II raid:
- **Relais des Horizons** (lvl 40).
- Revelation: the Noyau d'Orvalis is only one local cell in a much larger Graveur coherence network.
- End hook: `SOURCE NON INSCRITE` reacts with the Rune Impossible.

### ARC III — LES INACHEVÉS — levels 40–50
Status: **MACRO SKELETON LOCKED; detailed lore later.**

New major maps:
1. **Lisière Blanche** (40–43) — first clear proof that powerful Ascendants can damage the Trame without Nyxaroth.
2. **Cités d'Orée** (42–45) — international political center debating the legal status/control of Ascendants.
3. **La Confluence** (45–48) — multiple Graveur lines; proximity of powerful Ascendants alters local laws.
4. **Les Possibles Brisés** (48–50) — several possible states overlap after a modern Neuvième Lecture experiment.

New dungeons minimum:
- Prison des Ancrés;
- Jardin des Lois;
- Bibliothèque des Noms Absents.

New political movement:
- **Les Souverains** (working canonical organization name): Ascendant-rights movement with legitimate positions and a radical faction seeking freedom even from the Trame itself. Do not reduce them to a new evil cult.

Arc-III raids:
- **Le Conclave Brisé** (49–50);
- **La Chambre de la Neuvième Lecture** (lvl 50, base-game final raid).

Final base-game revelation:
- Neuvième Lecture is not a ninth class but a coherence relation between the eight grammars, allowing multiple reality modifications to coexist without destroying each other.
- The final campaign prevents forced synchronization of the Ascendant generation while using a limited version to stabilize existing damage.
- Level 50 concludes conventional progression, not runic potential.

## TARGET BASE-GAME SCALE
Design target, not a blind quota:
- ~17 major regions (9 current + ~8 new);
- multiple subzones/interiors;
- 11+ dungeons (5 current + 6+ new);
- 5 major raids (2 current + 3 new);
- several world bosses and dynamic events;
- several hundred quests when main, regional, class, profession, dungeon and secret content are counted.

Quality and coherence remain more important than raw quantity.

## ACTIVE PRIORITY — LORE ARC II BEFORE RUNTIME MIGRATION
Do **not** rewrite runtime quest/progression data yet.

### Exact next design block
Build **ARC II LORE 1 — LES ROUTES PERDUES** in depth:
1. explain why Nacrebrume, Marches de Verre, Sous-Trame and Plateaux de Silex exist historically/geographically;
2. define cultures, peoples, architecture, politics and visual language of each;
3. define what happened to the diverted year-0 convoys and why;
4. define the Ligue de Silex and its relationship to Orvalis/Azur/Braise;
5. define Relais Sept and the Relais des Horizons;
6. define Arc-II antagonists/factions without making everything another Voilé plot;
7. define the 30–40 reveal cadence and Maëlys/Darek progression;
8. preserve Graveur fate / gods / Rune Impossible origin as future mysteries.

After detailed Arc II lore:
- detail Arc III lore;
- derive the production world/environment + creature/character Master Asset List for 1–50;
- decide technical map boundaries/streaming requirements;
- only then migrate runtime in small blocks.

## Stable engine state
- P0–P7 substantially implemented/validated.
- P8.1–P8.6 implemented/validated.
- P8.7 walk-on-water / levitation remains open before P9.
- P9 must NOT start yet.
- GitHub Pages: `https://allandeman90-hash.github.io/orvalis/`.
- Current mannequin/Vanguard and generated environment art are TEST FIXTURES only.

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
- coherent assets rather than raw mixed packs;
- environments whose terrain, architecture, settlements, water, props and scenic compositions visibly follow history/culture;
- each region identifiable from a UI-free screenshot.

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
13. `docs/CAMPAIGN_02B_EXPANDED_CONTENT_1_50.md`
14. `ROADMAP.md`
15. only files/docs needed for the exact active block.
