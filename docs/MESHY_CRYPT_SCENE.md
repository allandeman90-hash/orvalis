# ORVALIS — Meshy Crypt Scene A7

Status: candidate scene blueprint; waiting for local GLB copies of the registered Meshy CC0 assets.

## Goal

Build a compact, playable-looking crypt/dungeon environment that feels deliberately assembled rather than procedurally filled. The scene is a visual contrast to the previous enchanted/forest review: cold stone, enclosed architecture, warm local light, readable MMO navigation, no forest dressing and no magical neon overload.

The source kit is registered in `engine/public/assets/meshy-crypt-candidates.json`.

## First scene layout

Target footprint: roughly 24 m long × 14 m wide × 6–8 m high.

Player-facing composition:

1. **Entry threshold**
   - narrow doorway/short vestibule;
   - Ancient Wooden Dungeon Door used as a side/entry architectural accent, not the main landmark;
   - immediate sightline into the central nave.

2. **Central nave**
   - Dungeon Stone Floor repeated in a controlled grid after seam/pivot validation;
   - Stone Dungeon Asset Pack supplies the main wall/arch/stone mass only if its downloaded pieces are clean enough to separate and reuse;
   - keep a 3–4 m clear combat/navigation lane through the middle.

3. **Side burial alcoves**
   - 2–4 Wooden Coffin instances total;
   - each rotated/offset slightly and placed against architecture, never evenly tiled;
   - 2–3 Bone Pile instances total, concentrated near one collapsed/dead-end area.

4. **Back landmark**
   - Ossuary Gate centered or slightly offset at the end of the nave;
   - raised by a short stair/platform if the modular kit permits it;
   - use as the strongest silhouette and progression cue in the room.

5. **Negative space**
   - do not fill every corner;
   - preserve readable floor around combat space;
   - density should come from architectural rhythm + a few high-value props, not dozens of repeated meshes.

## Lighting / atmosphere

- Base ambient: cool desaturated blue/gray.
- Local practical lights: warm orange near doors, coffins and the gate.
- Low fog concentrated toward the floor and back of the room.
- Stronger contrast at the Ossuary Gate to pull the eye forward.
- Avoid green/purple magical glow unless later gameplay requires it.
- Prefer baked/vertex-style readability and restrained specular response over shiny realistic PBR.

## Orvalis normalization rules

For every imported Meshy GLB:

- normalize up-axis and forward-axis;
- normalize scale against a 1.8 m character reference;
- move pivot to a useful placement point;
- force non-metal stone/wood response unless the material is genuinely metal;
- reduce excess roughness/specular variation that makes mixed Meshy sources clash;
- preserve useful albedo/vertex colour information;
- inspect topology before approval;
- reject or decimate assets that are disproportionately dense for a browser MMO;
- do not attempt to repair fundamentally bad silhouettes with new procedural geometry — replace the asset instead.

## Visual acceptance gate

The first crypt pass is acceptable only if:

- the room reads immediately as a crypt/dungeon at gameplay camera distance;
- the center path remains obvious without UI arrows;
- the gate is a clear destination landmark;
- materials from different authors feel like one Orvalis scene after normalization;
- no asset looks like an isolated Marketplace model dropped into an empty room;
- no forest/enchantment dressing remains from the previous review scene;
- performance remains appropriate for the web target before adding more props.

## Exact next implementation block

Once the GLB files are available locally:

1. copy them under `engine/public/assets/models/meshy/crypt/` with stable filenames;
2. record exact local paths and source provenance in the registry;
3. build `engine/public/crypt-review.html` from real local assets only;
4. assemble only the layout above — no extra systems;
5. run one targeted page/build validation and stop for visual review.
