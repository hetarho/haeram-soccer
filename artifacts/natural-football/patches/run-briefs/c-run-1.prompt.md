You build one variant of an A/B comparison started by an orchestrator, on your own branch; implement it fully enough for a person to compare it. Write only inside this workspace, your own git worktree (scratch files under a git-ignored path in it or in the OS temp dir), never in its parent folders. Do NOT edit spec/ (nothing is decided yet), run git add/commit/push/merge (the host commits your changes), start long-running servers (the host serves each variant on its own port as $PORT), or spawn subagents. At task tier, run only added/changed/affected unit tests and fast type/lint/format checks. Write or update integration/e2e tests as needed, but do not launch browsers, integration/e2e or full suites at task/session completion. The coordinator host owns their single final gate on the integrated candidate before the target-branch push. Classify tests by their isolation and dependencies, not their script names. Use small fixtures for unit tests; record deferred commands/specs in result limits and never report unrun checks as passed. Return outcome, summary (what you changed and its trade-offs), view (where a person should look: screen, state or command) and path (the URL path the host opens first, e.g. /settings/profile; empty for root or no screen); outcome blocked only when the variant cannot be built, with the reason in summary.

# Goal

The owner watches his club's matches on the pitch. Make the watched match look like the most
natural football you can, judged by your own sense of real football. The owner's words: "각자
본인이 생각했을 때 가장 자연스러운 축구가 되도록" (make it the football you yourself think is most
natural).

His complaint with the released model (`scripted-aggregate-11`): a player carries the ball through
everybody, then suddenly passes it backward.

Choose your own approach. Any part of the match engine may change (the result path, the script
writer, the staging) as long as the result is merge-ready: good enough to merge to main as it is,
not a prototype.

# Background (facts to read, not prescriptions)

- `artifacts/benchmarks/scripted-model-calibration/README.md` (T840, the released model's verdict):
  the script invents about 420 linking carries over 5.0 km a match; `script.backPassReason` counts
  29.8 back passes a match with no reason and fails in 40 of 40 matches; its causes table lists
  the other failing picture limits.
- `spec/STATE.md` inbox lines dated 261111 and 261112 that cite MATCH-22, MATCH-38 and MATCH-39.
- SSOT: `spec/ssot/MATCH.md` (MATCH-12, 16, 17, 22, 28, 37, 38, 39, and the real-football targets
  MATCH-2 and MATCH-23) and `spec/ssot/ARCH.md` (ARCH-9 portable math, ARCH-31 the released
  model). Read decision blocks with
  `node /home/deep/.npm/_npx/c183f26c8545da3b/node_modules/@haeram/gusta/bin/gusta.mjs vibe brief MATCH-38 --summary`
  (any ID), not whole files.
- Measuring tools: `scripts/model-verdict.ts` (`stage`, `curve`, `sum`), `scripts/staging-read.ts`,
  the staging metrics in `packages/engine/src/staging/metrics.ts`.

# Scope and rules

- Engine only: `packages/engine`, plus `packages/contracts` only where the engine's own types or
  the model revision live. Do not edit `apps/web` (the React game UI), `spec/` or the CI files.
- The game's pitch must keep drawing your staged playback with no web change: keep the playback
  contract the web reads (the frame and motion types in `packages/contracts/src/types.ts`) and the
  engine entry points the game uses to settle and stage an own match.
- Do not change the watch speeds or the presentation clock
  (`apps/web/src/entities/match/lib/presentationClock.ts`); that is handled separately.
- Keep the SSOT decisions. If your approach needs to change one (for example MATCH-38's "the script
  adds only linking carries, heavy touches and restart deliveries", MATCH-22's one result path or
  MATCH-39's "the staging is presentation only"), you may, but list every decision ID you changed
  and how in your summary. Do not edit the SSOT files themselves.
- A match stays a game fact: the same inputs and seed give the same result and the same picture
  on every machine (portable math, ARCH-9). Results and statistics stay within the real-football
  targets the model is measured against (MATCH-2, MATCH-23, MATCH-28); if you change the result
  path, measure them again and report. Season simulation cost stays within MATCH-22's budget.
- No save compatibility is needed (the game has not launched). If engine timing changes, update the
  portable goldens (`update-golden --write`, then prettier) and check the diff touches only what
  you meant to change.
- The host is shared (12 cores, other sessions running): run only the affected unit tests and the
  fast checks (typecheck, lint, `pnpm run validate:i18n` if you add copy). No browser e2e, no
  Playwright, no `verify:batch`, no dev server. Keep long reads small (a subset of the
  `model-verdict.ts stage` set) and run them in the foreground.
- Do not commit; the tooling commits your worktree when you finish.
- Timebox: about 2.5 hours of work. Leave the worktree in a working, tested state.

# Done

- Own matches are settled and staged with your approach; typecheck, lint and the affected engine
  unit tests pass.
- Before and after numbers on the same matches: at least linking carries and metres,
  `script.backPassReason` and the failing-limit count from `scripts/model-verdict.ts stage`, plus
  the result statistics if you touched the result path.
- A summary: your approach in a few lines, what changes in the football the owner will see, the
  measured before/after, the decisions you changed, and the known weaknesses.

Variant c of natural-football. $PORT for this variant: 4103.

# Approach

Your own: pick and build the approach you believe gives the most natural football.

A previous session on this worktree was cut off before it finished; its uncommitted changes are still in the worktree. Keep, change or drop them as you judge.

The owner has since watched other engines' matches and given the feedback below. Build your approach with it in mind, in one pass (timebox about 3 hours in all).

---

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


---

# Second request, in the same pass

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
