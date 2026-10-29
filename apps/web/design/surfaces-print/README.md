# Matchday Print: three material planes

Implemented working artwork, 2026-10-29. Three distinct neutral planes implement the approved
hierarchy in [WEB-91](../../../../spec/ssot/WEB.md). Exact colours and texture are the current
working treatment; the [shared guide](../DESIGN-SYSTEM.md) owns reusable authoring guidance.

| Level    | Purpose                      | Existing/shared role                               | Source and deployment                                              | Encoded mean / relative luminance |
| -------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| 1 Canvas | Quiet page backdrop          | `image-canvas-material` → `image-art-paper`        | `sources/canvas-grain-v2.png` → `surfaces-v1/canvas-grain-v2.webp` | `#c5af90` / 0.4448                |
| 2 Sheet  | Main content group           | `image-quiet-material` → `image-art-paper-quiet`   | `sources/sheet-grain-v2.png` → `surfaces-v1/quiet-grain-v2.webp`   | `#e4d1b3` / 0.6553                |
| 3 Detail | Record cards and inset facts | `image-detail-material` → `image-art-paper-detail` | `sources/detail-grain-v2.png` → `surfaces-v1/ivory-grain-v2.webp`  | `#f6f0e4` / 0.8756                |

These are three authored opaque materials, not one texture tinted with CSS. Each repeats at
256px and retains visible pulp fibres/flecks at that actual size. The three encoded papers
total 15112 bytes. The separate retained 160px neutral grain is encoded as WebP (22094 bytes),
preserving its appearance while reducing its previous PNG transfer cost. The original paper roles
are rebound instead of registering duplicate copies; original home artwork and provenance
remain available. Labels, dates, scores, links and controls stay live HTML.

[prompts.json](prompts.json) retains the original prompts; [grain-prompts-v2.json](grain-prompts-v2.json)
records the three built-in image edits and references used to restore visible texture. The
first fine-grain sources are retained as earlier drafts; their reduced encodings looked flat
and are no longer deployed. Regenerate with
`node apps/web/design/surfaces-print/build.mjs`; the existing `createUiArtPipeline` encodes WebP
and records dimensions, hashes and optimization metadata in the
[manifest](../../public/art/matchday-print/surfaces-v1/generation.json).
The luminance measurements above are averaged from the encoded pixels in linear sRGB, not
inferred from fallback hex tokens. The two neighbouring gaps are 0.2105 and 0.2203. Encoded luminance standard deviations are
0.0224, 0.0209 and 0.0195: grain remains visible after preparation.

Neutral content frames and inset frames are disabled by Matchday Print aliases. The unused
content-sheet frame is retained in its source/manifest but removed from the active pack
preload list. The registered UI resources total 299269 bytes, within the existing 300000-byte
budget; the new paper tiles keep their full 256px detail. The material
planes and their existing spacing separate groups. Input/button/badge artwork, functional
selection cues, fine table rules and keyboard focus retain their own semantic roles. Pitch
art remains on its separate analysis material. The deeper canvas requires readable dark text;
muted and semantic foreground tokens were adjusted alongside the materials.

## Shared Card

[Card.tsx](../../src/ui/Card.tsx) is an app component, used by the fixture notebook and shown in
the `cards` workbench story. It defaults to an `article` on the detail plane. `as` can be
`article`, `section` or `div`; `surface` can be `sheet` or `detail`. `meta`, `title`, children
and `actions` are optional live React content. Standard HTML attributes are forwarded.

```tsx
<Card
  title={<ClubLink w={w} id={opponent.id} />}
  meta="프리미어리그 · 홈 경기"
  actions={<button onClick={openReport}>분석 보기</button>}
>
  <b>우리 승 2–1</b>
</Card>
```

The component owns one compact inset and vertical rhythm; the theme owns materials and edge
policy. A sheet card has a stronger heading than a detail card; supporting metadata and the
body remain smaller. Cards are not implicitly clickable: the actual link/button is the
interactive target, so action semantics and 44px targets remain clear.

The fixture notebook is a sheet over the canvas, with detail cards for individual games.
Its filters, pagination, completed/upcoming facts and report/material actions are preserved.
Other themes inherit their existing quiet material/frame if they do not provide detail roles;
this iteration does not redesign those themes or workbench administration chrome.
