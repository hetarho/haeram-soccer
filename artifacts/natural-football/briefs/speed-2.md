# Next round: real-football pace in every minute

Keep everything in your combined engine and now fix the pace. The watch speed is real time (1x =
60 real seconds a match minute, on main since T869), so the picture must move at real football's
speeds on the match clock, every minute. Same rules as before: engine only, the playback contract
kept (an added optional field is fine), determinism, the affected unit and integration tests, no
e2e or batch, no commit. The owner said the SSOT may change freely; name every decision you change.

## The owner's words

- "선수들 속도가 좀 빠른것 같긴 하네" — the players seem a bit fast.
- "명령이 없을 때를 보니까 또 엄청나게 느리게 보이네" — when nothing is commanded, the picture looks
  extremely slow; around one minute he saw two engines almost standing still.

## Your combined engine on the owner's match (`4fc4da1a`; running play, dead balls excluded)

| | combined engine | real football (approx., elite men's league) |
|---|---|---|
| distance per 90 min | 10.1 km | 10–12 km |
| high-speed running (5.5 m/s+) per 90 | 1,866 m | 700–1,000 m |
| sprinting (7 m/s+) per 90 | 921 m | 200–350 m |
| top speed (median player) | 17.1 m/s | 9–10 m/s |
| player-seconds above 10 m/s | 0.52% (worst 75', 74', 88', 79', 80') | 0% |
| near-frozen minutes (mean speed < 0.7 m/s) | 5 (28', 45+1'–45+4') | 0 |
| rushed minutes (mean speed > 3 m/s) | 11 (34', 47', 72', 74'–81', 88') | 0 |
| spells held 5 s+ under pressure | 9 | few |

Your own last summary found the remaining causes: the rushed minutes sit in the 72'–88'
substitution windows, and most remaining 5 s+ holds come from sparse minutes where the clock
stretches a beat (an 8 s dribble shown over 30 s). Real football keeps a team's mean speed near
1.5–2.5 m/s in every minute of running play, the ball always moving somewhere, with short sprints.

## Measure (from this worktree; the export writes outside the repo, about 30 s)

    pnpm exec tsx /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/export.mts --out /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/out/followup/merged.json.gz
    for s in speed minutes press circle stick: python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/$s.py now=<that file>

A one-match read swings a lot with small writer changes (your last round saw circling 58–75 and
frozen minutes 5–13 across versions), so confirm a change on a few `scripts/model-verdict.ts stage`
matches as well before you keep it. Do not edit the viewer scripts.

## Done

- No near-frozen and no rushed minute; no player above real top speed; high-speed and sprint
  distances near the real-football column; the table above before and after.
- The earlier gains kept: passes lost to nobody, holds under pressure, circling, beat-then-come-back,
  sticking pairs (`press.py`, `circle.py`, `stick.py`).
- Typecheck, lint and the affected engine unit and integration tests pass.
- A summary: how the owner will now see the pace, decisions changed, weaknesses.
- Timebox: about 2 hours.
