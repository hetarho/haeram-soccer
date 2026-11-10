# T784 — seller spread of the 단장's fee signings (CLUB-33)

Read-only diagnosis and three candidate rules behind named settings, all off in play. Verdict: no
candidate meets CLUB-33's seller targets without lowering the signings' mean ability, so the rules
stay as released.

- tree: `aa034e8c` plus this task's commit (the settings off by default; `scripts/seller-spread.ts`)
- host: ihaelam-ui-MacBookPro (Apple silicon), at most 4 jobs at once; careers ~18 s a season
- worlds: `generateHistory(seed, 2000)` for `spread-0`, `spread-1`, `spread-2` (40–41 s each), kept
  outside the tree
- careers: ENG, a takeover on 1 August 2000 of LEAGUE-13's reference club of the tier (석유 재벌's or
  중견 사업가's median-priced English club), every responsibility delegated, recruitment's 재정 기조 set
  by `decisionBudgets` (공격적 = `aggressive`, 적극 = `bold`), seasons 2000/01–2007/08; `--inject 0.25`
  puts a quarter of the fortune in on each season's first day (within FFP), as an owner told to
  spend; the 중견 사업가 career ended during 2006/07 (`careerEnded`, cause not read)
- `careers/*.json`: every kept career (`base-` the rules in force; `line-`, `list-`, `signed-`,
  `lsk-` = line+signed+kept, `tsk-` = list+signed+kept); `report.md`: `--in` over all of them

## Commands

```
pnpm exec tsx scripts/seller-spread.ts --seed spread-0 --prepare --world-dir DIR
pnpm exec tsx scripts/seller-spread.ts --seed spread-1 --tier oil --finance aggressive --inject 0.25 \
  --until 2007 [--setting line|list|signed|kept joined by +] --world-dir DIR --out careers/X.json
pnpm exec tsx scripts/seller-spread.ts --in careers/a.json,careers/b.json > report.md
pnpm exec tsx scripts/seller-spread.ts --seed spread-1 --supply --world-dir DIR
```

## Diagnosis (rules in force)

| career | fee signings | one seller in a window | five-season share (4+ signings) | mean OVR | list: clubs / players, top club |
|---|---|---|---|---|---|
| s0 석유 재벌 공격적 | 11 | 3 | 43% (3/7) | 83.9 | 2.9 / 8.4, 4.6 |
| s0 석유 재벌 적극, no money in | 8 | 1 | 60% (3/5) | 84.3 | 3.1 / 8.7, 4.6 |
| s1 석유 재벌 공격적 | 20 | 3 | 78% (7/9) | 84.3 | 4.2 / 11.3, 4.6 |
| s2 석유 재벌 공격적 | 11 | 2 | 50% (3/6) | 82.5 | 4.4 / 10.8, 5.1 |
| s0 중견 사업가 공격적 (second tier, promoted 2001) | 14 | 2 | 30% (3/10) | 82.2 | 3.6 / 8.8, 4.7 |

- Seller: every one of the 64 fee signings came from a top-flight club, the second-tier club's
  included; fee / value on the seller's division 0.81–1.10, the same as on the top flight's. The
  hypothesis that CLUB-25's values on the selling club's division make a strong lower-division
  squad the cheapest fit does not hold here.
- Money: the money checks passed over 0.0–0.1 candidates ranked ahead of each bid; money never
  chose the seller. (Seed 0's bought club reads £0 of revenue over the last 12 months in its first
  owned season, so 재정 기조's wage-bill ceiling refused every signing in 2000/01 — a T785 matter.)
- Band: of the signed, 1–5 the manager's pick, 7–14 the shortlist, 0–2 the rest of the list; the
  단장's candidates are the scout's list itself (`transferOffers`), not the whole reach. 27–49% of
  the bids were refused: no seller accepts every bid.
- The list: at every look one club held 4.6–5.1 of its 8–11 players, over 2.9–4.4 clubs.
- Why the list is one squad (`--supply`, the 2000 world): players aged 18–30 at OVR 83–85, the top
  of 영입 기조 표준's search (40–85), sit in 3 clubs in seed 0 (38 players, 13/13/12, one of them the
  club bought), 5 in seed 1 (30; 13 and 9 in two) and 5 in seed 2 (60; 13/13/12/12/10, one the club
  bought). Squads are drawn tightly at club strength, so a strength-83–85 club holds a whole line of
  near-equal players, while the four strongest clubs (87–97) hold none at 85 or below.
- Doubles: a sold player's place is refilled at once by a player drawn at the same club's strength,
  position and age (`npc-continuity.ts` `replacement`), so the next look offers his double. Seed 1
  bought GK 84/83 aged 20 four times from ENG:1:0:22 in 2000/01 and FW 85 aged 18 three times from
  ENG:1:0:17 in the 2006 summer window.
- Same slot again: an upgrade is measured against the slot's lineup starter; a signing still
  settling in (PLAYER-11) does not start yet, so the slot stays open and the 단장 buys for it again
  (the runs above).

## Candidates (named settings, off in play)

- `LIST_SPREAD` (`scout-search.ts`): `line` lists a club's second player of a line only once every
  club with a fitting player there has one listed; `list` does so over the whole list.
- `UPGRADE_MEASURE` (`signings.ts`): `signed` counts a player who joined in this window and plays the
  slot's position, once, as that slot's measure.
- `REFILL_SALE` (`world-market.ts`): `kept` — a club nobody owns does not sell the player filling a
  place a departure emptied.

| setting | seed | fee signings | window | five-season (4+) | mean OVR (rules in force) |
|---|---|---|---|---|---|
| line | s0 / s1 | 10 / 23 | 2 / 4 | 43% / 75% | 83.6 / 83.4 (83.9 / 84.3) |
| list | s0 / s1 | 6 / 19 | 1 / 3 | 40% / 38% | 80.2 / 80.5 |
| signed | s0 / s1 | 10 / 16 | 2 / 3 | 60% / 50% | 84.4 / 83.6 |
| line+signed+kept | s0 / s1 / s2 | 7 / 16 / 12 | 2 / 3 / 2 | 60% / 50% / 50% | 84.1 / 84.1 / 82.5 (s2 82.5) |
| list+signed+kept | s0 / s1 | 7 / 16 | 1 / 3 | 40% / 36% | 81.9 / 81.0 |

No career meets both targets under any setting (0 of 16). Spreading the list over clubs (`list`)
brings the top club to 1.0 of the list but buys from weaker squads: mean OVR 2.0–3.8 lower, and the
five-season share still 36–40%. The settings that keep ability (`line`, `signed`, `kept`) leave the
ceiling clubs supplying every line. `signed` alone cut fee signings 20 → 16 and 11 → 10 without
lowering mean ability (a CLUB-33 need question of its own).

## Not read

- The owner's 2000s–2020s export: `.tmp/saves/` is not in this worktree, and reading the main
  checkout's needs a permission this unit does not have.
- CLUB-46's value targets and CLUB-48's books: no rule changed, so not re-read.
- Other countries, 적극 with money in, and seasons after 2007/08.
