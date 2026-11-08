# T712 — CLUB-25 r61's ability-fit wage, screened on LEAGUE-13's calibration careers

Measured 261108 on ihaelam-ui-MacBookPro (10 cores), on bf4b6be0 with this task's mechanism
(uncommitted while measured, committed with these files): `ABILITY_FIT` and `wageDivision` read inside
`marketWageAt`, `divisionFor` in `market-prices.ts` on the new leaf `tier-levels.ts`, and the
`--ability-fit` measurement override in `scripts/owner-balance.ts` and `scripts/era-wage-spread.ts`.

**Verdict: CLUB-25's gate fails on the calibration careers** (중견 사업가 wins the top flight in 3 of
8, more than 1 in 5; 지역 유지 and 자수성가 축구팬 reach it in every career). The switch stays off in
production; held-out careers and CLUB-48's books and champions worlds were not run (the task runs them
only on a calibration pass).

Files:

- `careers-calibration.md` — the gate table, T700's production readings beside (labelled), LEAGUE-13's
  table, the growth table, ECON-29's rows on 중견 사업가, ECON-36's ±25%, every career, then the growth
  sources (`--sources`): rating against the league, who carries the XI's points, wage bill over revenue
  (median, p90), the 단장's signings by OVR and division on 재정 기조's checks, the scout's list.
- `careers-calibration.json` — the 46 careers kept (`--out`, merged).
- `inertness.md` — the 중견 사업가 ENG `owner-balance-0` career lived on this tree without the flag
  against T700's (`--compare`): 20 seasons, 0 rows differing.

Commands (one job each, at most ten at a time, from a node driver in the session's temp area):

    pnpm exec tsx scripts/owner-balance.ts --prepare --seeds 1 --first-seed S --ability-fit --world-dir FIT   (S = 0–3)
    pnpm exec tsx scripts/owner-balance.ts --prepare --seeds 1 --first-seed 0 --world-dir PROD
    pnpm exec tsx scripts/owner-balance.ts --tiers T --countries C --seeds 1 --first-seed S --until 1969 \
      --purse-apart --growth --ability-fit --world-dir FIT --out T-C-S.json
        (T = oil chaebol industrial midsize local selfmade, C = ENG ESP FRA GER, S = 0 1: 48 jobs, 46 careers)
    pnpm exec tsx scripts/owner-balance.ts --tiers midsize --countries ENG --seeds 1 --first-seed 0 --until 1969 \
      --purse-apart --growth --world-dir PROD --out prod.json                 (the inertness control)
    pnpm exec tsx scripts/owner-balance.ts --in prod.json --compare artifacts/benchmarks/T700/careers.json \
      --until 1969 --purse-apart
    pnpm exec tsx scripts/owner-balance.ts --in FIT-careers --until 1969 --purse-apart --note "..." [--sources]

## Cost and time

Seconds per career (20 seasons, 1950/51–1969/70) at ten jobs: the 22 lower-tier careers with
`--growth`, median 368 s (338–420 s; T700: 446 s); the 24 upper careers, now also with `--growth`,
median 370 s (283–425 s; T700 without it: 346 s); the production control 363 s. The 1950 worlds:
7–8 s each (five at once). The whole career run: 1807 s wall (14:01:52–14:32Z) for 49 jobs.

Time breakdown: mechanism, overrides and unit tests about 12 minutes; worlds 8 s; careers 30 minutes;
reports and this write-up about 10 minutes. Held-out careers, the eight ownerless worlds, activation and
fixtures: not run (calibration failed).
