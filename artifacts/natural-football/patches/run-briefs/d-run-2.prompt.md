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

Variant d of natural-football. $PORT for this variant: 4104.

# Approach

Your own: pick and build the approach you believe gives the most natural football.


Your last run's summary: Approach (script writer only, packages/engine/src/script/write.ts + config.ts; result path and playback contract untouched, so records and statistics are unchanged): (1) each player's floating touches are spread over his window (spread pacing: groups by side/player/window pulled when behind their even share), so departing players' touches are no longer left for their window's end; (2) a reserved restart delivery no longer holds its window's last minute open (it caused 100-300-beat bursts in one minute); (3) a completed pass lands on the side of its recorded cell nearest where the receiver's chosen touch starts, shortening the linking carry; (4) every open-play pass played 5 m+ back gets a reason: 'layoff' (first-time return of a forward pass), 'pressed' in the other half (the staging brings the presser to him before the kick, so the cause is visible), 'reset' in his own half. What the owner sees: fewer and shorter 'carries through everybody', no frozen minute followed by a burst near substitutions, and back passes in the attacking half that come after a visible press. Before -> after on the same 6 matches (model-verdict stage --only 0,3,6,21,24,27): linking carries 410.8 -> 412.0; linking metres 5,016 -> 4,094 (-18%); links of 20 m+ 72 -> 57, 30 m+ 40.5 -> 31; heavy touches 24.8 -> 21.5; restarts without a recorded delivery 15.5 -> 13.7; script.backPassReason 6/6 failing (27.2 a match) -> 0/6; failing picture limits 36 -> 31; most beats in one minute 361 -> 91; exactness held (0 problems, fit.exact/performed/recast 0, validateScript 0). Decisions changed: none (reasons use the existing contract field ScriptBeatReason; the script still adds only links, heavy touches and restart deliveries; MATCH-22/38/39 kept). Known weaknesses: the root cause remains - the result record draws pass origins and destinations independently, leaving about 220 cell mismatches a match, so the number of linking carries does not fall and long links still pile up after 60' (37 -> 79 -> 161 per half hour); fixing it needs pass flows drawn as chains in the result path, which means recalibration (an owner call). Some limits worse on this sample: events.stretchRate mean 0.189 -> 0.24 (already failing everywhere; only a few events per match), shape.huddleLongest 4/6 -> 5/6, role.invertedFullBack.inside and motion.restarts now fail 1/6; clock fit about the same (189 -> 198 of ~310 stretches outside range) and a rate outlier at a period end remains. Only 'pressed' changes the picture; 'layoff' and 'reset' are labels the staging does not act on. Forward carry then back pass barely reduced (7.7 -> 7.0 a match). Tried and removed: per-cell flow-balance pricing (+17% linking metres), per-cell pacing, upfield-link penalty. Checks: typecheck pass, full lint pass, script + staging + scripted-match unit tests pass (incl. new natural.test.ts), portable golden contract test passes with goldens unchanged; no copy added. Not run (host's final gate): integration, e2e, full suite; read covers 6 of the 40 stage matches.

Your branch already contains this work; change only what is asked.

Follow-up request:
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
