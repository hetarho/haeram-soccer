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
  `Date.now` or `performance.now` outside `viewer/`, except `check/report.ts` timing its own run
  (`fit.writeMs`, `fit.stageMs`): a CLI outside `stage/` whose two numbers are printed, never fed
  back. Plain `Math.*` functions are fine here; the portable-math lint covers `packages/` only.
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
- `fixtures/settled/`: ten settled production matches (`## settled matches`).

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

## settled matches

`fixtures/settled/s01.json` … `s10.json` are ten production matches settled by the aggregate path
(the core sample's top-tier pairs, each side on 4-3-3 possession or 4-4-2 counter, in the latest
year without substitutes), the material a script is fitted to (T820). Each lists every attempt
with who made it and how it ended, every shot, every foul and card, and the record's team and
player rows; identifiers and numbers only. `core/settled.ts` owns the format: `Settled` and its
row layouts (`EV`, `SH`, `FO`, `CA` name the columns; the code lists `EVENT_KINDS`,
`SET_PIECES`, `EVENT_RESULTS`, `SHOT_KINDS`, `SHOT_OUTCOMES`, `TEAM_ROW`, `PLAYER_ROW`),
`readSettled` validates a file and `fixtureOf` gives its 22 players as a `Fixture`. They are
written by `pnpm exec tsx scripts/export-settled.ts --out scripts/match-proto/fixtures/settled`
(`--count`, `--year`), whose header states how a move group becomes attempts; the same run gives
the same bytes.

## fitted scripts

The record is the fact: a fitted script performs every settled attempt, shot and foul exactly
once, with its actor, cells, kind and result. The writer chooses only the order, the receivers,
the points inside the cells, the clock and the connective tissue between events. Connective tissue
is only what the record does not count: a carry that is not one of the record's (`link`), a heavy
touch that loses the ball (`miscontrol`) and a restart's delivery when no recorded pass is left to
make it (`restart`); a connective pass in open play does not exist.

- `fit/touches.ts` deals every row a minute (`dealMinutes`: shots, their sources and booked fouls
  keep the record's minute, the rest are dealt evenly from the seed) and gathers players' spells on
  the ball (`buildTouches`); `fit/write.ts` (`writeFitted`) joins them greedily by the nearest cell
  into a `Script` marked `bound`; `fit/validate.ts` (`validateFitted`) checks every row is played
  once as recorded and the ball is handed on from where it was left; `fit/count.ts` counts the
  record's rows back from the beats alone (`countScript`, `compareRecord`) and prices the joins
  (`fitCost`). `fit/cells.ts` holds the cell geometry and dead-ball spots both sides share.
- `pnpm exec tsx scripts/match-proto/fit/print.ts --match s01 [--beats <n>] [--seed <s>]` prints
  the match id, `mismatches=` and `problems=` (both 0 for a valid script), the cost line and the
  first beats; `--match all` prints the first three lines of every settled match.
- The cost: `beats` and `counted` (beats that perform a row), `links` and `linkMetres` (carries
  that take the ball to where the next row starts), `miscontrols` (balls lost without an event),
  `connectiveRestarts` and `countedRestarts` (deliveries without and with a recorded pass),
  `orphanSetPieces` (recorded corner or free-kick deliveries played from open play),
  `orphanFreeKickShots` (direct free kicks without a foul to take them from), `movedCarries`
  (carries moved to another minute to find their player's release) and `maxOverrun` (the most
  seconds a minute's beats needed beyond sixty; such a minute is pressed into its sixty seconds so
  every beat keeps its record minute).
- Yellow cards are taken from the record's card rows: no beat carries a booking.

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
