# Matchday Print result badges

Implemented working artwork for wins, draws and losses in the next-match detailed report.
The shared `ResultBadge` draws either a compact outcome or an outcome with its score, and
the design-system `badges` story displays both forms, including a double-digit score.
Recent results for both teams and their head-to-head meetings use this same component.

| Outcome | Artwork                                                    | Role                          |
| ------- | ---------------------------------------------------------- | ----------------------------- |
| Win     | Deep green printed ticket with an ivory double keyline     | `image-art-result-win-badge`  |
| Draw    | Muted ochre printed ticket with an ivory double keyline    | `image-art-result-draw-badge` |
| Loss    | Deep vermilion printed ticket with an ivory double keyline | `image-art-result-loss-badge` |

These informational skins are separate from venue badges, action emphasis and rating tiers.
Each has a filled, grained centre and transparent clipped corners. Outcome labels, accessible
names and scores remain live; all registered locale packs supply `result.{win,draw,loss}` and
their `.label` messages. Scores retain left-to-right team order in right-to-left locales.

Shared skin CSS uses `result-{win,draw,loss}-badge-{frame,slice,fill,text}` and
`result-badge-frame-width`. Native source dimensions and fixed source-pixel caps live in the
theme JSON and generation manifest, independently of the displayed edge width.
Other themes explicitly reuse their own secondary, tertiary and ticket art, with local ink;
the new print resources belong only to the print pack.

`prompts.json` records the exact three built-in image_gen edit prompts and ticket reference.
`sources/{win,draw,loss}.png` retains the original outputs. The deployed WebP files, encoding
metadata and source/output hashes are in `public/art/matchday-print/result-badges-v1/`.

From the repository root, regenerate with:

```sh
node apps/web/design/matchday-print/result-badges/build.mjs
```

Preparation uses the existing `createUiArtPipeline` bounds and compact WebP policy, requiring
project dependencies, Chromium, ffmpeg and ffprobe. The encoded resources were inspected;
the treatment awaits the owner's screen review. Tests and final verification remain deferred
while this checkout is in design mode.
