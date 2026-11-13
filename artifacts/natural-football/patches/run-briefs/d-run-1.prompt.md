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
