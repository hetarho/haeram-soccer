# Pixel art dropdown resources

Implemented working artwork, 2026-10-31. Native 128px integer-grid stepped plates, lossless PNG and a restrained green selected row.

The trigger, floating popup and selected option have separate nine-slice plates. Labels, hints, chevrons, checkmarks and focus remain live HTML/SVG. This family replaces the dropdown role only; editable text fields keep their existing resources.

- Editable native source: [source.mjs](source.mjs).
- Web files: `public/art/pixel/dropdown-v1/frame-{trigger,popup,selection}.png` (paths relative to `apps/web/`).
- [Runtime manifest](../../../public/art/pixel/dropdown-v1/generation.json) records source hash, crops, dimensions, source-pixel caps and output hashes.
- Regenerate all four packs with `node scripts/prepare-dropdown-art.mjs` from the repository root. It reuses `createUiArtPipeline` and complete-silhouette atlas slicing; smooth blank plates normalize to 192x64 with 22px source caps, while pixel plates retain 128x128 and 16px caps.

The shared Select uses body typography (13px; 14px for the native pixel font), compact 32px desktop/36px mobile option rows, 44px closed-control touch targets and a 280px scroll limit. Selected-row foreground and frame widths live in the theme pack. Resources were reviewed in live desktop and mobile controls and recruitment filters; automated verification remains part of design-mode closeout.
