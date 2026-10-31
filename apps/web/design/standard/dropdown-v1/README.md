# Stadium Green dropdown resources

Implemented working artwork, 2026-10-31. Deep matte forest-green plates and a pale sage selected row.

The runtime trigger and popup reuse `image-art-control-dropdown`; selection reuses the mint `image-art-frame-stamp`. These established resources keep a visible perimeter at the actual display size. The generated atlas plates remain retained working alternatives. Labels, hints, chevrons, checkmarks and focus remain live HTML/SVG. This family replaces the dropdown role only; editable text fields keep their existing resources.

- Original atlas: [sources/plates.png](sources/plates.png). Exact built-in image_gen prompt and alpha choice: [prompts.json](prompts.json).
- Web files: `public/art/standard/dropdown-v1/frame-{trigger,popup,selection}.webp` (paths relative to `apps/web/`).
- [Runtime manifest](../../../public/art/standard/dropdown-v1/generation.json) records source hash, crops, dimensions, source-pixel caps and output hashes.
- Regenerate all four packs with `node scripts/prepare-dropdown-art.mjs` from the repository root. It reuses `createUiArtPipeline` and complete-silhouette atlas slicing; smooth blank plates normalize to 192x64 with 22px source caps, while pixel plates retain 128x128 and 16px caps.

The shared Select uses body typography (13px; 14px for the native pixel font), compact 32px desktop/36px mobile option rows, 44px closed-control touch targets and a 280px scroll limit. Selected-row foreground and frame widths live in the theme pack. Resources were reviewed in live desktop and mobile controls and recruitment filters; automated verification remains part of design-mode closeout.
