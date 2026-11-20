# Large stadium and locker-room scenes (stages 9 and 10)

Working pixel artwork for the two largest stadium steps in ECON-32 — stage 9 (a 105,000-seat
rebuilt bowl) and stage 10 (an upper third tier) — and for the finished locker room that goes with
each step, in each of the three eras (heritage, terraces, contemporary). Twelve scenes in all.

- `source.mjs` is the editable 240×80 integer grid. Each pixel is computed from its coordinates and
  the era palettes, so the output is byte-stable and needs no browser.
- `sources/{era}-{kind}-{stage}.png` are the lossless RGB sources the prepare step writes.
- The deployed files are `apps/web/public/art/scenes/{era}/{kind}-{stage}.webp`, the same
  `{era}/{kind}-{stage}` slots the pixel pack resolves for stages 0–8 (no theme change needed).
- `generation.json` records every source and deployment hash, byte count and dimension.

Rebuild and verify from the repository root:

```sh
node apps/web/design/pixel/large-stadium-v1/prepare.mjs          # write sources and deployment files
node apps/web/design/pixel/large-stadium-v1/prepare.mjs --check  # decode and compare every file
```

`--check` decodes the deployed WebP files with ffmpeg and requires them to equal the generator's
pixels, so the encoding is lossless and decodable. The unit test `large-stadium.test.ts` checks the
committed sources, record, headers and hashes, and that no new file repeats a shipped scene.

## Composition

- Stadium: a night bowl whose roofline falls from the corners to the centre, with stand bands
  that follow it, floodlight masts above the roof and a pitch with a goal at the far touchline.
  Stage 9 has four tiers. Stage 10 adds a fifth tier at the top, shown in each era's upper-seat
  colour, and raises the corners.
- Locker room: a finished room with pendant lamps, a window band, two banks of lockers with shirts
  and a central table with a ball, a green rug and a tiled floor that reflects the lamps. Stage 9
  adds a trophy cabinet. Stage 10 adds a gallery rail and a glass showroom wall on the right.

## Status and limits

- Working artwork awaiting the owner's visual review. It is not an approved product rule.
- The art has no text, no club branding and no embedded capacity, and it does not change any
  engine fact. Stage 9 and 10 selection stays off until the engine maximum rises (T1051).
- The shared 72-asset `public/art/manifest.json` is intentionally unchanged, because the stage
  9–10 entries belong to the step that enables them. `generation.json` is this family's record.
