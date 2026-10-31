# Controller background proposals

Status: the owner selected **G1** on 2026-10-31 and it is applied to the active pack.
The other two candidates remain alternatives. Review the real ProgressControls component in
`/design-system?story=controller-backgrounds&theme=standard`.

Candidates: G1, G2, G3. Names, foregrounds and descriptions live in
`src/design-system/controllerBackgroundOptions.ts`. Exact generation prompts are in
[prompts.json](prompts.json). Original built-in image tool outputs live in `sources/`; review tiles are 256px WebP.

Regenerate preview tiles with `node scripts/prepare-controller-concepts.mjs`.
It reuses the shared UI-art pipeline and records source/output hashes and native tile
metadata in `tiles/generation.json`. Deploy the selected material with
`node scripts/prepare-controller-backgrounds.mjs`, followed by the standard artwork optimizer.
The active resource and native metadata live in `public/art/standard/controller-v1/`.
Disposable galleries and captures belong under `.tmp/`.
