# T371 screens (calibration round 52, same seeds)

Rows with their [95%] intervals are in `t371-screen-rows.md` (`t371-table.mts`); what each tactic
concedes a match comes from `t371-profile.mts`. Base is T370's kept football (3acb70b2). Sizes:

- full: `--set all --per 60 --core 600 --gap 60` (16 pairings × 60 a venue, 600 core, 17 gap buckets × 60)
- pairing: `--set all --per 150 --core 0 --gap 0` (16 × 150; MATCH-29 only), reference e0
- core: `--set none --core 2400` (MATCH-23 and MATCH-30 only), reference f0

Settings that patch a shared config (`duel.cross`, `shot.block`) were screened through it, since the
script plays only the candidate; the later screens use the candidate hooks of a18f8e11–81d6f3b6.

| setting | size | patch |
|---|---|---|
| base | full | T370's h6, no patch |
| a1 | full | failed crosses over the byline 0.15 → 0.08 (`duel.cross.failOut`) |
| a2 | full | shot block base 0.4 → 0.5 (`shot.block.base`) |
| b1 | full | shot line weights FW 0.36 → 0.33, MF 20 → 21.5 |
| b2 | full | box fouls kept 0.05 → 0.06 (`duel.candidate.boxFoul`) |
| b3 | full | FW 0.31, MF 23 |
| c1 | full | balanced's block 6 → 9 m deeper without the ball (`defend` −9) |
| c2 | full | balanced's `compact` 0.38 → 0.45 |
| c3 | full | balanced `defend` −8, back line 24–45 → 22–42 |
| d1 | full | balanced steps up 4 → 2 m with the ball (`advance` 2) |
| d2 | full | balanced press reach 10 → 12, counter-press 12 → 8 |
| d3 | full | a1 at 0.1 + box fouls 0.065 + block base 0.45 |
| e0 | pairing | no patch (reference) |
| e1 | pairing | balanced's lateral shift without the ball 0.25 → 0.4 (`shape.candidate.lateral`) |
| e2 | pairing | balanced's marking lean 0.4 → 0.6 (`shape.candidate.markBlend`) |
| e3 | pairing | balanced's lateral shift 0.25 → 0.12 |
| g1 | pairing | balanced's settled play below halfway: long +0.3, back ×0.8 (`decide.direct.settled.balanced`) |
| g2 | pairing | d2 |
| g3 | pairing | balanced's settled play below halfway: long +0.6, back ×0.6, lateral ×0.8 |
| g4 | pairing | g2 + g3 |
| f0 | core | no patch (reference) |
| f1 | core | failOut 0.08, cross target spread 8 → 12, box fouls 0.06, block base 0.45 |
| f2 | core | target spread 14, FW 0.34, MF 21 |
| f3 | core | candidate crossFailOut 0.08, box fouls 0.06, FW 0.32, MF 22.5, shotScale 0.45 → 0.47 |
| r1 | core | the keeper gathers 0.47 of the failed crosses running out (`duel.candidate.crossKeeper`), box fouls 0.06, FW 0.32, MF 22.5, shotScale 0.47 |
| r2 | core | r1 with FW 0.30, MF 22.5, DF 3.2 → 4.5, shotScale 0.475 (validated as R) |
| r3 | core | r1 with FW 0.30, MF 23.5, shotScale 0.48, longShotScale 3.5 → 3.3 |
| r4 | core | r1 with FW 0.31 and candidate target spread 14 |

Validated: R = r2, and RB = r2 + g4.
