# save-db-261119 (T1022)

What one save of the database costs, measured with `scripts/save-db-bench.ts` (→ARCH-14, →SAVE-3/4/13,
→ARCH-34). Each `*.json` here is one world's raw report: the three runs, their per-request wall and
main-thread CPU time, the host's load average and the commit.

## Method

- Each world is given to the real worker `Host` (`apps/web/src/runtime/host.ts`) on a game database in
  a temporary file (`node:sqlite`, the schema the browser's OPFS database shares, through
  `tests/fixtures/node-sqlite.ts`). The numbers are the host's own requests: `create-game` (the first
  save, every row), `save` after 7 days, 7 more days, 49 more days and 7 more days, then a fresh host's
  `open-game` (read, validation, writer upgrade) and the `.haeram-save` export (sha-256 + gzip).
- Every run loads the world afresh, so a run never sees an earlier run's cold rows. The value reported is
  the **median of 3 runs**; the raw `*.json` hold min and max (spread ≤ 15% on every figure below except
  heap/RSS, which is garbage-collector state and not an engine-memory claim).
- Worlds: the takeover worlds are `generateHistory('perf-261027', year)` + `takeOver(careerClub('ENG'),
  oil, no traits)` + `initializeReadModels` (the `late/gen.ts` recipe of
  `artifacts/benchmarks/night-perf-261119`); `ten rich seasons` is `cachedWorld('ten rich seasons')`
  (`persistence.testkit.ts`); the 100-season profiles are the storage benchmark's own builders
  (`scripts/benchmark.ts --phase baseline-1|-2` and `active-management-1|-2`), measured at their
  `…-round23` world (100 seasons closed, then the active round of season 101 settled — the SAVE-13
  checkpoint). Each world was built once and loaded for each run.
- Machine: Apple M1 Max, 10 cores, Node v26.8.1, macOS, host `ihaelam-ui-MacBookPro` — the host of the
  261119 night-perf baseline. Load average during the measuring runs 2.4–4.0 (the machine is shared;
  the builds of the century worlds ran before, not during, the final runs). Source: commit
  `21455f48a` (version 0.8.15, before this task's release bump).
- A takeover world starts on its takeover day, so its first 7 days are preseason; the 49 + 7 days after
  them reach the first own matches (own matches played by the last save: 1980 and 2000 takeovers 3,
  ten rich seasons 1, centuries 24–27). The century worlds play rounds 24–26 of their 101st season.

## Results (median of 3)

| world | first save ms (rows) | save after 7 days ms (rows) | 7 more days ms (rows) | in season, 7 days ms (rows) | open ms | complete / in-memory world JSON MB | people in memory (of all) | database MB | `.haeram-save` MB |
|---|---|---|---|---|---|---|---|---|---|
| 1980 takeover | 481 (68,177) | 511 (49,865) | 81 (4) | 131 (647) | 1,395 | 60.4 / 41.7 | 11,625 of 61,200 | 72.1 | 9.9 |
| 2000 takeover | 686 (94,972) | 759 (73,827) | 109 (4) | 154 (632) | 1,827 | 84.3 / 56.2 | 14,649 of 87,937 | 99.9 | 13.9 |
| ten rich seasons (1960) | 185 (27,519) | 180 (13,166) | 47 (5) | 49 (7) | 730 | 26.4 / 20.0 | 5,960 of 16,244 | 31.0 | 4.3 |
| baseline century, round 23 of season 101 | 1,363 (180,202) | 1,616 (148,223) | 292 (779) | 234 (39) | 3,064 | 185.5 / 95.5 | 20,049 of 134,500 | 222.8 | 31.3 |
| active-management century, round 23 | 1,391 (180,679) | 1,670 (148,417) | 289 (786) | 246 (498) | 3,131 | 187.8 / 96.4 | 20,332 of 134,242 | 225.4 | 31.7 |

Reading the columns:

- *first save* is `create-game`: every row of the world, none yet cold.
- *save after 7 days* is the first `save` after it: besides the days' changes it writes the people who
  have no current role as cold rows once (→SAVE-32; 49,865 of 1980's 61,198 people), so it is the
  catch-up save of a world that was never saved before; every later save writes what changed.
- *7 more days* (a second save, still preseason for the takeovers) and *in season, 7 days* (after 49 more
  days, where own matches are played) are what an autosave costs afterwards. For the centuries the
  7-day saves are in rounds 24–26 of season 101.
- *complete world JSON* is the world with every cold row (`rowsToWorld(includeCold: true)`), *in-memory*
  what a freshly opened game holds; both are `JSON.stringify` UTF-8 bytes summed by top-level field.
- *database MB* is the SQLite file after the last save; `.haeram-save` the gzip file with its header.

Raw per-run main-thread CPU for the 2000 takeover: first save 635–654 ms, save after 7 days 707–717 ms,
7 more days 105–111 ms (the wall figures above are within 8% of them: the save is synchronous SQLite
work on the engine thread).

## Against the 261119 baseline (same host, ARCH-34)

The baseline is the whole-world autosave measured on 261119 on this host (2000 takeover, about **18 s**
per autosave): hand-off clone 3.0 s, pack + unpack 8.4 s, full validation 4.3 s, canonical 1.1 s, gzip
1.3 s. None of those stages exists on the database path (SAVE-3): no hand-off clone, no packing, and the
whole world is validated at open (→SAVE-5), not at each save.

| 2000 takeover | whole-world autosave (261119) | database save now | ratio |
|---|---|---|---|
| first save of the world | ≈ 18 s | 0.69 s | ≈ 26× faster |
| first save after the takeover's days (writes the people leaving memory) | ≈ 18 s | 0.76 s | ≈ 24× faster |
| an ordinary autosave (7 days, preseason) | ≈ 18 s | 0.11 s | ≈ 165× faster |
| an ordinary autosave (7 days, in season) | ≈ 18 s | 0.15 s | ≈ 117× faster |
| open (read + validate + writer upgrade) | — (a load was the unpack + validation: 8.4 + 4.3 s of the 18) | 1.83 s | — |

The call under ARCH-34's rule: on the same machine every database save is faster than the baseline
by a factor of about 24 or more, against a run-to-run spread under 10% (and a main-thread-CPU/wall
agreement within 8%), so the interval lies far below 1 and the gain clears the noise. Caveats that keep this
from being a paired A/B: the baseline figures are those the 261119 session recorded, not rerun
alongside (the whole-world path no longer exists in this tree, so there is no second bundle to
alternate with), the machine was shared during both, and the ratio compares a whole-world autosave with
what a save now writes — the point of the change (SAVE-3: a save's cost follows what changed). The
ratios name this host; on another machine they are context only.

## SAVE-4 and SAVE-13: the 100-season profiles

| profile | database | limit | `.haeram-save` | limit |
|---|---|---|---|---|
| baseline, 100 seasons + settled round 23 | 222.8 MiB (233.6 MB) | 1,024 MiB | 31.3 MiB | 256 MiB |
| active management, 100 seasons + settled round 23 | 225.4 MiB | 1,024 MiB | 31.7 MiB | 256 MiB |

Both profiles save, reopen (3.1 s) and export within SAVE-4 on this host: the database is 22% of its
limit and the export 12% of its limit, with the settled active round after the century included. The
whole database is lossless (the complete world JSON, cold rows included, is 185–188 MB, of which a
freshly opened game keeps 95–96 MB in memory; 20,000 of 134,000 people).

## Limits of this measurement

- Browser OPFS write speed and the sqlite-wasm build are **not** measured: the database here is a
  `node:sqlite` file on the laptop's SSD. A browser save writes the same rows through the same record
  store, but its I/O is slower.
- The worlds are built once per world and reloaded for each run, so the three runs vary in the load of
  the save, not in the world (a different seed would change the numbers).
- The century worlds are built by the engine alone and saved at once (`create-game`, then the cold-moving
  save); a real century's autosaves would have moved people out of memory season by season, so the
  first-save figures of a century are a worst case.
- Heap and RSS after open are in the raw JSON; they include collector garbage and are not an
  engine-memory claim (people in memory is the engine's measure).
- Every world asked for was measured; none was left out. The `takeover-1980` and `-2000` worlds took 219
  and 391 s to build on this host with other builds running.
- The release bump (0.8.15 → 0.8.16, `pnpm run release:prepare`) came after the measurements, so the
  source fingerprint of these runs is the 0.8.15 tree.

## Reproduce

```
pnpm exec tsx scripts/save-db-bench.ts build takeover-2000 --out .tmp/save-db-bench/takeover-2000.bin
pnpm exec tsx scripts/save-db-bench.ts measure takeover-2000 .tmp/save-db-bench/takeover-2000.bin --runs 3 --out artifacts/benchmarks/save-db-261119/takeover-2000.json
pnpm exec tsx scripts/benchmark.ts --phase baseline-1 && pnpm exec tsx scripts/benchmark.ts --phase baseline-2
pnpm exec tsx --max-old-space-size=16000 scripts/save-db-bench.ts measure baseline-century-round23 .tmp/benchmark/<identity>/baseline-round23.world.json --runs 3
```
