# Owner feedback after watching your match

The owner watched your engine's match side by side with others. His words:

1. "지금 술래잡기하듯이 선수랑 엄청 가까운데 계속 붙어서 돌아다니는게 많아" — a lot of players stay
   very close to an opponent and move around stuck to him, like a game of tag.
2. Then, more precisely: "선수가 가까이 붙으면 전진을 못하고 대치할수는 있는데 이미 뚫고 다시 돌아와서
   빙글빙글 도는게 가장 큰 문제야. 그래서 붙은 상태에서 돌파를 시도하면 태클을 해서 뺏기거나 드리블을
   성공하면 앞으로 쭉 가게 하면 돼."
   — A carrier held up by a close opponent, unable to go forward and facing him off, is fine. The
   biggest problem is a carrier who has already got past his man, comes back and goes round and
   round. When he tries to beat the man stuck to him, either the man tackles him and wins the
   ball, or the dribble succeeds and he goes straight on forward.

Keep what you already built and make this right, by your own judgement. Same rules as before:
engine only, the playback contract kept, every SSOT decision you change named in your summary,
determinism, affected unit tests only, no e2e or batch, no commit.

## Facts to know (not prescriptions)

- Who wins a duel is a game fact: take-ons, tackles and their winners are recorded actions of the
  result path, and the script and staging do not invent a tackle (MATCH-38, MATCH-39). If the
  owner's rule needs a change there, name the decision.
- MATCH-12 currently says that under close pressure the carrier "shields it on the move, taking it
  away from the nearest opponent at the same bounded pace".

## Measured on the match the owner watched (running play, dead balls excluded)

Spells on the ball of 2 s or more on the current main engine (`circle.py`):

| | spells | circling under pressure (path turns 270°+ with an opponent within 3 m at half the spell or more) | beat his man, then came back 3 m+ | 90th percentile of a spell's turning |
|---|---|---|---|---|
| main | 568 | 105 | 8 | 499° |

Opponent pairs within 3 m of each other (`stick.py`): 138 pairs for 10 s+, 49 for 20 s+, the
longest 120 s. The owner accepts closeness as such; it is the circling and coming back he wants
gone.

## Measure your version on the same match

From your worktree (writes outside the repo; about 30 s and 1 GB):

    pnpm exec tsx /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/export.mts --out /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/out/followup/<your variant letter>.json.gz
    python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/circle.py now=<that file>
    python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/stick.py now=<that file>

Do not edit those scripts. Also read the staging's own picture limits on a few
`scripts/model-verdict.ts stage` matches, so marking, pressing and shape stay football.

## Done

- Both tables above for your new version, plus the picture limits you moved, before and after.
- Typecheck, lint and the affected engine unit tests pass.
- A summary: what the owner will now see when a carrier is held up and when he takes his man on,
  the decisions you changed, and the weaknesses.
- Timebox: about 1.5 hours.
