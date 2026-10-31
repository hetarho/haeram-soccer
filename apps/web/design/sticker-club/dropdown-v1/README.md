# Sticker Football Club dropdown resources

Implemented working artwork, 2026-10-31. Thin rounded vanilla matte plates and a light sunny-yellow selected row.

The closed trigger now reuses the current tertiary clay plate at a compact 32px visible height,
so its rounded green rim and matte depth match the surrounding controller buttons. Its runtime
alias points to `image-art-control-tertiary`; the new atlas trigger remains source review output.
In the transport its visible height is 44px to match the neighbouring buttons. The popup also
reuses that cream clay plate, with wider visible caps and padded content; its selected row uses
the current sunny-yellow primary plate. The three generated atlas plates remain retained
working alternatives. These runtime aliases match the established raised matte controls.

The trigger, floating popup and selected option have separate nine-slice plates. Labels, hints, chevrons, checkmarks and focus remain live HTML/SVG. This family replaces the dropdown role only; editable text fields keep their existing resources.

- Original atlas: [sources/plates.png](sources/plates.png). Exact built-in image_gen prompt and alpha choice: [prompts.json](prompts.json).
- Web files: `public/art/sticker-club/dropdown-v1/frame-{trigger,popup,selection}.webp` (paths relative to `apps/web/`).
- [Runtime manifest](../../../public/art/sticker-club/dropdown-v1/generation.json) records source hash, crops, dimensions, source-pixel caps and output hashes.
- Regenerate all four packs with `node scripts/prepare-dropdown-art.mjs` from the repository root. It reuses `createUiArtPipeline` and complete-silhouette atlas slicing; smooth blank plates normalize to 192x64 with 22px source caps, while pixel plates retain 128x128 and 16px caps.

The shared Select uses body typography (13px; 14px for the native pixel font), compact 32px desktop/36px mobile option rows, 44px closed-control touch targets and a 280px scroll limit. Selected-row foreground and frame widths live in the theme pack. Resources were reviewed in live desktop and mobile controls and recruitment filters; automated verification remains part of design-mode closeout.
