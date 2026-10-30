# Matchday Print home/away badges

Implemented working artwork for the home and away badges in the home page's NEXT MATCH row.
The real `HomeAwayBadge` also appears in the design-system `badges` story. It is informational,
with live locale-selected labels; neither text nor game facts are baked into the skins.

| Side | Artwork                                                   | Live ink   | Registered role              |
| ---- | --------------------------------------------------------- | ---------- | ---------------------------- |
| Home | Deep vermilion printed ticket, warm ivory double keyline  | Warm ivory | `image-art-match-home-badge` |
| Away | Slate blue-grey printed ticket, warm ivory double keyline | Warm ivory | `image-art-match-away-badge` |

Both are nine-slice images with filled centres and transparent clipped corners. Source-pixel
caps and encoded dimensions live in the theme JSON and generation manifest. The component
owns compact geometry; shared skin CSS consumes `match-{home,away}-badge-{frame,slice,fill,text}`.
These venue meanings do not redefine action priority or sporting result colours.

The print pack draws its 22px source caps at an 8px display width so the ivory double keyline
survives a compact badge. Keep `match-badge-frame-width` separate from source insets. Fallback ink
fills only the content box, preserving the artwork's transparent clipped corners.

The other shipped themes explicitly map the same venue roles to their existing secondary
and tertiary control artwork and matching local foregrounds. Those are deliberate resource
reuses in their own art families, not new generated badge illustrations.

`prompts.json` retains both exact built-in image_gen edit prompts and the reference path;
`sources/home.png` and `sources/away.png` retain the original generated outputs. Deployed
resources and their hashes/provenance live in `public/art/matchday-print/home-away-badges-v1/`.

From the repository root:

```sh
node apps/web/design/matchday-print/home-away-badges/build.mjs
pnpm run art:check
pnpm run validate:presentation
```

Preparation uses the shared `createUiArtPipeline` and encoding policy. It requires project
dependencies, Chromium, ffmpeg and ffprobe, and synchronizes the print pack's metadata.
Browser verification belongs to ARCH-30's final coordinator gate; disposable captures go in `.tmp/`.
