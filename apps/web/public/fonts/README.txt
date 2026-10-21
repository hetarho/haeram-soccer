Haeram pixel typography — self-hosted with no runtime font CDN requests.

Galmuri14 Regular: reading copy at 15 CSS px.
Galmuri11 Regular and Bold 2.40.3: compact labels, headings, controls and numbers.
Creator: Lee Minseo (quiple)
Repository: https://github.com/quiple/galmuri
Galmuri14 source, pinned to the inspected upstream tree:
https://github.com/quiple/galmuri/blob/71e1cacf1437a11220307120e63e30bc275312d4/dist/Galmuri14.woff2
Galmuri11 source: https://cdn.jsdelivr.net/npm/galmuri@2.40.3/dist/
License: SIL Open Font License 1.1, original copyright notice and terms in Galmuri-OFL.txt.
All font outlines are unmodified. No condensed Latin font or size-adjust is applied.

WOFF1 compatibility representations (2026-10-21)

Each .woff is converted only from the corresponding checked-in .woff2 above.
No glyphs are added, removed, substituted or edited. The original WOFF2 files and
Galmuri-OFL.txt copyright/license text are retained unchanged.

Reproducible conversion: Python fontTools 4.65.0 + brotli 1.2.0, installed in a
disposable /tmp venv (no project or global Python dependency changes):

    font = TTFont(source, recalcBBoxes=False, recalcTimestamp=False)
    font.flavor = "woff"
    font.save(target)

For each pair, SHA-256 comparisons of glyph order, best cmap, every horizontal
advance/side-bearing (hmtx), and RecordingPen outline commands for every glyph
are identical. unitsPerEm, hhea ascent/descent/lineGap and extent metrics, and
OS/2 typo/win ascent/descent/lineGap metrics are also identical.

basename           glyphs   WOFF2 bytes   WOFF1 bytes
galmuri14          19225    564764        955480
galmuri11          20968    504736        878292
galmuri11-bold     12698    166632        365196

Converted file SHA-256:
galmuri14.woff: d92b539965468cdab8efd525024068b3813da0291ba119ec38504d57928525a5
galmuri11.woff: 90d9623aa968c70a641b2bbb32bbff3dfa90f5327febbde12b8c296d6982fef5
galmuri11-bold.woff: 51d2cb63241ed71a9dc7b8841345ee21516c0f043a05639d0208ee76a88be776

pixel.json keeps WOFF2 primary and declares WOFF1 as an ordered alternative for
each face. The common loader creates a separate detached FontFace per source,
awaits load(), and stops at the first success. Only that loaded face is registered
at theme commit; all sources failing still rejects the required theme.

Compatibility proof: a native comma-separated WOFF2/WOFF1 FontFace source list
stalled in WebKit 26.6 without requesting WOFF1. Separate sequential loads let
the WOFF2 NetworkError reject and the same-font WOFF1 succeed. Chromium and
Firefox load the first WOFF2 and make zero WOFF1 requests. This policy uses no
browser identification or font-error bypass.
