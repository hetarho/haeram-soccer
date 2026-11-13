# Owner feedback: the players move too fast

The owner watched your match and said the players seem a bit fast ("선수들 속도가 좀 빠른것 같긴
하네"). The watch speed is being changed to real time (1x = 60 real seconds a match minute), so
the picture must move at real football's speeds on the match clock.

Keep everything you already built and fix the speed, by your own judgement. Same rules as before:
engine only, the playback contract kept, determinism, affected unit tests only, no e2e or batch,
no commit. The owner said the SSOT may change freely; still name every decision you change in your
summary so it can be written down.

## Measured on the match the owner watched (running play, dead balls excluded, `speed.py`)

| | main engine | real football (approx., elite men's league) |
|---|---|---|
| typical speed (median) | 1.3 m/s | similar |
| distance per 90 min | 9.2 km | 10–12 km |
| high-speed running (5.5 m/s+) per 90 | 2.7 km | 0.7–1.0 km |
| sprinting (7 m/s+) per 90 | 1.8 km | 0.2–0.35 km |
| top speed (median player) | 58 m/s | 9–10 m/s |
| player-seconds above 10 m/s | 2.5% | 0% |

Typical movement already matches real football. The excess comes in bursts, worst in a few
minutes (24'–27', 74'–76' on this match): minutes where the script packs many beats, so the
staging moves players impossibly fast to play them all (README cause "clock rate"; T840 measured
260 beats in one minute at a substitution window).

## Too slow as well: near-frozen minutes

Watching again, the owner said that when no action is commanded the picture looks extremely slow
("명령이 없을 때를 보니까 또 엄청나게 느리게 보이네"): around one minute he saw two panels almost
standing still. It is the other side of the same clock: the script leaves some minutes nearly
empty and packs others. Per minute on the main engine (`minutes.py`, mean outfield speed in
running play): 16 near-frozen minutes under 0.7 m/s (29'-38', 45+1'-45+4', 82', 84') and 12 rushed
minutes over 3 m/s (22'-27', 62', 63', 72', 75', 76', 80'); events a minute from 0 to 184. Real
football keeps a team's mean speed near 1.5-2.5 m/s in every minute of running play, with the
ball always moving somewhere. Make every minute look like football at real pace: no minute that
stands still and none that races.

## Measure your version on the same match

From your worktree (writes outside the repo; about 30 s and 1 GB):

    pnpm exec tsx /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/export.mts --out /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/out/followup/<your variant letter>.json.gz
    python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/speed.py now=<that file>
    python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/minutes.py now=<that file>
    python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/circle.py now=<that file>
    python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/stick.py now=<that file>

Do not edit those scripts. Keep the earlier gains (circle.py, back passes, linking carries) and
read the staging's own picture limits on a few `scripts/model-verdict.ts stage` matches.

## Done

- No near-frozen and no rushed minute (`minutes.py`); no player above real top speed; high-speed and sprint distances near the real-football column;
  the speed table for your version before and after, plus circle.py and stick.py.
- Typecheck, lint and the affected engine unit tests pass.
- A summary: what changed in how fast the owner sees players move, decisions changed, weaknesses.
- Timebox: about 1.5 hours.
