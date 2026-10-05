# WoW Vanilla 1.12.1 — Reverse Engineering Master Notes
**Target:** World of Warcraft Vanilla retail client **1.12.1, build 5875**  
**Purpose:** technical reference for recreating the *architecture, rendering philosophy, data flow and visual constraints* of Vanilla-era WoW in an original browser game (WebGL/WebGPU), without redistributing Blizzard assets.  
**Status:** living document — update after every 2 analysis blocks.

---

## 0. Scope and verification rules

This document focuses on **the original WoW Vanilla 1.12.1 client**, not WoW Classic 1.13+, not TBC, not WotLK.

### Confidence labels
- ✅ **Confirmed**: directly supported by reverse engineering of the 1.12.1 binary or by a parser/documentation specifically targeting that client.
- 🟢 **Strongly supported**: corroborated by multiple technical sources or a faithful reconstruction.
- 🟡 **In progress / partially confirmed**: mechanism identified, but one or more constants/edge cases still need verification.
- ⚠️ **Inference**: useful engineering conclusion, but not claimed to be an exact Blizzard implementation detail.

### Legal/asset boundary
The goal is to reproduce **techniques and architecture**:
- terrain chunking
- streaming
- low-poly geometry budgets
- texture blending
- old-school lighting
- fog
- water animation
- skeletal animation
- WMO/M2 organization
- data-driven gameplay

The goal is **not** to ship Blizzard's proprietary:
- models
- textures
- maps
- music
- sound
- cinematics
- logos
- names/trademarks as original game content

Use original assets built to similar technical constraints.

---

# 1. High-level architecture

Vanilla separates its world into several distinct asset/data families:

```text
WDT  -> world/tile presence
ADT  -> detailed outdoor terrain tiles
WDL  -> very low-detail far terrain
M2   -> animated models, characters, creatures, props
WMO  -> large static structures/buildings/interiors
BLP  -> textures
DBC  -> structured client data
MCLQ -> ADT liquid data inside terrain chunks
```

The old client stores much of this content in **MPQ archives**.

Common Vanilla-era MPQ groups include:

```text
base.MPQ
dbc.MPQ
misc.MPQ
model.MPQ
sound.MPQ
speech.MPQ
terrain.MPQ
texture.MPQ
wmo.MPQ
patch.MPQ
patch-2.MPQ
```

The important design lesson for a browser MMO is that the world is **not one giant mesh**. It is a streaming hierarchy of tiles, chunks, objects and far terrain.

---

# 2. WDT — world tile index

✅ Vanilla outdoor maps use a 64 × 64 tile grid.

The WDT `MAIN` table is:

```text
64 × 64 entries
8 bytes per entry
= 0x8000 bytes
```

The client uses a flag bit to decide whether a tile exists.

Conceptually:

```text
World
└── WDT
    └── 64 × 64 tile presence table
```

This lets the engine avoid requesting nonexistent tiles (for example open ocean or empty map regions).

---

# 3. ADT — detailed terrain tiles

✅ One ADT tile is approximately:

```text
533.333 × 533.333 world units
```

✅ Each ADT contains:

```text
16 × 16 MCNK chunks
= 256 chunks
```

So one chunk is approximately:

```text
33.333 × 33.333 world units
```

Each chunk contains an 8 × 8 cell grid.

One cell is approximately:

```text
33.333 / 8
≈ 4.1667 world units
```

---

# 4. MCNK terrain geometry

## 4.1 Vertex topology

✅ Each terrain chunk uses exactly:

```text
9 × 9 outer-grid vertices = 81
8 × 8 center vertices     = 64
--------------------------------
total                     = 145 vertices
```

The center vertex of each cell makes the cell a 4-triangle fan.

Conceptually:

```text
A---------B
| \     / |
|   \ /   |
|    X    |
|   / \   |
| /     \ |
D---------C
```

Triangles:

```text
A-X-B
B-X-C
C-X-D
D-X-A
```

One chunk:

```text
8 × 8 cells = 64 cells
64 × 4 = 256 triangles maximum
```

One complete ADT if all chunks are fully rendered:

```text
256 chunks × 256 triangles
= 65,536 terrain triangles maximum
```

If chunk borders are not globally merged:

```text
145 vertices × 256 chunks
= 37,120 stored chunk vertices
```

A mathematically merged equivalent grid would be approximately:

```text
129 × 129 outer = 16,641
128 × 128 inner = 16,384
total           = 33,025
```

### Browser-engine implication

This geometry is **already extremely light by modern GPU standards**. There is no need to heavily simplify the original Vanilla terrain topology for WebGL/WebGPU.

---

# 5. Vanilla terrain precision

✅ The 1.12.1 client uses several deliberate `f32` rounding points while rebuilding terrain coordinates.

Recovered relationship:

```text
prod(i)   = f32(f32(i) * 33.33333206)
origin(i) = f32(-prod + 17066.666015625)
d         = f32(origin(i) - origin(i+1))
step      = f32(-d / 8)
```

This matters for byte/bit-level reproduction because a pure `f64` implementation can diverge at large indices.

### Browser-engine recommendation

For an original game, exact x87-era rounding is unnecessary unless matching Vanilla coordinates precisely.  
For a faithful technical recreation, keep terrain storage and world transforms in `float32`-equivalent precision.

---

# 6. Terrain holes

✅ MCNK contains a terrain-hole mask.

In Vanilla the chunk header uses a compact **4 × 4 mask** to mark terrain regions that should not emit geometry.

Typical use:

```text
terrain surface
████████████
████    ████
██        ██
████    ████
████████████

          ↓

cave / WMO opening below
```

### Browser-engine implementation

Store:

```ts
chunk.holes
```

and omit the corresponding terrain triangles during mesh construction.

---

# 7. Terrain textures — MCLY / MCAL / MCSH

## 7.1 Texture layers

✅ A chunk can blend up to **4 terrain texture layers**.

Example:

```text
layer 0 = grass
layer 1 = dirt
layer 2 = rock
layer 3 = road
```

## 7.2 MCAL alpha map

✅ Vanilla MCAL uses a compact per-chunk alpha representation.

Important 1.12.1 details:
- alpha mask resolution: **64 × 64**
- common storage path: **4-bit**
- low nibble first
- additional edge handling exists for the 63×63/duplicated-edge path

## 7.3 MCSH baked shadow

✅ `MCSH` is:

```text
512 bytes
1 bit per sample
```

It represents a baked terrain-shadow mask.

## 7.4 Combined GPU-era packing

✅ Reverse engineering shows Vanilla combines terrain alpha/shadow information into a compact **RGBA4444** texture.

Channels conceptually correspond to:

```text
R = baked shadow
G = layer 1 alpha
B = layer 2 alpha
A = layer 3 alpha
```

### Browser-engine equivalent

A modern recreation can keep essentially the same idea:

```glsl
base = texture(layer0, uv);
base = mix(base, texture(layer1, uv), mask.g);
base = mix(base, texture(layer2, uv), mask.b);
base = mix(base, texture(layer3, uv), mask.a);
base *= shadow(mask.r);
```

This is much cheaper than unique giant textures per world tile.

---

# 8. Terrain lighting philosophy

✅ Vanilla does **not** rely on modern physically based rendering.

The recovered terrain-lighting model is much closer to old fixed-function / Gouraud-style lighting.

Conceptual diffuse lighting:

```text
light =
    ambient
  + diffuse * max(dot(normal, lightDirection), 0)
  + local point lights when applicable
```

A key characteristic:

✅ Lighting is evaluated primarily **per vertex**, then interpolated over triangles.

This means the lighting resolution is tied to the low-poly terrain mesh itself.

### Why this matters visually

If an identical low-poly scene is rendered with high-quality per-pixel PBR lighting, it can immediately feel "too modern".

To preserve the Vanilla feel:
- low geometric density
- broad per-vertex lighting gradients
- painted textures
- baked terrain shadow
- simple fog
- minimal specular
- avoid physically correct materials

---

# 9. Terrain specular / sheen

🟢 Faithful 1.12.1 reconstructions identify a subtle terrain specular pass.

Approximate shape:

```text
pow(max(dot(N, H), 0), 20)
```

The effect is:
- evaluated at low vertex density
- constrained by a sheen mask
- more appropriate for stone/wet-looking surfaces
- not meant to make grass globally glossy

### Browser recommendation

Keep this intentionally weak.

---

# 10. Day/night lighting

✅ Vanilla uses artist-authored data tables, not a physically simulated atmosphere.

Important client tables include data conceptually associated with:

```text
Light.dbc
LightParams.dbc
LightIntBand.dbc
LightFloatBand.dbc
LightSkybox.dbc
```

The client interpolates artistic values across the day.

The day domain is effectively:

```text
0 .. 2879
```

corresponding to 2880 half-minute units per in-game day.

### Design implication

Do **not** replace this with a realistic procedural sky if the goal is the Vanilla look.

Use authored keyframes such as:

```text
dawn
morning
noon
afternoon
sunset
dusk
night
```

and interpolate colors.

---

# 11. Two "suns"

✅ A particularly important Vanilla behavior is that the **visible celestial sun** and the **lighting sun direction** are not identical systems.

### Lighting sun
Recovered reconstruction:
- fixed azimuth around 225° in its travel-direction convention
- elevation changes only through a limited range
- stays usable for stable lighting/baked-shadow coherence

### Visible sun
The visible sky disc follows a much larger arc and actually rises/sets.

### Why this is clever

This allows:
- convincing celestial motion
- stable static/baked terrain shadowing
- extremely cheap world lighting

### Browser-engine recommendation

Keep the two systems separate:

```text
visualSunDirection
lightingSunDirection
```

---

# 12. Sky and horizon

🟢 Vanilla's sky is better understood as an artist-controlled gradient/dome system than as physically accurate atmospheric scattering.

The horizon color is closely integrated with fog.

Core visual trick:

```text
far terrain
    ↓
fog
    ↓
horizon color
    ↓
sky gradient
```

The transition hides the real edge of detailed terrain.

---

# 13. Fog

✅ Fog distance and color are central to Vanilla rendering.

Useful conceptual parameters:

```text
fogColor
fogStart
fogEnd
```

The recovered client derives fog behavior from day/night environmental values and scene state.

Outdoor vs underwater/indoor paths can use different fog values.

### Browser implementation

```glsl
fogFactor =
    clamp(
        (distance - fogStart) /
        (fogEnd - fogStart),
        0.0,
        1.0
    );

finalColor =
    mix(sceneColor, fogColor, fogFactor);
```

Critical artistic rule:

```text
fogColor ≈ horizonColor
```

This is what makes the world appear to continue naturally.

---

# 14. WDL — low-detail far terrain

✅ WDL is the low-detail distant representation of an outdoor map.

Each present WDL tile stores:

```text
17 × 17 outer heights = 289
16 × 16 inner heights = 256
--------------------------------
total                  = 545 heights
```

The heights are stored as signed 16-bit values in the recovered 1.12.1 format.

The geometry uses the same conceptual center-fan topology at much lower density.

### WDL vs ADT

```text
ADT:
high detail
textures
shadows
objects
water
chunk-level culling

WDL:
545 height samples per tile
far visual hull
extremely cheap
```

---

# 15. Far terrain rendering

✅ The far terrain has its **own render bucket/pass**.

The main world render phase includes terrain, objects and models, while the far-band is drained separately and late.

Important recovered trick:

```text
far terrain depth range:
0.955 .. 0.960
```

The WDL-like far geometry is effectively pinned to a tiny slice at the back of the depth buffer.

This minimizes depth conflict with detailed geometry.

### Browser recreation

A modern renderer can reproduce the same philosophy with:
- dedicated far-terrain pass
- very low-detail mesh
- strong fog
- depth bias or separate depth handling
- no expensive materials

---

# 16. Farclip and detail distance

🟢 The original Vanilla client exposes the `farclip` CVar.

A well-known 1.12.1 binary patch project documents:

```text
original maximum farclip = 777
```

and patches it to allow values up to 10000.

This is corroborated by patch code specifically targeting the original 1.12.1 executable.

Also relevant:
- Vanilla's default small-detail/frill distance is around **70**
- third-party 1.12.1 patchers commonly increase it dramatically

### Important distinction

`farclip = 777` is a high-level scene/render-distance limit.  
It does **not** mean there is a hard "ADT ends at X and WDL begins at X" replacement boundary.

ADT and far terrain participate in different render paths, with fog hiding the transition.

---

# 17. Streaming

## 17.1 ADT streaming

✅ The original client streams detailed ADT content asynchronously from MPQ.

Exact "N×N ADT residency square" behavior still needs additional verification.

Do **not** hard-code the assumption that retail Vanilla always held exactly 3×3 or 5×5 detailed ADTs.

## 17.2 WDL window

✅ The far-terrain scene walk iterates a camera-centered window of:

```text
±3 tiles
```

i.e. up to:

```text
7 × 7 = 49 WDL tiles
```

before culling.

### Recommended browser architecture

```text
player
  ↓
detailed ADT tile/chunk ring
  ↓
WDL-like far terrain ring
  ↓
fog
  ↓
horizon/sky
```

---

# 18. Frustum culling

✅ Vanilla constructs a **6-plane view frustum**:

```text
top
bottom
left
right
near
far
```

from the camera volume corners.

The engine performs per-record culling before objects enter render lists.

Terrain chunks carry spatial bounds (AABB / center / radius).

Conceptual pipeline:

```text
scene record
    ↓
frustum test
    ↓
optional occlusion test
    ↓
render-list insertion
    ↓
draw
```

### Browser-engine recommendation

Do culling at **chunk level**, not only at whole-ADT level.

That gives up to 256 independently cullable terrain chunks per detailed tile.

---

# 19. Occlusion culling

✅ Reverse-engineered scene walking includes optional occlusion-culling paths in addition to frustum culling.

For a first browser implementation, frustum + distance culling is enough.  
Occlusion can be added later if profiling shows it is necessary.

---

# 20. Detail doodads / ground clutter

✅ Vanilla removes or avoids detailed ground clutter at around:

```text
70 world units
```

in the recovered terrain rendering path.

This is a major performance-saving technique and should be preserved.

Recommended hierarchy:

```text
very near:
grass / small clutter / tiny doodads

near-mid:
M2 props / terrain chunks

mid-far:
larger M2/WMO

far:
WDL-like terrain

very far:
fog/horizon
```

---

# 21. Liquid data — MCLQ

✅ Vanilla ADT liquid is stored per terrain chunk in `MCLQ`.

A liquid block is approximately:

```text
min height
max height

9 × 9 liquid vertices = 81
8 × 8 liquid cells    = 64

cell flags
flow information
```

Each liquid vertex contains a height component, so water surfaces are not restricted to one global flat plane.

---

# 22. Liquid categories

✅ The recovered cell-flag low nibble identifies liquid variants/classes.

Core classes:

```text
0 = river
1 = ocean
2 = magma
3 = slime
```

Additional variant bits select related texture families.

The important technical point is that different liquid classes use **different render behavior**, not merely different colors.

---

# 23. Vanilla liquid texture animation

✅ Liquid textures use **30 animation frames**.

Recovered animation period:

```text
1250 ms
```

Equivalent rate:

```text
30 / 1.25
≈ 24 frames per second
```

Conceptual frame selection:

```ts
frame =
    floor(
        ((timeMs % 1250) / 1250) * 30
    );
```

Use original textures for your own game, but keep this 30-frame/1.25s-style animation if you want a strongly Vanilla-like water cadence.

---

# 24. Liquid depth shading

✅ Vanilla builds static lookup tables for water depth response.

### Ocean

Approximately:

```text
ocean[i] = min(i / 255, 1)
```

Very gradual saturation.

### River

Approximately:

```text
river[i] = min(i / 42, 1)
```

Saturates roughly six times faster.

This makes rivers and oceans visually different even before color and environment lighting.

---

# 25. Liquid alpha curve

✅ The recovered static opacity LUT is approximately:

```text
alpha(i) =
    clamp(
        1.6 * (i / 63)^8,
        0,
        1
    )
```

The exponent 8 produces a strongly nonlinear transition.

Result:
- shallow water stays transparent for a while
- deep water becomes opaque quickly near the upper end

---

# 26. Liquid render behavior

✅ ADT liquids have separate queues/passes.

Recovered distinctions include:

### River
- animated texture
- depth LUT
- alpha blending
- lighting/fog participation
- optional/fancy texture-generation path

### Ocean
- animated texture
- different depth response
- alpha blending
- special water path

### Magma
- effectively full-bright
- opaque
- no standard depth LUT
- special render-state behavior

### Slime
- handled differently and is especially associated with WMO-liquid paths in the recovered rendering structure

### Browser-engine lesson

Do not implement:

```ts
water.type = color;
```

Instead use distinct material behaviors.

---

# 27. M2 — model system overview

**Status: 6A/6B in progress.**

✅ Vanilla M2 is the main animated-model format used for:
- player characters
- creatures
- animated props
- many small environmental objects

Large static buildings/interiors instead use WMO.

The M2 file magic is:

```text
MD20
```

The 1.12.1 client accepts M2 versions:

```text
256
257
```

A reverse-engineered scan of the shipped 1.12.1 corpus reports:
- 10,196 `.m2` files total
- 10,170 loadable
- 10,165 version 256
- 5 version 257
- 26 zero-byte/unused stubs

This gives us an unusually good reference corpus description for Vanilla.

---

# 28. M2 header arrays

✅ Important MD20 arrays include:

```text
name
globalSequences
animations
animationLookup
playableAnimationLookup
bones
keyBoneLookup
vertices
views
colors
textures
transparency
textureAnims
texture replacements
render flags
bone lookup
texture lookup
texture-unit lookup
bounding triangles
bounding vertices
bounding normals
attachments
events
lights
cameras
ribbons
particles
```

This demonstrates that M2 is not "just a mesh". It is a complete render/animation asset.

---

# 29. M2 vertices

✅ Vanilla M2 vertex stride:

```text
0x30 bytes = 48 bytes per vertex
```

Recovered fields:

```text
+0x00 position      vec3
+0x0c bone weights  4 bytes
+0x10 bone indices  4 bytes
+0x14 normal        vec3
+0x20 texcoord      vec2
```

### Important implication

A Vanilla M2 vertex is already designed for **up to 4 bone influences**.

This maps very naturally to modern WebGL/WebGPU skinning:

```text
position
normal
uv
boneIndices[4]
boneWeights[4]
```

---

# 30. M2 views / skins

✅ Vanilla 1.12 stores its skin/view information **inside the MD20 file**.

It does **not** use the later separate `.skin` file organization.

A view contains arrays for:

```text
vertexIndex
triangle indices
properties
submeshes
texture units
```

Draw-time indirection:

```text
globalVertex =
    vertices[
        vertexIndex[
            triangle[i]
        ]
    ]
```

This allows different views/LOD-like skin layouts to reuse the global vertex data.

---

# 31. M2 submeshes / geosets

✅ Submeshes include data such as:

```text
geosetId
vertexStart
vertexCount
triangleStart
indexCount
boneCount
boneComboIndex
```

`indexCount` is an **index count**, so:

```text
triangleCount = indexCount / 3
```

Geoset IDs are used to enable/disable visual sections.

This is how Vanilla can swap:
- hairstyles
- facial parts
- armor geometry
- other conditional body sections

without loading a completely separate character mesh.

---

# 32. M2 texture units/material routing

✅ A Vanilla tex-unit record binds rendering data to a submesh.

Relevant concepts include:

```text
flags
shaderId
submeshIndex
colorIndex
materialIndex
textureCount
textureComboIndex
texCoordSet
```

### Browser-engine implication

A faithful original engine should preserve the conceptual split:

```text
geometry (submesh)
+
material/texture unit
+
geoset visibility
```

instead of baking every player appearance into unique complete meshes.

---

# 33. M2 bones

✅ Vanilla 1.12 bone record stride:

```text
0x6c bytes
```

Core bone definition:

```text
keyBoneId
flags
parentBone
submeshId

translation track
rotation track
scale track

pivot vec3
```

Parent `0xffff` denotes a root/no-parent condition in the recovered representation.

Each bone therefore carries:
- hierarchy
- pivot
- translation animation
- rotation animation
- scale animation

---

# 34. Bone tracks

✅ Vanilla M2 animation tracks use a compact structure containing:

```text
interpolationType
globalSequence
ranges
timestamps
values
```

For 1.12.1 version-256 M2:

### Translation
```text
vec3 float keys
12 bytes/key
```

### Scale
```text
vec3 float keys
12 bytes/key
```

### Rotation
```text
float quaternion
4 × f32
16 bytes/key
```

Important correction vs later WoW versions:

✅ Vanilla v256 rotation keys are **not the later compressed int16×4 quaternion format**.

They are stored as float quaternions.

---

# 35. M2 animation sequences

✅ Animation sequence record stride:

```text
0x44 bytes
```

Recovered fields include:

```text
id
variationIndex
startTimestamp
endTimestamp
moveSpeed
flags
frequency
replayMin
replayMax
blendTime
boundsMin
boundsMax
boundsRadius
variationNext
aliasNext
```

Important Vanilla behavior:

```text
sequence uses absolute start/end timestamps
```

rather than the later duration-only style.

---

# 36. M2 animation evaluator

✅ The 1.12.1 client animation system performs:

```text
choose active sequence
    ↓
resolve per-bone time
    ↓
binary-search keyframes
    ↓
interpolate translation/rotation/scale
    ↓
cross-fade when required
    ↓
build local bone matrix
    ↓
propagate through parent hierarchy
    ↓
store final matrix palette
    ↓
skin vertices
```

The same general track machinery is also reused for:
- texture transforms
- colors
- alpha
- visibility
- attachment behavior

This is a very reusable architecture for a browser game.

---

# 37. Bone matrix palette

✅ Runtime M2 instances build one matrix per animated bone in a matrix palette.

Recovered runtime matrix slot size:

```text
0x40 bytes = 64 bytes
```

which matches:

```text
4 × 4 float matrix
```

This maps directly to:
- WebGL uniform arrays for small skeletons
- texture/storage-buffer palettes for larger counts
- WebGPU storage buffers

---

# 38. Animation interpolation

✅ The evaluator:
- binary-searches keyframe timestamps
- samples active animation time
- linearly interpolates many scalar/vector tracks
- handles quaternion tracks separately
- supports sequence blending/cross-fade
- supports global sequences
- recursively propagates parent transforms

### Browser recommendation

A first faithful implementation can use:

```text
translation: lerp
scale: lerp
rotation: normalized quaternion interpolation / slerp
sequence blend: cross-fade between two sampled poses
```

Exact x87-era last-bit behavior is unnecessary for an original game.

---

# 39. Animation IDs

Vanilla uses numeric animation IDs for standard actions.

Examples include:

```text
0   Stand
1   Death
4   Walk
5   Run

16  AttackUnarmed
17  Attack1H
18  Attack2H

29  ReadyBow
30  Dodge

37  JumpStart
38  Jump
39  JumpEnd

41  SwimIdle
42  Swim

46  AttackBow
49  AttackRifle

50  Loot

51  ReadySpellDirected
52  ReadySpellOmni
53  SpellCastDirected
54  SpellCastOmni

69  EmoteDance

91  Mount

119 StealthWalk
120 StealthStand

133 FishingCast
134 FishingLoop

203 Cannibalize
```

This gives us a useful baseline for an animation-state machine even if our final game uses original animation names/content.

---

# 40. Recommended browser terrain renderer — current spec

```text
WorldRenderer
│
├── WDT-like WorldIndex
│   └── tile existence metadata
│
├── DetailedTerrainStreamer
│   ├── ADT-like Tile
│   │   └── 16×16 TerrainChunk
│   │       ├── 145 vertices
│   │       ├── 256 triangles max
│   │       ├── normals
│   │       ├── holes
│   │       ├── 1-4 terrain textures
│   │       ├── alpha/shadow mask
│   │       ├── object refs
│   │       └── liquid refs
│
├── FarTerrain
│   └── WDL-like 545-height tile
│
├── M2-like AnimatedModel
│   ├── shared mesh data
│   ├── submeshes/geosets
│   ├── materials
│   ├── skeleton
│   ├── sequences
│   ├── attachments
│   ├── particles
│   └── ribbons
│
└── WMO-like StaticStructure
    └── groups/interiors/portals
```

---

# 41. Recommended terrain shader — current approximation

```glsl
// 1. texture splatting
vec4 terrain = texture(layer0, uv);
terrain = mix(terrain, texture(layer1, uv), alpha1);
terrain = mix(terrain, texture(layer2, uv), alpha2);
terrain = mix(terrain, texture(layer3, uv), alpha3);

// 2. simple old-school lighting
float ndl = max(dot(normalize(normal), normalize(toLight)), 0.0);
vec3 light = ambient + diffuse * ndl;

// 3. baked shadow
terrain.rgb *= light;
terrain.rgb *= bakedShadow;

// 4. optional low-resolution sheen
terrain.rgb += terrainSpecular;

// 5. atmospheric hiding
terrain.rgb = mix(terrain.rgb, fogColor, fogFactor);
```

Key rule:

**Do not over-modernize this shader.**

The visual target is:
- low-poly
- hand-painted
- Gouraud-like
- strong environmental color direction
- aggressive atmospheric blending
- minimal physically correct behavior

---

# 42. Recommended liquid shader — current approximation

```glsl
int frame =
    int(
        floor(
            mod(timeMs, 1250.0) /
            1250.0 *
            30.0
        )
    );

vec4 water = sampleAnimatedWater(frame, uv);

float depth = waterHeight - terrainHeight;

float depthFactor =
    type == RIVER
        ? min(depth / riverScale, 1.0)
        : min(depth / oceanScale, 1.0);

float alpha =
    clamp(
        1.6 * pow(depthFactor, 8.0),
        0.0,
        1.0
    );

water.rgb *= simpleLighting;
water.rgb = mix(water.rgb, fogColor, fogFactor);
water.a *= alpha;
```

Magma should use a separate material path.

---

# 43. Recommended M2-like browser vertex format

A very natural WebGL/WebGPU representation matching Vanilla's conceptual needs:

```ts
struct Vertex {
    position: vec3<f32>,
    normal: vec3<f32>,
    uv: vec2<f32>,
    boneWeights: vec4<u8>,
    boneIndices: vec4<u8>,
}
```

At upload time, bone weights can be normalized into float values.

This keeps the same fundamental constraint:

```text
max 4 bone influences per vertex
```

---

# 44. Recommended character animation runtime

```text
AnimationController
│
├── currentSequence
├── previousSequence
├── currentTime
├── blendTime
│
├── sampleTracks()
│   ├── translation
│   ├── rotation
│   └── scale
│
├── buildLocalMatrices()
│
├── propagateHierarchy()
│
└── uploadBonePalette()
```

Example state machine:

```text
Stand
  ↓ movement
Walk
  ↓ faster movement
Run

Run
  ↓ jump
JumpStart -> Jump -> JumpEnd

Any
  ↓ attack
Attack
  ↓
previous locomotion

Any
  ↓ spell
SpellCast
  ↓
previous locomotion
```

---

# 45. Performance philosophy to preserve

The important Vanilla lesson is not just "low-poly".

It is **hierarchical cost control**:

```text
WORLD
│
├── only nearby detailed tiles
│
├── only visible chunks
│
├── only nearby ground clutter
│
├── reused/shared M2 assets
│
├── low-cost per-vertex lighting
│
├── baked terrain shadow
│
├── tiny alpha masks
│
├── tiny far-terrain representation
│
├── animated textures instead of expensive simulations
│
└── fog hides transitions
```

This is exceptionally well suited to a browser MMO.

---

# 46. Current dashboard

| System | Status |
|---|---|
| Target client 1.12.1 build 5875 | ✅ |
| WDT world grid | ✅ |
| ADT tile structure | ✅ |
| MCNK chunks | ✅ |
| Terrain dimensions | ✅ |
| 145-vertex chunk topology | ✅ |
| Terrain triangulation | ✅ |
| Terrain holes | ✅ |
| Terrain textures | ✅ |
| MCAL alpha | ✅ |
| MCSH baked shadow | ✅ |
| Per-vertex lighting philosophy | ✅ |
| Day/night data-driven lighting | ✅ |
| Visible sun vs lighting sun | ✅ |
| Fog/horizon integration | ✅ |
| WDL far terrain | ✅ |
| Far-band render pass | ✅ |
| Far depth range 0.955–0.960 | ✅ |
| WDL ±3 tile scene walk | ✅ |
| Frustum culling | ✅ |
| Optional occlusion path | ✅ |
| Detail doodad cutoff ~70 | ✅ |
| Original farclip max 777 | 🟢 |
| Exact detailed-ADT residency radius | 🟡 |
| MCLQ liquid geometry | ✅ |
| River/ocean/magma/slime distinction | ✅ |
| 30-frame / 1250ms water animation | ✅ |
| Liquid depth LUTs | ✅ |
| Liquid alpha curve | ✅ |
| M2 file layout | ✅ |
| M2 vertex layout | ✅ |
| M2 views/submeshes | ✅ |
| M2 bone format | ✅ |
| M2 animation track format | ✅ |
| M2 animation sequence format | ✅ |
| M2 runtime animation pipeline | ✅ |
| Exact polygon/bone counts for player races | 🟡 NEXT |
| Character compositing / equipment system | 🟡 NEXT |
| WMO building format | ⬜ |
| WMO portals/interiors | ⬜ |
| M2 particles/ribbons deep dive | ⬜ |
| Camera behavior | ⬜ |
| Player movement | ⬜ |
| Combat/gameplay data | ⬜ |
| Networking | ⬜ |
| Browser prototype | ⬜ |

---

# 47. Next analysis blocks

## 6A — M2 character/creature complexity
Need exact or corpus-derived:
- human male/female vertices
- triangle counts
- views/LOD counts
- submeshes/geosets
- material/texture counts
- how much geometry is body vs equipment
- common creature budgets

## 6B — skeleton and animations
Need:
- actual player-character bone count
- key-bone semantics
- animation count on base player models
- blend timings
- attachment bones
- weapon/helmet/shoulder attachment behavior
- mount animation integration
- billboarded bones if relevant

After 6A + 6B, update this same file.

---

# 48. Primary technical sources

## Direct WoW 1.12.1 reverse engineering
- WoW 1.12.1 Client Internals  
  https://github.com/samwhosung/wow-1121-client-internals

- Terrain internals  
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/terrain.md

- M2 / WMO model internals  
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/models.md

- Animation internals  
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/animation.md

- Rendering mathematics  
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/rendering-math.md

## Faithful/open reconstruction targeting Vanilla 1.12.1
- Benilla 1.12.1 open source  
  https://github.com/puRe991/benilla-1.12.1-open-source

Important files include:
```text
crates/benilla/assets/shaders/terrain.wgsl
crates/benilla/assets/shaders/liquid.wgsl
crates/benilla/src/lighting/daynight.rs
crates/benilla/src/lighting/global_light.rs
crates/benilla/src/terrain_stream.rs
```

## Vanilla server/client ecosystem
- MaNGOS Zero / Vanilla-focused server ecosystem  
  https://github.com/mangoszero/server

Relevant extractor code:
```text
src/tools/extractor/client/AdtParser.cpp
src/tools/extractor/client/M2Parser.cpp
src/tools/extractor/client/WmoParser.cpp
```

## Vanilla client patch documentation
- vanilla-tweaks 1.12.1  
  https://github.com/brndd/vanilla-tweaks

This project specifically documents the original 1.12.1 limits for values such as:
```text
farclip max = 777
frill distance = 70
```

## Format community documentation
- WoWDev Wiki  
  https://wowdev.wiki/

Useful format families:
```text
ADT
WDT
WDL
M2
BLP
WMO
DBC
```

---

# 49. Transfer instructions for another AI / developer

If this file is given to another agent/developer, the target should be understood as:

> Build an original WebGL/WebGPU MMO renderer inspired by the technical limitations and architecture of World of Warcraft Vanilla 1.12.1, preserving the old engine's terrain topology, low-resolution texture blending, simple per-vertex lighting, authored day/night colors, fog-hidden far terrain, low-cost animated water, M2-like skeletal animation and hierarchical streaming — but using entirely original game assets.

Do **not** reinterpret the goal as:
- WoW Classic 2019+
- WotLK rendering
- modern PBR WoW
- Unreal-style high-poly graphics
- copying Blizzard assets

The desired visual target is specifically the **2004–2006 Vanilla-era rendering philosophy**.

---

# 50. Update protocol

From this point forward:

1. Analyze **2 technical blocks at a time**.
2. Update this same master document.
3. Mark new discoveries as ✅ / 🟢 / 🟡 / ⚠️.
4. Preserve old confirmed information.
5. Correct earlier assumptions explicitly instead of silently replacing them.
6. Add implementation consequences for WebGL/WebGPU.
7. Add new source links when used.
8. Return the updated `.md` after every 2-block checkpoint.
---

# 51. Checkpoint 6A — player-character composition (CONFIRMED)

## 51.1 One base race/sex M2, not one full mesh per outfit

✅ The Vanilla 1.12.1 character system composes a player from:

```text
base race/sex M2
+
visible/hidden geosets
+
baked body/face/hair/equipment texture
+
separate attached item models where needed
```

This is materially different from a modern "each armor piece is always a standalone skinned mesh" approach.

The core runtime object is `CCharacterComponent` (recovered size `0x4e4` bytes).

It tracks appearance values including:

```text
race
sex
hairColor
skinColor
faceType
facialHair
hairStyle
```

and equipment-dependent texture/geoset state.

### Browser-engine implication

Use one reusable base model per race/sex, then drive appearance via:

```text
CharacterAppearance
├── baseModel
├── activeGeosets
├── bakedCompositeTexture
├── attachedModels[]
└── material overrides
```

This is both cheaper and much closer to Vanilla's actual architecture.

---

# 52. Vanilla player composite texture

✅ The client creates a **256 × 256** character composite render target.

Recovered format:

```text
256 × 256
16-bit RGB565
```

The target is assembled from:
- base skin
- face overlays
- facial hair
- hair
- underwear
- equipment texture regions

The character component maintains a skin-section grid and an equipment-section grid, then rebuilds only dirty regions.

### Important rendering signature

The old client is not feeding a set of modern 2K/4K physically based materials to a character.

It is taking many authored source sections and reducing them into one tiny composite.

### Recommended browser equivalent

For a Vanilla-like original game:

```text
characterComposite = 256×256
```

or, if extra UI readability is desired:

```text
512×512 maximum
```

while keeping the source art intentionally low-frequency and hand-painted.

Using 2K/4K textures would substantially change the visual character of the game.

---

# 53. Character texture region rebuild

✅ The compositing system uses **10 dirty/rebuild groups**.

The main rebuild logic:
1. loads required skin/equipment source sections;
2. lazily creates the 256×256 target;
3. computes visible geosets;
4. processes only dirty composite regions;
5. blits the affected regions;
6. clears dirty state.

This is an early form of incremental avatar texture baking.

### Browser implementation

```ts
if (appearanceDirtyMask !== 0) {
    rebuildOnlyDirtyCharacterRegions();
}
```

Do not rebuild the full character texture every frame.

---

# 54. Character source section categories

✅ Vanilla `CharSections` logic separates character texture inputs into five principal section types:

```text
0 = skin
1 = face
2 = facial hair
3 = hair
4 = underwear
```

Rows are selected using combinations of:

```text
race
sex
section type
variation
color
```

This data-driven structure is important: character customization is not hard-coded per race.

---

# 55. Geoset selection

✅ The character model contains many optional M2 submeshes/geosets.

The client:
1. disables broad geoset ranges;
2. enables baseline body regions;
3. applies hair/facial-hair choices;
4. changes geometry based on chest/robe/boots/gloves/trousers/cloak/etc.;
5. commits the final visible-geoset set.

A recovered table contains 16 principal region bases, spaced approximately by `0x64` geoset IDs:

```text
1
0x65
0xc9
0x12d
0x191
0x1f5
0x259
0x2be
0x321
0x385
0x3e9
0x44d
0x4b1
0x515
0x579
0x5dd
```

### Browser-engine lesson

Our model format should preserve:

```text
submesh.geosetGroup
submesh.geosetVariant
```

and character customization should toggle these, rather than generating a unique mesh for every possible outfit.

---

# 56. Equipment compositing

✅ Body equipment is processed through multiple texture-layer selectors.

The recovered character component walks **8 equipment texture layers** where relevant.

Each equipment record can:
- provide one or more texture sections;
- select character texture regions;
- enable/disable geoset groups.

This means much of Vanilla armor is effectively:

```text
painted onto the base body texture
```

rather than existing as a fully separate 3D armor model.

Some equipment still changes geometry via geosets and/or attached models.

### Browser recommendation

Split equipment into three categories:

```text
A. texture-only equipment
B. geoset-changing equipment
C. attached 3D equipment
```

This allows a huge item catalog without requiring a unique complete skinned mesh for every item.

---

# 57. RGB565 + old alpha behavior

✅ Character source sections are decoded into old low-precision formats.

The composite destination is RGB565.

For overlays, the recovered client supports:
- opaque replace;
- 1-bit alpha;
- 4-level alpha blending.

The 4-level source weights correspond approximately to:

```text
0
1/3
2/3
1
```

The client also uses Floyd–Steinberg-style dithering when converting source color into RGB565.

### Why this matters

Some of Vanilla's visual softness/noise is partly a consequence of:
- low texture resolution;
- low color precision;
- coarse alpha;
- dithering;
- hand-painted source art.

### Browser recreation options

Faithful:
```text
bake to RGB565-like target
quantize alpha
apply dither
```

Practical:
```text
store RGBA8
but deliberately quantize/dither during the bake
```

The second option is easier while keeping the period look.

---

# 58. HumanMale Vanilla concrete reference

🟢 A modern parser project tested against real Vanilla 1.12.1 version-256 models reports for `HumanMale.m2`:

```text
bones      = 96
animations = 142
file size  ≈ 2.5 MB
```

The same source contrasts this with TBC HumanMale:
```text
bones      = 119
animations = 143
```

This is useful evidence that we should **not** use a modern 150–300 bone character rig if our target is Vanilla-like.

### Additional validation

A separate parser changelog reports that its Vanilla model animation extraction was verified with:

```text
96 total bones
63 bones with animation data
```

This implies many bones can be:
- static hierarchy helpers;
- attachment/utility bones;
- only conditionally animated;
- present without authored tracks in a given model.

### Web target recommendation

For our own humanoid base rig:

```text
~60 actively animated deformation bones
~80–100 total utility + deformation + attachment bones
```

would be strongly consistent with the Vanilla engineering envelope.

This is a design target, **not** a requirement to clone Blizzard's exact skeleton.

---

# 59. Exact HumanMale vertex/triangle count — status

🟡 Not yet confirmed from the public reverse-engineering documents inspected so far.

The available sources confirm:
- M2 vertex format;
- two-level index indirection;
- embedded skin/view data;
- triangle statistics support in modern parsers;
- 96 bones;
- 142 animations;

but they do not expose a trustworthy `HumanMale.m2` vertex/triangle count in the documents checked.

### Required next measurement

To obtain an exact value without guessing, parse a legitimately owned Vanilla 1.12.1:

```text
Character/Human/Male/HumanMale.m2
```

with a version-256-aware parser and record:

```text
global vertex count
view count
per-view index count
per-view triangle count
submesh count
bone palette limits
material/tex-unit count
```

Do the same for:
```text
HumanFemale
OrcMale
OrcFemale
DwarfMale
DwarfFemale
NightElfMale
NightElfFemale
ScourgeMale
ScourgeFemale
TaurenMale
TaurenFemale
GnomeMale
GnomeFemale
TrollMale
TrollFemale
```

No estimate is inserted into this master file until measured.

---

# 60. Checkpoint 6B — skeleton runtime

✅ Vanilla M2 vertices support up to **4 bone influences per vertex**.

Per vertex:

```text
4 weight bytes
4 bone-index bytes
```

This maps directly to classic linear blend skinning.

Conceptually:

```text
skinnedPosition =
    Σ(
        boneMatrix[index_i] *
        bindPosition *
        weight_i
    )
```

for up to four bones.

This is entirely suitable for WebGL/WebGPU.

---

# 61. HumanMale matrix-palette cost

Using the confirmed HumanMale reference:

```text
96 bones
```

and one recovered runtime palette matrix per bone:

```text
4×4 float32
= 64 bytes
```

the complete palette is only:

```text
96 × 64
= 6,144 bytes
≈ 6 KB
```

per evaluated pose.

This is tiny on modern hardware.

### Web implementation options

WebGL2:
```text
uniform matrix array
or bone texture
```

WebGPU:
```text
storage/uniform buffer
```

For large crowds, several characters can share animation sampling or use pose instancing.

---

# 62. Per-bone runtime state

✅ The Vanilla evaluator maintains a sizable per-bone runtime block:

```text
stride = 0x118 = 280 bytes
```

For HumanMale:

```text
96 × 280
= 26,880 bytes
≈ 26.25 KB
```

This state holds:
- primary animation clock;
- blend animation clock;
- sequence/range selectors;
- playback rate;
- time windows;
- transition information;
- working flags;
- sampled-value scratch;
- optional matrix state.

### Browser simplification

Our implementation does not need to reproduce the historical memory layout.

A compact modern bone-state structure can preserve the behavior with far less memory.

---

# 63. Sequence definitions

✅ HumanMale example:

```text
142 animation sequences
```

Each Vanilla sequence record is:

```text
0x44 bytes = 68 bytes
```

So the raw sequence-record table alone is approximately:

```text
142 × 68
= 9,656 bytes
```

excluding keyframes/tracks.

Each sequence includes:

```text
animation ID
variation index
start timestamp
end timestamp
move speed
flags
frequency
replay min/max
blend time
bounds
variation linkage
alias linkage
```

This is much richer than a simple `{name,duration}` animation clip table.

---

# 64. Vanilla sequence timing

✅ Version-256 Vanilla sequences use:

```text
startTimestamp
endTimestamp
```

Duration is therefore:

```text
duration = endTimestamp - startTimestamp
```

Do not parse a Vanilla sequence as though its first timestamp field were already a duration; later versions changed conventions.

---

# 65. Per-bone keyframe sampling

✅ Every animation frame, the client can:

```text
resolve current sequence
↓
resolve per-bone animation time
↓
binary-search timestamps
↓
find surrounding keys
↓
calculate interpolation fraction
↓
sample transform
```

This avoids linear scans through keyframe arrays.

### Browser implementation

For each animated track:

```ts
const { k0, k1, t } = binarySearchKeys(track.timestamps, time);
```

Then:
```text
translation = lerp(T0,T1,t)
scale       = lerp(S0,S1,t)
rotation    = quaternion interpolation
```

---

# 66. Dual animation clocks and cross-fade

✅ Vanilla keeps **primary** and **blend** animation state per bone.

Recovered state includes, conceptually:

```text
primaryTime
primarySequence
primaryCursorWindow

blendTime
blendSequence
blendCursorWindow

transitionStart
inverseTransitionDuration
```

The sequence record itself also stores a `blendTime`.

Therefore Vanilla animation changes are not simply:

```text
currentAnimation = nextAnimation
```

They can perform real pose cross-fading.

### Recommended web controller

```text
currentClip
previousClip
transitionElapsed
transitionDuration
```

Compute:

```text
lambda =
    clamp(
        transitionElapsed /
        transitionDuration,
        0..1
    )
```

then blend the two sampled poses.

---

# 67. Bone hierarchy propagation

✅ Bone transforms are built parent-relative and recursively propagated through the hierarchy.

Conceptually:

```text
localBoneMatrix
      ↓
parentWorldMatrix × localBoneMatrix
      ↓
boneWorldMatrix
      ↓
matrix palette
```

Root bones fall back to the model/world base transform.

This should be reproduced directly.

---

# 68. Bone pivot behavior

✅ Each bone stores a pivot.

Classic skeletal transform construction uses the pivot around rotation/scale operations.

Conceptually:

```text
T(pivot)
× animatedTransform
× T(-pivot)
```

combined with the parent hierarchy as appropriate.

Ignoring bone pivots will visibly break Vanilla animations even if the keyframes themselves parse correctly.

---

# 69. Global animation sequences

✅ M2 tracks can reference a **global sequence** instead of the local active animation clock.

This allows effects that continue independently of the character's current action, e.g. looping model effects.

Our model runtime should therefore support:

```text
track.timeSource =
    localSequence
or
    globalSequence[n]
```

This becomes especially important later for particles, ribbons and certain model effects.

---

# 70. Attachments and held equipment

✅ M2 contains explicit attachment definitions.

The Vanilla character subsystem resolves held items separately from body-texture equipment.

Recovered held-item body slots include:

```text
0x0f
0x10
0x11
```

and the character system resolves them to M2 attachment-point IDs through a small lookup/jump-table path.

Recovered attachment IDs in this path include values such as:

```text
0x1b
0x1c
0x1f
0x20/0x21 family depending on branch
```

These numeric IDs should not be assigned human-readable semantics without confirming the attachment-ID table, but the architecture is clear:

```text
weapon/item M2
    ↓
attachment ID
    ↓
character bone/attachment transform
    ↓
child model
```

### Browser engine

Represent items as children of named attachment sockets:

```text
RightHand
LeftHand
Back
Shield
Head
ShoulderL
ShoulderR
etc.
```

Internally we can map these semantic names to our own stable attachment IDs.

---

# 71. Equipment architecture for the web renderer

A Vanilla-like character should be assembled as:

```text
CharacterEntity
│
├── BaseSkinnedMesh
│   ├── active geosets
│   ├── 256×256 composite texture
│   └── skeleton
│
├── Head/hair geoset variants
│
├── LeftShoulder attachment
│   └── shoulder model
│
├── RightShoulder attachment
│   └── shoulder model
│
├── MainHand attachment
│   └── weapon model
│
├── OffHand attachment
│   └── weapon/shield model
│
└── optional cloak/other geometry
```

Most clothing detail should remain:
- painted texture;
- geoset switch;

rather than fully modeled cloth.

---

# 72. Character-material target

To retain Vanilla's visual signature, a humanoid should generally avoid:

```text
normal map
metalness
roughness
subsurface scattering
high-frequency AO
microdetail normal
physically correct skin shader
```

Prefer:

```text
one tiny painted diffuse/composite
simple alpha where needed
simple per-vertex/diffuse lighting
small controlled specular only if required
fog integration
```

Character rendering and world rendering should look like they belong to the same old engine.

---

# 73. Recommended original humanoid technical budget

Based on the confirmed Vanilla architecture, a good target for our original browser humanoids is:

```text
total bones:            ~80–100
actively animated:      ~50–70
bone influences/vertex: <= 4
composite texture:      256×256
material complexity:    very low
animation library:      large, data-driven
equipment:              texture + geoset + attachment hybrid
```

### Polygon target

🟡 Still intentionally unspecified until actual Vanilla player models are measured.

Do not choose an arbitrary value solely from modern "low-poly" conventions.

---

# 74. New source references for checkpoint 6A/6B

## Direct 1.12.1 binary reverse engineering
- Character model composition:
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/character-model.md

- M2 model layout:
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/models.md

- M2 skeletal animation:
  https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/animation.md

## Version-aware modern parser validated with Vanilla models
- Version differences:
  https://github.com/wowemulation-dev/warcraft-rs/blob/main/file-formats/graphics/wow-m2/docs/version-differences.md

Important observed Vanilla `HumanMale.m2` values:
```text
96 bones
142 animations
~2.5 MB file
embedded skin data
```

- warcraft-rs changelog / parser validation:
  https://github.com/wowemulation-dev/warcraft-rs/blob/main/CHANGELOG.md

Important validation:
```text
Vanilla model:
96 bones
63 with animation data
```

---

# 75. Dashboard after checkpoint 6A/6B

| System | Status |
|---|---|
| Target client 1.12.1 build 5875 | ✅ |
| Terrain/WDT/ADT/MCNK | ✅ |
| Terrain texture/shadow pipeline | ✅ |
| Lighting/fog/day-night | ✅ |
| WDL/far terrain | ✅ |
| Terrain culling | ✅ |
| Vanilla water | ✅ |
| M2 binary layout | ✅ |
| M2 vertex format | ✅ |
| Max 4 bone influences | ✅ |
| M2 submesh/geoset system | ✅ |
| Character geoset composition | ✅ |
| 256×256 player texture bake | ✅ |
| RGB565/alpha/dither path | ✅ |
| Equipment texture-layer system | ✅ |
| Held-item attachment architecture | ✅ |
| HumanMale bones = 96 | 🟢 validated parser |
| HumanMale animations = 142 | 🟢 validated parser |
| HumanMale animated bones = 63 | 🟢 validated parser |
| Sequence timing/start-end | ✅ |
| Per-bone binary-search sampling | ✅ |
| Cross-fade architecture | ✅ |
| Matrix palette hierarchy | ✅ |
| HumanMale exact vertices | 🟡 requires direct model measurement |
| HumanMale exact triangles | 🟡 requires direct model measurement |
| Other race exact geometry stats | 🟡 |
| M2 render materials/blend modes deep dive | ⬜ |
| M2 particles/ribbons | ⬜ |
| WMO geometry | ⬜ |
| WMO portal/interior visibility | ⬜ |
| Camera | ⬜ |
| Player movement | ⬜ |
| Gameplay/combat | ⬜ |
| Networking | ⬜ |

---

# 76. Next two blocks

## 7A — M2 rendering/material pipeline
Analyze:
- render flags;
- texture units;
- blend modes;
- alpha testing;
- two-sided materials;
- unlit/full-bright;
- texture animation;
- character vs creature material differences;
- exact old fixed-function assumptions.

## 7B — M2 effects and LOD behavior
Analyze:
- views / embedded skins;
- what Vanilla "views" actually change;
- model distance/fade/culling;
- particle emitters;
- ribbon emitters;
- billboard behavior;
- practical browser equivalents.

After 7A + 7B, update this same master file again.
---

# 77. Checkpoint 7A — M2 material record

✅ The Vanilla-era M2 material structure is extremely small.

A parsed material consists of:

```text
u16 renderFlags
u16 blendMode
```

Total:

```text
4 bytes / material
```

The visual complexity therefore does **not** come from a modern material graph. It comes from:
- a small render-state descriptor;
- one or more texture-unit references;
- animated color/alpha tracks;
- UV transforms;
- global lighting/fog;
- special effect emitters.

This is a major design clue for reproducing the 2004–2006 look.

---

# 78. M2 render flags

🟢 Version-aware M2 parsers expose the classic render-state bits as:

```text
0x01  UNLIT
0x02  UNFOGGED
0x04  NO_BACKFACE_CULLING
0x08  NO_ZBUFFER
0x10  AFFECTED_BY_PROJECTION / version-context state
0x20  DEPTH_TEST
0x40  DEPTH_WRITE
```

Higher bits exist in parser abstractions for shadow/unknown behavior.

### Important caution

Some faithful 1.12.1 reconstruction code describes parts of the historical state through a reconstructed internal render-state interpretation rather than the generic cross-version flag names above.

Therefore:
- the **bit values and material record** are useful;
- exact semantic naming for every obscure bit should be treated cautiously;
- the common behaviors below are strongly corroborated.

### Common confirmed behavior

```text
UNLIT
    → bypass normal world lighting

UNFOGGED
    → do not use normal scene fog

NO_BACKFACE_CULLING
    → render two-sided

depth-related flags
    → influence depth test/write state
```

For our original web engine, the important thing is to preserve these simple state switches rather than converting every material into a PBR surface.

---

# 79. Vanilla M2 blend modes

✅ The classic M2 material blend-mode field supports the following principal values:

```text
0 = Opaque
1 = Alpha Key / cutout
2 = Alpha Blend
3 = No-Alpha Add / special additive family
4 = Add
5 = Mod
6 = Mod2x
```

A later `7 = BlendAdd` exists in newer-version abstractions and should not be treated as a core Vanilla mode.

### Practical interpretation

```text
Opaque
    normal solid surface

AlphaKey
    hard texture cutout

Alpha
    standard translucency

Add / NoAlphaAdd
    glow-like/effect blending

Mod
    framebuffer multiplication

Mod2x
    multiplied result with stronger factor
```

This small mode table is enough to drive a substantial part of the Vanilla visual language.

---

# 80. Vanilla alpha-key threshold — exact period behavior

✅ A faithful 1.12.1 reconstruction records the Vanilla/WotLK-era alpha-test reference as:

```text
224 / 255
≈ 0.878431
```

This is significantly more aggressive than the ~0.5 cutoff commonly used by modern engines.

Conceptually:

```glsl
if (textureAlpha * materialAlpha < 224.0 / 255.0)
    discard;
```

### Why it matters

Using:

```text
0.5
```

instead of:

```text
0.878
```

makes cutout vegetation and similar meshes look denser and changes their silhouette.

This is one of the kinds of tiny technical constants that can make a recreation look subtly "wrong" even when the same kind of low-resolution texture is used.

---

# 81. Two-sided M2 rendering

✅ The M2 two-sided/no-backface-cull state disables back-face culling.

Browser equivalent:

```text
normal:
cull BACK

two-sided:
cull NONE
```

Typical uses include:
- foliage cards;
- thin cloth/cards;
- glow planes;
- other intentionally single-plane geometry that must be visible from both sides.

This is another reason old WoW can use extremely little geometry: a single textured plane can visually represent something that a modern physically modeled asset might build with thickness.

---

# 82. Lighting behavior by blend/material state

🟢 The 1.12.1-focused Benilla reconstruction, based on byte-level work on the original client, preserves several non-obvious M2 rules.

### UNLIT

```text
renderFlags & 0x01
```

marks a full-bright/unlit path.

### Additive

Important:

```text
additive != automatically unlit
```

An additive M2 batch can still receive the normal lighting unless its authored material says otherwise.

### Mod / Mod2x

Benilla's recovered 1.12.1 state table indicates that modes 5 and 6 disable the normal GL lighting path even when the ordinary UNLIT bit is not set.

This means:

```text
blend mode itself can affect lighting state
```

not merely framebuffer blending.

### Browser-engine lesson

Pipeline selection should be based on:

```text
blendMode
+
renderFlags
```

not just on the texture.

---

# 83. Fog policy and effect blending

✅/🟢 M2 material/effect rendering uses different fog policies depending on render state.

The faithful reconstruction specifically keeps fog policy in its material identity.

For example:
- ordinary alpha/opaque surfaces can fog toward the scene fog color;
- additive effects should visually disappear toward **black**, otherwise fog would add a bright grey veil to glowing effects;
- explicitly unfogged materials bypass normal world fog.

### Recommended web abstraction

```ts
enum FogMode {
    SceneColor,
    Black,
    None
}
```

Then each material/effect selects the appropriate policy.

---

# 84. Animated M2 material channels

✅ Vanilla M2 is not limited to static texture + static alpha.

The M2 data contains animation tracks for:

```text
color RGB
alpha
transparency/weight
texture transforms
```

A skin batch contains references such as:

```text
colorIndex
materialIndex
textureComboIndex
weightComboIndex
textureTransformComboIndex
```

The 1.12.1-focused parser/reconstruction resolves:
- animated RGB tint;
- animated alpha;
- transparency tracks;
- UV animation.

This allows effects such as:

```text
pulsing glow
scrolling texture
fading material
animated magical surface
```

without changing mesh geometry.

---

# 85. Character/creature texture slot routing

🟢 The Vanilla-focused reconstruction identifies important runtime M2 texture slots.

Examples:

```text
type 1 → composited character body atlas
type 2 → object/item skin
type 6 → hair mesh texture
type 8 → extra skin (e.g. special race surface)
```

Creature models also use variation slots equivalent to:

```text
Monster1
Monster2
Monster3
```

whose texture filenames can come from creature display data instead of being permanently embedded in the M2.

### Browser-engine consequence

Our asset format should allow:

```text
material texture =
    fixed asset
or
    runtime appearance slot
```

This avoids duplicating the same mesh for every skin variation.

---

# 86. Recommended Vanilla-like M2 render pipeline

A compact browser pipeline can closely mirror the old behavior:

```text
M2 batch
│
├── resolve active geoset/submesh
├── resolve runtime texture slot
├── resolve color / alpha animation
├── resolve UV animation
├── select render flags
├── select blend mode
│
├── skin vertices
├── simple old-style lighting OR unlit
├── sample diffuse texture
├── apply animated tint/alpha
├── alpha-test if mode 1
├── apply fog policy
└── blend using mode 0..6
```

No PBR stack is required.

### Recommended shader inputs

```text
diffuse texture
vertex/model tint
animated alpha
simple light
fog
optional UV transform
```

Avoid adding by default:

```text
normal maps
metalness
roughness
parallax
micro-normal detail
SSR
physically based Fresnel
```

if the target remains Vanilla.

---

# 87. Checkpoint 7B — M2 embedded views / skin profiles

✅ In Vanilla v256, M2 view/skin profiles are embedded directly inside the MD20 file.

Each `M2View` header is:

```text
44 bytes
```

and references:

```text
indices
triangles
properties
submeshes
texture batches
bone-count/profile value
```

A robust 1.12.1 parser treats these as an actual array:

```text
views.offset + index * 44
```

and decodes each profile independently.

### Important correction / uncertainty

⚠️ One modern parser helper contains an older workaround saying to always use `views[0]` because additional profiles appeared invalid in some tested models.

A newer 1.12.1-focused parser decodes every embedded profile normally.

Therefore the safe conclusion is:

```text
Vanilla definitely has embedded M2 views/profiles.
```

But we should **not yet claim an exact distance→view LOD switching law** until the original 1.12.1 profile-selection routine (`0x71d6c0`) is fully characterized.

Status:

```text
format:        ✅ confirmed
profile select:🟡 still needs exact retail-client analysis
```

---

# 88. M2 billboard bones — exact 1.12.1 behavior

✅ Direct reverse engineering of the Vanilla animation kernel confirms billboard behavior is implemented at the **bone-matrix level**.

The selector uses the relevant bone flag field and chooses camera-facing basis construction.

Recovered Vanilla selector:

```text
flags & 0x78
```

Important cases:

```text
0x08 → spherical billboard

0x10 → cylindrical billboard,
       one local axis locked

0x18 → cylindrical billboard,
       another local axis locked

0x20 → cylindrical billboard,
       third local axis locked
```

Other values use the normal/default path.

### Why bone billboards matter

This is more flexible than simply marking a whole model as a billboard.

A model can contain:

```text
normal animated body
+
camera-facing glow card
+
camera-facing spell plane
```

all driven by one skeleton.

### Browser equivalent

Mark individual skeleton nodes:

```ts
bone.billboard = None
bone.billboard = Spherical
bone.billboard = CylindricalAxis0
bone.billboard = CylindricalAxis1
bone.billboard = CylindricalAxis2
```

and construct their local/world matrix against the camera basis.

---

# 89. M2 particles — architecture

✅ Vanilla M2 embeds particle-emitter definitions.

The original runtime contains a polymorphic particle-emitter family including:

```text
Plane
Sphere
Spline
```

The model definition drives cosmetic effects rather than skeletal deformation.

Recovered/reconstructed particle parameters include concepts such as:

```text
bone attachment
local position
emission speed
speed variation
vertical/horizontal spread
lifespan
emission rate
emission area
gravity
texture
blend mode
```

The runtime:
1. updates particle age;
2. kills particles past lifespan;
3. emits new particles;
4. moves them;
5. depth-sorts where needed;
6. expands particles into textured quads.

This is an extremely browser-friendly design.

---

# 90. Particle rendering philosophy

✅ The recovered original render path emits particle **quads**, including plain and tiled/rotated expansion modes.

So the correct visual philosophy is not:

```text
complex volumetric particle meshes
```

but:

```text
small textured cards
+
blend mode
+
camera-facing orientation
+
simple motion
```

### Browser implementation

Use GPU-instanced quads whenever possible:

```text
ParticleInstance
├── position
├── size
├── rotation
├── color
├── alpha
└── texture-frame/cell
```

Then one shared quad geometry can draw large numbers of Vanilla-style particles cheaply.

---

# 91. Particle blending

🟢 Particle reconstruction code maps effect modes into a similarly compact family:

```text
opaque
alpha-key
alpha blend
additive
modulate
```

This aligns naturally with the broader M2 material philosophy.

Particles therefore do not require a separate physically based material system.

---

# 92. M2 ribbons — exact conceptual behavior

🟢 A 1.12.1-focused reconstruction based on byte-level reverse engineering describes Vanilla ribbon trails as a stream/ring of **edges**.

Each update:

```text
emitter bone/local origin
        ↓
transform to current world node
        ↓
construct edge:
    top    = node + axis * heightAbove
    bottom = node - axis * heightBelow
        ↓
commit edges at edgesPerSecond
        ↓
old edges expire at edgeLifetime
        ↓
gravity can sag stored edges
        ↓
render adjacent edges as strip/quads
```

The texture U coordinate advances with edge age, allowing the texture's transparent tail to fade the trail.

This is ideal for:
- weapon enchant trails;
- spell streaks;
- missile tails;
- wisps.

---

# 93. Ribbon visibility and animation

🟢 Ribbon properties can be animation-driven.

The faithful reconstruction supports concepts recovered from the M2 data such as:

```text
visibility by animation sequence
color track
alpha track
heightAbove track
heightBelow track
edge lifetime
edges per second
gravity
texture cell
blend mode
```

Thus a trail can be:

```text
OFF in Stand
ON in attack/projectile animation
OFF after impact
```

without requiring a separate gameplay particle object.

---

# 94. Exact Vanilla doodad distance fade — major finding

✅ A recent byte-level reconstruction of `WoW.exe` 1.12.1 documents the original world-M2 doodad fade routine.

The fade depends on the **world-space bounding-sphere radius**.

The client computes approximately:

```text
d =
    horizontalDistance(
        camera.xy,
        boundingSphereCenter.xy
    )
    - boundingRadius
```

Vertical distance is ignored for this fade calculation.

Then it selects one of three size buckets.

### Exact buckets

| Bounding-sphere radius | Fade start | Fully gone |
|---:|---:|---:|
| `≤ 0.5 yd` | 40 yd | 50 yd |
| `0.5–2.5 yd` | 100 yd | 125 yd |
| `2.5–7.0 yd` | 150 yd | 200 yd |
| `> 7.0 yd` | no size-fade | far-clip/frustum |

Recovered binary constants:

```text
radius thresholds:
0.5
2.5
7.0

fade ranges:
10
25
50

fade ends:
50
125
200
```

### Formula

```text
fade =
    clamp(
        1 - (d - fadeStart) / fadeRange,
        0,
        1
    )
```

Examples:

```text
tiny prop:
40 ─────── 50
1.0  fade  0.0

medium prop:
100 ────── 125
1.0  fade   0.0

large prop:
150 ─────────── 200
1.0     fade     0.0
```

Large objects with radius > 7 yd stay fully visible through this mechanism and rely on the ordinary far-clip/frustum path.

---

# 95. Doodad fade + alpha test interaction

✅ The distance-fade scalar flows into model alpha.

For cutout surfaces, the effective alpha-test condition is conceptually:

```text
textureAlpha × objectFade
    >= 224/255
```

As the object fades, lower-alpha edge pixels fail first.

This causes a characteristic:

```text
edge-first erosion
```

rather than the entire cutout immediately becoming uniformly transparent.

During the intermediate fade region, the faithful reconstruction uses the corresponding blended rendering path so the result reads smoothly.

### This is visually important

For foliage/fences/small props, Vanilla's disappearance is not merely:

```text
if distance > max:
    hide()
```

The fade interacts with the aggressive cutout threshold.

---

# 96. Temporal object appearance fade

🟢 The 1.12.1 reconstruction also documents a separate **spawn/appearance fade** for streamed CGObjects.

Recovered behavior:

```text
duration ≈ 2 seconds
alpha = t³
```

where normalized `t` runs from 0 to 1.

This is conceptually separate from the doodad distance fade:

```text
map doodads → size/distance fade

dynamic/streamed objects
→ temporal appearance fade
```

Both ultimately affect model render alpha.

For an original browser MMO, this is an excellent way to hide asynchronous object arrival.

---

# 97. Recommended browser visibility hierarchy after 7B

We can now construct a much more Vanilla-specific visibility system:

```text
VERY SMALL M2
radius ≤ 0.5
    ↓
fade 40→50 yd

MEDIUM M2
radius ≤ 2.5
    ↓
fade 100→125 yd

LARGE M2
radius ≤ 7
    ↓
fade 150→200 yd

VERY LARGE M2
radius > 7
    ↓
remain until frustum/farclip

DETAIL DOODADS / ground clutter
    ↓
separate ~70 yd detail rule

TERRAIN
    ↓
ADT detailed world

FAR TERRAIN
    ↓
WDL + fog + horizon
```

This is much more nuanced than one global draw distance.

---

# 98. Vanilla-like M2 pipeline state table for our web engine

Recommended initial state mapping:

| Mode | Depth | Cull | Lighting | Fog | Blend |
|---|---|---|---|---|---|
| Opaque | test/write | normal unless two-sided | normal/unlit flag | scene/none flag | replace |
| AlphaKey | test/write | normal unless two-sided | normal/unlit flag | scene/none flag | discard < 224/255 |
| Alpha | test; write as authored | normal unless two-sided | normal/unlit flag | scene/none | src-alpha |
| Add | test; authored write | often cards | normally lit unless unlit | black/appropriate | additive |
| Mod | transparent-order path | authored | effectively fullbright in recovered 1.12 state | policy | multiply |
| Mod2x | transparent-order path | authored | effectively fullbright in recovered 1.12 state | policy | multiply ×2 |

This should be treated as the **starting implementation contract**, then refined when the exact original batch-state setter is fully documented.

---

# 99. Performance implications of 7A/7B

The Vanilla M2 system stays cheap because visual richness comes from:

```text
tiny materials
+
texture cards
+
blend modes
+
UV animation
+
bone billboards
+
small particle quads
+
ribbon strips
+
aggressive distance fade
```

rather than:
- high mesh density;
- dozens of high-resolution material maps;
- expensive fragment lighting;
- volumetric effects.

This is extremely favorable for a browser MMO.

---

# 100. New source references — Checkpoint 7A/7B

## Direct/reconstructed 1.12.1 behavior

WoW 1.12.1 Client Internals:
https://github.com/samwhosung/wow-1121-client-internals

M2 models/material/particle runtime:
https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/models.md

Animation and billboard bone logic:
https://github.com/samwhosung/wow-1121-client-internals/blob/main/docs/animation.md

## Benilla — 1.12.1-focused reconstruction

Repository:
https://github.com/puRe991/benilla-1.12.1-open-source

M2 material renderer:
```text
crates/benilla/src/model_render.rs
```

Exact world-doodad fade reconstruction:
```text
crates/benilla/src/model_fade.rs
```

M2 embedded skin profiles:
```text
crates/benilla-m2/src/skin.rs
```

M2 render-batch assembly:
```text
crates/benilla-formats/src/models/m2_batches.rs
```

Particles:
```text
crates/benilla-formats/src/particles.rs
crates/benilla/src/particles.rs
```

Ribbons:
```text
crates/benilla-formats/src/ribbons.rs
crates/benilla/src/ribbons.rs
```

## Cross-version parser corroboration

warcraft-rs:
https://github.com/wowemulation-dev/warcraft-rs

M2 material flags/blend modes:
```text
file-formats/graphics/wow-m2/src/chunks/material.rs
```

M2 bones/billboard flag parsing:
```text
file-formats/graphics/wow-m2/src/chunks/bone.rs
```

---

# 101. Dashboard after Checkpoint 7A/7B

| System | Status |
|---|---|
| Target client 1.12.1 build 5875 | ✅ |
| Terrain / ADT / MCNK | ✅ |
| Terrain textures/shadows | ✅ |
| Lighting / fog / day-night | ✅ |
| WDL / far terrain | ✅ |
| Terrain culling | ✅ |
| Vanilla water | ✅ |
| M2 file layout | ✅ |
| M2 character composition | ✅ |
| M2 skeleton / animation | ✅ |
| HumanMale 96 bones / 142 anims | 🟢 |
| M2 material record = 4 B | ✅ |
| M2 render flags | 🟢 |
| M2 blend modes 0–6 | ✅ |
| Alpha-key 224/255 | 🟢 byte-aligned reconstruction |
| Two-sided behavior | ✅ |
| Unlit/fog state | 🟢 |
| Animated RGB/alpha/UV | ✅ |
| Runtime texture slots | 🟢 |
| Embedded M2 views | ✅ |
| Exact profile/LOD selection law | 🟡 |
| Bone billboards | ✅ |
| Particle emitter families | ✅ |
| Particle quad rendering | ✅ |
| Ribbon architecture | 🟢 |
| Doodad radius fade 40/50,100/125,150/200 | ✅ byte-verified |
| >7 yd no size-fade | ✅ byte-verified |
| CGObject ~2s t³ appear fade | 🟢 |
| HumanMale exact vertices/triangles | 🟡 requires model measurement |
| WMO geometry | ⬜ NEXT |
| WMO groups/materials | ⬜ NEXT |
| WMO portals/interiors | ⬜ NEXT |
| WMO indoor/outdoor visibility | ⬜ NEXT |
| Camera | ⬜ |
| Player movement | ⬜ |
| Combat/gameplay | ⬜ |
| Networking | ⬜ |

---

# 102. Next two blocks

## 8A — WMO geometry, grouping and materials

Analyze:
- root WMO vs group WMO files;
- MOHD / MOTX / MOMT / MOGN / MOGI;
- per-group geometry;
- vertices / triangles;
- material batches;
- doodads inside WMOs;
- liquid inside WMOs;
- bounding boxes;
- collision relevance;
- browser representation.

## 8B — WMO portals, rooms and interior/exterior visibility

Analyze:
- portal polygons;
- room/group adjacency;
- portal flood;
- exterior → interior visibility;
- interior → exterior visibility;
- occlusion;
- interior lighting behavior;
- why buildings can contain huge interiors cheaply;
- exact browser portal-culling architecture.

After 8A + 8B, update this same master file again.

---

# 103. Checkpoint 8A — WMO architecture

✅ Vanilla WMO is not one monolithic building mesh.

The 1.12.1 client splits a WMO into:

```text
Root.wmo
├── global/shared metadata
├── materials
├── texture-name table
├── group table
├── doodad definitions
├── doodad sets
├── lights
├── fog
├── portal graph
└── optional WMO skybox reference

Root_000.wmo
Root_001.wmo
Root_002.wmo
...
└── actual geometry + render batches for each group
```

This is one of the most important architectural discoveries for the browser engine.

A large building/city can be represented as:

```text
one logical WMO
+
many independently cullable groups
```

instead of one enormous mesh.

---

# 104. WMO file container

✅ WMO uses chunked IFF-style records:

```text
[tag:4 bytes]
[size:u32]
[data:size]
```

The FourCC appears reversed on disk.

Example:

```text
MVER
```

is encountered as reversed magic in raw storage/parsing.

For Vanilla 1.12.1, the documented shipped WMO corpus uses:

```text
MVER version 17
```

---

# 105. WMO corpus observed by the 1.12.1 reverse-engineering project

The 1.12.1 client-internals corpus analysis reports:

```text
6332 .wmo files total
820 roots
5373 groups
139 zero-byte stubs
```

The validated loaded files use WMO version 17.

This confirms how strongly WoW relies on the root+group architecture.

---

# 106. WMO root file — major shared chunks

The original client root parser resolves at least these major shared chunks:

| Chunk | Purpose |
|---|---|
| `MOHD` | WMO root/header metadata |
| `MOTX` | texture-name string block |
| `MOMT` | material table |
| `MOGN` | group-name strings |
| `MOGI` | per-group information / bounds |

Other root-side systems include:

```text
MODN / MODD / MODS
    doodad names, placements and sets

MOLT
    lights

MFOG
    fog definitions

MOPV / MOPT / MOPR
    portal graph

MOSB
    optional skybox M2
```

The portal side will be handled in Checkpoint 8B.

---

# 107. MOMT — WMO material record

✅ Vanilla 1.12.1 uses:

```text
64 bytes per MOMT material
```

The original client resolves exactly two texture references from the record:

```text
+0x0c → texture 1 name offset into MOTX
+0x18 → texture 2 name offset into MOTX
```

The runtime stores resolved handles into fields near the end of the same record.

### Critical Vanilla limit

✅ There is no third texture resolved by the 1.12.1 material loader.

So the practical Vanilla WMO material design is:

```text
small fixed material record
+
maximum 2 resolved texture inputs
+
simple render flags / blend mode / colors
```

not a modern multi-map PBR graph.

---

# 108. WMO material flags recovered in the 1.12.1 reconstruction

🟢 Important MOMT flags include:

```text
0x01  UNLIT
0x04  UNCULLED / two-sided
0x10  SIDN / night-glow behavior
0x20  WINDOW behavior
```

### 0x01 — UNLIT

For exterior WMO rendering, this can disable normal lighting and render the material full-bright.

Interior batches obey additional section-specific lighting rules, so the same flag is not blindly applied in every path.

### 0x04 — UNCULLED

Default WMO geometry is back-face culled.

If this flag is set:

```text
back-face culling disabled
```

This is important because some Vanilla assets deliberately contain duplicate reversed faces rather than depending on universal two-sided rasterization.

### 0x10 — SIDN

Used by recovered WMO night-light behavior.

It carries authored night-emissive information used for effects such as stained glass that becomes visibly luminous after dusk.

### 0x20 — WINDOW

Interior-window batches can select a different/brighter lighting lane.

This will become more important in 8B when interior rendering is analyzed.

---

# 109. WMO blend modes

🟢 The 1.12.1-focused reconstruction treats the MOMT `blendMode` as a direct renderer blend-state index.

Important mappings:

```text
0 → Opaque
1 → Alpha Test
4 → Mod
5 → Mod2x
other non-zero values
  → translucent/blended family
```

This is intentionally kept separate from M2's blend-mode interpretation.

### Engine rule

Do not force M2 and WMO material enums to be identical internally.

Use something like:

```ts
WmoMaterial {
    flags
    blendMode
    texture0
    texture1
}
```

then map to browser GPU state.

---

# 110. WMO group file

✅ Each `<root>_NNN.wmo` group contains:

```text
MVER
MOGP {
    0x44-byte group header
    subchunks...
}
```

The first geometry subchunk begins after the fixed:

```text
0x44 byte MOGP header
```

The group therefore behaves like an independently renderable scene cell.

---

# 111. Mandatory WMO geometry subchunks

The original client derives counts from each subchunk's byte size and fixed element stride.

| Chunk | Element stride | Meaning |
|---|---:|---|
| `MOPY` | 2 B | material/flags per triangle |
| `MOVI` | 2 B | `u16` vertex indices |
| `MOVT` | 12 B | `vec3<f32>` positions |
| `MONR` | 12 B | `vec3<f32>` normals |
| `MOTV` | 8 B | `vec2<f32>` UV coordinates |
| `MOBA` | 24 B | render batch |

This is extremely straightforward to convert to WebGL/WebGPU.

---

# 112. WMO geometry pipeline

Conceptually:

```text
MOVT
  ↓
positions

MONR
  ↓
normals

MOTV
  ↓
UV0

MOVI
  ↓
index buffer

MOPY
  ↓
triangle properties/collision semantics

MOBA
  ↓
draw ranges + material
```

Browser representation:

```ts
WmoGroupGPU {
    vertexBuffer
    indexBuffer
    batches[]
}
```

Each batch becomes one draw range.

---

# 113. MOBA render batches

✅ Each MOBA record is:

```text
0x18 bytes = 24 bytes
```

The Vanilla-focused parser uses each batch to select:

```text
start index
index count
material id
```

Then it resolves the material through the root MOMT table.

This gives:

```text
group
  ├── batch 0 → material A
  ├── batch 1 → material B
  ├── batch 2 → material C
  └── ...
```

rather than requiring one material per entire building.

---

# 114. WMO batch classes

🟢 The MOGP header carries counts that divide MOBA batches into ordered sections:

```text
TRANS
INT
EXT
```

The reconstructed 1.12 path treats batches as laid out in this order.

These classes affect interior lighting behavior.

For the browser implementation, store:

```ts
enum WmoBatchClass {
    Trans,
    Interior,
    Exterior
}
```

even if initially all three share the same simple shader.

That keeps the engine compatible with the original lighting rules we will decode in 8B.

---

# 115. MOCV — baked vertex color

🟢 Some WMO groups contain vertex colors parallel to `MOVT`.

These are not merely decorative vertex tint.

In interior rendering they participate directly in the old lighting model.

The reconstructed renderer treats:

```text
MOCV RGB
    → baked per-vertex shade / local-light contribution
```

and in specific interior batch classes:

```text
MOCV alpha
```

also participates in lighting behavior.

### Important lesson

Do not discard vertex colors when converting WMO geometry.

For a faithful Vanilla-like result:

```text
position
normal
uv
vertex color
```

should all be retained.

---

# 116. WMO group classification

✅/🟢 A major Vanilla group test is:

```text
groupFlags & 0x48
```

The reconstructed client logic classifies a true interior group when:

```text
(groupFlags & 0x48) == 0
```

Important bits include:

```text
0x08 → exterior
0x40 → exterior-lit related path
```

This means "inside/outside" is authored at the WMO-group level rather than guessed simply from geometry.

The exact visibility consequences are reserved for 8B.

---

# 117. WMO group bounding boxes

✅ `MOGI` stores an axis-aligned bounding box for each group.

This is useful for:
- broad-phase visibility;
- rough containment;
- streaming;
- portal traversal acceleration.

However, the 1.12.1 reconstruction found that authored group bounds can sometimes be loose or imperfect relative to actual floor geometry.

Therefore our web engine should distinguish:

```text
authored group bounds
    → fast broad-phase / visibility

actual collision triangle bounds
    → exact spatial query
```

Do not use one as a guaranteed substitute for the other.

---

# 118. WMO doodads are separate M2 props

✅ A WMO does not bake every chair, lamp, banner and brazier into its static wall mesh.

Root-side data describes placed M2 props.

Important structures:

```text
MODN
    model-name table

MODD
    individual doodad placement

MODS
    doodad sets

MODR
    per-group references to doodads
```

A `MODD` placement includes concepts such as:

```text
model
position
orientation quaternion
uniform scale
authored color
```

Then the M2 instance is positioned inside WMO model space.

This is a highly reusable architecture.

---

# 119. WMO doodad sets

✅ `MODS` defines ranges inside the global doodad list.

Conceptually:

```text
DoodadSet {
    start
    count
}
```

Recovered behavior:

```text
set 0
    → global / always-present set

placement-selected set
    → one additional themed/state set
```

This allows one building mesh to have alternate prop configurations without duplicating the WMO geometry.

### Browser use

This is ideal for:

```text
seasonal decorations
instance states
different room dressing
quest-state variants
alternate interiors
```

using the same static WMO mesh.

---

# 120. MODR — group ownership of doodads

🟢 Each WMO group can reference doodads through `MODR`.

That relationship is important for both:
- lighting;
- visibility.

Conceptually:

```text
Group 0
    → doodad 2
    → doodad 7

Group 1
    → doodad 5
    → doodad 7
```

A prop can therefore belong to / be referenced by more than one group.

This will matter in 8B because a prop should disappear when every group capable of exposing it is portal-culled.

---

# 121. WMO lights

🟢 Root-side `MOLT` contains WMO light definitions.

Groups can reference relevant lights with:

```text
MOLR
```

So the architecture is:

```text
root:
    global light definitions

group:
    list of light indices relevant to this room/group
```

This is far cheaper than testing every interior light against every object in a city-sized WMO.

This is another strong pattern to reproduce in a browser MMO.

---

# 122. MOPY — per-triangle semantic flags

✅ `MOPY` has one 2-byte entry per triangle.

It is not merely a material number.

Recovered semantics include flags used for:
- collision;
- detail surfaces;
- camera collision;
- rendering/lighting queries.

Two particularly useful flags are:

```text
0x02 → NOCAMCOLLIDE
0x04 → DETAIL
```

and the reconstruction also identifies:

```text
0x08 → COLLISION
0x80 → VISITED / internal query-state-related flag family
```

Some flags are path-specific, so the full bit table should not yet be treated as finalized.

---

# 123. Separate player and camera collision

✅ Vanilla effectively allows different collision face sets for different jobs.

### Walking/player collision

Recovered behavior keeps:

```text
non-DETAIL faces
```

for the normal walking collision path.

Thus:

```text
DETAIL 0x04
    → not part of normal player-body collision
```

### Camera / LOS collision

The camera path:

```text
keeps DETAIL
but excludes NOCAMCOLLIDE 0x02
```

So:

```text
camera-only face =
DETAIL set
+
NOCAMCOLLIDE clear
```

This allows roofs, signs, decorative overhangs and thin visible geometry to stop the third-person camera even when the player should not collide with them.

---

# 124. Recommended browser collision split

For our engine:

```text
WMO source triangles
       │
       ├── playerCollisionMesh
       │      excludes DETAIL
       │
       ├── cameraCollisionMesh
       │      excludes NOCAMCOLLIDE
       │      may keep DETAIL
       │
       └── renderMesh
              normal visual batches
```

These can share the same source positions while using different index arrays.

That means we do **not** need three copies of vertex data.

---

# 125. WMO collision broad phase

🟢 The modern 1.12 reconstruction found a practical performance requirement that also follows the original grouped design:

```text
whole-WMO AABB
    ↓
group AABB
    ↓
spatial grid/BSP-like acceleration
    ↓
triangle test
```

A large dungeon group can contain many thousands of collision triangles.

A browser implementation should therefore never perform:

```text
every character
×
every WMO triangle
×
every frame
```

Recommended:

```text
WMO placement bounds
→ visible/relevant group bounds
→ local spatial index
→ triangle query
```

---

# 126. Original WMO triangle intersection

✅ The reverse-engineered client uses a Möller–Trumbore-style segment/triangle intersection routine shared by WMO queries and M2 picking.

Recovered epsilon:

```text
0.002
```

We do not need instruction-level floating-point identity for the browser game, but the geometric model itself is standard and straightforward to reproduce.

---

# 127. MLIQ — liquids embedded inside WMO groups

✅ WMO groups can carry their own liquid surface via:

```text
MLIQ
```

Examples include:
- city canals;
- fountains;
- lava inside structures;
- dungeon pools;
- slime.

This is separate from outdoor ADT `MCLQ`.

---

# 128. Exact WMO liquid grid spacing

✅ Byte-verified 1.12.1 constant:

```text
MLIQ_CELL_STEP
=
4.166666507720947 yards
```

Approximately:

```text
4.1666665 yd
```

Each grid vertex is placed as:

```text
position(i,j) =
base
+
(i * STEP,
 j * STEP,
 height[i,j])
```

This is an extremely cheap height-grid representation.

---

# 129. WMO liquid topology

✅ If:

```text
xverts
yverts
```

are the vertex-grid dimensions, then:

```text
xtiles = xverts - 1
ytiles = yverts - 1
```

Each wet tile becomes:

```text
2 triangles
```

A tile whose flag low nibble is:

```text
0xF
```

is a hole and generates no water geometry.

Pseudo-code:

```ts
for each tile:
    if ((tileFlag & 0xF) == 0xF)
        continue

    emit two triangles
```

---

# 130. WMO liquid type selection

🟢 One liquid kind is resolved for the WMO liquid surface.

The recovered reconstruction follows:

```text
if groupLiquid != 0xF:
    use groupLiquid low nibble
else:
    use first non-hole tile type nibble
```

The nibble determines the liquid family:

```text
water / ocean-like
magma
slime
...
```

and therefore which visual/material path is used.

---

# 131. WMO liquid UV behavior

🟢 The original client uses a shared texture-generation transform rather than treating every tiny liquid group as a visually independent texture island.

The current faithful reconstruction uses model-space/world-anchored coordinates to preserve continuity between neighboring MLIQ surfaces.

The exact upstream texture-matrix scale is still partially unresolved.

Therefore:

```text
grid placement mechanism   ✅
hole mechanism             ✅
type resolution            ✅
shared continuous UV idea  🟢
exact original UV matrix   🟡
```

For our web engine, world/model-anchored animated UVs are the right implementation.

---

# 132. WMO material + batch WebGL/WebGPU representation

Recommended converted asset:

```ts
WmoAsset {
    materials: WmoMaterial[]
    groups: WmoGroup[]
    doodads: WmoDoodad[]
    doodadSets: DoodadSet[]
    lights: WmoLight[]
    portals: PortalGraph
}

WmoGroup {
    bounds
    flags

    positions
    normals
    uv0
    vertexColors

    renderIndices
    batches

    playerCollisionIndices
    cameraCollisionIndices

    liquid?
    doodadRefs[]
    lightRefs[]
}
```

This keeps the architecture close to Vanilla without requiring us to preserve Blizzard's proprietary binary format at runtime.

---

# 133. Recommended browser WMO load pipeline

```text
download converted WMO root manifest
        ↓
create shared materials/textures
        ↓
load only required group blobs
        ↓
for each group:
    GPU vertex buffer
    GPU index buffer
    batch table
    collision indices
    liquid grid
        ↓
spawn referenced original-game-inspired props
using OUR OWN original M2-like assets
```

Large WMO scenes can therefore stream per group.

---

# 134. Recommended WMO render path

```text
visible WMO placement
        ↓
visible groups only
        ↓
for each group:
    for each MOBA-like batch:
        select MOMT-like material
        set blend/cull state
        bind texture(s)
        apply WMO lighting lane
        draw index range
```

The important optimization is:

```text
DO NOT submit every group.
```

The portal system in 8B will decide the visible set.

---

# 135. Why this is ideal for a browser MMO

The Vanilla architecture gives us several major advantages:

```text
STATIC ARCHITECTURE
    WMO group meshes

REUSABLE DETAIL
    M2 doodads

CHEAP MATERIALS
    max ~2 WMO textures
    simple blend flags

CHEAP LIGHTING
    baked MOCV
    group-local light lists

CHEAP COLLISION
    same source mesh
    filtered index sets

CHEAP WATER
    tiny grid

CHEAP VISIBILITY
    group bounds + portals
```

A building can look detailed without requiring:
- one giant unique high-poly mesh;
- dozens of dynamic lights touching everything;
- PBR materials;
- full-world collision scans.

---

# 136. Browser conversion rule — do not merge all WMO groups

A common modern asset-pipeline temptation would be:

```text
all groups
→ merge meshes
→ one GLB
```

For this project that would destroy one of Vanilla's strongest performance mechanisms.

Instead preserve:

```text
WMO
├── group 0
├── group 1
├── group 2
├── group 3
└── ...
```

Each group should remain independently:

```text
loadable
visible/hidden
collidable
lightable
portal-addressable
```

---

# 137. WMO source-confidence table

| Finding | Confidence |
|---|---|
| root + `_NNN.wmo` groups | ✅ direct 1.12 RE |
| WMO version 17 | ✅ corpus |
| MOGP header 0x44 B | ✅ direct RE |
| MOPY stride 2 | ✅ direct RE |
| MOVI stride 2 | ✅ direct RE |
| MOVT stride 12 | ✅ direct RE |
| MONR stride 12 | ✅ direct RE |
| MOTV stride 8 | ✅ direct RE |
| MOBA stride 24 | ✅ direct RE |
| MOMT stride 64 | ✅ direct RE |
| two WMO textures max resolved | ✅ direct RE |
| separate M2 doodads | ✅ |
| doodad sets | ✅ |
| per-group MODR refs | 🟢 reconstructed + byte-cited |
| MOLT/MOLR light relation | 🟢 |
| player vs camera collision split | 🟢/✅ byte-oriented reconstruction |
| DETAIL = 0x04 | 🟢 |
| NOCAMCOLLIDE = 0x02 | 🟢 |
| MLIQ step 4.1666665 yd | ✅ byte-verified |
| MLIQ hole nibble 0xF | ✅ |
| exact original MLIQ UV matrix scale | 🟡 |
| portal visibility | ⏭ 8B |

---

# 138. Dashboard after Checkpoint 8A

| System | Status |
|---|---|
| Target client 1.12.1 build 5875 | ✅ |
| ADT terrain | ✅ |
| terrain textures/shadows | ✅ |
| lighting/fog/day-night | ✅ |
| WDL/far terrain | ✅ |
| MCLQ outdoor water | ✅ |
| M2 geometry | ✅ |
| M2 characters | ✅ |
| M2 animation | ✅ |
| M2 materials | ✅ |
| M2 particles/ribbons | ✅ |
| M2 distance fade | ✅ |
| WMO root/group architecture | ✅ |
| WMO geometry buffers | ✅ |
| WMO materials | ✅ |
| WMO batches | ✅ |
| WMO baked vertex color | ✅ |
| WMO doodads | ✅ |
| WMO doodad sets | ✅ |
| WMO group light references | 🟢 |
| WMO player collision | 🟢 |
| WMO camera collision | 🟢 |
| WMO MLIQ liquid | ✅ |
| WMO exact UV texgen matrix | 🟡 |
| WMO portal graph | 🟡 data known |
| WMO portal traversal | ⬜ NEXT |
| WMO indoor/outdoor culling | ⬜ NEXT |
| WMO interior lighting law | 🟡 → NEXT |
| camera | ⬜ |
| movement | ⬜ |
| gameplay/combat | ⬜ |
| networking | ⬜ |

---

# 139. Next checkpoint — 8B

Next:

```text
WMO PORTALS / INTERIORS
```

Specifically:

```text
MOPV
MOPT
MOPR

camera current-group detection

outside → inside visibility
inside → outside visibility

portal flood
portal clipping

group visibility masks

MODR doodad visibility

interior/exterior transitions

interior fog
MOCV lighting lanes
windows / stained glass
WMO skybox groups
```

The goal of 8B is to reconstruct the mechanism that lets Vanilla render large interiors and cities while submitting only the rooms/groups reachable through visible portals.

---

# 140. Checkpoint 8B — WMO portal graph

✅ Vanilla WMO portal visibility is driven by three root chunks:

```text
MOPV
MOPT
MOPR
```

Together they form a graph:

```text
WMO Group
   │
   ├── portal reference
   │       ↓
   │    Portal polygon
   │       ↓
   └── Neighbor group
```

This lets the client decide which WMO groups are potentially visible from the camera's current room.

---

# 141. MOPV — portal polygon vertices

✅ `MOPV` stores a shared pool of portal vertices.

Element layout:

```text
3 × f32
= 12 bytes
```

Stride:

```text
0x0c
```

All coordinates are in WMO model space.

A portal can therefore be an arbitrary planar polygon with at least 3 vertices.

---

# 142. MOPT — portal definition

✅ One `MOPT` record is:

```text
20 bytes
= 0x14
```

Layout:

```text
u16 startVertex
u16 vertexCount
f32 planeNormalX
f32 planeNormalY
f32 planeNormalZ
f32 planeDistance
```

Conceptually:

```text
Portal {
    vertexSpan
    plane = [nx, ny, nz, d]
}
```

Signed plane distance for a point `p` is:

```text
dot(normal, p) + d
```

---

# 143. MOPR — group-to-portal edge

✅ One `MOPR` record is:

```text
8 bytes
```

Recovered layout:

```text
u16 portal
u16 neighborGroup
i16 side
u16 filler
```

`side` is normally used as a ± orientation factor.

This gives the graph edge:

```text
current group
    ↓
portal
    ↓
neighbor group
```

with a directional plane-side test.

---

# 144. Per-group portal slice

✅ Each WMO group header stores:

```text
portal_ref_start @ MOGP +0x24
portal_ref_count @ MOGP +0x26
```

Thus a group does not scan the whole WMO's portal list.

Instead:

```text
group
  ↓
small contiguous MOPR slice
  ↓
only portals touching that room
```

This makes portal traversal cheap.

---

# 145. Current-room detection is NOT just an AABB test

✅ The original Vanilla client determines the camera's current WMO group with a downward spatial probe.

Recovered ray length:

```text
1760 yards
```

The camera sends a vertical ray downward.

Two principal WMO tests race each other:

```text
Leg A
walking-collision triangle crossing

Leg B
portal-plane/polygon crossing
```

The closest valid crossing beneath the eye wins.

The ADT terrain surface also participates in the decision.

---

# 146. Leg A — collision-face room detection

✅ The current-group probe uses the WMO's walking-collision face set.

Important behavior:

```text
no "floor-normal only" filter
```

Any relevant non-DETAIL collision face below the camera can participate, including:

```text
floors
stairs
slopes
ledges
risers
```

This makes room transitions much more precise than testing only a group's authored bounding box.

---

# 147. Leg B — portal crossing

✅ The same vertical ray tests portal polygons.

For a non-nearly-parallel portal plane:

```text
z =
 -(nx*x + ny*y + d) / nz
```

and the crossing must:
- lie at/below the camera;
- lie inside the portal polygon;
- beat or tie the nearest collision hit.

Recovered nearest-hit tolerance:

```text
~1e-4
```

A portal crossing within this tolerance can win over a nearly coincident floor face.

This is particularly important for horizontal/floor-hole portals such as stairwells.

---

# 148. Vertical doorway special case

✅ A vertical doorway plane is almost parallel to a vertical down-ray.

Recovered near-parallel threshold:

```text
abs(denominator) < 1e-4
```

In that case the client treats the doorway as crossed only while the eye is very near its plane.

Recovered snap distance:

```text
0.1 yd
```

This prevents a vertical doorway from constantly claiming the current room simply because the ray mathematically cannot cross its plane.

---

# 149. Terrain vs WMO race

✅ The client also probes the ADT terrain under the same camera column.

If terrain is strictly nearer to the camera than the WMO hit:

```text
terrain wins
→ camera considered outside the WMO
```

This prevents buried cave/interior geometry from incorrectly claiming the camera while the player is standing on outdoor terrain above it.

Conversely:

```text
no terrain because MCNK hole / cave entrance
→ WMO interior may win
```

This is an elegant integration between ADT holes and WMO interiors.

---

# 150. Room result can contain TWO flood roots

✅ An especially important discovery:

The current-room result is not always a single group.

If the nearest crossing is a portal:

```text
seed 1 = containing/current side group
seed 2 = group across the portal
```

Both groups become independent full-screen roots for portal traversal.

So the result cardinality is effectively:

```text
0 → outside
1 → normal room
2 → straddling/crossing a portal
```

This avoids one-frame disappearing rooms when the camera crosses a doorway.

---

# 151. Exterior group means outside

✅ If the winning group has:

```text
MOGP flags & 0x08
```

the camera is treated as being in the exterior/open-world path rather than a sealed WMO interior.

Important distinction:

```text
0x08 = EXTERIOR

0x40 = EXTERIOR_LIT
```

A `0x40`-only group can still behave as an indoor group for area/interior identity while being lit like outdoors.

This is useful for:
- city streets enclosed inside a WMO;
- covered plazas;
- porches;
- transitional spaces.

---

# 152. Portal flood — high-level algorithm

✅ Once seed groups are known, Vanilla performs a portal flood.

Conceptually:

```text
stack = seed groups
each with FULL_SCREEN visibility rect

while stack not empty:
    pop group

    mark group visible

    for each portal touching group:
        reject wrong-facing portal

        project portal into screen space

        intersect portal rect
        with inherited visibility rect

        if intersection survives:
            push neighboring group
            with smaller rect
```

Thus visibility gets narrower at every doorway.

---

# 153. Portal front-side test

✅ Before following a portal, the camera must be on the correct side of its oriented plane.

Conceptually:

```text
d =
    dot(portal.normal, eye)
  + portal.distance

if portalRef.side < 0:
    d = -d

if d < 0:
    reject portal
```

Exact-zero passes.

Recovered comparison threshold:

```text
0.0
```

There is no large arbitrary epsilon in this side test.

---

# 154. Portal screen rectangle

✅ A portal polygon is transformed:

```text
WMO local
→ world
→ clip space
→ NDC
```

The resulting polygon is reduced to:

```text
[minX, minY, maxX, maxY]
```

This screen rectangle becomes a cheap approximation of the visible window through that portal.

Example:

```text
current room
FULL SCREEN
[-1,-1,1,1]

        ↓ doorway

doorway rect
[-0.3,-0.7,0.2,0.6]

        ↓ next doorway

[-0.1,-0.2,0.15,0.3]
```

The farther the traversal goes, the smaller the valid visual window can become.

---

# 155. Portal polygon clipping

✅ Before computing the NDC bounds, the client clips the portal polygon against the four SIDE planes of the view pyramid:

```text
left
right
top
bottom
```

The reconstructed algorithm is standard Sutherland–Hodgman polygon clipping.

Important historical behavior:

```text
no normal near-plane clip in this particular portal-polygon step
```

This helps preserve doorways when the camera is directly straddling their plane.

---

# 156. Near-zero clip-space W handling

✅ Vanilla uses unusual but byte-recovered handling when portal vertices approach:

```text
w ≈ 0
```

Constants:

```text
if abs(w) < 0.001:
    w = +0.00001
```

That is:

```text
W_CLAMP_BAND = 0.001
W_CLAMP_SUB  = 1e-5
```

This can greatly enlarge the portal's projected rect while the eye straddles it.

The practical effect is desirable:

```text
camera crossing doorway
→ next room does NOT disappear for a frame
```

For our browser engine we can reproduce the behavior exactly or implement a cleaner equivalent with explicit doorway-crossing handling.

---

# 157. Eye directly inside portal plane

✅ The client has another doorway-transition special case.

If the eye is:
1. inside the portal polygon; and
2. within the portal plane distance:

```text
abs(planeDistance) <= 0.01 yd
```

then that portal gets:

```text
FULL_SCREEN rect
```

instead of its normal projected rectangle.

Recovered constant:

```text
ON_PLANE_EPS = 0.01
```

Again, this prevents transition flicker.

---

# 158. Rect intersection threshold

✅ Each newly projected portal rect is intersected with the inherited one.

A branch dies if the resulting rectangle collapses below:

```text
0.001 NDC units
```

Recovered:

```text
RECT_EPS = 0.001
```

This means a room is not considered visible merely because the portal graph connects to it.

The chain of openings must remain visually non-empty from the camera.

---

# 159. Portal recursion guard

🟢 The faithful reconstruction uses the client's recovered recursion-depth protection:

```text
depth cap = 64
```

This prevents pathological cyclic portal graphs from recursing indefinitely.

Real Vanilla WMO graphs normally settle far below this.

---

# 160. Outside → WMO visibility

When the camera is outside:

```text
no interior seed
```

the visibility pass starts with WMO groups authored as:

```text
EXTERIOR (0x08)
```

as full-screen roots.

Normal frustum/group bounds then further eliminate off-screen exterior pieces.

Through their visible portals, interior groups can subsequently become visible.

This allows an inn's inside wall or room to become visible through an open doorway without drawing every room in the building.

---

# 161. Inside → outside visibility

✅ The reverse direction is even more interesting.

While inside a WMO, the portal flood can eventually reach a portal connected to an EXTERIOR group.

Only then is outside visibility permitted.

Conceptually:

```text
camera inside room
    ↓
visible doorway
    ↓
portal chain reaches exterior
    ↓
outdoor world becomes visible
through exterior window(s)
```

If no such visible chain exists:

```text
sealed room
→ outdoor world need not render
```

This saves a huge amount of outdoor rendering.

---

# 162. Exterior-window rendering

🟢 The recovered world-scene path maintains a worklist of screen-space exterior windows.

Conceptually each window contains:

```text
x0
y0
x1
y1
portal depth/plane metric
```

The world renderer can then repopulate/render outdoor content with a frustum narrowed to each visible opening.

This is effectively:

```text
portal-based scissored world rendering
```

rather than conventional full-screen outdoor rendering from inside every building.

### Browser equivalent

Use one of:

```text
A. CPU portal frustum + normal GPU frustum
B. scissor rect
C. custom clipped frustum planes
```

A is simplest initially.

---

# 163. Exterior shell special pass

🟢 The reconstructed 1.12 behavior also contains a deferred exterior-shell concept.

Once an interior flood reaches an exterior doorway:

```text
WMO exterior shell groups
```

must be allowed to render, including some shell groups not themselves connected through the normal interior portal flood.

Why?

Because exterior walls of a building can be authored as disconnected shell geometry.

Without this second rule, looking out from an inn could make parts of its own outside walls disappear.

---

# 164. Portal visibility is a PVS per WMO instance

A placed WMO therefore maintains something conceptually like:

```text
visible[groupCount]
```

Every frame:

```text
true
false
false
true
...
```

Geometry, liquids and props use this group visibility to determine whether they draw.

This is a runtime PVS:

```text
Potentially Visible Set
```

computed from the actual camera instead of stored as one static global set.

---

# 165. Doodads obey group portal visibility

✅ A WMO's M2 doodads are submitted from each visible group's `MODR` references.

Therefore:

```text
group invisible
→ its furniture/props are not submitted
```

A doodad referenced by multiple groups is visible if:

```text
ANY referencing group is visible
```

This matters for props spanning rooms, such as:
- waterfalls;
- hanging structures;
- large decorative pieces.

### Browser rule

```ts
doodadVisible =
    doodad.groupRefs.some(
        g => wmo.visibleGroups[g]
    );
```

---

# 166. Liquids obey group visibility

🟢 Since `MLIQ` belongs to a particular WMO group, its draw follows that group's visibility.

Thus a dungeon pool hidden three rooms away does not need to render merely because the building instance itself is resident.

---

# 167. WMO interior fog — MFOG

✅ The WMO root can contain:

```text
MFOG
```

One record is:

```text
48 bytes
= 0x30
```

Recovered fields include:

```text
flags
position
inner radius
outer radius

land fog:
    end
    start scalar
    color

underwater fog:
    end
    start scalar
    color
```

Group headers provide up to:

```text
4 fog indices
```

into this root table.

---

# 168. WMO interior fog selection

🟢 The byte-oriented reconstruction identifies the room-fog selection law.

The root's fog record 0 acts as the base/default when a dedicated WMO fog path is active.

Candidate fog records must:

```text
be referenced by current group
AND
flags & 1 == 0
AND
camera distance <= outer radius
```

Blend weight:

```text
w =
1 -
(distance - innerRadius)
/
(outerRadius - innerRadius)
```

clamped to 0..1.

Candidates are folded so nearer records have stronger/final influence.

---

# 169. Fog start interpretation

✅ For the selected WMO fog:

```text
fogStart = fogEnd × startScalar
```

not:

```text
fogEnd - startScalar
```

The resulting end distance is later constrained by scene/farclip logic.

This is another detail worth preserving if indoor atmospheres are meant to closely match Vanilla's feel.

---

# 170. Interior fog transition

🟢 The 1.12 reconstruction identifies an approximately:

```text
4 second
```

scene-fog transition toward the WMO interior target.

That means entering an inn/cave does not require an abrupt single-frame atmosphere switch.

### Browser recommendation

```ts
environmentBlend += dt / 4.0;
```

then interpolate:
- fog color;
- fog start/end;
- environment color;
- potentially other room ambience values.

---

# 171. WMO interior/exterior lighting classification

🟢 The group-level classification should remain explicit:

```text
TRUE INTERIOR:
(flags & 0x48) == 0

EXTERIOR:
flags & 0x08

EXTERIOR-LIT:
flags & 0x40
```

This distinction affects more than visibility.

It also influences:
- sun/day-night lighting;
- local baked lighting;
- fog;
- area identity;
- weather visibility.

Therefore do not reduce it to:

```ts
group.isIndoor: boolean
```

Use an authored group lighting/environment class.

---

# 172. Interior WMO MOCV RGB

🟢 `MOCV` RGB acts as baked vertex-lighting information in true interior groups.

This gives an old-school lighting structure:

```text
static room geometry
+
baked vertex color
+
small number of authored local-light effects
```

instead of modern realtime GI.

This is one of the main reasons Vanilla interiors are so inexpensive.

---

# 173. Interior MOCV alpha — batch-dependent behavior

🟢 The 1.12-focused renderer reconstruction has pinned separate uses for MOCV alpha depending on the WMO batch class.

### TRANS interior batch

MOCV alpha acts approximately as a:

```text
dynamic-lit ↔ baked-light
blend factor
```

### INT interior batch

The reconstruction identifies a self-illumination-like amplification equivalent to:

```text
texture * MOCV * (1 + 4 * alpha)
```

for this specific interior path.

### EXT / ordinary exterior lanes

MOCV alpha is not interpreted identically and can be forced opaque by the reconstructed renderer.

### Engine implication

Do not blindly interpret all WMO vertex alpha as transparency.

It is often **lighting metadata**.

---

# 174. WMO windows and night glow

🟢 MOMT-specific behaviors discovered in the reconstruction:

```text
0x10 → SIDN
0x20 → WINDOW
```

`SIDN` participates in an authored night-glow/emissive path.

`WINDOW` can select a brighter interior lighting treatment.

Examples of the intended visual family:

```text
stained glass
warm inn windows
lit architectural panes
```

This is how Vanilla achieves atmospheric night architecture without modern emissive/PBR materials.

---

# 175. Optional WMO-specific skybox

🟢 The WMO root can contain:

```text
MOSB
```

referencing an M2 skybox/model.

Recovered group flag:

```text
0x40000 = SHOW_SKYBOX
```

When a camera is in the appropriate group, this WMO-specific sky backdrop can replace the ordinary outdoor `Light.dbc` gradient sky.

This is used rarely in the Vanilla corpus but is important for:
- special cities;
- dungeons;
- enclosed/open hybrid environments.

---

# 176. Weather through doorways

🟢 The recovered portal/environment path reveals an elegant side effect:

An interior can know whether an EXTERIOR group is currently reachable through a **screen-visible portal**.

Therefore weather can remain visible through a doorway/window while the player stands inside.

Conceptually:

```text
inside tavern
+
looking through doorway
→ outside rain can be visible

turn away / doorway clipped out
→ outside weather path can disappear
```

This is much cheaper than rendering weather everywhere inside all buildings.

---

# 177. Recommended browser PVS algorithm

For the original web game:

```ts
function computeWmoPVS(wmo, camera) {
    const seeds = findCurrentRoomSeeds(
        camera,
        wmo,
        terrain
    );

    const stack = seeds.map(g => ({
        group: g,
        rect: FULL_SCREEN,
        depth: 0
    }));

    const visible = new BitSet(wmo.groupCount);

    while (stack.length) {
        const node = stack.pop();

        visible.set(node.group);

        if (node.depth >= 64)
            continue;

        for (const edge of wmo.groupPortals[node.group]) {
            if (!portalFacingCamera(edge, camera))
                continue;

            const portalRect =
                cameraInsidePortal(edge)
                    ? FULL_SCREEN
                    : projectPortal(edge);

            const nextRect =
                intersect(node.rect, portalRect);

            if (!nextRect)
                continue;

            stack.push({
                group: edge.neighbor,
                rect: nextRect,
                depth: node.depth + 1
            });
        }
    }

    return visible;
}
```

This is close to the Vanilla architecture while being straightforward in TypeScript/Rust/WASM.

---

# 178. Recommended rendering after portal flood

```text
compute visible group bitset
        ↓
terrain/world visibility
        ↓
for each WMO group:
    if invisible:
        skip everything
    else:
        draw MOBA batches
        draw MLIQ
        submit MODR doodads
        activate room lights/effects
```

This is much more powerful than simply calling:

```text
frustum.contains(buildingAABB)
```

for an entire building.

---

# 179. Why a large Vanilla interior is cheap

A hypothetical 30-room building can be resident while the camera sees:

```text
current room
+
doorway
+
next room
+
tiny fragment of third room
```

The renderer therefore submits only those groups and their props.

Everything else can stay:

```text
loaded in RAM
but invisible to GPU submission
```

This is a key distinction between:

```text
streaming
```

and:

```text
visibility
```

Vanilla uses both.

---

# 180. Browser data structure after Checkpoint 8B

Recommended:

```ts
WmoAsset {
    groups: WmoGroup[]
    portals: Portal[]
    portalRefs: PortalRef[]
    fogs: WmoFog[]
}

WmoGroup {
    flags
    bounds

    portalRefStart
    portalRefCount

    fogIndices[4]

    batches[]
    doodadRefs[]
    lightRefs[]
    liquid?
}

Portal {
    vertices[]
    plane
}

PortalRef {
    portal
    neighborGroup
    side
}

WmoInstance {
    transform
    visibleGroupsBitset
    currentRoom?
    exteriorWindows[]
}
```

---

# 181. Exact portal constants collected so far

| Constant | Vanilla value |
|---|---:|
| current-room downward ray | `1760 yd` |
| portal near-parallel threshold | `1e-4` |
| doorway plane snap | `0.1 yd` |
| portal/face nearest tie epsilon | `~1e-4` |
| eye-on-portal plane band | `0.01 yd` |
| clip-space `w` band | `0.001` |
| substituted `w` | `1e-5` |
| portal rect min extent | `0.001 NDC` |
| portal traversal depth cap | `64` |
| MOPV stride | `12 B` |
| MOPT stride | `20 B` |
| MOPR stride | `8 B` |
| MFOG stride | `48 B` |

These constants are valuable for a strict recreation but can be slightly modernized for an original game if numerical behavior proves unstable in WebGL/WebGPU.

---

# 182. Confidence notes for Checkpoint 8B

### Directly tied to WoW.exe 5875 / parser consumers
✅
- MOPV/MOPT/MOPR structures and strides
- portal plane representation
- MOGP portal-ref span
- current-group 1760 yd down-ray
- collision + portal race
- terrain-vs-WMO arbitration
- 0/1/2 seed behavior
- oriented front-side portal test
- on-plane special case
- portal projection/clipping constants
- MFOG stride/layout
- fog start multiplier semantics

### Faithful reconstruction / reverse-engineered behavior with some implementation-level interpretation
🟢
- exact browser-equivalent organization of exterior-window pass
- four-second atmosphere crossfade presentation
- MOCV alpha interior formulas
- reconstructed WINDOW/SIDN material realization
- portal-visible weather integration
- rare WMO skybox usage mapping

### Still worth refining later
🟡
- instruction-perfect exterior-shell second pass
- exact original GPU state ordering for every WMO interior material combination
- exact original MLIQ UV texture-matrix scale

---

# 183. Dashboard after Checkpoint 8B

| System | Status |
|---|---|
| Target client 1.12.1 build 5875 | ✅ |
| ADT/WDT terrain | ✅ |
| terrain texture/shadow | ✅ |
| day/night/fog | ✅ |
| WDL far terrain | ✅ |
| outdoor liquids | ✅ |
| M2 geometry | ✅ |
| M2 characters | ✅ |
| M2 skeletal animation | ✅ |
| M2 materials | ✅ |
| M2 particles/ribbons | ✅ |
| M2 distance visibility | ✅ |
| WMO root/groups | ✅ |
| WMO geometry/materials | ✅ |
| WMO doodads | ✅ |
| WMO collisions | ✅/🟢 |
| WMO liquids | ✅ |
| MOPV/MOPT/MOPR | ✅ |
| camera current-WMO-group probe | ✅ |
| portal flood | ✅ |
| screen-rect portal clipping | ✅ |
| interior→exterior windowing | 🟢 |
| doodad PVS | ✅ |
| WMO interior fog | ✅/🟢 |
| WMO interior MOCV lighting | 🟢 |
| WINDOW/SIDN/night glow | 🟢 |
| WMO skybox | 🟢 |
| exact WMO liquid UV matrix | 🟡 |
| exact HumanMale triangles | 🟡 |
| Camera system | ⬜ NEXT |
| Movement + collision response | ⬜ |
| Gameplay/combat | ⬜ |
| DBC/data architecture | ⬜ |
| Networking | ⬜ |
| WebGL/WebGPU final architecture | ⬜ |

---

# 184. Remaining major reverse-engineering blocks

After completing 8B, approximately **6 major blocks** remain for the main technical target:

```text
9  Camera
10 Movement / collision response / swimming / jumping
11 Gameplay + combat timing / targeting / interactions
12 DBC + client data architecture
13 Networking / update-object architecture
14 Final WebGL/WebGPU engine specification + reference prototype architecture
```

Optional later deep dives:

```text
BLP encoding/compression
audio/music zones
UI/frame XML/Lua architecture
spell visual details
weather particles
minimap generation
character exact polygon corpus scan
creature polygon corpus scan
exact M2 view selection
remaining bit-perfect rendering edge cases
```

---

# 185. Next checkpoint — 9 Camera

Next reverse-engineering target:

```text
CAMERA
```

Investigate:

```text
third-person camera distance
pitch/yaw
camera target position
near/far clip
FOV
camera collision
zoom
camera smoothing
character-follow behavior
camera obstruction response
first-person transition
mounted camera behavior
underwater camera/environment interaction
M2 embedded cameras vs gameplay camera
```

The objective is to derive an implementation-ready Vanilla camera specification for the browser engine.

---

# 186. Checkpoint 9 — Gameplay camera

## 186.1 CCamera / projection

The 1.12.1 client camera stores the expected gameplay-view state:

```text
eye position
target position
distance
near clip
far clip
FOV
roll
projection terms
```

The recovered gameplay-camera object is approximately:

```text
0x170 bytes
= 368 bytes
```

The renderer derives:

```text
Perspective projection
×
LookAt/view transform
→
6-plane frustum
```

The historical FOV path uses approximately:

```text
1.5708 rad
≈ 90 degrees
```

for the original 4:3-era camera configuration.

For an original browser game, aspect-correct projection should be used while preserving the same overall field-of-view character.

---

# 187. Camera zoom

Recovered Vanilla defaults / limits:

```text
cameraDistanceMax       = 15 yd
cameraDistanceMaxFactor = 1.0
absolute distance cap   = 50 yd
```

Mouse-wheel zoom operates conceptually in:

```text
1 yd increments
```

and the actual distance moves toward the requested distance rather than teleporting instantly.

Recovered default move speed:

```text
cameraDistanceMoveSpeed ≈ 8.33 yd/s
```

Recommended runtime state:

```ts
CameraZoom {
    requestedDistance
    actualDistance
    moveSpeed
    hardMaxDistance
}
```

---

# 188. Camera pitch and mouse rotation

Recovered pitch clamp:

```text
-89° .. +89°
```

approximately:

```text
±1.553343 rad
```

Historical movement-speed CVars include approximately:

```text
cameraYawMoveSpeed   = 180 deg/s
cameraPitchMoveSpeed = 90 deg/s
```

Historical mouse-angle mapping uses screen-normalized denominators:

```text
deltaYawDegrees =
    cameraYawMoveSpeed * mouseDX / 800

deltaPitchDegrees =
    cameraPitchMoveSpeed * mouseDY / 600
```

For modern pointer-lock input, preserve:
- separate yaw/pitch sensitivity;
- hard pitch clamp;
- no artificial roll.

---

# 189. Mouse-button behavior

Core WoW-like control behavior:

```text
Left mouse drag
→ orbit camera only

Right mouse drag
→ turn camera + character together

Left + Right held
→ move forward
```

This interaction is a major part of the recognizable WoW camera feel.

---

# 190. Camera follow modes

Vanilla supports conceptually:

```text
0 Never
1 Smart
2 Always
```

with Smart as the important default behavior.

Follow/recenter uses smoothing rather than snapping.

A recovered easing form is:

```text
e(t) =
(1 - cos(pi*t)) / 2
```

with bounded recenter timing roughly:

```text
0.1 s .. 2.0 s
```

Recommended:

```ts
enum CameraFollowMode {
    Never,
    Smart,
    Always
}
```

---

# 191. Model-dependent camera pivot

Camera target height is tied to the active creature/player model rather than using one universal constant.

Recovered useful clamp region:

```text
min pivot ≈ 5/6 yd = 0.833333...
max pivot ≈ 15 yd
```

and pivot adjustment can move smoothly at approximately:

```text
1.2 yd/s
```

This naturally supports:

```text
small race
large race
mount
polymorph/shape change
```

without separate camera implementations.

---

# 192. Camera collision philosophy

The desired third-person position is traced from the character/pivot toward the requested camera position.

Collision can involve:

```text
terrain
WMO camera-collision faces
doodads / M2 collision
GameObjects
optional liquid surface behavior
```

The original behavior is close to ray/segment collision rather than a large modern camera sphere.

A useful behavioral asymmetry:

```text
obstruction appears
→ camera moves inward immediately

obstruction clears
→ camera returns outward smoothly
```

This can be summarized as:

```text
SNAP IN
EASE OUT
```

---

# 193. Player collision vs camera collision

As recovered from WMO triangle semantics:

```text
normal player walking collision:
    excludes DETAIL faces

camera collision:
    keeps DETAIL
    excludes NOCAMCOLLIDE
```

Important flags:

```text
DETAIL       = 0x04
NOCAMCOLLIDE = 0x02
```

This lets small architecture stop the camera without necessarily blocking the player capsule.

---

# 194. First-person transition

The player model does not need to pop out abruptly when zooming inward.

Recovered self-fade window:

```text
~1.8315 yd
```

A cosine fade can be modeled as:

```text
D = cameraDistance - nearClip

alpha =
(1 - cos(pi * D / 1.8315)) / 2
```

clamped appropriately.

A near-zero threshold around:

```text
~0.00278 yd
```

marks effectively complete hiding.

This yields:

```text
third person
→ smooth character fade
→ first person
```

---

# 195. Terrain tilt and smart pivot

Vanilla includes extra camera behavior that helps it feel less rigid.

### Terrain tilt
A forward ground probe of approximately:

```text
10/3 yd
≈ 3.333 yd
```

can quantize camera tilt into values similar to:

```text
0°
5°
10°
15°
20°
```

rather than using a fully physical continuous slope solution.

### Smart pivot
If the camera is constrained by geometry, look orientation can still adjust without pushing the camera arm through the blocker.

These should be optional fidelity features after the base orbit camera works.

---

# 196. First-person head bob

Recovered behavior is primarily active:
- in first person;
- while moving.

It is suppressed for states such as:
- swimming;
- falling;
- mounted;
- taxi/path travel.

A useful approximation is a figure-eight:

```text
x = sin(phase)
z = sin(2*phase)
```

with intentionally low amplitude.

---

# 197. Camera and water

The camera can optionally treat water surface as a collision/constraint plane.

Useful recovered constants around surface handling include:

```text
5/6 yd ≈ 0.83333
2/9 yd ≈ 0.22222
5/9 yd ≈ 0.55556
1/9 yd ≈ 0.11111
```

A swimmer's camera pivot can be held slightly above the water surface to avoid flickering between above-water and underwater atmosphere.

---

# 198. Recommended browser camera controller

```text
CameraController
│
├── Orbit
│   ├── yaw
│   ├── pitch [-89,+89]
│   └── requested distance
│
├── Zoom
│   ├── 1 yd steps
│   ├── ~8.33 yd/s response
│   └── 50 yd hard cap
│
├── Pivot
│   ├── model-dependent target height
│   └── smooth retargeting
│
├── Follow
│   ├── Never
│   ├── Smart
│   └── Always
│
├── Collision
│   ├── terrain
│   ├── WMO camera faces
│   ├── doodads
│   ├── GameObjects
│   └── optional liquid plane
│
├── FirstPersonFade
├── TerrainTilt
├── SmartPivot
├── HeadBob
└── WaterHandling
```

---

# 199. Checkpoint 10 — movement controller

## 199.1 Kinematic movement

Vanilla player movement is best reproduced as a deterministic **kinematic character controller**, not a general rigid-body simulation.

The original movement path subdivides large elapsed intervals with a maximum integration step of approximately:

```text
250 ms
```

So large hitches are processed as multiple movement substeps.

For a browser game, use a substantially smaller fixed simulation step if desired, but preserve deterministic movement rules.

---

# 200. Baseline movement speeds

Useful Vanilla reference values:

```text
Run forward       = 7.0 yd/s
Run backward      = 4.5 yd/s
Walk              = 2.5 yd/s

Swim forward      = 4.722222 yd/s
Swim backward     = 2.5 yd/s
```

Server/gameplay modifiers can then scale these values.

Diagonal movement should normalize the intent vector so:

```text
forward + strafe
!= sqrt(2) × normal speed
```

---

# 201. Jump and gravity

Recovered constants:

```text
jump initial vertical speed = 7.955547 yd/s
gravity                     = 19.291105 yd/s²
normal terminal speed       = 60.148003 yd/s
slow-fall terminal speed    = 7.0 yd/s
```

Idealized ballistic formulas:

```text
v(t) =
jumpSpeed - gravity*t

z(t) =
z0
+ jumpSpeed*t
- 0.5*gravity*t²
```

Approximate normal jump:
```text
time to apex ~0.412 s
total no-obstacle airtime ~0.825 s
height gain ~1.64 yd
```

---

# 202. Falling-state distinction

Vanilla distinguishes a normal jump/fall state from a more committed long fall.

Useful recovered behavior:

```text
falling from jump:
FALLING_FAR after descending ~1/9 yd below launch height

stepping off edge with no initial vertical jump velocity:
FALLING_FAR after ~0.5 s
```

This affects animation/state selection.

---

# 203. Character collision dimensions

Collision dimensions depend on the active model.

Fallback radius:

```text
~1/3 yd
```

Examples recovered from model data include approximately:

```text
Human male radius   ~0.30555 yd
Human female radius ~0.20835 yd
```

Fallback collision height:

```text
~2.0277777 yd
```

Therefore:

```text
collision radius
collision height
combat reach
```

should be distinct authored values.

---

# 204. Walkable slopes

Recovered walkable-surface threshold:

```text
~50 degrees
```

Equivalent normal-up threshold:

```text
cos(50°)
≈ 0.642788
```

Conceptually:

```text
surface angle <= 50°
→ walkable

surface angle > 50°
→ steep-wall/slide handling
```

---

# 205. Automatic step-up

Recovered approximate player step height:

```text
1.0 yd
```

Creature/non-player paths can use larger values around:

```text
2.0 yd
```

A proper step solution should perform multiple probes:

```text
forward obstruction
↓
upward clearance
↓
forward at raised level
↓
downward support test
↓
accept step
```

Do not simply teleport vertically based on obstacle height.

---

# 206. Ground and landing probes

Useful reconstructed values:

```text
normal ground snap/probe ~0.2 yd
landing probe           ~0.05 yd
```

Small collision skin values are also used to avoid numerical sticking.

A browser implementation can keep a configurable collision skin around:

```text
~0.02 yd
```

while preserving the overall feel rather than exact last-bit behavior.

---

# 207. Sliding

When a move collides with a non-walkable surface, project the remaining displacement along the collision plane.

Conceptually:

```text
v' =
v - N * dot(v,N)
```

Repeat for a small bounded number of collision corrections.

The recovered movement paths use only a handful of correction/reflection passes, so cap the loop.

---

# 208. Air control

WoW-style air movement should preserve horizontal momentum strongly rather than instantly redirecting the full velocity vector every frame.

Recommended behavior:

```text
jump:
inherit current horizontal velocity

air input:
apply limited directional correction
```

A useful fallback magnitude from reconstructed paths is around:

```text
2.5 yd/s
```

for small airborne control.

---

# 209. Swimming

Swimming starts based on water depth relative to actual collision height.

Recovered threshold:

```text
swim when:
waterDepth > 0.75 × collisionHeight
```

Exit hysteresis:

```text
exit when:
waterDepth <
0.75 × collisionHeight - 1/36 yd
```

with:

```text
1/36 yd ≈ 0.02778 yd
```

This avoids rapid walk/swim toggling at the surface.

---

# 210. 3D swim movement

Swim-forward movement incorporates pitch:

```text
forward3D =
horizontalForward * cos(pitch)
+
worldUp * sin(pitch)
```

Strafing remains primarily horizontal.

Normal swimming suppresses ordinary gravity; vertical motion is driven by movement pitch and surface handling.

---

# 211. Swim surface and breach jump

The swimmer's body is kept near a depth tied to:

```text
surface - 0.75 × collisionHeight
```

When trying to move upward through the surface, motion transitions into along-surface behavior.

Recovered swim-jump vertical speed:

```text
9.096748 yd/s
```

vs land jump:

```text
7.955547 yd/s
```

This produces the recognizable stronger breach hop.

---

# 212. Water walking and hover

Recovered water-walk pitch threshold:

```text
~ -37°
≈ -0.645772 rad
```

Hover behavior keeps roughly:

```text
1 yd
```

above terrain and can correct upward at around:

```text
7 yd/s
```

These should be state modes layered on the normal kinematic controller.

---

# 213. Recommended movement architecture

```text
PlayerMovement
│
├── InputIntent
│
├── State
│   ├── Grounded
│   ├── Falling
│   ├── Swimming
│   ├── WaterWalking
│   ├── Hovering
│   └── Transport
│
├── KinematicIntegrator
│   ├── horizontal
│   ├── jump
│   └── gravity
│
├── CollisionSolver
│   ├── model-dependent capsule
│   ├── walkable <= 50°
│   ├── slide
│   ├── step-up
│   └── ground snap
│
├── LiquidController
│
└── NetworkPrediction
```

---

# 214. Checkpoint 11 — combat architecture

## 214.1 Server authority

The most important rule:

```text
CLIENT
→ predicts / validates UX / renders

SERVER
→ decides gameplay truth
```

The client may check:
- target;
- resource;
- range;
- facing;
- basic prerequisites;

but authoritative:
- damage;
- hit/miss;
- dodge/parry/block;
- resist/immune;
- final cast success;
- cooldown/state;
- threat;

belongs to the server.

---

# 215. Generalized spell target request

Vanilla uses a generic spell-target request capable of expressing:

```text
caster GUID
unit target
corpse target
GameObject target
item target
source position
destination position
string/name target
target flags
spell ID
```

Recommended representation:

```ts
SpellCastRequest {
    casterId
    spellId
    unitTarget?
    itemTarget?
    objectTarget?
    sourcePosition?
    destinationPosition?
    targetMask
}
```

This is preferable to special-case RPCs for each spell type.

---

# 216. Ground-targeted spells

Ground AoE flow:

```text
activate spell
↓
enter targeting cursor mode
↓
player clicks world position
↓
destination XYZ attached to cast request
↓
server validates
```

Radius should come from spell data, not the cursor implementation.

---

# 217. Range and combat reach

Spell tables provide:

```text
minRange
maxRange
```

For unit-target ranges, effective distance may include the caster/target's authored combat reach.

Important architecture rule:

```text
collisionRadius
!=
combatReach
```

Combat reach is a gameplay property.

---

# 218. Auto attack

Conceptual flow:

```text
client:
AttackSwing(target)

server:
validate target
→ ATTACK_START
→ maintain weapon timer
→ resolve swings
→ send results
→ ATTACK_STOP when required
```

The client animation should not be the source of truth for hit timing.

---

# 219. Weapon timers

Server combat keeps distinct timing lanes:

```text
main hand
off hand
ranged
```

The timer is gameplay timing based on weapon attack speed and modifiers.

Animation playback adapts to gameplay timing, not the reverse.

Support a queued:

```text
next-swing ability
```

for abilities that modify the next auto attack.

---

# 220. Attack result presentation

A server result contains data conceptually equivalent to:

```text
attacker
victim
damage
school
absorb
resist
block
victim state
hit flags
associated melee ability
```

The client can start the attack animation, then trigger impact effects at an authored animation event:

```text
ATTACK_HIT
```

Recommended separation:

```text
server result known
↓
visual attack animation
↓
animation marker
↓
blood/sound/hit reaction
```

---

# 221. Spell lifecycle

Recommended Vanilla-like lifecycle:

```text
TryCast
↓
local UX prevalidation
↓
send cast request
↓
server validates
↓
CastResult
SpellStart
↓
cast bar / animation
↓
SpellGo
↓
confirmed hit/miss targets
↓
projectile/impact presentation
```

This is the correct architecture for a responsive but authoritative MMO.

---

# 222. GCD and cooldowns are data-driven

Do not hard-code:

```text
GCD = 1.5 seconds
```

Spell data carries concepts equivalent to:

```text
StartRecoveryCategory
StartRecoveryTime
```

Cooldown state should support:

```text
spell cooldown
category cooldown
global cooldown category
```

in integer milliseconds.

---

# 223. Channels and pushback

Casting state should distinguish:

```text
Idle
Casting
Channeling
AutoRepeat
```

rather than one `isCasting` flag.

Cast pushback/delay should be server-confirmed and reflected in the client cast timer.

---

# 224. Spell projectile speed

Spell data has a projectile/visual speed concept.

```text
speed == 0
→ visually instant

speed > 0
→ launch moving missile visual
```

The server may already have resolved hit/miss before the client projectile reaches its target.

Therefore projectile presentation should not itself decide gameplay hit detection.

---

# 225. Spell visual definition

Recommended data-driven visual schema:

```text
SpellVisualDefinition
├── castKit
├── launchKit
├── missileKit
├── impactKit
├── casterSocket
├── targetSocket
└── projectileSpeed
```

This lets many spells reuse common visual building blocks.

---

# 226. Threat

Threat is a server system separate from initial aggro detection.

A reconstructed Vanilla server rule commonly used for victim switching is:

```text
candidate in melee range:
must exceed current threat by ~110%

candidate outside melee:
must exceed by ~130%
```

Treat this as faithful server reconstruction, not a WoW.exe client-side constant.

Threat storage:

```text
targetId → threatValue
```

Taunt should be modeled as dedicated threat/victim-selection behavior rather than simply adding a giant permanent threat number.

---

# 227. Recommended combat architecture

```text
CLIENT
├── TargetController
├── SpellTargeting
├── CastPrediction
├── CooldownUI
├── CombatAnimation
├── ProjectilePresentation
└── CombatText

SERVER
├── TargetValidator
├── RangeFacingLOS
├── AutoAttackSystem
├── SpellSystem
├── AuraSystem
├── CooldownSystem
├── ThreatSystem
└── DamageResolver
```

---

# 228. Checkpoint 12 — WDBC static data

## 228.1 Two data classes

Vanilla cleanly separates:

```text
STATIC CLIENT DATA
DBFilesClient/*.dbc

DYNAMIC SERVER DATA
query/cache records
```

Static tables define broad rules and presentation data.

Dynamic query caches hold realm/session-specific templates and metadata.

---

# 229. WDBC file format

Classic header:

```text
magic            4 B  "WDBC"
recordCount      u32
fieldCount       u32
recordSize       u32
stringBlockSize  u32
```

Total header:

```text
20 bytes
```

Then:

```text
recordCount × recordSize bytes
+
string block
```

---

# 230. WDBC has no type metadata

The file itself does not say whether a 4-byte field means:

```text
u32
i32
f32
string offset
flags
foreign key
```

The schema lives in client knowledge/code.

For the browser engine, preserve data-driven behavior but use explicit typed schemas.

---

# 231. Vanilla DBC count

The build-5875 analysis identifies approximately:

```text
151 static DBC tables
```

loaded by the client.

Do not reproduce all 151 blindly; reproduce the domain separation and the useful tables.

---

# 232. Byte-packed exceptions

A naive rule:

```text
recordSize == fieldCount * 4
```

is not universally true.

Confirmed examples include tables with byte-packed columns such as:
- `CharBaseInfo`;
- `CharStartOutfit`.

Any import/conversion tool must use a per-table schema.

---

# 233. Spell.dbc scale

The analyzed Vanilla Spell table is very large:

```text
~22,357 records
173 fields
~692 bytes/record
```

This demonstrates why the spell engine can stay generic while data defines:
- targeting;
- ranges;
- costs;
- effects;
- visuals;
- cooldowns;
- speed;
- attributes.

---

# 234. Table relationships

Typical relational pattern:

```text
Spell
├── RangeId    → SpellRange
├── RadiusId   → SpellRadius
├── DurationId → SpellDuration
├── VisualId   → SpellVisual
└── IconId     → SpellIcon
```

World example:

```text
ADT/MCNK areaId
→ AreaTable
→ Map
```

The correct engine architecture keeps geometry, static gameplay data and assets separated.

---

# 235. Runtime indexing

Vanilla strongly favors stable integer IDs and fast:

```text
id → record
```

lookup.

Recommended modern approach:

```text
authoring key:
"fireball"

build:
assign stable numeric id

runtime/network:
spellId = N
```

Stable IDs are a strong idea worth preserving.

---

# 236. Localization

Vanilla localized fields can contain multiple locale-string slots plus flags.

For our project, prefer:

```text
LocalizationKey
→ per-language resource table
```

rather than duplicating wide locale arrays in every runtime gameplay record.

The principle to retain is:

```text
gameplay record references localized text
```

instead of hard-coding language text into code.

---

# 237. Dynamic cache / DBCache concept

Server-provided records such as:

```text
creature template
item data
quest data
NPC text
player names
guild information
```

can be queried lazily and cached.

Conceptual client flow:

```text
lookup template
↓
not cached
↓
query server
↓
continue without blocking render loop
↓
response
↓
cache
↓
notify waiters
```

This is ideal for a large MMO.

---

# 238. Template vs instance

Always separate:

```text
CreatureTemplate
├── model/display
├── faction
├── base stats
├── abilities
└── static text

CreatureInstance
├── entity ID
├── template ID
├── current position
├── current HP
├── current target
├── active auras
└── AI state
```

Many instances share one template.

---

# 239. Recommended data build pipeline

Authoring:

```text
SQLite / CSV / JSON / editor tools
```

Build step:

```text
validate schemas
validate foreign keys
assign stable IDs
resolve localization
strip server-only/client-only columns
pack typed binary
generate manifests
```

Runtime browser data:

```text
spells.bin
areas.bin
maps.bin
animations.bin
visuals.bin
...
```

This preserves Vanilla's data-driven design without preserving its raw WDBC limitations.

---

# 240. Checkpoint 13 — object replication

## 240.1 Object hierarchy

Vanilla networked object kinds:

```text
Object
Item
Container
Unit
Player
GameObject
DynamicObject
Corpse
```

All use a common server-replicated field system.

---

# 241. UpdateFields

Every object exposes a flat replicated-field space in the original client.

Recovered field-count geometry:

```text
Object          6
Item           48
Container     122
Unit          188
Player self  1282
Player other  486
GameObject     26
DynamicObject  16
Corpse         38
```

The major design lesson:

```text
owner receives private state
other clients receive a smaller public state
```

---

# 242. Replication visibility classes

Recommended modern equivalent:

```text
Public
OwnerOnly
PartyOnly
ServerOnly
```

Examples:

```text
health       → Public
target       → Public
equipment    → Public
inventory    → OwnerOnly
quest log    → OwnerOnly
threat list  → ServerOnly
```

This is useful for both bandwidth and anti-cheat.

---

# 243. SMSG_UPDATE_OBJECT lifecycle model

Core update types:

```text
VALUES
MOVEMENT
CREATE
CREATE variant
OUT_OF_RANGE
NEAR
```

Recommended modern conceptual equivalents:

```text
CREATE
DELTA
MOVEMENT
REMOVE_FROM_INTEREST
```

---

# 244. Delta masks

A VALUES update contains a mask plus only changed values.

Conceptual:

```text
mask block
+
value for each set bit
```

This is the original dirty-field system.

Modern engine equivalent:

```text
ECS component dirty bits
→ viewer-filtered replication mask
→ compact binary delta
```

---

# 245. Create / update / interest exit

Lifecycle:

```text
entity becomes relevant
→ CREATE

entity stays relevant
→ field/movement deltas

entity leaves interest set
→ OUT_OF_RANGE / client representation removed
```

Important:

```text
out of interest
!=
destroyed on server
```

---

# 246. Interest management

For each player:

```text
oldRelevantSet
newRelevantSet
```

Compute:

```text
entered = new - old
left    = old - new
stayed  = old ∩ new
```

Then:

```text
entered → CREATE
left    → remove-from-interest
stayed  → only dirty deltas
```

The exact original retail server interest radius is not safely recoverable from the client alone and should remain configurable.

---

# 247. Movement replication

Vanilla movement packets carry state sufficient to reconstruct:
- flags;
- position;
- orientation;
- transport state;
- jump/fall data;
- movement speeds.

Recovered speed order:

```text
walk
run
runBackward
swim
swimBackward
turnRate
```

The local player simulates immediately and sends state/heartbeat.

The recovered movement heartbeat cadence is around:

```text
~500 ms
```

while state transitions are sent immediately.

For a modern MMO, use a higher network update cadence while keeping client prediction.

---

# 248. Packed GUID concept

Vanilla compresses 64-bit GUIDs by transmitting:
- a mask of non-zero bytes;
- only those bytes.

Modern equivalent can simply use:
- varint entity IDs;
- compact u32/u64 IDs.

The principle is:

```text
do not waste 8 bytes when a smaller identifier representation is sufficient
```

---

# 249. Compressed object snapshots

Vanilla can zlib-compress large update-object payloads, then feed the decompressed result into the same logical update pipeline.

Keep this architectural principle:

```text
one logical replication format
+
optional compression wrapper
```

Modern choices may include:
- WebSocket per-message compression;
- Brotli/Zstd for bulk snapshots;
- no compression for tiny deltas.

---

# 250. Two-pass reference resolution

Transport-related create batches demonstrate an important dependency rule.

Recommended client apply:

```text
Pass 1
create entity identities/components

Pass 2
resolve references:
    parent transport
    target
    owner
    attachments
```

This avoids ordering bugs.

---

# 251. Modern network architecture

```text
SERVER WORLD
      │
Spatial AOI
      │
      ├── entered
      │     → CREATE
      │
      ├── stayed
      │     → movement + dirty deltas
      │
      └── left
            → REMOVE
                │
                ▼
         Binary WebSocket
                │
                ▼
         Client EntityManager
```

---

# 252. Checkpoint 14 — final browser-engine architecture

## 252.1 Goal

Build an original browser MMO engine that reproduces the **technical feel and cost structure** of WoW Vanilla 1.12.1 without copying Blizzard's proprietary assets.

The target is not a literal emulator.

It is:

```text
Vanilla-style architecture
+
modern web platform
+
original game data/assets
```

---

# 253. Backend strategy — WebGPU first, WebGL2 fallback

As of the 2026 research pass, WebGPU is powerful and available in secure contexts, including Workers, but is still not considered universally Baseline across all commonly used browsers.

Therefore define:

```ts
interface RendererBackend {
    createBuffer(...)
    createTexture(...)
    createPipeline(...)
    beginFrame(...)
    submit(...)
}
```

Backends:

```text
WebGPURenderer
    preferred

WebGL2Renderer
    fallback
```

Never make world/game logic depend directly on WebGPU objects.

This prevents graphics-backend lock-in.

---

# 254. Optional renderer Worker

Modern browsers support `OffscreenCanvas`, and a normal HTML canvas can transfer control to a Worker.

WebGPU APIs are also available in supporting Workers.

Therefore the engine can evolve toward:

```text
MAIN THREAD
UI + input + DOM

RENDER WORKER
OffscreenCanvas
WebGPU/WebGL
render extraction
asset upload
```

Do not require this for the first prototype.

Start simple:

```text
render on main thread
```

and move rendering later only if profiling shows main-thread contention.

---

# 255. Shared memory and cross-origin isolation

If using multi-threaded WASM or `SharedArrayBuffer`, the page must satisfy cross-origin isolation requirements.

Typical headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

or a compatible `credentialless` COEP configuration.

Therefore threading should be an optional optimization layer, not a requirement for basic gameplay.

---

# 256. Recommended technology stack

### Browser/client
```text
TypeScript
WebGPU primary
WebGL2 fallback
WebSocket
Web Workers
OffscreenCanvas optional
```

### Heavy CPU modules — optional
```text
Rust → WebAssembly
```

Good candidates:
- collision acceleration;
- path/nav queries;
- binary asset parsing;
- compression/transcoding helpers.

### Server
Use a language/runtime optimized for long-lived authoritative simulation.

A clean option:

```text
Rust
```

but the architecture does not require the client and server to share one language.

---

# 257. Asset formats

Do not ship MPQ/ADT/M2/WMO/BLP directly as production runtime formats.

Those formats are reverse-engineering references.

Build conversion should output original-project formats optimized for browser delivery.

Recommended:

```text
M2-like animated models
→ GLB/glTF or custom compact mesh blob

WMO groups
→ group-scoped GLB/custom static mesh blobs

BLP-like source textures
→ KTX2/Basis Universal

DBC-like data
→ typed binary

ADT-like terrain
→ custom chunked terrain binary

WDL-like far terrain
→ compact far-height binary
```

---

# 258. KTX2 / Basis texture strategy

KTX2 with Basis Universal is a good browser distribution format because one compressed source can be transcoded to GPU-native compressed formats supported by the current device.

Use it for:
- terrain layers;
- M2 diffuse textures;
- WMO diffuse textures;
- particles;
- UI atlases when appropriate.

Preserve the Vanilla aesthetic by limiting source texture resolution and authored detail rather than relying only on compression.

---

# 259. Asset build graph

```text
ART SOURCE
│
├── Blender / authored meshes
├── PNG/TGA source textures
├── world editor data
└── SQLite gameplay data
        │
        ▼
BUILD TOOLS
│
├── mesh converter
├── terrain baker
├── texture KTX2 encoder
├── skeleton/animation packer
├── WMO-group packer
├── collision builder
├── navmesh builder
└── data compiler
        │
        ▼
VERSIONED CDN / STATIC HOSTING
```

All runtime assets should be content-addressable or versioned for cache control.

---

# 260. World-pack layout

Recommended:

```text
/world/
  manifest.bin

  /maps/<mapId>/
    map.bin

    /tiles/
      x_y.tile

    /far/
      x_y.far

    /wmo/
      <assetId>.root
      <assetId>_group_000.mesh
      ...

  /models/
    <modelId>.glb

  /textures/
    <textureId>.ktx2

  /data/
    spells.bin
    areas.bin
    maps.bin
    animations.bin
```

---

# 261. Terrain runtime format

Preserve the Vanilla chunk structure:

```text
Tile
├── 16 × 16 chunks
│
└── each chunk:
    145 height vertices
    hole mask
    normals
    1–4 texture IDs
    blend/shadow mask
    object refs
    WMO refs
    liquid
```

Do not merge the full outdoor world into giant meshes.

---

# 262. Far terrain

Maintain a distinct WDL-like representation:

```text
far tile
≈ 545 height samples
```

Render it cheaply behind detailed terrain with:
- strong fog;
- low material complexity;
- depth separation.

This is much more useful for the desired aesthetic than modern continuous geometric tessellation.

---

# 263. M2-like model runtime

Recommended model data:

```text
AnimatedModel
├── vertices
│   ├── position
│   ├── normal
│   ├── uv
│   ├── 4 bone weights
│   └── 4 bone indices
│
├── submeshes/geosets
├── materials
├── skeleton
├── sequences
├── attachment sockets
├── ribbons
└── particles
```

Target humanoid envelope:

```text
~80–100 total bones
~50–70 actively animated bones
<=4 influences per vertex
```

Use a large data-driven animation library.

---

# 264. Character appearance

Vanilla-like character composition:

```text
base race/sex mesh
+
geoset selection
+
small baked/composited character texture
+
attached 3D items
```

A faithful target:

```text
256×256 composite character texture
```

A practical modern maximum:

```text
512×512
```

while maintaining low-frequency hand-painted style.

---

# 265. WMO-like runtime

Preserve groups.

```text
WmoAsset
├── root metadata
├── groups[]
├── materials[]
├── portals[]
├── fogs[]
├── doodads[]
└── lights[]
```

Never flatten all groups into one giant mesh if portal culling is desired.

Each group remains independently:
- visible;
- loadable;
- collidable;
- portal-addressable.

---

# 266. Visibility stack

Recommended order:

```text
1. world tile residency
2. ADT chunk frustum culling
3. WMO placement broad-phase
4. WMO portal PVS
5. M2 bounding-sphere/frustum culling
6. Vanilla-style M2 size/distance fade
7. small-detail cutoff
8. far terrain
9. fog hides boundaries
```

This is more important than sophisticated GPU occlusion for the initial implementation.

---

# 267. M2 size fade

Retain the recovered Vanilla size bands:

```text
radius <= 0.5 yd
fade 40 → 50 yd

radius <= 2.5 yd
fade 100 → 125 yd

radius <= 7 yd
fade 150 → 200 yd

radius > 7 yd
no size-band fade
```

This is a strong visual/performance fingerprint.

---

# 268. WMO portal PVS

Runtime:

```text
find camera room seed(s)
↓
portal flood
↓
project portal polygons
↓
intersect inherited screen rect
↓
visible group bitset
↓
submit only visible group geometry/doodads/liquids
```

This is one of the highest-value systems to reproduce.

---

# 269. Render philosophy

Do not build a modern PBR renderer and then try to "downgrade" it with low-poly assets.

Build a deliberately simple lighting model:

```text
painted diffuse
+
per-vertex/simple directional lighting
+
ambient
+
baked terrain/WMO shade
+
small special sheen
+
fog
```

No default:
- metalness;
- roughness;
- SSAO;
- SSR;
- high-frequency normal maps;
- realistic atmospheric scattering.

---

# 270. Render passes

Recommended initial pass organization:

```text
FRAME
│
├── environment / sky
├── far terrain
├── detailed terrain opaque
├── WMO opaque/cutout
├── M2 opaque/cutout
├── liquids
├── M2 alpha/add/mod
├── particles
├── ribbons
└── UI
```

Exact historical submission order can be emulated where blending requires it, but this modern pass decomposition is easier to maintain.

---

# 271. Terrain shader

Core:

```text
layer0
mix layer1 using alpha
mix layer2 using alpha
mix layer3 using alpha
× simple lighting
× baked shadow
+ optional weak sheen
→ fog
```

Keep lighting low-frequency.

---

# 272. M2 material shader family

Use a small fixed set of pipelines based on:

```text
render flags
blend mode
fog mode
lighting mode
```

Core blend families:

```text
opaque
alpha-key
alpha blend
add
mod
mod2x
```

For alpha-key fidelity, preserve the high cutout threshold close to:

```text
224/255
≈ 0.8784
```

for assets designed for that rule.

---

# 273. Water rendering

Maintain:
- animated frame textures;
- type-specific river/ocean/magma behavior;
- depth/opacity LUT-inspired response;
- simple lighting/fog.

Recovered cadence:

```text
30 frames
1250 ms loop
≈24 fps
```

Do not replace this with expensive fluid simulation.

---

# 274. Particles and ribbons

Particles:

```text
instanced textured quads
+
simple blend mode
+
billboard orientation
```

Ribbons:

```text
time-ordered edge strip
+
lifetime
+
UV progression
+
gravity/sag
```

These are very inexpensive on modern GPUs.

---

# 275. Animation system

```text
AnimationController
├── current sequence
├── previous sequence
├── local time
├── crossfade
├── global sequences
└── animation events
```

Per frame:

```text
sample T/R/S
↓
build local bone matrices
↓
parent propagation
↓
GPU bone palette
↓
skin vertices
```

Use animation markers for gameplay presentation events such as attack impact.

---

# 276. Client ECS

Recommended components:

```text
Transform
MovementState
Renderable
SkeletonPose
Appearance
Health
Power
CombatState
Target
Auras
Equipment
NetworkIdentity
NetworkInterpolation
PlayerPrediction
WmoMembership
AudioEmitter
```

Game logic should read typed components rather than original-style raw UpdateField indices.

The network layer maps components to replication schemas.

---

# 277. Client world modules

```text
GameClient
│
├── Input
├── Camera
├── Network
├── Replication
├── EntityManager
├── LocalPrediction
├── StaticData
├── AssetManager
├── WorldStreamer
├── CollisionWorld
├── Animation
├── Audio
├── Renderer
└── UI
```

Each system communicates through explicit state/events rather than direct tight coupling.

---

# 278. World streaming

Recommended residency model:

```text
camera/player position
↓
required detailed terrain tiles
↓
required WMO placements/groups
↓
required model assets
↓
far terrain ring
```

Separate:

```text
resident
```

from:

```text
visible
```

Assets can stay in memory while temporarily portal/frustum culled.

---

# 279. Asset states

Useful lifecycle:

```text
Unrequested
Requested
Downloading
Decoded
GPUUploading
Ready
Evictable
```

Each world element references handles rather than awaiting network requests inside rendering code.

---

# 280. Browser cache strategy

Use:
- normal HTTP caching;
- immutable hashed asset URLs;
- optional Cache Storage / IndexedDB for explicit cache management if measurements justify it.

Do not design a complex custom offline cache before profiling actual CDN/browser cache behavior.

---

# 281. Main loop

The original client uses a scheduler/event-bus-driven frame loop rather than one giant hard-coded method.

A clean web equivalent:

```text
requestAnimationFrame
↓
collect network messages
↓
input
↓
client prediction / movement
↓
animation
↓
streaming decisions
↓
visibility extraction
↓
render
↓
UI event publication
```

Server simulation should use its own fixed tick.

Do not couple gameplay simulation rate to browser render FPS.

---

# 282. Recommended timing model

Client:

```text
render:
requestAnimationFrame

local kinematic simulation:
fixed or semi-fixed timestep

network snapshot processing:
message-driven

animation:
render-time interpolation

day/night visual clock:
smooth local clock re-anchored by server time
```

Server:

```text
authoritative fixed tick
```

---

# 283. Game-time architecture

Preserve the Vanilla idea:

```text
server authoritative world time
↓
periodic time sync
↓
client local continuous advance
↓
lighting clock
```

Do not request current server time every frame.

---

# 284. Network transport

Modern browser transport:

```text
WSS / WebSocket
```

Use compact binary frames.

Do not reproduce:
- Vanilla SRP6 wire protocol;
- old additive header cipher;
- legacy opcode framing.

TLS handles transport encryption.

The gameplay protocol should still preserve:
- stable entity IDs;
- CREATE/DELTA/REMOVE;
- interest management;
- owner-only fields;
- authoritative results.

---

# 285. Client movement network model

Recommended:

```text
input
↓
immediate local prediction
↓
send input/state sequence
↓
server validates/simulates
↓
authoritative snapshot
↓
small correction / reconciliation
```

Remote entities:

```text
snapshot buffer
↓
interpolate between server states
↓
render smooth transform
```

This is a modernized presentation layer around the same authoritative philosophy.

---

# 286. Server architecture

```text
Gateway / Session
        │
        ▼
World Instance
│
├── SpatialIndex
├── EntityStore
├── MovementSystem
├── CombatSystem
├── SpellSystem
├── AuraSystem
├── Threat/AI
├── InterestManager
├── ReplicationSystem
├── WorldTime
└── Persistence boundary
```

Static data is loaded into typed server records by stable ID.

---

# 287. Server tick pipeline

A practical ordering:

```text
1 network input ingest
2 validate/queue player commands
3 movement
4 collision/world transitions
5 AI
6 combat/spells/auras
7 world scripts
8 interest-set update
9 replication delta build
10 outbound send
```

Exact tick frequency can be chosen through profiling; it does not need to reproduce 2006 server internals.

---

# 288. Data authority

Keep three scopes:

```text
SHARED STATIC DATA
IDs/rules required by both sides

SERVER-ONLY
authoritative formulas
loot
AI secrets
private state

CLIENT-ONLY
visual mappings
UI presentation
optional prevalidation hints
```

Build tools should emit separate client/server datasets from one source schema where possible.

---

# 289. Suggested project repository layout

```text
/game
  /client
    /src
      /camera
      /ecs
      /network
      /movement
      /animation
      /render
      /world
      /ui

  /server
    /src
      /world
      /movement
      /combat
      /spells
      /ai
      /replication

  /shared
    /protocol
    /ids
    /math
    /schemas

  /tools
    /asset-build
    /data-build
    /world-build

  /content
    /source
      /models
      /textures
      /world
      /data

  /dist
    /assets
```

---

# 290. Recommended implementation phases

## Phase 1 — single-player renderer proof
Build:
- terrain tile;
- camera;
- basic M2-like character;
- simple lighting/fog;
- WDL-like far terrain.

Target:
```text
walk around a Vanilla-feeling outdoor zone
```

## Phase 2 — world structures
Add:
- WMO groups;
- portals;
- doodads;
- water;
- collision.

## Phase 3 — movement fidelity
Add:
- slope;
- step-up;
- jump;
- swimming;
- camera collision.

## Phase 4 — characters
Add:
- skeleton;
- animation states;
- geosets;
- character texture baking;
- equipment attachments.

## Phase 5 — combat sandbox
Add:
- target selection;
- auto attack;
- spell casts;
- cooldowns;
- projectiles;
- hit presentation.

## Phase 6 — authoritative multiplayer
Add:
- WebSocket;
- entity IDs;
- interest management;
- client prediction;
- CREATE/DELTA/REMOVE.

## Phase 7 — persistent MMO systems
Add:
- characters/accounts;
- inventory;
- quests;
- NPCs;
- persistence;
- zones/instances.

---

# 291. Performance targets

The Vanilla-inspired content structure is naturally browser-friendly.

Focus optimization in this order:

```text
1 draw-call/batch count
2 unnecessary visible groups/entities
3 texture memory/downloads
4 animation cost for crowds
5 collision broad-phase
6 network replication volume
```

Do not begin by reducing the already-small terrain triangle topology.

---

# 292. GPU batching strategy

Batch where it does not destroy visibility granularity.

Good:
```text
same material + same visible region
instanced identical doodads
particle quad instances
```

Avoid:
```text
merge all WMO rooms
merge entire world tile hierarchy
merge objects that need different portal/distance visibility
```

---

# 293. Crowd animation strategy

Near characters:
```text
full skeletal evaluation
```

Mid-distance:
```text
lower animation update rate
```

Far characters:
```text
pose update decimation
or simplified animation
```

Do not necessarily reduce mesh geometry first; animation CPU cost can dominate large crowds.

---

# 294. Fidelity profile

Create one engine config:

```ts
VanillaFidelity {
    terrainChunkTopology: true
    lowResolutionTextureBlend: true
    perVertexLighting: true
    bakedTerrainShadow: true
    authoredDayNight: true
    vanillaWaterCadence: true
    m2DistanceFade: true
    wmoPortalCulling: true
    characterCompositeTexture: true
    pbr: false
}
```

This lets the project intentionally preserve the era's look.

---

# 295. Final architectural principle

The reverse engineering converges on one core lesson:

```text
WoW Vanilla looks large
because it controls cost hierarchically.
```

It does not brute-force the entire world.

The hierarchy is:

```text
WORLD INDEX
↓
streamed terrain tiles
↓
individually culled terrain chunks
↓
grouped WMO interiors
↓
portal-visible rooms
↓
reused M2 props
↓
distance-faded small objects
↓
simple materials
↓
simple lighting
↓
far terrain + fog
```

and gameplay follows a similar hierarchy:

```text
static typed data
↓
shared templates
↓
dynamic entity instances
↓
server interest set
↓
dirty field deltas
↓
client prediction + presentation
```

That architecture is the real reason a browser recreation is technically realistic.

---

# 296. Final implementation recommendation

For this project, build:

```text
CLIENT
TypeScript
WebGPU + WebGL2 fallback
WebSocket
KTX2/Basis textures
GLB/custom compact model blobs
custom chunked terrain/WMO data

OPTIONAL CPU ACCELERATION
Rust/WASM workers

SERVER
authoritative world simulation
stable numeric IDs
typed static data
spatial interest management
binary delta replication
```

Do not begin with a massive engine.

The first useful milestone should be:

```text
one outdoor map tile
+
one controllable humanoid
+
Vanilla camera
+
Vanilla movement
+
terrain texture blending
+
day/night/fog
+
WDL-style horizon
```

If that scene already feels like the 2004–2006 rendering philosophy, the architecture is correct.

---

# 297. Current web-platform notes (research pass 2026-10)

WebGPU:
- available only in secure contexts;
- supported in Workers where available;
- still listed by MDN as not fully Baseline across all major-browser combinations.

Therefore retain WebGL2 fallback.

OffscreenCanvas:
- widely available;
- a DOM canvas can transfer rendering ownership to a Worker.

SharedArrayBuffer:
- requires cross-origin isolation in normal modern browser deployment;
- use appropriate COOP/COEP headers if/when threaded shared-memory WASM is enabled.

KTX2/Basis:
- designed by Khronos for compressed portable GPU texture delivery;
- `KHR_texture_basisu` enables KTX2 textures in glTF;
- runtime transcoding can select an available native GPU texture format.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen
- https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
- https://www.khronos.org/gltf/
- https://www.khronos.org/news/press/khronos-ktx-2-0-textures-enable-compact-visually-rich-gltf-3d-assets

---

# 298. Final main-project dashboard

| Area | Status |
|---|---|
| target build 1.12.1 / 5875 | ✅ |
| WDT world indexing | ✅ |
| ADT tile/chunk geometry | ✅ |
| terrain holes | ✅ |
| terrain texture blending | ✅ |
| baked terrain shadows | ✅ |
| Vanilla lighting philosophy | ✅ |
| authored day/night | ✅ |
| fog/horizon | ✅ |
| WDL far terrain | ✅ |
| terrain culling/streaming | ✅ |
| MCLQ water | ✅ |
| M2 format | ✅ |
| M2 skeleton/animation | ✅ |
| character compositing | ✅ |
| M2 materials | ✅ |
| particles/ribbons | ✅ |
| M2 distance fade | ✅ |
| WMO root/group architecture | ✅ |
| WMO materials/doodads | ✅ |
| WMO collision | ✅/🟢 |
| WMO liquid | ✅ |
| WMO portal PVS | ✅ |
| WMO interior fog/light | ✅/🟢 |
| gameplay camera | ✅ |
| movement/jump/swim | ✅ |
| combat architecture | ✅/🟢 server reconstruction where noted |
| WDBC static data | ✅ |
| dynamic query cache model | ✅ |
| network object replication | ✅ |
| client/server architecture | ✅ |
| final browser architecture | ✅ |
| exact HumanMale triangle count | 🟡 optional measurement |
| exact M2 view selection | 🟡 optional deep dive |
| exact WMO liquid UV matrix | 🟡 optional deep dive |
| audio deep dive | ⬜ optional |
| FrameXML/Lua UI deep dive | ⬜ optional |
| weather deep dive | ⬜ optional |
| minimap deep dive | ⬜ optional |

---

# 299. Status of the reverse-engineering phase

The **main reverse-engineering roadmap is complete**.

The remaining unknowns are no longer blockers for building the engine.

They are precision/optional research topics.

The project can now move from:

```text
RESEARCH
```

to:

```text
IMPLEMENTATION
```

with the recommended first milestone:

```text
Vanilla-like outdoor renderer + player controller
```

before multiplayer systems are introduced.
