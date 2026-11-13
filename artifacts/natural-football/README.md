# Natural football comparison

The standalone comparison shows the same frozen fixture on two pitches: baseline main `9b701adf` and the reviewed natural-football candidate. The settled inputs and records match. Both pitches share one clock, real-time 1x, play/pause, speed and seek; Space toggles playback and the arrow keys move five seconds. The generated page embeds its data and opens offline.

Local delivered page: `.tmp/natural-football/index.html`, served at `http://localhost:19610/`. Production tool sources are `scripts/natural-football/`; generated full-match datasets and raw receipts remain in `.tmp/nf14-evidence/` in the coordinator checkout. Small durable measurements are in [261114-measurements.json](261114-measurements.json).

## Fixed comparison

ENG, 2024, club `ENG:0:0:0`, first own league fixture, seeds `viewer-2`, `viewer-3`, `viewer-4`. Baseline and candidate use identical inputs, squads and settled records; the support-only step also keeps the full actual record and script hashes identical to the preceding candidate. The builder compares actual normalized records and frozen squads as well as provenance hashes, so changed score/player facts cannot pass by retaining an old hash.

| Proxy, per seed 2 / 3 / 4 | Baseline | Final support candidate |
|---|---|---|
| Close-pressure holding spells of 2 s or longer | 96 / 99 / 97 | 38 / 38 / 29 |
| Circling under pressure | 126 / 149 / 118 | 68 / 77 / 58 |
| Lost passes aimed at nobody | 37 / 35 / 25 | 20 / 21 / 19 |
| Uncalled offside receiver positions at the kick | 5 / 5 / 4 | 0 / 0 / 0 |
| Opposing pairs within 3 m for at least 20 s | 31 / 38 / 42 | 21 / 15 / 33 |

These are observational proxies on three fixed matches. They do not establish universal realism. The final support-angle step changes blocked support options from 3483/23096 (15.081%) to 3421/22923 (14.924%): two fixtures improve and one worsens. Some pressure, circling and sticking counts also worsen relative to the preceding repaired candidate; their full raw values are retained in the JSON. No production threshold was loosened. Pace and chained result flows remain separate work.

## Rebuild

Export each installed checkout with the same fixture options, then build and smoke the page:

```sh
pnpm exec tsx scripts/natural-football/export.ts --repo /path/to/baseline-checkout --out /tmp/baseline.json.gz --seed viewer-2
pnpm exec tsx scripts/natural-football/export.ts --repo /path/to/candidate-checkout --out /tmp/candidate.json.gz --seed viewer-2
pnpm exec tsx scripts/natural-football/build.ts --baseline /tmp/baseline.json.gz --candidate /tmp/candidate.json.gz --out /tmp/natural-football/index.html --locale ko-KR
pnpm exec tsx scripts/natural-football/smoke.ts --page /tmp/natural-football/index.html --screenshot /tmp/natural-football/desktop.png
```

The frozen baseline commit is retained in Git history. A changed fixture input or settled record fails the build. Raw sampled metrics use the unchanged remote measurement scripts captured by hash in the JSON; the full-precision displayed pressure diagnostic may differ by one threshold-boundary sample from the rounded export proxy.

## Football references

The movement hypotheses follow [FIFA's support and passing-angle session](https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/sessions/support-and-off-the-ball-movements.php), [central-midfielder support](https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/position-specific-training/game-situations-developing-central-midfielders.php) and [pressure with central cover](https://www.fifatrainingcentre.com/en/practice/training-perspectives/mid-block-instincts/introducing-mid-block-instincts-in-small-units.php). Receiver timing follows [IFAB Law 11](https://www.theifab.com/laws/latest/offside/): position at the kick, with the direct goal-kick, throw-in and corner exemptions preserved. These sources motivate the rules; the experiment's numerical effects come from this repository's fixed runs.
