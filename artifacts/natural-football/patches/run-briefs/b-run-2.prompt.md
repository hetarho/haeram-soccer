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

Variant b of natural-football. $PORT for this variant: 4102.

# Approach

Your own: pick and build the approach you believe gives the most natural football.


Your last run's summary: 변형 b: 결과 경로는 그대로 두고, 스크립트 작성기의 "플레이 순서"만 고쳐 실제 축구처럼 보이게 했습니다. 변경은 packages/engine/src/script 안에만 있습니다(write.ts, touches.ts, cells.ts, clock.ts, config.ts, 새 테스트 order.test.ts).

접근 방식 (5가지):
1) 받는 지점을 다음 동작 쪽으로: 패스를 받는 위치와 운반이 끝나는 위치를, 그 선수가 이어서 할 동작이 시작되는 셀 쪽 가장자리에 둡니다(seed 기반 0–3 m 깊이). 그러면 연결 운반이 셀을 가로지르는 질주가 아니라 다음 셀로 미는 한 번의 터치가 됩니다. 공을 빼앗긴 상황(가로채기, 루즈볼, 헤비터치)과 분 끝에 받는 사람이 정해지는 경우도 이긴 선수의 다음 동작 쪽에 둡니다.
2) 방향을 보는 비용: 앞으로 연결 운반한 뒤 뒤로 내주는 터치에 벌점을 주고(reversal), 공격 진영에서는 백패스를 공격이 끝난 뒤로 미룹니다(backDelay). 기록에 있는 전진 운반이 백패스에 붙지 않도록 하는 규칙도 touches.ts에 넣었습니다.
3) 백패스 이유: 8 m 이상 뒤로 가는 패스에는 맥락에 맞는 이유가 붙습니다. 첫 터치로 돌려주면 layoff, 25 m 이상이면 reset, 두 레인 이상 가로지르면 switch, 상대 진영이면 pressed, 그 외는 reset입니다. pressed는 기존 staging이 압박 수비수가 바짝 붙고 볼 가진 선수가 몸으로 버티는 모습을 실제로 그립니다.
4) layoff는 최소 hold(0.4 s)를 받아 원터치로 보이고, 남는 시간은 같은 분의 다른 비트가 나눠 갖습니다.
5) pointAway 보정: 최소 패스 거리(7 m)를 맞출 때 공을 셀 반대편 모서리로 보내지 않고, 공에서 곧장 멀어지는 방향으로만 밀어냅니다.

구단주가 보게 될 차이: 받고 → 한두 터치 → 패스. 긴 질주 직후의 뜬금없는 백패스가 줄었고, 공격 진영의 백패스는 첫 터치 리턴이거나 압박을 받은 상태에서 나옵니다.

같은 경기 기준 전/후 측정:
- 40경기, 스크립트만 읽은 값 (스크립트 40개가 README 기준값을 그대로 재현):
  - 연결 운반: 420.3회/4,998 m → 409.4회/4,199 m (−16%)
  - 15 m 이상 연결 운반: 96.1 → 81.5
  - x≥80에서 이유 없는 백패스: 29.75 → 0
  - 8 m 이상 전진 운반 직후 백패스: 7.7 → 5.7
  - 헤비터치: 30.1 → 30.8 (거의 변화 없음)
  - 연결 restart: 16.0 → 15.1
  - 점유 횟수(팀당): 87.4 → 87.7
  - 점유당 패스 중앙값: 3.9 → 3.7
  - 슛으로 끝난 점유 비율: 13% (변화 없음)
  - 검증/카운트 문제: 0/40
- 12경기 staging, model-verdict.ts stage --only 0,3,6,9,12,15 / 20,23,26,29,32,35:
  - 실패 한도: 81 → 64
  - script.backPassReason: 12/12 → 0/12
  - offside.consistency: 2.08 → 1.50
  - 연결 운반 거리: 4,996 → 4,299 m
  - fit.exact/performed/recast: 0 유지
  - stage.pressVisible: 1.0 → 0.975 (한도 ≥0.9 안)
  - 나빠진 것: events.contest 0.927→0.918 (실패 9→10), stretchRate 0.213→0.237 (12/12 그대로), clockRatio 0.975→0.95, 시계 중앙값 0.825→0.815, events.shortKick 실패 0→1

결과 경로는 건드리지 않았습니다. 기록·점수·통계가 동일하므로 MATCH-2/23/28과 MATCH-22 시즌 비용은 변하지 않아 다시 측정하지 않았습니다. Portable golden 계약 테스트는 갱신 없이 통과했습니다.

바꾼 결정: 없습니다. MATCH-38/39/22를 그대로 지켰고, reason은 행동이 아니라 스크립트 주석입니다.

알려진 약점:
- 남은 15 m 이상 연결 운반(경기당 ~80회)은 주로 60–90분 교체 시간대의 분당 몰림에서 나옵니다(예: 73분에 168비트). README 원인 1번인 "만료 터치를 다 쓸 때까지 분을 열어 두는" 작성기 규칙 때문입니다. 선수 창별 균등 분배 당김을 시도했지만 효과가 없어 되돌렸습니다. 이 문제는 계획 사안입니다.
- 나머지 운반 후 백패스(경기당 ~5.7회)는 기록상의 흐름 불균형에서 옵니다.
- 백패스 이유 중 화면에 차이가 보이는 것은 pressed와 layoff뿐입니다.

실행한 것: typecheck, 전체 lint, prettier, unit 테스트(script·staging 36파일 288개, web match-viewer/runtime staging 14파일 107개), portable contract 테스트 — 모두 통과.
실행하지 않은 것(호스트 최종 게이트로 넘김): 통합 테스트(build/sample/scripted-match/frames.match/perform.fixtures/pairings/incidents/match-model), e2e, verify:batch, 40경기 전체 staging 측정.

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
