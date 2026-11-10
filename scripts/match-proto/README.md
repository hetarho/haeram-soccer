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
