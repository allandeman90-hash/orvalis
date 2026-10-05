# ORVALIS CHARACTER VISUAL DIRECTION

Updated: 2026-10-05

## Intent
Create original Orvalis characters that evoke the readability, exaggeration and hand-painted fantasy language of WoW Vanilla/Classic without copying Blizzard meshes, textures, characters, armor sets or proprietary assets.

The current procedural mannequin and Vanguard fixture are NOT art targets. They exist only to prove engine systems.

## Base-body rule
A character must already look good with no equipment.

Reject a base body if it reads as:
- generic mannequin;
- realistic modern human scan;
- toy/playmobil;
- thin low-poly placeholder;
- armor-dependent silhouette.

Accept only when the silhouette itself has identity.

## Desired body language
### Male archetype reference qualities
- heroic upper-body mass;
- broad shoulder line;
- tapered waist;
- large forearms/hands;
- substantial calves/feet;
- stylized anatomy rather than realistic anatomy;
- face readable at gameplay camera distance;
- hair/beard can strongly alter silhouette.

### Female archetype reference qualities
- clearly authored feminine silhouette without realistic-scan proportions;
- readable head/face/hair silhouette;
- limbs and hands remain stylized enough to match the same world;
- equipment must preserve body readability rather than turning the body into a generic armored cylinder.

## Face
- simple planes, strong brows/eyes/nose/mouth shapes;
- readable expression at medium distance;
- avoid tiny realistic facial detail that disappears in gameplay;
- skin shading should feel painted, not physically scanned;
- hair/beard should frame the face and contribute to silhouette.

## Hands and feet
- intentionally oversized versus realistic anatomy;
- gloves and boots may enlarge them further;
- silhouettes should remain readable during animation;
- avoid tiny hands/feet that make the body look like a generic modern character model.

## Armor layering
The visual stack should support:
1. base skin/body;
2. composited clothing textures;
3. body/geoset variants where needed;
4. separate attached pieces for strong silhouette items.

Typical attached pieces:
- helmets;
- shoulders;
- weapons;
- shields;
- capes/back items.

Typical body/composite pieces:
- shirts;
- chest fabrics/leather/plate regions;
- trousers;
- belts;
- glove/boot base forms;
- tabards/cloth layers.

## Shoulders
Shoulder armor is allowed to be exaggerated, but must feel anchored.

Rules:
- socket starts from actual shoulder anatomy, not empty air;
- inner edge should visually relate to deltoid/upper arm;
- outer edge can enlarge silhouette strongly;
- no torso intersection in idle pose;
- no obvious floating gap in idle pose;
- animation fit must be checked for stand/walk/run/attack;
- body-specific socket/scale offsets are acceptable.

## Helmets
- decide intentionally whether a helmet reveals, frames or fully hides the face;
- eye opening must align with the actual face if visible;
- hair visibility is rule-driven, not accidental clipping;
- helmet volume should follow the head and then exaggerate outward;
- avoid uniform bucket/cone shapes unless deliberately stylized;
- use material/value accents so the helmet reads as authored gear, not one flat primitive.

## Equipment progression
The same character should visually communicate progression:

### Level 1
- simple cloth/leather;
- minimal silhouette expansion;
- weak/simple weapon;
- few attached pieces.

### Mid tier
- stronger material contrast;
- more geometry around gloves/boots/shoulders;
- clearer faction/class fantasy;
- better weapon silhouette.

### Endgame
- major silhouette transformation;
- large but properly fitted shoulders/helmet/weapon;
- richer hand-painted material separation;
- cape/ribbons/particles only where they improve readability;
- must still clearly be the same underlying character.

## Transmog architecture
Gameplay stats and visuals must remain separate.

Conceptually:
```text
Item
  stats/progression/requirements
  appearanceId

ItemAppearance
  textures
  geosets
  attachments
  hide rules
  body-fit variants

EquippedAppearance
  appearanceOverride ?? item.appearanceId
```

Once an appearance is unlocked, it can remain available for future transmog even if the original item is gone, subject to game-design rules.

## Eight base characters
Do not author every armor set eight times by default.

Prefer:
- standardized semantic sockets;
- compatible UV/composite conventions where possible;
- per-body socket offsets/scales;
- per-body geoset fit data;
- appearance-specific body overrides only when necessary.

## Material direction
Target painterly old-school MMO readability:
- diffuse/hand-painted dominant;
- broad value gradients;
- painted highlights/shadows;
- clear material color families;
- restrained specular behavior;
- no default modern PBR look;
- no microdetail/noise that disappears at gameplay distance.

## Visual acceptance tests
A production character checkpoint is not accepted only because it renders.

Check at minimum:
- front / side / back;
- no gear;
- simple gear;
- endgame gear;
- stand / walk / run / attack;
- medium gameplay camera distance;
- shoulder and helmet intersections;
- hand/weapon grip;
- cape/back placement;
- readable silhouette against dark and bright backgrounds.

## Reference policy
Wowhead Classic Dressing Room screenshots supplied by the user are reference images for proportions, silhouette and armor layering only.
Do not copy or redistribute the actual WoW character/armor assets.

OpenWow can be used to understand how the client structures character compositing, model attachments, material state and related runtime behavior. The 1.12.1 master reverse-engineering document remains the primary technical reference.
