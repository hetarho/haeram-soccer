# T808 — the squad spread's gate (WORLD-6) and what it does to supply, sellers, the Ballon d'Or and title runs

Measured 261110, 17:12–19:12Z (task start 17:12Z, timebox to 19:40Z) on a darwin-arm64 host (10 cores), at
most four measurement processes at once while other sessions' integration suites shared the host (load 4 → 25),
on `e5bbc5e0` (T803–T807 and T809 integrated) with this task's script changes: `--setting
flat|spread` on `scripts/ballon-dor-podiums.ts`, `scripts/era-wage-spread.ts`, `scripts/calibrate.ts`,
`scripts/calibrate-transfers.ts` and `scripts/match-parity.ts` (passed on to its workers) through
`scripts/lib/squad-spread-setting.ts`; `seller-spread.ts --setting` gains `flat` and `spread` beside T784's
names; `era-wage-spread.ts --allowance N` (a recorded allowance in place of re-lived placebo sets) and its
title-run kinds name the squad spread; `calibrate-transfers.ts` stops a career at any career end
(`careerEnded`, recorded as `ended`), where it stopped only at a club bankruptcy and looped once the owner, the
fans or the club's settlement ended it (see CLUB-46 below).

Both arms run the rules in force: T804's `signed`, T805's ladder, T807's refill, T809's `xi` and `books`,
CLUB-48's table with LEAGUE-10's means level and the books' competition money. `flat` is the released default;
`spread` is T806's `SQUAD_SPREAD_CONFIG` (class ±6, bench 3, WORLD-6's age terms and headroom). Every pair
below is the same seeds and the same command but `--setting`.

**Verdict: `SQUAD_SPREAD` stays `flat`.** Four of WORLD-6's five gates hold on the spread worlds — MATCH-2's
curve, MATCH-23's season scoring rows, CLUB-48's books and LEAGUE-10's champions (on T698's recorded allowance) —
and CLUB-46's value targets are **unread**: `calibrate-transfers.ts` looped on careers that ended without a club
bankruptcy (fixed here; see CLUB-46 below), and the corrected careers end in 1985, before the 1993–2025 anchors
where the scouts placed the risk (1952–1982: one year of seven outside the band in either arm). An unread gate keeps the
released draw (T808's exit). No tuning round was run: no read gate failed, and the only open gate needs the
careers, not a value of WORLD-6's table.

## Commands

`SC` = the session's scratch folder (worlds, raw careers, rows), never the tree.

    pnpm exec tsx scripts/seller-spread.ts --seed spread-K --supply --world-dir SC/worlds --setting S       K = 0, 1, 2
    pnpm exec tsx scripts/seller-spread.ts --seed spread-K --tier oil --finance aggressive --inject 0.25 \
      --until 2007 --world-dir SC/worlds --setting S --out careers/S-sK-oil.json                           K = 0, 1
    pnpm exec tsx scripts/seller-spread.ts --in careers/flat-s0-oil.json,...,careers/spread-s1-oil.json > sellers.md
    pnpm exec tsx scripts/ballon-dor-podiums.ts --seeds podium-K --seasons 36 --variants released \
      --setting S --out podiums/S-K.json                                            K = 1–3 (podium-4 not run)
    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-K --years 1950,1970,1990,2010 \
      --countries ENG,ESP,FRA,GER --until 2010 --spread artifacts/benchmarks/T697/candidate.json --means --cups \
      --setting S --out SC/gate/S-K.json         K = 0, 1 (seeds 2, 3: --years 1960,1980,2000, all eight, --until 2009)
    pnpm exec tsx scripts/era-wage-spread.ts --in SC/gate/S-0.json,SC/gate/S-1.json --lived \
      --extra SC/gate/S-0.extra.json,SC/gate/S-1.extra.json > books-calibration-S.md   (seeds 2, 3: books-held-out-S.md)
    pnpm exec tsx scripts/era-wage-spread.ts --champions-released SC/gate/flat-{0..3}.extra.json \
      --champions-candidate SC/gate/spread-{0..3}.extra.json --allowance 6 > champions.md
    pnpm exec tsx scripts/era-wage-spread.ts --champions-runs SC/gate/flat-{0..3}.extra.json \
      SC/gate/spread-{0..3}.extra.json --out champions-runs.md
    pnpm exec tsx scripts/calibrate-transfers.ts --seeds 1 --first-seed 0 --setting S --out transfers/S-0.json > transfers-S.md
    pnpm exec tsx scripts/match-parity.ts --report --partition validation --conditions core:equal-top-tier \
      --scale 5 --seasons 40 --jobs 1 --setting S --out parity/S.json
    pnpm exec tsx scripts/calibrate.ts --quick --only curves --setting S > curves-S.md

## WORLD-6's gate, read on the spread worlds

| gate | read | flat | spread | band | verdict |
|---|---|---|---|---|---|
| MATCH-2's strength curve | `calibrate.ts --quick --only curves`, mean absolute W/D/L error, gaps −10…+40 | grid 5.9, summary 2.1 points | grid 6.4, summary 1.7 points | none set (MATCH-2 records the error) | holds (within sampling noise) |
| MATCH-23, club top scorer's share | `match-parity.ts`'s seasons, 40 founded worlds one season each, 360 20-club divisions | 0.290 (0.288–0.292) | 0.293 (0.291–0.295) | 0.20–0.30 (registry's tolerant band 0.1875–0.3125) | holds |
| MATCH-23, league top scorer's goals | the same | 26.2 (25.8–26.6) | 26.6 (26.2–27.0) | 22–32 | holds |
| MATCH-23, hat-tricks a match | the core condition (equal top-tier sides), 3,000 matches on the aggregate path | 0.029 (0.024–0.036), 87 | 0.027 (0.022–0.034), 82 | 0.02–0.05 | holds |
| CLUB-46's value targets | `calibrate-transfers.ts`, ENG career seed 0 (1950–1984, the career's end) | 1952–1982: 1 of 7 outside | 1952–1982: 1 of 7 outside | dearest 0.5–1.0× the standing record; mean 0.6–1.4× the TPI (1993–2025) | **unread** (1993–2025 not reached) |
| CLUB-48's books | below | 32 / 32, 48 / 48 | 32 / 32, 48 / 48 | every calibration case; no club without a project above revenue | holds |
| LEAGUE-10's champions | below | 23 points outside | 15 points outside | each country within flat + 6 (T698's allowance) | holds on T698's allowance |

Beside the scoring rows (context): goals a match 2.78 / 2.78, champion's points a game 2.15 / 2.15, goals by line
FW 54.8 / 54.2%, MF 32.5 / 32.9%, DF 12.7 / 12.9% (`parity/scoring-rows.md`, `parity/*.json`).

MATCH-2's curve (`curves-flat.md`, `curves-spread.md`; 6,000 gap fixtures a path, 211–480 a 5-point bucket, the
same draw of strengths on the same pools of eight generated clubs a strength; 20 min each under the host's load):
the spread moves the grid engine's error +0.5 points and the summary's −0.4, inside a bucket's sampling noise
(a 400-match share is ±4–5 points at 95%). MATCH-2 sets no tolerance, so the verdict is that the spread squads
leave the curve where the flat squads hold it: a club's strength is its XI's mean at the slots either way, and the
bench and the class sit around it.

### CLUB-46: read to 1982 only, so unread as a gate

`calibrate-transfers.ts` played each career round by round while `w.bankrupt` was unset; a career that ends another
way (the owner's money, the fans or the club's settlement set `w.ended`) leaves `advanceRound` returning at once, so
its loop never ended. The first four careers (flat and spread × seeds 0 and 1, 80 seasons each, from 17:35–17:50Z)
printed their 1959, 1969 and 1979 closes and nothing more for 54–69 minutes at full CPU, and were stopped at 18:44Z
so the curve and scoring reads could run inside the box. The loop now stops at any career end and records it
(`ended`; a career that ends at a close is recorded too, after the reruns). Seed 0 rerun on both arms from 18:56Z
(`transfers-*.md`, `transfers/*-0.json`; 12–14 min): both careers end after 35 seasons, the 1984/85 close (the cause
not recorded by the version that ran), so CLUB-46 is read on one seed per arm for the anchors 1952–1982 only:

| arm | 1952 | 1957 | 1962 | 1967 | 1972 | 1977 | 1982 | outside 0.5–1.0× the standing record |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| flat | 0.93 | 0.83 | 0.64 | 0.89 | 0.87 | 1.06 | 0.96 | 1 of 7 (1977) |
| spread | 1.04 | 0.91 | 0.60 | 0.95 | 0.80 | 0.99 | 0.87 | 1 of 7 (1952) |

The top flight's best OVR stands at 93–98 in both arms (decade means). The anchors the scouts' risk names (1993–2025: the
dearest at 1.01 of the record in 2025 already, the mean against the Transfer Price Index from 1993) are not reached
by a career that ends in 1985, so the gate is unread and `SQUAD_SPREAD` stays `flat` (T808's exit).

## Supply (`supply-flat.md`, `supply-spread.md`)

England's 2000 world (`generateHistory(seed, 2000)`, 38–44 s each): players aged 18–30 at OVR 83–85, the top
of 영입 기조 표준's search band, by club.

| seed | flat: players / clubs, top club (share) | spread: players / clubs, top club (share) | top flight's strongest six, flat → spread |
|---|---|---|---|
| spread-0 | 53 / 5, 14 (26%) | 52 / 15, 6 (12%) | 90 88 87 84 84 84 → 89 88 87 86 85 84 |
| spread-1 | 12 / 2, 11 (92%) | 27 / 12, 6 (22%) | 97 94 92 90 85 82 → 97 93 92 89 84 84 |
| spread-2 | 65 / 6, 13 (20%) | 33 / 13, 4 (12%) | 91 88 87 84 84 84 → 91 88 87 86 84 84 |

Flat squads put the band in 2–6 clubs of strength 81–85, each holding 11–14 of them, and none at a club of 86 or
more; spread squads put it in 12–15 clubs, at most 6 in one, and the strongest clubs (88–97) hold some (their
young and their bench). On this tree the flat supply is not T784's (seed 0: 38 players in 3 clubs then, 53 in 5
now; T805's ladder and T807's refill changed the squads since).

## Sellers (`sellers.md`, `careers/*.json`)

T784's careers on this tree: ENG, a 1 August 2000 takeover of LEAGUE-13's 석유 재벌 reference club, every
responsibility delegated, 재정 기조 공격적, a quarter of the fortune put in each season, 2000/01–2007/08; 2.2 min a
career. The reference club is the median-priced club of the band, so the spread arm bought a different club
(prices follow the squads).

| career | club bought | fee signings | one seller in a window (≤ 2) | five-season share, spans of 4+ (≤ 25%) | mean signed OVR | the list at looks: clubs / players, top club holds |
|---|---|---:|---:|---|---:|---|
| s0 flat | ENG:0:0:0 | 16 | 3 | 57% (4/7, 2001–2005) | 88.5 | 3.7 / 11.2, 5.0 |
| s0 spread | ENG:2:0:17 | 26 | 3 | 44% (8/18, 2001–2005) | 89.4 | 5.5 / 9.7, 3.4 |
| s1 flat | ENG:0:0:3 | 26 | 3 | 56% (5/9, 2002–2006) | 89.3 | 3.6 / 10.7, 5.2 |
| s1 spread | ENG:0:0:19 | 22 | 3 | 60% (6/10, 2001–2005) | 89.9 | 6.2 / 10.8, 4.0 |

Neither arm meets CLUB-33's seller targets in any career (0 of 2 each). The spread widens the scout's list (5.5–6.2
clubs at a look against 3.6–3.7, the top club 3.4–4.0 of its players against 5.0–5.2) and keeps the signings'
ability (mean OVR 89.4–89.9 against 88.5–89.3), but the 단장 still takes three from one club in a window and
44–60% of a five-season span from one seller: the list's order (ability, then potential) still picks the same club's
players at each look (review F10, outside this task).

## Ballon d'Or (`podiums.md`)

`ballon-dor-podiums.ts --seasons 36 --variants released` from the 1950 takeover (awards 1955/56–1985/86, 31 a
world), 10–13 min a world under the host's load.

| setting | world | awards | one club's three | two from one club | distinct winners | most wins | longest run | winner age min / median / max | GK / DF / MF / FW | winner at the strongest club | winner's club European champion |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| flat | podium-1 | 31 | 30 | 1 | 24 | 3 | 2 | 18 / 25 / 36 | 0 / 0 / 2 / 29 | 12 | 25 |
| flat | podium-2 | 31 | 27 | 4 | 23 | 3 | 2 | 19 / 30 / 35 | 0 / 0 / 4 / 27 | 10 | 23 |
| flat | podium-3 | 31 | 28 | 3 | 23 | 4 | 2 | 18 / 26 / 35 | 0 / 0 / 1 / 30 | 11 | 21 |
| **flat** | 3 worlds | 93 | 85 (91%) | 8 (9%) | 70 (23.3 a world) | 4 | 2 | 18 / 27 / 36 | 0 / 0 / 7 / 86 | 33 (35%) | 69 (74%) |
| spread | podium-1 | 31 | 26 | 5 | 24 | 3 | 2 | 18 / 27 / 35 | 0 / 0 / 3 / 28 | 5 | 17 |
| spread | podium-2 | 31 | 26 | 5 | 22 | 4 | 3 | 19 / 26 / 34 | 0 / 0 / 5 / 26 | 10 | 21 |
| spread | podium-3 | 31 | 28 | 3 | 24 | 3 | 2 | 20 / 28 / 35 | 0 / 1 / 2 / 28 | 9 | 16 |
| **spread** | 3 worlds | 93 | 80 (86%) | 13 (14%) | 70 (23.3 a world) | 4 | 3 | 18 / 27 / 35 | 0 / 1 / 10 / 82 | 24 (26%) | 54 (58%) |

The fourth world (`podium-4`) was not read: its two runs were queued behind the gate reads and dropped at 18:35Z
so the gate reads could start before the 19:20Z cut-off (see CLUB-46 below); the pooled rows are three worlds, 93 awards an arm.

The spread breaks up the strongest club's hold on the award a little (winner at the season's strongest club 35% →
26%, one club's three 91% → 86%, winner's club European champion 74% → 58%), and leaves the number of
different winners, the most wins and the longest run where they were. Real football (context, recalled): one club's
three only in 1988, 1989 and 2010; about 47 winners in 69 awards, most wins 8, longest run 4; the winner's club
European champion in about 30% of years.

## Title runs (`champions-runs.md`)

T803's `--champions-runs` on the same four worlds per arm the books and champions read (lived 1930–2009/10 by T697's
gate recipe, which lives T698's champions recipe's seasons: `--years` only chooses which closes are priced).

| arm | 1955/56–2009/10: median longest run per country | world-countries with a run of 5+ | longest anywhere | 1980/81–2009/10: median longest | 5+ | longest |
|---|---|---:|---|---|---:|---|
| flat | BEL 4.5, ENG 5.5, ESP 7, FRA 7, GER 7.5, ITA 5.5, NED 5, POR 5 | 24 of 32 | 18 (BEL, seed 3) | BEL 3.5, ENG 4, ESP 7, FRA 5, GER 5, ITA 5, NED 3.5, POR 5 | 16 of 32 | 13 (ESP) |
| spread | BEL 5, ENG 4, ESP 6.5, FRA 5.5, GER 6.5, ITA 7, NED 6, POR 6 | 23 of 32 | 19 (BEL, seed 3) | BEL 4, ENG 3, ESP 6.5, FRA 4, GER 5, ITA 7, NED 4, POR 4.5 | 17 of 32 | 16 (GER) |

No change beyond one history's luck: the long runs belong to the world's giants and the means level, not to the
squads' spread. Real (recalled, context): the longest run to 2009/10 in the eight leagues was 7 (Lyon), five runs of
five or more in all.

## CLUB-48's books (`books-calibration-*.md`, `books-held-out-*.md`)

| arm | calibration (seeds 0, 1; 1950/1970/1990/2010; ENG ESP FRA GER): strongest-three median ≤ 70% and no club without a project above its revenue | held-out (seeds 2, 3; 1960/1980/2000; all eight): no club without a project above its revenue | held-out medians ≤ 70% (context) |
|---|---|---|---|
| flat | 32 of 32 | 48 of 48 | 47 of 48 (POR 1960 seed 3 76.2%) |
| spread | 32 of 32 | 48 of 48 | 46 of 48 (POR 1960 seed 3 83.5%, BEL 2000 seed 2 70.8%) |

**Holds.** Spread squads cost the means level less (T806: within about 10% per strength), so it binds less: top-flight
club-seasons sold down over seeds 0–1 BEL 373 → 322, NED 309 → 223, POR 276 → 229, FRA 96 → 69, GER 28 → 21.

## LEAGUE-10's champions (`champions.md`)

CLUB-48's champions part, 1980/81–2009/10, the spread worlds against the flat worlds on seeds 0–3, pooled per
country, points outside the real leagues' spread (4–9 different champions, the most titles of one club 7–17):

| | BEL | ENG | ESP | FRA | GER | ITA | NED | POR |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| flat | 0 | 2 | 9 | 3 | 7 | 0 | 0 | 2 |
| spread | 0 | 0 | 4 | 3 | 5 | 3 | 0 | 0 |

**Holds on T698's allowance (6):** every country within flat + 6, and 15 points outside in all against flat's 23.
ITA moves 0 → 3 (seed 1: 6 different champions, one club 20 titles), so on a bar of flat alone (allowance 0) ITA would
fail. The allowance is T698's, measured on the released worlds of 261104; the 19 placebo sets were not lived again on
this tree (76 worlds, about an hour of the box). Champions diverge from flat in 43.4% of the 960 country-seasons
(T698's placebos: 37.0–40.9%).
