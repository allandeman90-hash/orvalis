# V1.3 — Equipment appearance / transmog contract

Status: **VALIDATED**

Updated: 2026-10-05

## Purpose

V1.3 closes the production-facing visual-equipment boundary without introducing inventory, combat, item-stat tables or persistence systems.

V0.1 already established the important split:

```text
Gameplay item
  └─ itemAppearanceId

optional appearanceOverrideId
  ↓
ItemAppearanceDefinition
  ↓
ResolvedItemAppearance
  ↓
V1.2 character asset adapter
  ↓
existing P5 renderer systems
```

V1.3 adds the missing policy layer around **which transmog appearances a player is allowed to select**.

## Reference boundary

The WoW 1.12.1 technical reference remains useful for how equipment affects character textures, geosets and separately attached models.

A persistent transmog collection is **not** a Vanilla 1.12.1 feature. The unlocked-appearance rules in this checkpoint are therefore an explicit Orvalis product rule, not a claim about the original client.

## Runtime contract

File:

- `engine/src/character/appearanceCollection.ts`

### Serializable collection

```ts
interface AppearanceCollectionSnapshot {
  readonly unlockedAppearanceIds: readonly string[];
}
```

The snapshot contains stable appearance ids only.

It deliberately does not contain:

- item stats;
- item instance ids;
- inventory positions;
- durability;
- requirements;
- bind state;
- combat data;
- renderer/GPU objects.

That makes the object suitable as a future persistence payload without implementing P9/P12 now.

## Native appearance vs transmog override

Orvalis uses this rule:

```text
no override
  → render the equipped item's native itemAppearanceId

with override
  → override must exist in the current appearance registry
  → override must be unlocked in AppearanceCollectionSnapshot
  → render the override
```

The native appearance of an actually equipped item does **not** require a collection unlock.

This is intentional: an item must always be able to render its own authored look. The collection controls reuse of an appearance as a transmog override, not whether the original item is visible.

## Unknown ids and content evolution

`validateAppearanceCollection()` validates the persisted shape:

- ids are non-empty;
- ids are unique.

It intentionally does not reject an old unknown id stored in a snapshot. Content can be renamed/retired between versions and one stale id should not make an entire saved collection unreadable.

Usage is stricter:

- `unlockAppearance()` refuses to newly unlock an id absent from the live `ItemAppearanceRegistry`;
- a native equipped `itemAppearanceId` must exist in the live registry;
- a transmog `appearanceOverrideId` must exist in the live registry;
- the override must also be present in `unlockedAppearanceIds`.

Thus persistence can survive stale data while runtime selection remains strict.

## Pure unlock operation

`unlockAppearance()` returns a new snapshot and does not mutate the old one.

Unlocking an already-unlocked appearance is idempotent and returns the original snapshot.

V1.3 does **not** decide which gameplay event grants an unlock. That belongs to later gameplay/persistence design.

## Equipment appearance state

V1.3 exposes a renderer-facing visual equipment map:

```ts
type EquippedAppearanceState =
  Readonly<Partial<Record<EquipmentSlot, EquippedItemAppearanceRef>>>;
```

and its resolved counterpart:

```ts
type ResolvedAppearanceState =
  Readonly<Partial<Record<EquipmentSlot, ResolvedItemAppearance>>>;
```

`resolveAppearanceState()`:

1. validates runtime slot names;
2. resolves each native/override visual under collection policy;
3. applies the existing body compatibility/body override rules;
4. returns only resolved visual data.

Gameplay item power never enters this map.

## Body-specific fit remains downstream

Collection authorization selects **which appearance id may be used**.

After selection, `resolveItemAppearance()` still performs the V0.1 rules:

- compatible-body validation;
- semantic geoset mapping;
- body-specific texture overrides;
- body-specific attached-model overrides;
- body socket resolution input.

The resulting `ResolvedItemAppearance` then feeds V1.2.

The collection layer therefore does not duplicate body fitting or renderer logic.

## Persistence handoff for later phases

When account/character persistence is introduced, the minimum stable visual payload is conceptually:

```text
appearance collection:
  unlockedAppearanceIds: string[]

equipped item visual choice:
  itemAppearanceId: string
  appearanceOverrideId?: string | null
```

Ownership/inventory decides the equipped item and its native appearance. Persistence may store an override selection with that equipment state, but the override remains visual-only.

At load time:

1. load authored `ItemAppearanceRegistry` content;
2. load the saved collection snapshot;
3. load the equipped item visual refs from the owning gameplay system;
4. call `resolveAppearanceState()` for the chosen body;
5. pass resolved appearances to the V1.2 adapter.

P9/P12 may choose database tables, account-vs-character collection ownership, migration rules and networking format later. V1.3 deliberately does not pre-implement those systems.

## Validation

Targeted workflow:

- `.github/workflows/v1-3-validation.yml`

Validated by **V1.3 Equipment Appearance Validation #1**, run `37377477971`, commit `a5d061db6cc0af784dd99174527b35ff3dc8cabc`.

Green:

- engine typecheck;
- targeted ESLint;
- `tests/character/productionContract.test.ts` — 6/6;
- `tests/character/appearanceCollection.test.ts` — 6/6;
- total: **2 test files, 12/12 tests passed**;
- production Vite build.

No browser/GPU smoke was added for this checkpoint because V1.3 changes only pure CPU data/policy resolution and does not modify renderer, AssetManager, shaders, GPU resources or browser interaction. V1.2 already validates the resolved-appearance renderer path on WebGL2 and WebGPU.

## Acceptance result

V1.3 now proves:

- normal/native item appearance;
- unlocked transmog override;
- locked override rejection;
- unknown native/override rejection;
- persistence-tolerant stale collection ids;
- body-specific appearance override after authorization;
- visual-only multi-slot equipment resolution;
- no gameplay stats entering the renderer contract.

V1 real-asset contract work is therefore complete. The roadmap proceeds to **V2 — Vanilla-like rendering/material convergence**, beginning with V2.1 terrain 4-layer blending + alpha maps.
