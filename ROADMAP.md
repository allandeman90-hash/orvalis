# ORVALIS ROADMAP

Updated: 2026-10-05

This file is the short forward plan. `PROJECT_STATUS.md` remains the long historical record.

## Completed foundation
- P0 — migration/bootstrap/custom renderer foundations.
- P1 — terrain topology, chunks/tiles, holes, normals, streaming foundations.
- P2 — lighting/fog/day-night/sky foundations.
- P3 — liquids/far-terrain foundations.
- P4 — M2-like models, skeletons, animation, attachments, particles/ribbons/material foundations.
- P5 — character compositing/geosets/equipment test pipeline.
- P6 — WMO-like buildings/groups/portals/doodads/liquids/collision.
- P7 — gameplay camera.
- P8.1–P8.6 — movement, slope/slide/step/jump/fall/swim foundations.

## Immediate closure
### P8.7 — movement special states
Goal: walk-on-water / levitation behavior and final P8 validation.
Do not begin P9 until this is green.

---

# VISUAL CONVERGENCE PHASE — before P9

The engine is technically Vanilla-inspired but the visible test fixtures do not yet feel like Vanilla. This phase exists to fix that before adding large gameplay/backend layers.

## V0 — OpenWow reference audit
### V0.1 Character pipeline
- OpenWow character/M2/equipment/composite/attachment audit.
- Compare with 1.12.1 master spec.
- Orvalis gap matrix.
- Production character asset contract.

### V0.2 Terrain/material pipeline
- OpenWow terrain layers, alpha maps, vertex colors, baked shadows.
- Compare to Orvalis P1–P3 implementation.
- Define production terrain material contract.

### V0.3 WMO/doodad/material pipeline
- OpenWow WMO material/group/doodad conventions.
- Define Orvalis environment asset contract.

## V1 — Real asset pipeline
### V1.1 Model asset ingestion
Replace code-generated fixture art for player-facing scenes with real external original assets handled by `AssetManager`.

### V1.2 Character asset contract
Each base archetype defines:
- body mesh;
- skeleton/animation compatibility;
- UV/layout rules;
- face/hair/facial-hair options;
- attachment sockets;
- body-type fit data;
- geoset/visibility rules.

### V1.3 Equipment appearance contract
Separate gameplay item from appearance:
- `Item` = stats/progression/requirements;
- `ItemAppearance` = visual data;
- `appearanceOverride` = transmog;
- unlocked appearances persist in collection.

## V2 — Vanilla-like rendering/material convergence
### V2.1 Terrain 4-layer blend + alpha maps
### V2.2 Vertex color / baked shadow integration
### V2.3 M2-like material modes: opaque, alpha-key, alpha blend, unlit, two-sided, texture transforms
### V2.4 WMO/doodad materials in same visual language
### V2.5 Fog/sky/light tuning for painterly non-PBR output

## V3 — Characters and equipment
### V3.1 First original male base body
Must already look intentional and old-school heroic with no armor.

### V3.2 First original female base body
Same standard: strong silhouette without equipment.

### V3.3 Base customization proof
Skin/face/hair/facial hair and stable UV/composite behavior.

### V3.4 Equipment progression proof
For the same character:
- level-1/simple outfit;
- mid-tier outfit;
- endgame outfit.

### V3.5 Transmog proof
Keep endgame stats while overriding appearance with previously unlocked visuals.

### V3.6 Eight base archetype framework
Generalize sockets/fit/proportions so all 8 base characters can share equipment appearances where sensible, with body-specific overrides only when needed.

## V4 — Original Orvalis environment kit
### V4.1 Trees/bushes/rocks
### V4.2 Ground textures: grass/dirt/road/rock/sand
### V4.3 Architecture/props: house/fence/sign/lamp/small props
### V4.4 Water/coast/river visual kit

## V5 — First integrated world scene
Create `?scene=world` combining:
- terrain;
- lighting/fog/sky;
- water;
- doodads;
- buildings;
- character;
- gameplay camera;
- P8 movement.

### V5.1 Forest benchmark
Original Orvalis zone, no copied geography/assets, but target the readability and visual cohesion of a 2004–2006 stylized MMO.

### V5.2 Contrasting benchmark
Arid/swamp/snow test to prove the art language works beyond one green forest.

### V5.3 User visual gate
Do not call visual convergence done until the user can open `?scene=world` and genuinely say it starts to feel like Vanilla-era WoW rather than a generic low-poly test scene.

---

# AFTER VISUAL CONVERGENCE

## P9 — typed game/static data
Templates/instances/stable IDs/data tables/cache.

## P10 — local gameplay/combat
Targeting, spells, GCD/cooldowns, threat, combat feedback, inventory/equipment integration.

## P11 — networking/replication
Modern WSS binary protocol, AOI, CREATE/DELTA/REMOVE, prediction/reconciliation/interpolation.

## P12 — MMO persistence/server integration
Accounts/characters/persistence/world services, authoritative gameplay, content systems.

---

# Permanent rules
- Orvalis remains original; no Blizzard proprietary assets.
- Master 1.12.1 RE spec is primary; OpenWow is secondary implementation reference.
- OpenWow native/DirectX/WotLK/auth choices are not copied blindly.
- Do not polish test fixtures into production art.
- Each checkpoint must be atomic and verified before being marked complete.
- Use targeted validation while iterating; broad verification only at checkpoint/phase boundaries.
- Change chat after ~3–5 substantial checkpoints, major phase boundaries, or excessive debug/context accumulation.
