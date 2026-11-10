# T785 — the record fee of a funded delegated club (CLUB-33)

Read-only diagnosis and three candidate rules behind named settings, all off in play. Verdict: the
target (the dearest signing at least 0.5× the standing British record within the first three
seasons) is met in none of the 5 careers on the rules in force (0.14–0.16×) and in 4 of 20 overall —
1 of 4 with the `open` ceiling, 3 of 4 with the owner's own widest recruitment dials (영입 기조 5 and
해외 스카우트망 5, no rule changed), each at 0.50–0.62×. Money never chose: the cause is how high and
how far the 단장 looks. The rules stay as released.

- tree: `46d3c359` plus this task's commit (the settings off by default; `scripts/record-fees.ts`)
- host: ihaelam-ui-MacBookPro (Apple silicon), at most 4 jobs at once; careers ~20 s a season
- worlds: `generateHistory(seed, 2000)` for `spread-0`, `spread-1`, `spread-2` (T784's seeds), kept
  outside the tree
- careers: ENG, a takeover on 1 August 2000 of LEAGUE-13's reference club of the tier (석유 재벌 =
  `oil`, 재벌 총수 = `chaebol`, 산업 자본가 = `industrial`), every responsibility delegated,
  recruitment's 재정 기조 공격적 (`decisionBudgets`), `--inject 0.25` puts a quarter of the fortune in
  on each season's first day (no FFP before 2011/12), 2000/01–2002/03 — the target's three seasons
- record: the British record standing that season, as `scripts/calibrate-transfers.ts` (£22.5m in
  2000/01, £28.1m in 2001/02, £29.1m in 2002/03); fees are the completed fee signings' (HIST-20)
- each of the 단장's regular looks in an open window (every 7th day) reads: cash, 재정 기조's runway
  (6 rounds of fixed costs) and the fee cap (all the cash above it), the wage bill against the
  revenue over the last 12 months (75% ceiling) and the season's cash projection; the needs (short
  lines, replacements, upgrades used, squad size); the five dearest players on the scout's list and
  the eight dearest of every playable top flight, each with his gap over our starter at his best
  slot, whether 영입 기조's band holds him, and the first money check that passes him over
- `careers/*.json`: every kept career (`base-` the rules in force; `open-`, `xi-` SEARCH_CEILING;
  `revenue-` REVENUE_SINCE_TAKEOVER `books`; `rec5-` the owner's 영입 기조 at level 5, `rec5abroad5-`
  with 해외 스카우트망 at 5 too — owner dials, no rule changed); `report.md`: `--in … --brief` over all

## Commands

```
pnpm exec tsx scripts/record-fees.ts --seed spread-0 --prepare --world-dir DIR
pnpm exec tsx scripts/record-fees.ts --seed spread-1 --tier oil --finance aggressive --inject 0.25 \
  --until 2002 [--setting open|xi|revenue] [--recruitment 5] [--abroad 5] --world-dir DIR --out careers/X.json
pnpm exec tsx scripts/record-fees.ts --in careers/a.json,careers/b.json --brief > report.md
```

## Diagnosis (rules in force)

| career | club | dearest signing a season (×record) | best | looks with a gap of 2+ | list's dearest | top flights' dearest, in 표준's band |
|---|---|---|---|---|---|---|
| s0 석유 재벌 | ENG:0:0:0, top flight, 83 | - / - / £4.0m OVR 84 | 0.14 | 0 of 30 | £5.0m | £17.2m, 0 of 150 |
| s1 석유 재벌 | ENG:0:0:9, top flight, 81 | £3.1m / £4.1m / £4.0m | 0.15 | 18 of 30 | £3.6m | £17.1m, 0 of 150 |
| s2 석유 재벌 | ENG:3:0:21, top flight, 84 | £3.5m / - / - | 0.15 | 0 of 30 | £5.0m | £20.9m, 0 of 150 |
| s0 재벌 총수 | ENG:2:0:8, top flight, 74 | £3.5m / £3.8m / £4.6m | 0.16 | 25 of 30 | £5.0m | £18.9m, 0 of 150 |
| s0 산업 자본가 | ENG:1:0:1, second tier, 74 (promoted 2000/01) | £3.6m / £3.7m / £4.0m | 0.16 | 30 of 30 | £5.0m | £18.9m, 0 of 150 |

- The owner's report holds on these careers: the dearest signing stands at 0.13–0.16× the record
  (his £7.7m against £30.8m in 2006/07 is 0.25×), always an OVR 83–84 player for £3.1–4.6m.
- Money: on every look the cash above 재정 기조 공격적's runway (6 rounds) was £30–59m for 재벌 총수
  and 산업 자본가 and £380–900m for 석유 재벌, and its fee cap all of it; all 750 reads of the list's five dearest passed every check, and so did 747 of the
  750 reads of the five dearest players of the playable top flights (OVR 90–95, £10–21m at a 110%
  bid; the other 3 failed the wage-bill ceiling). Takeover-day revenue (the £0 T784 saw) costs one
  look at most: from the first round the revenue over the last 12 months reads £25–55m.
- Reach: 영입 기조 표준 searches abilities 40–85 (ECON-16). None of those 750 dearest players is in
  that band, so the scout never lists them and the 단장 never bids for them. Within the band the
  dearest listed player costs at most £5.0m (0.18–0.22×).
- Need: an upgrade must beat a slot's starter by 공격적's margin, 2 (CLUB-33). A top-flight
  upper-table XI stands at 83–88, so in the strongest careers (s0, s2) no listed player beat any
  starter by 2 in any of 30 looks: the 단장 made no upgrade at all, under the most generous 재정 기조.
  Upgrades also stop once the squad passes 24 (25 at the last look for 재벌 총수 and 산업 자본가).

## Candidates (named settings, off in play) and the owner's own dials

- `REVENUE_SINCE_TAKEOVER` `books` (`finance.ts`): in the takeover season the revenue over the last
  12 months counts the bought club's books' last income (`owner.takeover.lastIncome`) as last
  season's turnover, as 팬 민심 already reads it.
- `SEARCH_CEILING` (`scout-search.ts`): `open` lifts 영입 기조's ability ceiling to 99; `xi` keeps it
  at least 5 (the manager's request margin) above our XI's mean value at its slots.
- the owner's dials, no rule changed: 영입 기조 5 (즉시 전력: abilities 60–92, ages 26–33) and, beside
  it, 해외 스카우트망 5 (the top flights of all seven other playable countries).

| arm | careers | best dearest / record in the first three seasons | met |
|---|---|---|---|
| rules in force | s0 s1 s2 석유 재벌, s0 재벌 총수, s0 산업 자본가 | 0.14 0.15 0.15 0.16 0.16 | 0 of 5 |
| `revenue` | s1 석유 재벌 | 0.15 (every signing as in force) | 0 of 1 |
| `xi` | s0 s1 석유 재벌, s0 재벌 총수 | 0.28 0.26 0.16 | 0 of 3 |
| `open` | s0 s1 s2 석유 재벌, s0 재벌 총수 | 0.30 0.62 0.32 0.28 | 1 of 4 |
| 영입 기조 5 | s0 s1 석유 재벌, s0 재벌 총수 | 0.45 0.36 0.48 | 0 of 3 |
| 영입 기조 5 + 해외 스카우트망 5 | s0 s1 s2 석유 재벌, s0 재벌 총수 | 0.50 0.40 0.53 0.57 | 3 of 4 |

- `xi` and `open` let a strong club upgrade (a gap of 2+ in every look) but the list ranks by
  ability, then potential: equally able players aged 19–23 come first and cost a third to a half of
  a prime-age star (OVR 90/23 £6.5m against 90/28 £10.4m in 2000), so the 단장 buys OVR 88–91 for
  £5–8m. `open` met the target only where the ablest English player was a prime-age 95 (s1, £17.4m).
- 영입 기조 5's ages (26–33) fix the age but rank 30–33-year-olds of equal ability, worth a half of a
  27-year-old's value, as readily (s0 2000: 91 at 30 for £7.0m beside 90 at 28 for £10.4m; s1's
  dearest in 2000/01 an OVR 92 for £5.4m); its ceiling (92) still leaves out every 93–95.
- With 해외 스카우트망 5 the list holds the other top flights' 92s (ESP, GER, ITA), and the dearest
  signing reaches 0.50–0.57× in 3 of 4 careers — each time an OVR 92 at £11.5–15.5m, at the edge of
  the target; s1 stayed at 0.40 buying England's 92s.
- Money binds only for 재벌 총수 (cash £11–25m at the closes): with the widest dials the runway check
  passed over 86–126 of its 150 dearest-player reads, mostly in windows after a summer's spending,
  so a club without the money still signs nothing it cannot pay. For 석유 재벌 the wage-bill ceiling
  passed over 0–40 of 150 once stars were in reach, and its room fell to £6–9m by the third season
  in seven of those eight careers.

## Not read

- The owner's 2000s–2020s export: `.tmp/saves/` is not in this worktree.
- CLUB-46's value targets, CLUB-48's books, OWNER-3's tiers and ECON-33's runway beside a candidate
  in force: no candidate went in force, so nothing they measure changed.
- Seasons after 2002/03 (the target's window ends there), other countries, 적극, and the 2020s.
