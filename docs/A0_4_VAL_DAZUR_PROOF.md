# A0.4 — Val d'Azur organic production-art proof

Date: 2026-10-10

## Scope

This checkpoint is deliberately limited to the first visible production-art proof for Slice A. It does not migrate the legacy world map and does not start P9.

## Inputs validated in A0.2/A0.3

- `MF-VAL-TREE-001` — stylized oak — CC0 — 17,802 runtime triangles.
- `MF-VAL-ROCK-001` — low-poly rock — CC0 — 2,152 runtime triangles.
- `MF-VAL-FENCE-001` — low-poly wooden fence — CC0 — 10,060 runtime triangles.

The canonical downloaded/normalized GLBs remain the source/runtime assets. The GitHub Pages proof uses a derived compact review payload only because the current connector cannot directly publish the local GLB files as repository binaries.

## Proof implementation

Public entry point after Pages deployment:

`/val-azur-slice-a.html`

Local review payload:

`engine/public/assets/val-azur/seed-geometry.ovg.gz`

Manifest/provenance:

`engine/public/assets/val-azur/seed-manifest.json`

The page reconstructs the real seed mesh geometry in the browser, using quantized positions, baked base-color vertex colors and original triangle indices. Normals are recomputed client-side for the review scene.

## Organic-world checks represented

- continuous terrain instead of a visible square region grid;
- winding Catmull-Rom road;
- irregular tree line placement;
- rocks distributed around the road and landscape;
- two non-grid fence lines suggesting fields;
- small natural-water landmark;
- camera views for overview and road-level reading;
- no Meshy/CDN model dependency at runtime.

The Three.js library still comes from the same jsDelivr review dependency already used by `art-review.html`; the production asset payload itself is local to Orvalis.

## Important limitation

This is an art-direction/density proof, not the final engine ingestion path. Do not treat `OVG1` as the canonical Orvalis asset format. The next engine-facing step must consume the normalized GLB assets through the real model/asset pipeline and preserve provenance.

## Next coherent block

1. visually validate the deployed A0.4 proof;
2. keep/reject the three seeds based on the actual scene rather than isolated previews;
3. acquire the next small coherent Slice A families (vegetation variation + one architecture/prop family), packs first;
4. then wire normalized GLBs into the real runtime scene/streaming path rather than expanding this review page indefinitely.
