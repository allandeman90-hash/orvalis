# Orvalis Art Asset Pipeline

Updated: 2026-10-09

## Goal

Orvalis must not depend on either the user or the assistant being a professional 3D artist. The production path is therefore asset-selection first, then technical normalization, then Orvalis-specific rendering.

The visible target is a dense, stylized MMO world: simple meshes are acceptable, but the final result must feel coherent through palette, material treatment, vertex lighting, fog, shadows, foliage motion, batching and composition.

## Mandatory asset states

1. **candidate** — external asset is only being visually reviewed; it may be loaded from an external review URL.
2. **vetted** — licence, author, source and style are accepted.
3. **local** — the exact approved source file is copied into the Orvalis repository or owned asset storage. Production must never depend on a third-party CDN copy.
4. **normalized** — scale, axis, pivot, materials, naming, collision/LOD metadata and texture policy follow Orvalis conventions.
5. **runtime** — the asset is imported through the Orvalis production asset path and can participate in batching/instancing.
6. **approved** — it passed integrated visual review under Orvalis lighting/shaders.

## Licence rule

Nothing enters production without a registry record containing:
- stable asset id;
- title/category;
- author;
- licence;
- original source URL;
- local file path once copied;
- any modifications made by Orvalis.

Prefer CC0 for environment kits. CC-BY may be used only when attribution is intentionally accepted and recorded. No NC, ND, ripped-game or unclear-licence assets.

## Art review page

`engine/public/art-review.html` is a review-only gallery. It gives every candidate the same camera, ground, lighting, fog and material normalization pass so style differences are obvious.

Current first candidates:
- Quaternius — Pine Trees — CC0 — `https://poly.pizza/m/oYtDty0fR6`
- Quaternius — Rocks — CC0 — `https://poly.pizza/m/OQvi8PIZ40`
- Kay Lousberg — Lantern — CC0 — `https://poly.pizza/m/CtHBJ1ufeW`

The review page temporarily loads public mirrors from an external CDN. This is deliberately **not** the shipping architecture. An approved candidate must be copied locally before runtime integration.

## Orvalis normalization target

Environment assets should converge through the same rules rather than being accepted raw:
- meters/world-scale normalized to Orvalis units;
- sensible ground pivot and forward axis;
- no accidental metallic look; mostly rough, stylized surfaces;
- vertex colours preserved where useful;
- alpha foliage prepared for stable mipmaps/alpha testing;
- shared materials/atlases preferred where batching benefits;
- deterministic colour/scale variation supplied by runtime instances, not dozens of duplicate meshes;
- LOD/culling/instance metadata added before dense world use.

## Character exception

Characters are stricter than static environment assets. Random AI-generated or marketplace meshes are not accepted directly as production player bodies. Production characters need a controlled topology/rig/skeleton/UV/equipment contract so animations and transmog remain stable.

## Immediate sequence

A0.1 — art-review gallery + registry.

A0.2 — approve a small environment seed kit and copy the exact source assets locally.

A0.3 — build the smallest practical GLB-to-Orvalis production ingestion/normalization path for static environment meshes. Do not rewrite the renderer or invent a custom binary format unless profiling later proves it necessary.

A0.4 — put the approved assets under Orvalis materials/lighting and prove repeated instances can form a dense scene without looking like raw asset-pack placement.
