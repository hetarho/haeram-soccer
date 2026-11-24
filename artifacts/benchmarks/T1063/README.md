# T1063 — stopped view reads (Node host)

Measured 261124 on hq-dev1-pve2-vm2 (Intel Xeon Silver 4214, 12 cores, Node 24.22.1), with other
sessions loading the host (each run's 1-minute load is in its JSON and each summary's `loads`).
Node `Host` with a `node:sqlite` in-memory game database; OPFS and the browser are not measured.

Baseline: the diff base 3da8ed6ba extracted with `git archive` into `.tmp/t1063-base` (the
worktree's `node_modules`). Candidate: the same tree with `candidate.diff`'s `disciplineNames.ts`
(`.tmp/t1063-cand`). The candidate was **not kept**: it moved the work instead of removing it.

## Candidate

`disciplineNames` drew every representative club's squad (no stored squad, →WORLD-6) on each read,
and the day's `invalidateNpcSquads` drops those draws. The candidate drew only a representative club
that can hold a discipline entry: an entry ID beginning `<club>:` (its generated places and
refills) or a person playing for it (`continuousSquad`). The first version cut every entry at each
colon (1.4 ms a read); the second only entries whose first segment is a drawn club's.

## Profile (`waits-prof.mts.txt`: `waits.ts` with `slowReads` split into its five parts)

1930 e2e start, seed `records-room-journey`, 10 stops (baseline tree, `prof-base`):

| request | parts summed over the run (ms) |
|---|---|
| 5 next-event | discipline 93, office 50, transfers 154, coaches 4, managers 1 |
| 5 advance-days | discipline 117, office 53, transfers 156 |
| 10 stopped-reads | discipline 30, office 99, transfers 5, coaches 8, managers 3 (median read 14.5 ms: office 9.8, discipline 3.2) |
| open-game / import-game | discipline 85 / 92, office 9 / 9 |

On a 1930 world after four stops (`disc-prof.mts.txt`): 2,114–3,148 table entries, 160
representative clubs (`euro:N`), none of them holding an entry; drawing their squads 69 ms cold.
The candidate's read: 3.2 ms warm, 2.9 ms right after invalidation (first version 5.1 / 4.5 ms).

`officeRead` parts (`office-prof.mts.txt`, 1930 after six stops; mean of 5): whole 9.6 ms; the
delegation plans with their revenue and cash projection 2.86, the six ticket gate projections 1.85
(`gateProjection` on a world copy per preset, everything but the effective price the same), the
effect ledger 1.71, the 25 policy-level operating costs 1.34 (a world copy each; one
`operatingCosts` 0.02), the cash projection 1.28, current gate 0.33, facilities 0.22, the rest
below 0.2 each.

## Paired waits (`scripts/perf/waits-pair.ts --rounds 8 --steps 10`, 1930)

| directory | candidate | loads |
|---|---|---|
| `pair-1930-first` | first version | 1.8–6.6 |
| `pair-1930` | second version | 2.3–6.4 |

Every kind "no difference" in both (`summary.json`); `pair-1930`: next-event 0.973 (95%
0.867–1.141), advance-days 1.001 (0.876–1.133), stopped-reads 0.943 (0.811–1.214, median 18 →
18 ms), decision 0.948 (0.812–1.166), open-game 0.994 (0.894–1.065), import-game 1.000
(0.896–1.077). World and reopened hashes `8e9033c3e3ae93af` on every run of both sides; posted reply
hashes and rows put equal in all 304 matched requests of each directory (`parts.cjs.txt`).

Why: the projection reads every club's `rating` (`startingSquad`), which draws the same
representative squads. With `disciplineNames` first in `slowReads` the baseline paid the draw there
and `rating` reused it; the candidate's `rating` paid it instead (projection median 66 → 63 ms on
next-event, 180 → 178 on open-game, while the slow reads' own share fell 167 → 95 ms on
open-game). A stopped read follows a projection of the same day, so its squads were already drawn
(discipline 3.2 ms in the baseline).

## Parity (`parity.mts.txt`)

The candidate against the full squad scan on the same world after each stop (squads invalidated
before each): takeover-2000 (`.tmp/t1061-takeover-2000.bin` from T1061) four stops identical
(863–2,454 entries, no representative club holding one); the run was slow and left unfinished.
The 1930 run gave no output within the timebox. The unit case `T1063-read-parity` (in
`candidate.diff`) passed on both versions.
