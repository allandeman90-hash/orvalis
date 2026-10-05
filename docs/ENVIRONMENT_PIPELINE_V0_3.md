# V0.3 — OpenWow × Orvalis WMO / Doodad / Material Audit

Updated: 2026-10-05

## Status

V0.3 defines the production environment-asset boundary for WMO-like buildings and their doodads before real Orvalis architecture/prop assets are ingested.

The existing procedural cottage, basin and code-built prop models remain **technical fixtures**, not production art.

## Reference priority

1. `docs/WoW_Vanilla_1.12.1_RE_Master.md` — primary technical truth.
2. `World0fWarcraft/OpenWow` — secondary implementation reference.
3. Orvalis remains original: no Blizzard WMO/M2 meshes, textures, maps or other proprietary assets are imported.

OpenWow is useful as a subsystem/reference implementation, not as a byte-for-byte target. Version-specific WotLK branches are not copied into the Vanilla-inspired path.

## OpenWow areas inspected

- `owGame/WMO/WMO.cpp`
- `owGame/WMO/WMO_Headers.h`
- `owGame/WMO/WMOGroup.cpp`
- `owGame/WMO/WMOGroup_Headers.h`
- `owGame/WMO/WMO_Part_Material.cpp`
- WMO group batch/collision/liquid and instance helpers around those paths

## OpenWow architectural observations

A WMO root owns shared/root-level data:

- texture-name table;
- material records;
- group table and authored bounds;
- portal vertices/definitions/references;
- local lights;
- doodad model-name table;
- doodad placements;
- doodad sets;
- fog records.

Each WMO group is separately loadable and owns/references:

- positions, normals, UVs and indices;
- material/triangle information;
- render batches;
- optional vertex colours (`MOCV`);
- doodad references;
- light references;
- collision data;
- optional liquid;
- group flags/bounds/portal relationships.

Material behavior is deliberately small and fixed-function-like:

- blend mode;
- two-sided/culling flag;
- disable-lighting/unlit behavior;
- fog-related flagging;
- SIDN/night-glow/window concepts;
- clamp/repeat sampler state;
- texture references rather than a modern PBR graph.

Doodads remain separate model instances with:

- model reference;
- position;
- quaternion;
- uniform scale;
- authored colour;
- set membership;
- visibility through group references.

## Orvalis areas inspected

- `engine/src/building/building.ts`
- `engine/src/building/doodad.ts`
- `engine/src/building/portal.ts`
- `engine/src/building/visibility.ts`
- `engine/src/building/collision.ts`
- `engine/src/building/fog.ts`
- `engine/src/building/liquid.ts`
- `engine/src/building/cottage.ts`
- `engine/src/building/props.ts`
- `engine/src/buildingRender/buildingRenderer.ts`
- `engine/src/buildingRender/doodads.ts`
- `engine/src/renderer/shaders/building.ts`
- existing M2-like model/material runtime used by doodads

## Orvalis gap matrix

| Area | Existing Orvalis state | V0.3 result | Remaining production work |
|---|---|---|---|
| Root + independent groups | Already implemented; groups are not merged | Keep | Load root/group assets externally instead of constructing fixture objects in code |
| Group geometry | positions/normals/UV/colors/u16 indices | Keep | External original group geometry loader |
| Authored group bounds | Implemented and validated | Keep | Store in production group manifest |
| Render batches | TRANS/INT/EXT ordering, material references | Keep | Production batches use stable material ids, resolved to runtime indices |
| Interior/exterior lighting paths | Implemented from authored group/batch classes | Keep | Tune only during V2.4/V2.5 |
| Vertex colours | Runtime/shader already supports building baked colours | Keep | External vertex-colour source ingestion |
| Collision | Semantic triangle flags + collision paths implemented | Keep | External collision payload ingestion |
| Portals/visibility | Implemented including portal flood and visible-group sets | Keep | External portal polygon/root data ingestion |
| Doodads | Placement, quaternion, uniform scale, colour, sets, visible-group submission implemented | Keep | Replace fixture model names/code-built props with `modelAsset` references |
| Fog | Root/group fog logic implemented | Keep | External fog data ingestion |
| WMO liquids | Implemented | Keep | External group liquid source |
| Local WMO lights | Not a production runtime path yet | Contract preserves data | Later rendering/integration; do not require a manifest redesign |
| Building textures | `BuildingTexture` embeds RGBA bytes | Runtime decoded form is fine | Production manifest references texture assets loaded via `AssetManager` |
| Material texture refs | Runtime uses numeric texture indices | Fine after decode | Production contract uses stable texture ids |
| Texture sampler clamp | Current BuildingRenderer uploads all building textures with repeat | Production gap recorded | V2.4 honor per-texture/material clamp settings |
| Second WMO material texture | Runtime `BuildingMaterial` permits up to 2, renderer currently samples only texture 0 | Data path kept | V2.4 implement second-texture behavior only where required |
| SIDN/night glow/window | Flags stored; shader comment explicitly says not drawn yet | Data path kept | V2.4 implement period-style behavior |
| Modern PBR | Not the default | Correct | Do not add metalness/roughness/normal-map stack by default |
| Fixture architecture | Cottage/Basin/props built in code | Fixture only | V4.3 original architecture/props enter through production contract |

## Production contract added

`engine/src/building/productionContract.ts` is the V0.3 production-facing boundary.

### External textures

`EnvironmentTextureDefinition` stores:

- stable id;
- external original asset path;
- optional wrap/clamp S/T rules.

The manifest does **not** embed pixels. The current `BuildingTexture` remains the decoded/runtime form after AssetManager loading.

### Materials

`EnvironmentMaterialDefinition` stores:

- stable id;
- fixed-function-like flags;
- blend mode;
- one or two texture ids;
- optional authored emissive/SIDN colour.

The existing Orvalis material semantics remain the renderer target:

- opaque;
- alpha test;
- translucent family;
- mod/mod2x;
- unlit;
- two-sided;
- night-glow/window flags retained for later V2.4 behavior.

### Groups

`BuildingGroupAssetDefinition` keeps each cell independently streamable:

- external geometry asset;
- flags;
- authored bounds;
- ordered batches using stable material ids;
- optional external vertex-colour data;
- optional collision payload;
- optional liquid payload;
- doodad ids visible from this group;
- fog ids used by the group.

The root does not combine the group geometry into one monolithic mesh.

### Doodads

Production doodads are split into:

- `EnvironmentDoodadModelDefinition` — reusable external model asset;
- `EnvironmentDoodadPlacementDefinition` — id, model id, position, quaternion, uniform scale, authored colour;
- `EnvironmentDoodadSetDefinition` — stable lists of placement ids.

This maps cleanly onto the existing runtime doodad-set/group-visibility system without baking props into wall geometry.

### Portals, fog and local lights

Root contracts retain:

- portal group relationships and external polygon asset;
- fog references;
- WMO-like local light definitions.

Local lights are preserved now even though the current renderer is driven mainly by global lighting and baked vertex colours. This avoids changing the production schema when local-light behavior is implemented later.

## Validation rules

V0.3 validation checks:

- stable unique ids;
- all material → texture references exist;
- one or two textures per material;
- external asset ids are non-empty;
- valid group bounds;
- batches cover a contiguous index range and remain ordered TRANS → INT → EXT;
- batch material ids exist;
- doodad placements reference existing reusable models;
- doodad sets reference existing placements;
- every doodad is listed by at least one group;
- group fog references exist and remain at the runtime maximum of four;
- portals connect two existing distinct groups;
- local-light vectors/intensity/attenuation are finite and valid.

Targeted tests live in `engine/tests/building/productionContract.test.ts`.

## What V0.3 deliberately does NOT implement

### Two-texture WMO shaders

The current building runtime already allows two texture references, but the renderer samples only the first. That is an explicit V2.4 convergence task, not a reason to rewrite P6 now.

### SIDN / night windows

The material flags are retained, but their exact visual behavior remains later rendering work. Production manifests can already author the data.

### Final building/prop art

The fixture cottage/basin/props must not be polished into shipping assets. Original architecture, fences, signs, lamps and props belong to V4.3 and should enter through V1 asset ingestion.

## Smallest implementation delta before real environment art

Do **not** rewrite P6 portals, collision, fog, liquids or doodad visibility.

The next production steps are:

1. external model/texture/group/root loaders through `AssetManager`;
2. adapter from `BuildingAssetContract` to the existing decoded `Building` runtime;
3. shared doodad models loaded once and instanced by placements;
4. preserve group-level streaming/culling and root/shared material ownership;
5. V2.4 implements sampler clamp, second texture and SIDN/window behavior where authored;
6. V4.3 provides the first serious original Orvalis architecture/prop kit.

## V0.3 acceptance

V0.3 is technically complete when:

- OpenWow WMO root/group/material/doodad conventions have been compared against the master spec and Orvalis P6;
- the gap matrix is recorded;
- a production environment asset contract exists;
- stable material/group/doodad/root references are validated;
- fixture builders remain intact;
- no proprietary assets are imported;
- P9 is not started.

## V0 phase result

When V0.1, V0.2 and V0.3 have all passed CI, the OpenWow reference-audit phase is complete.

The next phase is **V1 — Real asset pipeline**, beginning with V1.1 model asset ingestion. P8.7 movement closure remains a separate blocker before P9.
