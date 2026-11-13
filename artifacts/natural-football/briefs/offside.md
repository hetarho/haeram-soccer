# Next round: no lone receiver waiting offside

Keep everything you have built. Same rules as before: engine only, the playback contract kept (an
added optional field is fine), determinism, the affected unit and integration tests, no e2e or
batch, no commit. The owner said the SSOT may change freely; name every decision you change.

## The owner's words (watching the combined engine, `4fc4da1a`)

"지금 통합엔진에서 21분01초에 왜 흰색팀 공격수만 혼자 멀리 동떨어져있고 그쪽으로 패스가 가지? …
심지어 오프사이드도 안됐네" — at 21′01″, why is one attacker of the white team standing alone far
away from everybody, and why does the pass go to him? It was not even given offside.

## What happened there (the owner's match, minute label 21 = running seconds 1200–1260)

- A home free kick from its own half (ball at x ≈ 37 m; home attacks +x). The record: Matthew
  Morris's free kick, not completed, the loose ball won by Daniel Bailey (a CM) in the deep left
  cell around (85.7, 22.6); Bailey then carries and crosses.
- During the dead ball (t = −15 s to the kick at 2.1 s) the staging walks Bailey from x = 41 to
  x = 84.6, state `shape`/`support`, to the cell where the record has him win the ball. At the kick
  the opponents' second-last player is at x = 59.8: Bailey stands 24.8 m beyond the offside line,
  25–30 m from every teammate, with no defender tracking him. The ball is then played to him.

## How often (`offside.py`: a ball played to a teammate whose receiver is in the opponent half,
1 m+ beyond the second-last opponent and the ball at the kick; throw-ins, goal kicks, corners skipped)

| | balls played to a teammate | receiver offside at the kick | of which 5 m+ beyond |
|---|---|---|---|
| main | 795 | 7 | 5 |
| combined engine | 819 | 11 | 9 |

Almost all are restarts (free kicks): the dead ball gives the staging time to bring the recorded
winner to the recorded landing cell, ignoring the offside line, his role and the defenders.

## What football looks like

At a free kick or any long ball, attackers hold the line (onside) and run when the ball is
struck; defenders hold their line and track the runner. A player does not stand alone 25 m past
the defence waiting for the ball, and a ball is not played to an offside player unless the record
says offside. Who wins the ball stays the record's fact; where in the recorded cell the ball lands
and how the winner gets there are yours to choose.

## Measure (from this worktree; the export writes outside the repo, about 30 s)

    pnpm exec tsx /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/export.mts --out /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/out/followup/merged.json.gz
    for s in offside speed minutes press circle stick: python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/$s.py now=<that file>

Also read `offside.consistency` and the other picture limits on a few `scripts/model-verdict.ts
stage` matches. Do not edit the viewer scripts.

## Done

- `offside.py` at 0 receivers offside at the kick (or each remaining case explained), the 21′ scene
  played onside with the runner timing his run, and the earlier gains kept.
- Typecheck, lint and the affected engine unit and integration tests pass.
- A summary: what the owner will see at free kicks and long balls, decisions changed, weaknesses.
- Timebox: about 1.5 hours.
