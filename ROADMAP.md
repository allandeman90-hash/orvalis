# ORVALIS ROADMAP

Updated: 2026-10-09

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

## Immediate gameplay closure
### P8.7 — movement special states
Goal: walk-on-water / levitation behavior and final P8 validation.
Do not begin P9 until this is green.

---

# VISUAL CONVERGENCE PHASE — before P9

Orvalis must stop proving visual systems only with generated fixtures. The user explicitly prioritized real production assets first so rendering decisions can be judged on believable content.

## A0 — Production asset foundation — ACTIVE
### A0.1 Art review + licence registry
- `art-review.html` shows candidate real assets under one consistent review setup.
- Every candidate records author, licence and original source.
- Review URLs may be remote; shipping assets may not depend on third-party CDN mirrors.

### A0.2 First local environment seed kit
- choose a tiny coherent CC0 set first: trees + rocks + one small prop;
- copy exact approved source files locally;
- keep provenance beside the assets;
- reject incompatible style before importing more.

### A0.3 Static GLB ingestion / normalization
- smallest practical GLB → Orvalis runtime path for static environment meshes;
- normalize scale, axis, pivot, material policy and texture handling;
- preserve useful vertex colours;
- no renderer rewrite and no premature custom binary format.

### A0.4 Production art-review proof
- render locally owned candidates through Orvalis material/lighting rules;
- prove repeated instances do not read as raw asset-pack placement;
- establish screenshot/visual-review workflow for later assets.

## V0 — OpenWow reference audit — COMPLETE
### V0.1 Character pipeline — COMPLETE
### V0.2 Terrain/material pipeline — COMPLETE
### V0.3 WMO/doodad/material pipeline — COMPLETE

## V1 — Real asset pipeline contracts — COMPLETE
### V1.1 Model asset ingestion — COMPLETE
### V1.2 Character asset contract — COMPLETE
### V1.3 Equipment appearance contract — COMPLETE

## V2 — Rendering/material convergence
### V2.1 Terrain 4-layer blend + alpha maps — IMPLEMENTED, CLOSURE PROOF DEFERRED
Runtime/test work is present. One WebGPU smoke closure proof remains deferred because the available assistant browser runner cannot execute it. Do not restart V2.1.

### V2.2 Vertex color / baked shadow integration
Use real A0 assets while implementing so the effect is judged on production-like geometry, not only fixtures.

### V2.3 M2-like material modes
Opaque, alpha-key, alpha blend, unlit, two-sided, texture transforms.

### V2.4 WMO/doodad materials
Bring buildings/props into the same stylized visual language.

### V2.5 Fog/sky/light tuning
Painterly, readable, non-PBR output; no effect stacking merely for complexity.

## V3 — Characters and equipment
### V3.1 First original male base body
### V3.2 First original female base body
### V3.3 Base customization proof
### V3.4 Equipment progression proof
### V3.5 Transmog proof
### V3.6 Eight base archetype framework

## V4 — Original Orvalis environment kit + density systems
### V4.1 Trees/bushes/rocks
Use approved A0 assets as source material; add Orvalis-specific variants only where needed.

### V4.2 Ground textures
Grass/dirt/road/rock/sand with biome-compatible blending.

### V4.3 Architecture/props
House/fence/sign/lamp/small props; prefer modular kits.

### V4.4 Water/coast/river visual kit

### V4.5 Prop batching / instancing
High decoration density without one draw call per object.

### V4.6 Foliage density / biome placement
Procedural/scatter rules, exclusion masks, distance density and readable composition.

## V5 — Integrated Orvalis migration scene
The target is no longer a disconnected demo forest. Existing Orvalis content should progressively move onto the new engine and receive the production asset/material pipeline.

### V5.1 Existing-world migration benchmark
Take a real existing Orvalis area and replace its placeholder terrain/decor rendering progressively.

### V5.2 Density benchmark
The same area must feel deliberately decorated rather than like an empty plain: macro landmarks, medium props, small props and micro foliage layers.

### V5.3 Contrasting biome proof
Arid/swamp/snow or another non-green biome to prove the art language generalizes.

### V5.4 User visual gate
Do not call visual convergence done until the normal Orvalis page visibly feels like the intended game, not a generic low-poly technical scene.

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
- Orvalis remains original; no Blizzard/Hordes proprietary assets or copied geography/content.
- Hordes.io is a rendering/world-density reference, not a source tree.
- Master 1.12.1 RE spec is primary for Vanilla-like mechanics; OpenWow is secondary implementation evidence.
- Do not polish generated fixtures into production art.
- Prefer real licensed assets + coherent Orvalis normalization over blind procedural modeling.
- Each checkpoint should stay atomic and use targeted validation.
- No temporary checkpoint CI workflows unless explicitly approved.
