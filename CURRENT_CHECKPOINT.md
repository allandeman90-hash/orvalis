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

## CANONICAL LORE + CAMPAIGN — LOCKED THROUGH CAMPAIGN 2 QUEST AUDIT
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

The central pillar is **unbounded runic ascension**: runes are fragments of the laws of reality, fusion reconstructs increasingly exact versions of those laws, and Ascendants can continue accepting runic modifications without a known ceiling. Two initially identical individuals can therefore become incomparably different in power.

Core canon includes:
- the Informe, Première Rune, Écriture Première and Trame;
- runes as fragments of world-law and equipment as Ancrages;
- the Voile and Nyxaroth / Celle-qui-n'a-pas-de-Nom;
- the Graveurs and Grand Glyphe beneath ancient Valcœur;
- Morvhal, Elyra, the Grande Réécriture and the Fracture in year 0 AF;
- the Eight founders, Eight Orders and Eight Seals;
- modern Ascendants / Inachevés and the Voilés;
- the game beginning in year 1000 AF;
- Pacte d'Azur and Clans de Braise as political cultures, not good/evil races;
- Havrebleu and Forge-Cendre as lore-derived capitals;
- intelligent Crapoussins, kobolds, goblins, trolls and drakônides with internal factions/cultures;
- the Eight playable classes as living runic grammars;
- each Order itself being part of its Seal;
- the hidden Neuvième Lecture hypothesis;
- the nine regions as Fracture scars: Continuity, Transformation, Memory, Depth, Boundary, Contradiction, Stillness, Dissolution and Potential;
- Morvhal as guilty while having correctly identified a pre-existing failure in the Grand Glyph;
- Elyra's residual pattern possibly embedded in the Grand Glyph;
- Nyxaroth as an Informe-origin presence forced into a Trame-compatible wyrm identity;
- wyrms as both creatures and runic phenomena;
- the Grand Glyph as a coherence-maintenance system rather than merely a lock;
- unbounded Ascendance as a possible long-term source of Trame instability;
- the nine-region map potentially being part of a larger inscription;
- Catacombes' Roi Oublié as a fractured portion of Morvhal's Empreinte;
- Trône de Cendre-Noire's Nyxaroth as a true but partial Incarnation;
- Rune Impossible, fate of the Graveurs and true nature of gods intentionally unresolved.

Narrative rule for future twists: **never default to “everything you knew was false.” Prefer “what you knew was true, but you did not yet know what it meant.”**

Do NOT redesign quests, dungeons, raids, capitals, zones, landmarks or production art sets independently of this canon and campaign.

The lore is intended to become the basis of a future opening cinematic/video, but the cinematic must preserve mysteries and not reveal every hidden truth immediately.

## ACTIVE PRIORITY — LORE-DERIVED GAME CONTENT
The user explicitly reprioritized Orvalis on 2026-10-09: first establish the epic lore, then derive quests, dungeons, raids, capitals, environments and asset requirements from it.

### Completed lore blocks
- **LORE 0** — cosmology / Écriture Première / runic ascension.
- **LORE 1** — historical eras and chronology through 1000 AF.
- **LORE 2** — peoples, cultures, politics and intelligent non-human peoples.
- **LORE 3** — factions, current politics, Havrebleu and Forge-Cendre.
- **LORE 4** — Eight Orders, Seals, class grammars, sanctuaries, schisms, Heralds and Neuvième Lecture.
- **LORE 5** — nine regions as runic scars, including terrain, water, vegetation, settlements and scenic identity.
- **LORE 6** — public beliefs, hidden truths, reveal structure and unresolved mysteries.

### Completed campaign blocks
- **CAMPAIGN 1 — L'ASCENDANCE** (`docs/CAMPAIGN_01_LEVELING_1_30.md`) — canonical level 1–30 narrative spine and base endgame conclusion.
- Preserve the current 16 class-story chapter levels `1,1,2,3,5,6,8,11,13,16,19,22,25,28,30,30` where practical.
- Faction paths remain distinct through the starting regions and first secondary region, then converge narratively in Vasegrise and contested zones.
- Opposite-faction Ascendant rivals: Maëlys Varenne / Darek Cendre-Libre.
- Dungeons provide strong lore proof without becoming mandatory solo progression blockers.
- Azhkar is a recurring Potential phenomenon.
- Sanctuaire des Tempêtes reveals the geography/Grand Glyph relation.
- Trône de Cendre-Noire ends Arc 1 by destroying a true but partial Nyxaroth Incarnation.
- End stinger: `VOUS APPRENEZ ENCORE À LIRE.`

- **CAMPAIGN 2A — QUEST AUDIT** (`docs/CAMPAIGN_02_QUEST_AUDIT.md`) — complete audit of the 74 current regional quests plus the 16 generated class-story chapter templates and the 7 instances.
- Every regional quest is mapped to KEEP / REWRITE / REPLACE; no current regional quest slot needs pure deletion.
- IDs, levels, reward hooks, existing NPCs and objective primitives should be preserved where practical to reduce migration risk.
- Generic species-kill premises are explicitly non-canon for Goblins, Kobolds, Crapoussins, Trolls and Drakônides.
- Mère Vase becomes a protected living memory; the boss encounter must be a corruption/parasite/echo rather than killing the healthy Mère Vase.
- Cime guardians are repaired/reactivated rather than killed for their runes.
- PvP remains optional to the main narrative.
- New reusable NPC needs are identified: neutral Goblin, neutral Kobold elder, Crapoussin spokesperson, Mère Vase memory-keeper, non-hostile Troll, dissident Drakônide, Maëlys/Darek, optional Elyra archivist.

### Exact next design block
Finish **CAMPAIGN 2B — instance/rival/class beat specification** before runtime migration:
1. define entrance quest, solo fallback clue and post-instance follow-up for each of the 5 dungeons;
2. define exact Maëlys/Darek encounters in Vasegrise, Cœur, Pics, Cime and endgame;
3. define the class-specific Order beat attached to each major campaign act without multiplying the whole quest count eightfold;
4. define boss-by-boss lore role for the 5 dungeons + 2 raids, preserving existing bosses where compatible;
5. define exactly which post-boss evidence/object advances the mystery;
6. then freeze the content plan before changing runtime quest/NPC/mob data.

After CAMPAIGN 2B:
- either migrate content runtime in small zone blocks, or first derive the production world/environment + creature/character Master Asset List if the user wants to finish the full content plan before coding;
- broad production asset acquisition remains paused until that lore-derived asset list exists.

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
Existing terrain blend work is valid. One WebGPU closure proof remains deferred due runner limitation. Do NOT restart V2.1 from zero.

## Asset foundation — PAUSED BEHIND LORE-DERIVED CONTENT
A0 production asset work remains valid but is not the current design priority.

A0.1 art review/provenance work already includes Quaternius Pine Trees, Quaternius Rocks and Kay Lousberg Lantern. See `docs/ART_ASSET_PIPELINE.md`.

Do not perform broad asset acquisition until the lore-derived world/environment Master Asset List exists.

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
- each region identifiable from a UI-free screenshot through its runic scar, terrain, architecture, water, vegetation and scenic composition.

## Chat continuity
Read order:
1. `AGENT_RULES.md`
2. `CURRENT_CHECKPOINT.md`
3. `docs/LORE_FOUNDATION.md`
4. `docs/LORE_01_CHRONOLOGY.md`
5. `docs/LORE_02_PEOPLES_CULTURES.md`
6. `docs/LORE_03_FACTIONS_CAPITALS.md`
7. `docs/LORE_04_EIGHT_ORDERS.md`
8. `docs/LORE_05_NINE_REGIONS.md`
9. `docs/LORE_06_BELIEFS_AND_TRUTHS.md`
10. `docs/CAMPAIGN_01_LEVELING_1_30.md`
11. `docs/CAMPAIGN_02_QUEST_AUDIT.md`
12. `ROADMAP.md`
13. only docs/code needed for the exact active block.
