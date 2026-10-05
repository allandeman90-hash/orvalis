# V0.1 — OpenWow × Orvalis Character Pipeline Audit

Updated: 2026-10-05

## Status

V0.1 defines the production character boundary before any real Orvalis player body is authored/imported.

The procedural mannequin and Vanguard outfit remain **technical fixtures only**. They are not production art and must not be polished into production assets.

## Reference priority

1. `docs/WoW_Vanilla_1.12.1_RE_Master.md` — primary technical truth.
2. `World0fWarcraft/OpenWow` — secondary implementation reference.
3. Orvalis stays original: no Blizzard meshes, textures, maps, animations or other proprietary game assets are imported.

OpenWow is useful for subsystem boundaries, not as a literal target. In particular its current character baker uses a 512×512 layout, while the Orvalis master 1.12.1 research confirms the Vanilla target composite as 256×256 RGB565. The master spec wins where they differ.

## OpenWow areas inspected

- `owGame/Character/Character.cpp`
- `owGame/Character/CharacterTemplate.h`
- `owGame/Character/Character_SectionWrapper.*`
- `owGame/Character/Character_SkinTextureBaker.*`
- `owGame/CharacterItem/CharacterItem.*`
- `owGame/CharacterItem/CharacterItemDefines.h`
- `owGame/CharacterItem/CharacterItemM2Instance.*`
- `owGame/M2/*` as the model/attachment substrate

Useful architectural observations:

- character customization data is separate from the model runtime;
- skin/face/hair sections are resolved separately from item visuals;
- item visuals can contribute texture sections, geoset changes and separate attached models;
- item models attach through explicit character attachment points;
- helmet visibility is data-driven and can hide hair/facial/ear geosets;
- race/sex can influence model/texture resolution and fit.

## Master 1.12.1 constraints retained

From §§51–57 and §§70–73 of the master document:

- one base humanoid model per authored body archetype, not a complete mesh per outfit;
- active geosets + one 256×256 composite texture + attached models;
- 10 dirty/rebuild groups;
- 8 equipment texture layers;
- texture-only / geoset-changing / attached-model equipment hybrid;
- semantic attachment sockets are appropriate for the browser engine;
- low-frequency hand-painted diffuse appearance, simple material state, no default modern PBR character stack;
- roughly 80–100 total bones is a period-consistent target, with no more than 4 bone influences per vertex.

## Orvalis gap matrix

| Area | Existing Orvalis state | V0.1 result | Remaining production work |
|---|---|---|---|
| Character composite | `CharacterComposite`: 256×256, dirty groups, alpha modes, 565-style dither | Keep | Load authored source sections instead of procedural fixture sections |
| Equipment texture layers | 8 layers already implemented | Keep | Drive from `ItemAppearanceDefinition` assets |
| Geoset infrastructure | 16 groups supported; fixture semantics mainly hair/facial hair/gloves/boots | Keep core | Each production body declares semantic geoset-group mapping; expand semantic vocabulary as assets require |
| Attachments | Generic model attachment runtime exists; mannequin has hard-coded fixture sockets | Keep runtime | Production bodies declare their own semantic sockets and body fit |
| Base customization | Fixture skin/face/hair exists procedurally | Architecture proven | Replace with authored asset IDs and body manifests |
| Helmet visibility | Fixture path has essentially `hideHair` | Insufficient for production | Production contract supports hair/facialHair/ears/semantic-geoset hide rules |
| Body-specific fit | Not represented as production data | Added contract | Runtime adapter must apply body socket transforms and appearance body overrides |
| External player assets | `AssetManager` exists | Foundation ready | Register production model/texture loaders and manifest resolution |
| Item vs visual appearance | Fixture `EquipmentItem` owns its visual data directly | Production boundary added | Future gameplay item only references `itemAppearanceId`; renderer consumes appearance registry |
| Transmog | No production contract | Added | `appearanceOverrideId ?? itemAppearanceId`; persistence/unlock rules belong to later gameplay/persistence layers |
| Eight base characters | No production manifests yet | Contract enforces eight-body roster when populated | Author/import eight original body manifests progressively; do not duplicate every armor set eight times |
| Real art quality | Mannequin/Vanguard only | Explicitly out of scope for V0.1 | V1/V3 create original male/female bodies and progression outfits |

## Production contract added

`engine/src/character/productionContract.ts` is the production-facing data boundary.

### `CharacterBodyContract`

Each base body declares:

- `modelAsset`;
- `rigId`;
- `compositeLayoutId`;
- semantic geoset name → body-specific numeric group;
- semantic sockets:
  - head;
  - left/right shoulder;
  - main hand;
  - off hand;
  - shield;
  - back;
- skin/face/hair/facial-hair customization IDs.

The socket carries body-wide position/rotation/scale fit. This prevents an appearance from baking mannequin-specific coordinates into every item.

### `ItemAppearanceDefinition`

An appearance is visual-only and can provide:

- body-composite texture sections;
- semantic geoset variants;
- attached models on semantic sockets;
- visibility/hide rules;
- optional compatible-body whitelist;
- exceptional body-specific overrides.

The default is **one shared appearance**. A body override is the exception, not the normal authoring path.

### Transmog boundary

The production renderer consumes:

```text
itemAppearanceId
appearanceOverrideId?
```

and resolves:

```text
effectiveAppearance = appearanceOverrideId ?? itemAppearanceId
```

Gameplay stats do not live in the appearance definition. Therefore a future item can keep endgame stats while rendering a previously unlocked simple appearance without mutating the item itself.

## One appearance across different bodies

Resolution is semantic rather than numeric.

Example:

```text
Appearance asks for:
  geoset "gloves" variant 2
  leftShoulder attachment

Body A maps:
  gloves -> geoset group 4
  leftShoulder -> broad-body socket transform

Body B maps:
  gloves -> geoset group 7
  leftShoulder -> compact-body socket transform
```

The appearance definition stays shared. Only the body contract supplies its fit and numeric implementation details.

For exceptional geometry/UV cases, `bodyOverrides` may replace texture/attached arrays and override specific geoset/hide rules.

## Validation rules added

The contract validates:

- all required semantic sockets;
- finite transform data and positive scales;
- unique body IDs;
- eight bodies by default for the production roster gate;
- valid 0–15 geoset groups and 1–99 variants;
- no duplicate texture region inside one appearance payload;
- no duplicate attached model on one semantic socket in one payload;
- compatible body rules;
- semantic geosets required by an appearance actually existing on the selected body.

Targeted tests live in `engine/tests/character/productionContract.test.ts`.

## Smallest implementation delta before real character art

Do **not** redesign the renderer and do **not** polish the mannequin.

The next character-pipeline implementation steps are intentionally narrow:

1. define external original model/texture formats/loaders through the existing `AssetManager`;
2. add an adapter from `CharacterBodyContract` + resolved `ItemAppearanceDefinition` into the existing composite/geoset/attachment runtime;
3. create the first production male and female body manifests with original assets;
4. prove no-gear, simple gear and endgame gear on those two bodies;
5. only then generalize the manifest set toward all eight base bodies.

The underlying P5 composite/geoset/attachment machinery should be reused, not rewritten.

## V0.1 acceptance

V0.1 is considered technically complete when:

- the audit is recorded;
- the production body/appearance/transmog contract exists;
- body-specific semantic resolution is tested;
- the fixture pipeline remains intact;
- no P9 gameplay/data work is started.

Real original player meshes/textures are intentionally **not** a V0.1 deliverable.

## Still blocked / separate

- P8.7 walk-on-water / levitation remains open as the final P8 movement closure item.
- P9 remains blocked.
- The next visual-convergence audit in `ROADMAP.md` is V0.2 — terrain/material pipeline, followed by V0.3 WMO/doodad/material pipeline.
