# Matchday Print dropdown resources

Implemented working artwork, 2026-10-31. Warm ivory print plates, small clipped corners and a pale vermilion selected row.

The current runtime uses the established `image-art-frame-ticket` for the closed trigger and
popup, preserving its visible charcoal/vermilion perimeter, and `image-art-frame-stamp` with
cream text for the selected row. The thinner generated atlas plates below remain working
alternatives; their keylines were too faint at small display sizes.

The trigger, floating popup and selected option have separate nine-slice plates. Labels, hints, chevrons, checkmarks and focus remain live HTML/SVG. This family replaces the dropdown role only; editable text fields keep their existing resources.

- Original atlas: [sources/plates.png](sources/plates.png). Exact built-in image_gen prompt and alpha choice: [prompts.json](prompts.json).
- Web files: `public/art/matchday-print/dropdown-v1/frame-{trigger,popup,selection}.webp` (paths relative to `apps/web/`).
- [Runtime manifest](../../../public/art/matchday-print/dropdown-v1/generation.json) records source hash, crops, dimensions, source-pixel caps and output hashes.
- Regenerate all four packs with `node scripts/prepare-dropdown-art.mjs` from the repository root. It reuses `createUiArtPipeline` and complete-silhouette atlas slicing; smooth blank plates normalize to 192x64 with 22px source caps, while pixel plates retain 128x128 and 16px caps.

The shared Select uses body typography (13px; 14px for the native pixel font), compact 32px
desktop/36px mobile option rows and a 280px scroll limit. Border plus padding total 6px per
popup side. Closed controls keep 44px touch targets. Selected-row foreground and frame widths
live in the theme pack. Resources were reviewed in live desktop and mobile controls and
recruitment filters; automated verification remains part of design-mode closeout.
