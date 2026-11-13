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


Your last run's summary: 요약: 운반자가 상대를 돌거나 제친 뒤 되돌아오는 원인을 두 군데서 고쳤습니다. 결과 경로는 건드리지 않았고(기록·통계 동일) playback 계약도 그대로입니다. 이전 라운드 작업은 유지했습니다.

무엇을 바꿨나
1) staging, 볼을 들고 버티는 동안(`pass.ts` holdMove): 아직 제치지 않은 상대가 3 m 안에 붙으면 방향을 한 번만 정하고, 그 상대가 4.5 m 밖으로 떨어질 때까지 유지합니다. 방향은 패스할 쪽으로 상대를 옆으로 비껴 가는 쪽이고(상대가 등 뒤면 앞으로), 자기 골문 쪽으로는 절대 가지 않습니다. 그 길이 동료나 패스 받는 지점에 막히면 공을 밟고 서서 대치합니다. 예전 코드는 매 틱 압박자에게 직각으로 다시 방향을 잡아서 상대 주위를 공전했습니다.
2) staging, 드리블 직전 보유(`carryStep`): 드리블 끝점까지 보유 시간에 맞춰 곧장 걸어가서 끝점을 지나치지 않습니다. 예전에는 짧은 연결 드리블 끝점을 지나쳐 그 주위를 반경 약 2 m로 돌았고, 이것이 빙글빙글의 가장 큰 원인이었습니다. 드리블 경로에 붙은 상대가 있으면 서서 마주 봅니다.
3) staging, 돌파 성공(`takeon.ts`, `carry.ts`): 완료된 take-on, 그리고 4 m 안 앞에 선 상대를 지나가는 완료 드리블은 그 상대 옆으로 비껴 지나갑니다. 지나친 상대는 '제쳐진 선수'(`StageState.beaten`)가 되어 해당 beat가 끝나고 3초 동안 압박하지 않고 운반자를 다시 붙잡지도 않으며 뒤에서 따라오기만 합니다. 그래서 운반자는 앞으로 계속 갑니다. 공을 따내는 쪽은 여전히 기록된 tackle·foul만 가능하고, staging이 tackle을 지어내지 않습니다.
4) 스크립트 작성기(`write.ts`):
   - 같은 칸 안에서 기록된 드리블이 제자리(0 m)였는데, 이제 다음 행동 쪽으로, 없으면 앞으로, 막히면 옆으로 5 m 운반합니다. 이 경기에서 0 m 드리블이 110개에서 27개로 줄었습니다.
   - 칸을 넘는 드리블은 다음 행동이 시작되는 칸에 가장 가까운 지점에서 끝나서, 되돌아오는 연결 드리블이 짧습니다.
5) 회귀 수정: 지난 라운드의 spread pacing 때문에 `staging/incidents.test.ts`(교체 시점 XI 확인)가 이 브랜치에서 실패하고 있었습니다(main에서는 통과). 이제 각 선수의 몫을 창의 마지막 분 시작까지 채우게 해서 통과합니다.

사장님이 보게 될 것: 상대가 붙은 운반자는 그 자리에서 버티며 대치하거나 옆으로 한 방향으로만 비껴 갑니다. 상대 주위를 돌지 않고, 자기 골문 쪽으로 물러나지도 않습니다. 돌파를 시도하면 기록대로 태클·파울로 공을 뺏기거나, 수비를 옆으로 제치고 곧장 앞으로 갑니다. 제쳐진 수비는 뒤에서 쫓아올 뿐 바로 다시 앞을 막지 않습니다.

측정 (사장님이 본 경기, viewer-2, 같은 export → circle.py / stick.py)
| | 2초+ 보유 | 압박 속 빙글빙글 | 뚫고 되돌아옴 | 회전 p90 |
| main | 568 | 105 | 8 | 499° |
| d 이전 | 737 | 154 | 9 | 477° |
| d 지금 | 720 | 71 | 7 | 350° |

3 m 안 상대 쌍(stick.py): main 10초+ 138 / 20초+ 49 / 최장 120 s → d 이전 100 / 23 / 104 s → d 지금 93 / 25 / 241 s. 최장 241 s는 마크맨이 지원 선수를 계속 붙어 다닌 쌍(mark/support)이고, 볼 운반자와 압박자 쌍(carry/press) 10초+는 29(main) → 10(d 이전) → 5(지금)입니다.

picture limit, `model-verdict stage --only 0,3,6,21`(같은 4경기, 전 → 후):
- 실패 수 20 → 25. 정확성은 유지(problems 0, fit.exact/performed/recast 0, validateScript 0).
- 실패가 늘어난 항목:
  - events.contest 2→4경기 (평균 0.935→0.908): 드리블 지나치기를 끈 실험에서도 0.896/0.907이라 그 기능 탓은 아니고, 원인은 확인하지 못했습니다.
  - motion.restarts 1→2 (3.75→4.02, 대치하며 서는 동작 때문)
  - mark.near 3→4 (0.436→0.433)
  - shape.swarm 1→2 (0.015→0.018)
  - shape.huddleLongest 3→4 (4.7→5.3 s)
- 실패가 줄어든 항목: role.invertedFullBack.inside 1→0.
- 통과는 하지만 수치가 움직인 항목:
  - stage.pressVisible 0.981→0.935
  - events.stretchRate 0.223→0.266 (원래부터 실패)
  - offside.consistency 평균 0.5→0.75 (같은 2경기 실패)
- 연결 드리블 400→403회, 3,969→3,853 m.

바꾼 결정: MATCH-12 한 가지입니다. 현재 문구 "under close pressure he shields it on the move, taking it away from the nearest opponent"를 다음처럼 바꿉니다: 붙은 상대에게 막히면 한 방향을 유지해 그를 옆으로 비껴 가거나(상대가 등 뒤면 앞으로), 서서 버틴다(hold it up). 그를 돌지 않고 자기 골문 쪽으로 물러나지 않는다. 지나친 상대는 잠시 그를 다시 막지 않는다.
MATCH-22, 38, 39, 2, 23, 28은 유지했습니다(결과 경로 불변, 추가 beat 없음, tackle을 지어내지 않음, 기록된 칸 안에서만 위치 선택).

약점:
- '뚫고 되돌아옴' 7건이 남았습니다. 기록이 "같은 칸에서 제치기·드리블 → 뒤 칸에서 패스"처럼 출발 칸을 독립적으로 뽑아서, 공을 그 칸으로 되돌려야 하기 때문입니다.
- 같은 선수의 연속 드리블 중 반대 방향 왕복이 이 경기에서 58쌍 남았습니다. 대부분 칸 경계 3–4 m 왕복이고, 이것은 결과 경로가 패스·드리블을 사슬로 뽑아야 고칠 수 있습니다(재보정 필요, 사장님 결정 사항).
- 위의 picture limit 소폭 악화가 있습니다.

확인한 것: typecheck 통과, 전체 lint 통과. staging·script 단위 테스트 36파일 293개 통과(새 `staging/held.test.ts`와 `natural.test.ts`의 새 검사 포함). 엔진 통합 테스트 perform.fixtures, incidents, frames.match, script build·sample, scripted-match 통과(build·sample은 마지막 작은 staging 수정 전에 돌림). portable golden contract 테스트 통과, golden 변경 없음.

돌리지 않은 것(호스트 최종 게이트 몫): `staging/pairings.test.ts`, 전체 suite, e2e, verify:batch. picture limit 측정은 stage 세트 40경기 중 4경기만 했습니다.

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
