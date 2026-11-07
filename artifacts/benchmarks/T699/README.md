# T699 — CLUB-48's careers part on T697's table, then activation

Measured 261104, 13:05–13:35Z on hq-dev1-pve2-vm2 (12 cores, at most 10 jobs; load 0.4 at the
start, 12.9 at its peak), on 40ef1a2e with T697's table, LEAGUE-10's means level and the books'
competition money given as measurement overrides (`--spread`, `--means`, `--cups`).

Files:

- `careers-candidate.md` — the 16 reference careers' report (`owner-balance.ts --in`).
- `careers-candidate.json` — the 16 careers kept (`--out`, merged).

Commands (one job each, at most ten at a time, from a node driver in the session's temp area):

    pnpm exec tsx scripts/owner-balance.ts --prepare --seeds 1 --first-seed S \
      --spread artifacts/benchmarks/T697/candidate.json --means --cups --world-dir DIR   (S = 0, 1)
    pnpm exec tsx scripts/owner-balance.ts --tiers oil|midsize --countries C --seeds 1 --first-seed S \
      --until 1969 --purse-apart --spread artifacts/benchmarks/T697/candidate.json --means --cups \
      --world-dir DIR --out TIER-C-S.json                                               (16 jobs)
    pnpm exec tsx scripts/owner-balance.ts --in DIR/careers --until 1969 --purse-apart \
      --spread artifacts/benchmarks/T697/candidate.json --means --cups --note ...

## The careers part (CLUB-48 r58)

LEAGUE-13's 석유 재벌 and 중견 사업가 references (ENG ESP FRA GER × `owner-balance-0`/`-1`, 1950–1969,
no traits, purse apart), lived with the three:

| tier | careers | club bankrupt (→ECON-24) | owner bankrupt at 0.2% (→OWNER-8, from the purse) | first top-flight title | median first title | titles after the first | top flight reached (mean seasons there of 20) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 석유 재벌 | 8 | 0 | 0 | 8 of 8 | 2nd season | 19.1% (26/136) | 8 (19.5) |
| 중견 사업가 | 8 | 0 | 0 | 1 of 8 | 8th season | 0.0% (0/12) | 8 (14.4) |

No club and no owner is bankrupt in either tier, at OWNER-8's 0.2% or any rate read beside it (0.25,
0.15, 0.1, 0.05%). No count can be below none, so **the part passes** without re-living the released
careers on this tree (T699's acceptance); the released side was not run.

Beside, as targets (LEAGUE-13's bands, not the gate): 석유 재벌 — most careers win (8 of 8), median
first title within 10 seasons (2nd), 35% or less after (19.1%), none bankrupt: in band. 중견 사업가 —
1 in 5 or fewer win (1 of 8), the top flight in most careers (8 of 8), 1 in 20 or fewer bankrupt (0):
in band.

ECON-29's rows on 중견 사업가 (8 careers, 160 seasons, building nothing as a career plays): wage bill
39.8% of revenue (below 45–70%), operating result +23.2% (above −5 to +10%), player sales 6.3%, net
with sales 29.5%, 1950s matchday 70.3% (ok), facility ladder 104.8 seasons (ok), none bankrupt.

ECON-36's ±25% check: 16 of 16 first owned seasons within it (석유 재벌 0.91–1.10, 중견 사업가
0.88–1.16).

### Context (not the comparison), each on its own tree

| reading | tree | 석유 재벌: club bankrupt / wins / median first title / after the first / mean top-flight seasons | 중견 사업가: club bankrupt / wins / median first title / mean top-flight seasons | ECON-29 on 중견 사업가: wages, operating, sales, net |
|---|---|---|---|---|
| T693 baseline, released (`artifacts/benchmarks/T693/careers-baseline.md`) | 7241867b, before T695's merge | 6 of 8 (in the 1st season) / 1 / 3rd / 0.0% / 4.8 | 0 / 1 / 15th / 10.6 | 44.2%, +19.7%, 9.0%, 28.7% |
| T696 candidate, no competition money (`artifacts/benchmarks/T696/careers.md`) | 44a341ee | 0 / 8 / 2.5th / 13.8% / 19.8 | 0 / 2 / 10th / 16.9 | 40.3%, +21.1%, 4.4%, 25.5% |
| T699 candidate (this) | 40ef1a2e | 0 / 8 / 2nd / 19.1% / 19.5 | 0 / 1 / 8th / 14.4 | 39.8%, +23.2%, 6.3%, 29.5% |

## Cost

Seconds per career (20 seasons, 1950/51–1969/70), the same host:

- the first ten at ten jobs: 850–912 s, median 880 s (석유 재벌 ENG seed 0: 898 s, against T696's 938 s
  at ten jobs on the same host);
- the last six, started as the first ten ended (ten jobs for their first minute, then six or fewer):
  759–874 s;
- all 16: median 869 s, mean 851 s; the whole run 29.3 minutes wall.
- each 1930–1950 world: 17 s (15 s of living), two in parallel, once per seed.
