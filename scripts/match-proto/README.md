# match-proto

An isolated prototype of the match-engine split proposed in review/match-engine-split-261110 F1:
the facts of a match come from a probabilistic script of on-ball beats, and the picture is staged
from that script afterwards. It runs ten staged minutes between two synthetic demo squads so the
owner can watch whether staging a script reads as football. Nothing here is production code.

## rules for the whole chain

- Everything lives under `scripts/match-proto/`. Imports come only from inside this folder, Node
  built-ins, `vitest` (tests) and `esbuild` (the viewer's `build.ts` only). Nothing is imported
  from `packages/`, `apps/` or `tests/`, and no task of the chain edits a production file.
- Determinism (ARCH-5): the only randomness is `createRng` in `core/rng.ts`. No `Math.random`,
  `Date.now` or `performance.now` outside `viewer/`. Plain `Math.*` functions are fine here; the
  portable-math lint covers `packages/` only.
- No authored display prose anywhere (ARCH-32 stays untouched): the viewer and the CLIs print only
  digits, symbols and identifiers that come from data (`beat.move`, `beat.kind`, role ids, metric
  ids). No Korean literal in any file. Prose, if ever wanted, must become message IDs in the
  product resources, which is outside this chain.
- Comments and docs are in English. Tests are fast, deterministic unit tests (ARCH-21), and the
  squads are synthetic demo data, marked as such.
- Every tunable number lives in `core/config.ts` under a name.
- Format with `pnpm exec prettier --write scripts/match-proto` before `pnpm run format:check`.

## frames of reference

- World frame: metres, `x` 0-105 along the pitch, `y` 0-68 across. Team 0 (home, code `H`)
  attacks toward `x = 105`; team 1 (away, code `A`) toward `x = 0`. There is no change of ends.
- Attack frame of a team: the frame in which that team attacks toward `x = 105` and `y = 0` is its
  own left touchline. `toAttack` converts world to attack frame and, being its own inverse, back.
- Player index: `team * 11 + slot`; slot 0 is the goalkeeper.

## layout

- `core/` shared contracts: types, vector and pitch helpers, the seeded random generator, the
  config object and the synthetic demo squads.
- `script/` the probabilistic script: the beats a match is made of and their settled outcomes.
- `stage/` the staging: bounded movement of players and ball that performs the script as frames.
- `check/` metrics: machine-checked staging invariants.
- `viewer/` and `build.ts`: a single HTML page that plays the staged minutes.

## commands

- `pnpm exec vitest run --project unit scripts/match-proto` runs the prototype's unit tests.
- `pnpm exec tsx scripts/match-proto/script/print.ts [--seed <s>] [--showcase] [--beats <n>]` prints
  a script as identifiers and numbers: the seed used, the attempts, each showcase quota with its
  count, both teams' `TeamStats` and the first beats (default 40), one per line. `--seed`
  (default `demo`) is the seed, or with `--showcase` the base of the showcase search
  (`script/showcase.ts`: seeds `<s>#0`, `<s>#1`, … until one meets every quota).
- `pnpm exec tsx scripts/match-proto/stage/produce.ts [--seed <s>] [--no-showcase] [--duration <seconds>] [--out <file>]`
  stages a playback (`stage/pipeline.ts`: the showcase scripts of base `<s>`, default `demo`, staged
  until one meets every quota on its performed beats, at most `grammar.showcase.maxStaged`; with
  `--no-showcase` the script of seed `<s>`) and prints `key=value` lines: the seed used, script
  attempts, staged candidates, each quota with its count, `duration`, `score`, the event counts by
  kind and the numbers of `recast` and `stretch` events. `--out` writes the playback as JSON.
- `pnpm exec tsx scripts/match-proto/check/report.ts [--seed <s>] [--no-showcase] [--duration <seconds>] [--json <file>] [--strict]`
  stages a playback as `produce.ts` does and judges it by the staging metrics
  (`check/metrics.ts`, thresholds in `PROTO_CONFIG.limits`): it prints the produce info, the
  script statistics of the performed beats, one line per metric (`id value limit ok|FAIL`, then
  its detail) and `passed n/m`. `--json` writes `{ info, stats, metrics }`; `--strict` exits with
  code 1 when a metric fails (the default exit code is 0). The last ten metrics read open play
  (live, no set piece, no restart beat): `events.shortKick` the share of ordinary passes kicked to a
  receiver almost on the passer, `shape.huddle` how often two outfield teammates stick together
  for longer than allowed and `shape.huddleLongest` the longest such pair, `motion.restarts` how
  often a player starts after a rest, `motion.startSync` the share of starts made together with
  many others, `motion.speedSync` how alike two players' speeds rise and fall (with the share of
  speed samples in each band), `turn.reverse` the share of moving players who turn back as one
  after a settled turnover, `turn.run` and `turn.counterRun` the share of outfield players running
  shortly after a settled turnover and after a counter, and `mark.near` the share of attackers
  without the ball in the last part of the pitch with a defender close.
- `pnpm exec tsx scripts/match-proto/build.ts [--seed <s>] [--no-showcase] [--duration <seconds>] [--out <dir>]`
  stages a playback as `produce.ts` does, judges it by the metrics, bundles `viewer/main.ts` with
  esbuild and writes one self-contained page, `<dir>/index.html` (playback and viewer inline), plus
  `<dir>/playback.json` (default dir `.tmp/match-proto` under the repository root). It prints
  `html=`, `json=`, `bytes=` (the page's size), `seed=` (the seed used) and `passed=<n>/<m>`.
- `pnpm exec tsx scripts/match-proto/build.ts --seed demo --serve [port]` does the same, then serves
  the page at `http://localhost:<port>/` (default `PROTO_CONFIG.viewer.port`, 4310) and prints
  `url=`; stop it with Ctrl-C. Opening `index.html` directly works as well.

## viewer

The page draws the pitch from above with the 22 numbered players (a tick shows where each faces),
the ball with its shadow and height, the score, the clock, the current beat's identifiers
(`#index move · kind · outcome · reason  actor → receiver × opponent`) and flashes for goals,
offsides, saves, blocks, tackles and interceptions. It only interpolates recorded frames (ARCH-7)
and shows no authored prose. Buttons: `▶`/`❚❚` play, `1×` `2×` `5×` speed, the seek bar, and the
toggles `⇥` offside lines, `#` role ids, `∿` the ball's trail.

| key         | identifier                                      |
| ----------- | ----------------------------------------------- |
| `space`     | `play`                                          |
| `1` `2` `3` | `speed`                                         |
| `←` `→`     | `seek` (`PROTO_CONFIG.viewer.seekStep` seconds) |
| `o`         | `offsideLines`                                  |
| `r`         | `roles`                                         |
| `t`         | `trail`                                         |
