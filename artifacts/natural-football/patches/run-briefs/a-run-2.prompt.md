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

Variant a of natural-football. $PORT for this variant: 4101.

# Approach

Your own: pick and build the approach you believe gives the most natural football.


Your last run's summary: ## 접근
결과 경로(aggregate 기록)와 스테이징은 그대로 두고, 스크립트 작성기(`packages/engine/src/script/write.ts`)만 고쳤습니다. 진단해 보니 원래 탐욕 순서 그대로 링크 끝점만 최적으로 다시 짝지어도 4.7km가 2.6km로 줄어들었습니다. 링크 거리는 70–90분에 초반보다 약 5배 많았습니다. 바꾼 것은 다섯 가지입니다.
1. **패스 착지점:** 기록된 도착 셀 안에서, 받는 선수의 다음 터치가 시작되는 쪽 가장자리로 겨눕니다. 공을 받고 셀을 가로질러 끌고 가는 장면이 사라집니다.
2. **기록된 캐리 끝점:** 다음 캐리나 릴리스가 시작되는 셀 쪽으로 끝나게 했습니다.
3. **한 수 앞보기 비용(`LOOKAHEAD` 0.3):** 공을 다음에 할 일이 없는 곳으로 보내지 않게 합니다. 정수 cm 계산이라 이식성(ARCH-9)과 결정성이 유지됩니다.
4. **백패스 사유:** 8m 이상 뒤로 가는 오픈플레이 패스에 사유를 붙입니다. 패스를 받자마자 돌려주면 `layoff`, 상대 진영이면 `pressed`, 자기 진영이면 `reset`입니다. `pressed`는 스테이징이 실제로 그립니다: 수비수가 바짝 붙고, 볼 가진 선수가 공을 지키고, 압박이 닿은 뒤에 찹니다. 그래서 숫자만 맞추는 꼬리표가 아니라 눈에 보이는 이유입니다.
5. **박스 밖 슈팅 위치:** 셀의 골문 쪽 10m 안에서 찹니다. 골문 쪽으로 한두 걸음 치고 들어가 슈팅하고, 패스를 받아 바로 차는 경우는 착지점을 그 위치로 겨눕니다.

## 오너가 보게 될 변화
- 공을 받은 선수가 셀을 가로질러 끌고 가는 장면이 줄어듭니다.
- 뒤로 주는 패스는 압박을 받거나, 받자마자 돌려주거나, 자기 진영에서 다시 시작할 때만 나옵니다.
- 중거리 슛이 30m 밖이 아니라 18–27m에서 나옵니다.

## 전/후 측정 (같은 10경기, `model-verdict.ts stage --only 0,2,4,6,8,20,22,24,26,28`; 전 = HEAD 9769ffe9)
| 항목 | 전 | 후 |
|---|---|---|
| 링크 캐리 | 429.4개 | 411.9개 |
| 링크 거리 | 5,052m | 4,148m (−18%) |
| `script.backPassReason` | 10/10 실패 (평균 31.0) | 0/10 |
| 실패 한계 합계 | 68 | 53 |
| 평균 슈팅 거리 (목표 15–18, 허용 ≤20.6) | 21.3m | 18.2m |
| 30m+ 슈팅 비율 (목표 ≤10%) | 28.3% | 0.4% |
| 헤비 터치 | 31.4 | 33.8 |
| 기록 없는 리스타트 | 16.0 | 15.0 |
| `fit.exact`/`validateScript` 문제 | 0 | 0 |

- 개선된 한계: `offside.consistency` 6→4, `shape.huddleLongest` 9→8, `mark.near` 9→8, `role.poacher.shoulder` 2→1, `shape.spacing` 1→0.
- 악화된 지표: `events.stretchRate` 평균 0.213→0.239(전후 모두 10/10 실패), `motion.restarts` 실패 0→1, 시계 비율 중앙값 0.811→0.792, `stage.pressVisible` 1.0→0.968(기준 ≥0.9는 여전히 통과).
- 스크립트만 쓰는 측정(40경기 전부): 링크 420.3→401.6개, 4,998→4,163m. 40경기 모두 스크립트가 정상 작성됐습니다.
- 결과 경로는 건드리지 않아서 결과·통계(MATCH-2/23/28)와 시즌 비용(MATCH-22)은 그대로입니다. 작성기 시간은 경기당 약 +25ms 늘었습니다.
- 포터블 골든은 `update-golden --write`와 prettier를 돌려도 바뀌지 않았습니다(스크립트가 골든에 들어가지 않음).

## 바꾼 SSOT 결정
없습니다. MATCH-38(추가하는 것은 링크 캐리·헤비 터치·리스타트 전달뿐, 셀 안의 지점은 작성기 선택), MATCH-22, MATCH-39를 모두 그대로 지켰습니다.

## 알려진 약점
- 20m 이상 긴 링크가 여전히 경기당 약 66개 남았고, 대부분 경기 후반입니다. 터치를 시간에 고르게 나누는 소프트 일정도 시험했지만 링크가 오히려 늘어 버렸습니다(T840 duePull과 같은 결과). 근본 해결은 기록의 흐름을 사슬로 뽑는 결과 모델 변경(MATCH-22)이 필요합니다.
- '앞으로 끌고 가서 백패스' 비용(BACK_AFTER_RUN)도 시험했지만 효과가 없어 빼고, 이 패턴은 `pressed` 사유로 대신 설명합니다.
- 헤비 터치가 경기당 2.4개 늘었고, `events.stretchRate`와 시계 비율이 조금 나빠졌습니다.
- 30m+ 슈팅이 거의 없어져 실제보다 장거리 슛이 적을 수 있습니다.
- 새 상수(LOOKAHEAD, SHOT_DEPTH, BACK_PASS)는 `write.ts` 모듈 상수입니다. `SCRIPT_CONFIG`에 넣으면 `apps/web` 랩 카탈로그가 stale이 되기 때문에, 랩에서 조정할 수 없습니다.

## 실행한 검사 / 미룬 검사
- 실행해서 통과: script·staging·lab 단위 테스트 37개 파일 302개, `typecheck`, eslint(script 폴더), prettier. `write.test.ts`에 테스트 3개를 새로 넣었습니다(백패스 사유, 박스 밖 슈팅 위치, 패스 착지 후 짧은 링크).
- 미룸(돌리지 않음, 통과로 보고하지 않음): 통합/contract 테스트(`tests/fixtures/portable.contract.test.ts`, `staging/frames.match.test.ts` 등), 40경기 전체 stage 측정, e2e, `verify:batch`. `validate:i18n`은 문구를 추가하지 않아 실행하지 않았습니다.

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
