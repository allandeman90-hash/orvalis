# V0.2 — OpenWow × Orvalis Terrain / Material Pipeline Audit

Updated: 2026-10-05

## Status

V0.2 defines the production terrain-material boundary before real Orvalis ground textures / world tiles are authored and ingested.

The current procedural grass/dirt/rock/path palette, synthetic `TerrainPaint` functions and technical grid zones remain **fixtures / authoring tests**, not production world art.

## Reference priority

1. `docs/WoW_Vanilla_1.12.1_RE_Master.md` — primary technical truth.
2. `World0fWarcraft/OpenWow` — secondary implementation reference.
3. Orvalis remains original: no Blizzard ADTs, maps, textures or proprietary assets are imported.

OpenWow is cross-version code. WotLK/Northrend branches and native renderer details are not copied blindly. When its internal channel packing differs from the master 1.12.1 research, the master spec wins.

## OpenWow areas inspected

- `owGame/Map/MapTile.cpp`
- `owGame/Map/MapChunk.cpp`
- `owGame/Map/MapChunkMaterial.*`
- related ADT/MCLY/MCAL/MCSH/MCCV structures used by those paths

Useful architectural observations:

- a tile (`ADT`-like unit) owns a texture-name table, but **each chunk selects its own texture layers** through MCLY;
- a chunk has up to four terrain layers;
- layers after the base have per-chunk 64×64 alpha data;
- OpenWow handles compressed, uncompressed and compact 4-bit alpha source forms before handing normalized values to rendering;
- the old duplicated-edge/fix-alpha behavior belongs to decoding / source preparation, not to the high-level renderer contract;
- MCSH is a separate baked-shadow source;
- MCCV is optional per-vertex terrain colour data;
- terrain diffuse textures may have an optional weak specular/sheen companion;
- OpenWow's temporary blend texture stores alpha/shadow channels in a different internal order than Orvalis. This is not a semantic conflict: Orvalis deliberately follows the master spec's `R=shadow, G/B/A=overlay alpha` convention.

## Master 1.12.1 constraints retained

From §§3–9 and the existing terrain checkpoints of the master document:

- one tile ≈ 533.333 world units;
- 16×16 chunks per tile;
- 145 terrain vertices per chunk;
- 4×4 terrain-hole mask;
- up to four terrain texture layers per chunk;
- 64×64 alpha masks;
- compact old source storage is allowed, but the browser renderer may normalize it after load;
- baked MCSH-like terrain shadow remains a distinct authored concept even if packed with alpha for the GPU;
- terrain lighting is broad, simple and primarily per vertex;
- no default PBR ground stack;
- weak/specifically masked sheen is period-consistent, not universal glossy terrain;
- fog / horizon integration and far terrain remain part of the same visual system.

## Orvalis areas inspected

- `engine/src/terrain/chunkMesh.ts`
- `engine/src/terrain/chunkNormals.ts`
- `engine/src/terrain/tile.ts`
- `engine/src/terrain/paint.ts`
- `engine/src/terrain/gridZone.ts`
- `engine/src/terrain/streaming.ts`
- `engine/src/terrain/farTerrain.ts`
- `engine/src/renderer/shaders/terrainTextured.ts`
- `engine/src/terrainRender/terrainRenderer.ts`
- `engine/src/terrainRender/terrainTextures.ts`
- `engine/src/scenes/terrainMaterial.ts`

## Orvalis gap matrix

| Area | Existing Orvalis state | V0.2 result | Remaining production work |
|---|---|---|---|
| Chunk topology | 145 vertices, 256 max triangles, hole masks | Keep | None for production material work |
| Tile topology | 16×16 chunks, seamless positions/normals, chunk culling | Keep | Real tile source/loader later |
| Layer blend renderer | 4 layer textures + one 64×64 RGBA mask | Keep | Feed it decoded production chunk materials |
| GPU mask convention | `R=lit/shadow`, `G/B/A=layers 1/2/3` | Keep; matches master spec | Loader packs source alpha + shadow into this representation |
| Baked shadow | Implemented in current mask/shader and lighting path | Keep | Replace synthetic `shadowAt` with authored/derived production data |
| Terrain palette | Renderer already owns a palette and chunks reference numeric indices | Good foundation | Build palette from `TerrainTextureDefinition` assets instead of procedural textures |
| Current terrain art | `proceduralPalette()` / solid test palette | Fixture only | V4.2 original hand-painted grass/dirt/road/rock/sand assets |
| Current alpha authoring | `TerrainPaint.alphaAt` functions | Fixture only | Load authored 64×64 alpha sources per chunk |
| Per-chunk layer selection | `TerrainChunk` can store different `ChunkMaterial`, but standard tile builder's `paint` supplies one layer tuple for the whole tile | Production gap identified | V1 adapter must fill 256 independent chunk materials from the V0.2 tile contract |
| Production material schema | Missing | Added in V0.2 | Asset loader/adapter in V1 |
| MCAL source encodings | Not represented (runtime already expects normalized bytes) | Correct separation | Importer may decode compact/RLE/custom original authoring form into normalized alpha maps |
| MCCV / vertex colours | Not carried through textured terrain shader | Recorded in production contract | V2.2 add per-vertex colour data + shader integration |
| Weak terrain sheen | Master/OpenWow support the concept; current textured shader has none | Recorded as optional `sheenAsset` | V2 terrain material convergence; keep subtle and masked |
| Per-pixel PBR | Not used | Correct | Do not introduce normal/metalness/roughness terrain stack by default |
| Lighting | Ambient + diffuse from normal in vertex shader | Keep | Visual tuning in V2.5 |
| Fog | Implemented | Keep | Visual tuning in V2.5 |
| Far terrain | Implemented separately | Keep | Derive/tune far colours from production palette/world data later |
| Streaming | Tile/chunk streaming foundations exist | Keep | Production tile provider loads authored assets through `AssetManager` |

## Production contract added

`engine/src/terrain/productionContract.ts` is the production-facing material boundary.

### `TerrainTextureDefinition`

One reusable ground surface declares:

- stable `id`;
- original diffuse asset;
- optional weak `sheenAsset`.

This is intentionally **not** a PBR material definition.

### `TerrainChunkMaterialContract`

Every chunk owns its own visual inputs:

- `textureIds`: **1..4** terrain surfaces;
- `alphaMapAssets`: exactly one source for every overlay layer (`textureIds.length - 1`);
- optional `bakedShadowAsset`;
- optional `vertexColorAsset` for the 145 terrain vertices.

The contract stores source concepts separately. A loader is free to pack them into the current renderer representation later:

```text
R = baked shadow / lit value
G = alpha layer 1
B = alpha layer 2
A = alpha layer 3
```

### `TerrainTileMaterialContract`

A material tile contains exactly:

```text
16 × 16 = 256 chunk material records
```

in y-major order.

This closes the important schema gap where real world chunks need different combinations such as:

```text
chunk 0,0 = grass + dirt
chunk 1,0 = grass + rock + road
chunk 2,0 = sand
...
```

instead of sharing one synthetic `TerrainPaint.layers` tuple across the whole tile.

## Decoded renderer boundary

`ChunkMaterial` remains the compact runtime form already consumed by the renderer:

```text
4 numeric palette slots
+
64 × 64 × RGBA mask
```

Missing production layers can later be padded with the base texture while their alpha channel stays zero.

V0.2 adds `validateChunkMaterial()` and `CHUNK_MASK_BYTES` so external loaders have an explicit checked hand-off point before GPU upload.

The authoring contract and decoded runtime representation are intentionally separate.

## What V0.2 does NOT implement

### MCCV rendering

The production contract can reference vertex-colour data now, but the current textured shader does not consume it yet.

That belongs to **V2.2 — Vertex color / baked shadow integration**. The data contract is designed so V2.2 will not require rewriting world manifests.

### Terrain sheen/specular

The production texture definition can reference an optional sheen asset, but the current shader does not sample it yet.

That belongs to the V2 material-convergence work. It must remain weak and deliberately non-PBR.

### Final ground art

No serious art should be generated inside the fixture palette. Original production grass/dirt/road/rock/sand belongs to **V4.2** and must enter through V1 asset ingestion.

## Smallest implementation delta before real terrain art

Do **not** rewrite terrain topology, lighting, fog, culling or streaming.

The next production steps are intentionally narrow:

1. register original terrain texture / alpha / shadow / vertex-colour asset loaders through the existing `AssetManager`;
2. build a terrain material library from `TerrainTextureDefinition`;
3. add an adapter that resolves one `TerrainTileMaterialContract` into the existing 256 `TerrainChunk.material` runtime objects;
4. preserve the current 64×64 combined-mask shader path;
5. V2.2 adds MCCV consumption without changing the manifest schema;
6. V2 material convergence adds subtle sheen only where authored;
7. V4.2 supplies the first real original terrain art kit.

The current `TerrainPaint` and `gridZonePaint` paths remain useful deterministic fixtures and technical authoring tools; they should not be mistaken for the final world file/material format.

## V0.2 acceptance

V0.2 is technically complete when:

- OpenWow terrain layer/alpha/shadow/MCCV behavior has been compared with the master spec;
- Orvalis P1–P3/material state has a recorded gap matrix;
- a production terrain texture/chunk/tile material contract exists;
- the contract proves 256 independent chunk material records;
- the decoded `ChunkMaterial` hand-off is validated;
- no proprietary external game assets are imported;
- no P9 gameplay/backend work is started.

Targeted tests live in `engine/tests/terrain/productionContract.test.ts`.

## Next visual-convergence audit

After validation, proceed to **V0.3 — WMO/doodad/material pipeline**.

P8.7 remains a separate technical closure item, and P9 remains blocked until both the movement closure and visual-convergence gates are satisfied.
