# Natural football — handoff (261113)

Work in progress to make the watched own match look like natural football. Pushed as
`wip/natural-football` so the owner can continue on another machine. Nothing here is on `main`
yet; `main` is not affected by this branch until it is merged.

## Where it stands

Branch history on top of `9769ffe9` (main at the start):

| commit | what | state |
|---|---|---|
| `f8bbfa52` | D, round 1: script writer spreads each player's touches over his window (no minute bursts), passes land toward the receiver's next touch, back passes get a reason | tested (unit) |
| `2f14fa4a` | D, round 2: staging stops circling under pressure (one direction or hold up), a beaten man does not re-press for 3 s, take-ons go on forward, zero-length carries fixed | tested (unit + engine integration) |
| `4fc4da1a` | combined engine: D + A's outside-shot placement + B's back-pass-after-forward-carry penalty; new pressure release (`staging/release.ts`): a carrier reached within 2.2 m plays within 0.4 s, only a press-resistant player ((dribbling×2 + composure + strength)/4 ≥ 78) holds up to 2.5 s; a lost pass aims at the nearest teammate and is cut out in front of him; a sub/red-card beat no longer runs the clock into the next minute | tested (48 files, 350 tests; no e2e) |
| `5f091b6f` | pace round, stopped midway for this handoff (`staging/pace.ts`, `staging/keep.ts`, frame clock) | **untested** — review before keeping |
| merge of `main` | brings T868/T871 (1x = real time, `WATCH_MINUTE_MS` 60000) and the finance work | — |

The four variants A–D came from one identical brief (`briefs/shared.md`); the owner saw no clear
winner by eye and asked to combine them by the numbers. A, B and C were deleted; their committed
and unfinished work is in `patches/` (`<v>.committed.patch` against `9769ffe9`,
`<v>.wip.patch` = stopped unfinished work), and every run's brief with the previous summary is in
`patches/run-briefs/`. C never finished a run.

## Measured on the owner's match (seed `viewer-2`, 2024 ENG top flight, round 1, 2-2)

| | main engine | combined `4fc4da1a` | real football (approx.) |
|---|---|---|---|
| circling under pressure (`circle.py`) | 105 | 75 | — |
| beat his man, then came back | 8 | 5 | — |
| opponent pairs within 3 m for 20 s+ (`stick.py`) | 49 | 18 | — |
| lost passes that went to nobody (`press.py`) | 38 | 14 | — |
| spells held 2 s+ / 5 s+ with an opponent within 2 m | 95 / 26 | 55 / 9 | few |
| player-seconds above 10 m/s (`speed.py`) | 2.5% | 0.52% | 0% |
| sprint metres per 90 | 1,831 | 921 | 200–350 |
| top speed (median player) | 58 m/s | 17.1 m/s | 9–10 m/s |
| near-frozen / rushed minutes (`minutes.py`) | 16 / 12 | 5 / 11 | 0 / 0 |
| receivers offside at the kick (`offside.py`) | 7 (5 by 5 m+) | 11 (9 by 5 m+) | 0 |

Result path untouched throughout: scores, records and statistics are identical to main's.

## Next, in order

1. **Pace** (`briefs/speed-2.md`): review or redo the WIP commit `5f091b6f`; goal: no frozen or
   rushed minute, nobody above real top speed, high-speed/sprint distances near real, earlier
   gains kept.
2. **Offside** (`briefs/offside.md`): the owner saw it at 21′01″ — at a home free kick from its own
   half the staging walked the recorded winner (a CM) 25 m past the defence during the dead ball,
   no defender tracked him, no offside. Mostly restarts. Goal: `offside.py` at 0.
3. Show the owner, take his feedback.
4. Land: merge this branch into `main` (do not use `vibe ab pick` on another machine — the ab state
   lives only in the first machine's `.git`), write the SSOT changes the summaries name
   (MATCH-12: hold up / one direction / no circling, a beaten man does not re-press, release
   under pressure with the press-resistant exception, the interception's receiver chosen on screen,
   the sub/red-card beat's clock; `StagingPlayer.escape` optional field), decide whether
   `artifacts/natural-football/` stays, run the final gate (`verify:batch` with e2e) and push.

Known weak spots: a one-match read swings with small writer changes (circling 58–75 across
versions), so confirm on a few `scripts/model-verdict.ts stage` matches; picture limits still
failing as in T840 (`events.stretchRate`, `offside.consistency`, `mark.near`, …); remaining
beat-then-come-back cases come from the record's independently drawn cells (fixing them needs
chained flows in the result path, a recalibration the owner has not ordered).

## Tools (all engine-only, no React, no dev server)

From a checkout of this branch (`pnpm install` first):

    # one match from this checkout's engine; --out must be outside the repo
    pnpm exec tsx artifacts/natural-football/viewer/export.mts --out /tmp/nf/merged.json.gz
    # measures
    for s in circle stick speed minutes press offside; do python3 -I artifacts/natural-football/metrics/$s.py now=/tmp/nf/merged.json.gz; done
    # page: list up to four panels in viewer/panels.tsv (label<TAB>caption<TAB>export file), then
    bash artifacts/natural-football/viewer/rebuild.sh
    python3 -m http.server 19610 --bind 0.0.0.0 --directory artifacts/natural-football/viewer/out/variants

For a baseline panel, export from a checkout of `main` the same way. The page opens at 1x (real
time), shows the clock with seconds (`49′ 23″`), plays and pauses on Space, steps 5 s with ← / →,
and keeps all panels on one shared clock (`각자 시계` gives each its own).

## Owner preferences learned in this run

- Watch speed 1x = real time; the game still opens at 2x.
- Show each update as soon as one variant changes; one page, one port reachable from other
  machines; seconds on the clock; arrow keys step 5 s.
- Closeness between players is fine (a stand-off); circling, beat-then-return, lone receivers and
  holding the ball under pressure are not. "상대가 다가오면 패스를 해야해 그게 축구야."
- The SSOT may change freely for this work; name every changed decision.
- Judge by numbers on the same match when the eye cannot tell.
