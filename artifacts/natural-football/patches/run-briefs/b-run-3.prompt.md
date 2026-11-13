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


Your last run's summary: 변형 b 후속 작업: 제친 뒤 되돌아오거나 빙글빙글 도는 모습은 줄었지만 다 없애지는 못했습니다. 그 대가로 그림 한도 두 개가 나빠졌습니다. 결과 경로는 건드리지 않았고, 변경은 staging에만 있습니다(packages/engine/src/staging: pass.ts, takeon.ts, world.ts, config.ts, 새 테스트 takeon.test.ts).

구단주가 이제 보게 될 모습:
- 붙어서 막혔을 때(대치): 공 가진 선수는 앞 상대를 피해 뒤로 물러서지 않습니다. 정한 한쪽 옆으로 천천히 버티고, 수비수는 골문 쪽에서 따라붙습니다. 예전에는 수비수 주위를 직각으로 비켜 돌았는데, 수비수가 계속 골문 쪽으로 돌아 들어가 원이 됐습니다. 이제 방향을 직각 이상 틀 때는 속도를 40%로 줄여 그 자리에서 돌고(holdMove.turnSlow 0.4), 짧은 운반은 끝점에서 멈춥니다(끝점 주위를 공전하던 원인).
- 돌파 성공: 수비수가 공격수가 가려는 길목에 서고, 공격수는 그 지점을 옆으로 지나 그대로 끝점까지 앞으로 갑니다. 돌파 방향에는 자기 골문 쪽 성분이 없고, 끝점은 늘 수비수보다 최소 2 m 앞입니다. 제쳐진 수비수는 3초 동안 다시 압박하지 않고 쫓아오기만 합니다(예전에는 곧바로 앞에 다시 나타났습니다).
- 돌파 실패: 태클로 공을 빼앗는 경우는 원래처럼 기록된 경합만 그립니다. 누가 이기는지는 바꾸지 않았습니다.

같은 경기 측정(circle.py, 이전 → 이후, main은 참고):
- 2초 이상 점유: 644 → 640 (main 568)
- 압박 속 돌기: 124 → 76 (main 105)
- 제친 뒤 3 m 이상 복귀: 11 → 6 (main 8). 비슷한 설정 사이에서 4~6회로 흔들렸고, 6이 최종 상태로 다시 내보낸 값입니다.
- 회전 p90: 432° → 338° (main 499°)

stick.py(이전 → 이후, main은 참고):
- 3 m 이내 쌍 10초 이상: 119 → 122 (main 138)
- 20초 이상: 42 → 41 (main 49)
- 최장: 242 s → 242 s (main 120 s)
- 2 m 이내 비율: 7.9% → 7.8% (main 7.5%)
가까이 붙는 것 자체는 그대로입니다(구단주가 받아들인 부분).

그림 한도(model-verdict stage, 6경기 #0·6·12·20·26·32): 실패 합계 27 → 30.
- 나아진 것: events.stretchRate 0.247→0.209 (실패 6→6), events.contest 0.924→0.935 (5→5), turn.reverse 0.347→0.346 (6→5), shape.huddleLongest 5.45→4.98 (4→4), stage.pressVisible 0.976→0.979.
- 나빠진 것: motion.restarts 3.84→4.07 (한도 4, 실패 1→4), offside.consistency 0.67→0.83 (실패 2→3).
- fit.exact·performed·recast 0 유지, 점수와 스크립트는 이전과 동일.

바꾼 결정: MATCH-12의 "압박을 받으면 가장 가까운 상대에게서 멀어지며 몸으로 지킨다"를 "골문 쪽으로 물러서지 않고 옆으로 버티며 상대 둘레를 돌지 않는다. 제치면 그대로 앞으로 간다"로 좁혔습니다. 그래서 돌파 끝점이 스크립트 지점보다 수비수 너머로 몇 m 밀릴 수 있습니다. MATCH-38·39·22는 그대로입니다.

약점:
- motion.restarts는 짧은 운반의 끝점에서 멈췄다가 다시 출발하기 때문입니다. 멈추지 않고 계속 가게 해 봤지만 돌기가 80으로 늘고 전술 테스트 3개가 깨져 되돌렸습니다.
- offside.consistency가 왜 나빠졌는지는 조사하지 못했습니다.
- 남은 돌기 76회는 주로 기록상 운반이 셀 경계를 오가는 부분(한 번 오갈 때마다 4~7 m)과 60~90분대 비트 몰림에서 나옵니다. 스크립트 쪽에서 운반 순서를 바꾸거나 합쳐야 하는 문제라 이번에는 하지 않았습니다.

실행한 것: typecheck, pnpm run lint, prettier, engine unit 292개(새 takeon.test.ts 포함), portable 계약 테스트 6개 — 모두 통과. golden 갱신은 필요 없었습니다.
실행하지 않은 것(호스트 최종 게이트로 넘김): 통합, e2e, verify:batch, 40경기 전체 staging 측정.

Your branch already contains this work; change only what is asked.

Follow-up request:
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
