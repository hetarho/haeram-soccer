# T803 — who keeps winning: league title runs and the Ballon d'Or winner read

Read 261111 on a darwin-arm64 host, on aa70afdb with this task's script changes
(`scripts/era-wage-spread.ts --champions-runs`, `scripts/ballon-dor-podiums.ts` winner columns and
`--variants`, the counting functions in `scripts/lib/title-runs.ts` and `scripts/lib/ballon-dor-winners.ts`).
No engine, SSOT or save change; no world was lived for the runs read.

## League title runs (`champions-runs.md`)

Inputs, unpacked into the session's scratch folder (never into the tree) and named in the table by folder:

| folder in the table | archive | worlds |
|---|---|---|
| `T698-placebos/` | `artifacts/benchmarks/T698/placebos.tar.gz` | `check-0` (the released world re-lived, seed 0) and the 76 placebo worlds (19 sets × owner-balance-0…3) |
| `T697-rows/cost/` | `artifacts/benchmarks/T697/rows.tar.gz` | `released-0…3` (released) and `t696-0…3` (T696's candidate: table + means level) |
| `T697-rows/screen/` | the same | `screen-0…3` (T696's candidate re-lived, competition money observed) |
| `T697-rows/gate/` | the same | `gate-0…3` (T697's candidate: table + means level + competition money) |
| `T697-rows/fit/` | the same | `fit-0…1` (no means level, competition money in force) |

95 files, 95 worlds; the pooled table counts a seed whose 1955/56–2009/10 champions are read twice once (released 4
distinct worlds: `check-0` equals `released-0`; table + means 4: `screen-*` equal `t696-*`).

    pnpm exec tsx scripts/era-wage-spread.ts --champions-runs <scratch>/T698-placebos/check-0.extra.json \
      <scratch>/T698-placebos/placebo-*.extra.json <scratch>/T697-rows/cost/released-*.extra.json \
      <scratch>/T697-rows/cost/t696-*.extra.json <scratch>/T697-rows/screen/screen-*.extra.json \
      <scratch>/T697-rows/gate/gate-*.extra.json <scratch>/T697-rows/fit/fit-*.extra.json \
      --out artifacts/benchmarks/T803/champions-runs.md

Reading (a measurement, no verdict here): on the released worlds every country's longest run 1955/56–2009/10 is
4–13 titles (median per country 5–8), and a world-country holds on average 1.0–1.75 runs of five or more; the
placebo sets agree (median 6–7, up to 22 in GER and 18 in ESP). The real leagues' longest run to 2009/10 in the eight
playable leagues was 7 (Lyon), with five runs of five or more in all (recalled, not read against the lists: Lyon 7,
Real Madrid 5 twice, Porto 5, Anderlecht 5).

## Ballon d'Or winner read (a check of the new columns only)

The read itself (36 seasons, four worlds) is T808's. A career starts in 1950 and the award in 1955/56, so
`--seasons 3` reads no winner; the check ran seven seasons (about 2 minutes, one process):

    pnpm exec tsx scripts/ballon-dor-podiums.ts --seasons 7 --seeds podium-a --variants released --out <scratch>/podium-a.json

| variant | seasons | winners | most wins | longest run | age min / median / max | GK / DF / MF / FW | strongest club | owner's club |
|---|---:|---:|---:|---:|---|---|---:|---:|
| released | 2 | 1 | 2 | 2 | 20 / 20.5 / 21 | 0 / 0 / 0 / 2 | 50% | 0 |

The existing columns read as before (one club 50%, two clubs 50%, winner European champion 50%).
