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
스크립트 작성기와 결과 경로는 지난번 그대로 두고, 이번에는 스테이징만 고쳤습니다. 맴도는 원인은 세 가지였습니다.
1. 공을 쥐고 기다리는 동안(홀드) 선수가 캐리 끝점을 지나쳤다가 되돌아오면서 돌았습니다.
2. 압박을 받으면 선수가 수비수 둘레를 옆으로 돌았습니다.
3. 압박수비수는 늘 골문 쪽 앞자리로 돌아가 다시 막았습니다.

바꾼 것은 다섯 가지입니다.
- **압박 속 홀드(`pass.ts` holdMove):** 볼 가진 선수가 수비수 반대쪽으로 곧게 빠지며 공을 지킵니다. MATCH-12 문구("가장 가까운 상대에게서 공을 떼어 놓으며 움직이며 지킨다")를 그대로 따른 것입니다. 압박 속에서는 한 홀드에 최대 180°까지만 방향을 틀고, 그 뒤 수비수 쪽으로 다시 들어가야 하면 그 자리에서 버팁니다(MATCH-12가 허용하는 '홀드업').
- **캐리 홀드:** 홀드 시간에 맞춰 끝점까지 천천히 걸어가고 끝점에 서서 기다립니다. 지나치거나 맴돌지 않습니다.
- **제쳐진 수비수(`world.ts` `beatMan`/`isBeaten`):** 돌파가 성공하거나 캐리가 압박수비수를 지나쳐 그가 공 뒤쪽으로 1m 넘게 밀리면, 그 수비수는 5초 동안(같은 선수가 공을 쥐고 있는 동안) 다시 압박하지 않습니다. 자기 자리로 복귀하고, 다음 수비수가 막으러 나옵니다.
- **돌파·태클의 수비 위치(`contest.ts` `jockeyPoint`):** 1:1 때 수비수가 골문 쪽이 아니라 드리블이 가는 방향을 막고 섭니다. 그래서 돌파에 성공하면 그대로 앞으로 나가고, 기록상 태클이면 그 방향으로 가다가 뺏깁니다.
- **압박 비트에서 공 뒤에 있는 압박수비수:** 돌아서 앞으로 가지 않고 등 뒤에 붙어 압박합니다.

## 오너가 보게 될 변화
- **막혔을 때:** 수비수가 붙으면 볼 가진 선수가 몸으로 공을 지키며 수비수 반대쪽으로 조금씩 빠지거나, 그 자리에서 버팁니다. 수비수 둘레를 도는 장면은 크게 줄었습니다.
- **1:1을 걸었을 때:** 태클 기록이면 막아선 수비수에게 뺏깁니다. 성공 기록이면 수비수 옆을 지나 앞으로 계속 가고, 제쳐진 수비수는 뒤에서 쫓기만 하며 앞질러 다시 막지 않습니다.

## 측정: 오너가 본 경기 (viewer-2, Durham Borough 2-2 Leeds Forge, 데드볼 제외)
| | 2초+ 소유 | 압박 속 빙글빙글 | 제친 뒤 되돌아오기 | 회전 p90 |
|---|---|---|---|---|
| main | 568 | 105 | 8 | 499° |
| 내 이전 버전 | 582 | 114 | 7 | 464° |
| **지금** | 594 | **72** | 8 | **341°** |

| | 3m 안 5초+ 쌍 | 10초+ | 20초+ | 최장 | 합계 | 10초+ 중 carry/press 쌍 |
|---|---|---|---|---|---|---|
| main | 259 | 138 | 49 | 120초 | 63.1분 | 29 |
| 내 이전 버전 | 257 | 132 | 53 | 212초 | 64.6분 | 20 |
| **지금** | 246 | 122 | 46 | 214초 | 61.0분 | 17 |

## 화면 품질 한계 (`model-verdict.ts stage --set all --only 0,2,4,6`, 같은 4경기, 전 = HEAD)
- 실패 한계 합계: 24 → 22
- `offside.consistency`: 실패 3 → 2 (평균 1.25 → 0.5)
- `shape.swarm`: 실패 1 → 0
- `stage.pressVisible`: 평균 0.977 → 0.950. 네 경기 모두 통과(최저 0.915, 기준 ≥0.9).
- 실패 수가 그대로인 항목: `mark.near` 0.429→0.424, `turn.reverse` 0.344→0.349, `shape.huddleLongest` 5.33→5.23, `events.stretchRate` 0.204→0.192, `motion.restarts` 3.77→3.88. 이 중 앞의 셋은 마킹·압박·대형 관련 한계입니다.
- 결과 경로를 건드리지 않아서 결과·통계(MATCH-2/23/28)와 시즌 비용(MATCH-22)은 그대로입니다. 경기는 여전히 결정적입니다(새 계산은 vec 연산과 PORTABLE_MATH.atan2만 씁니다).

## 바꾼 SSOT 결정
없습니다. 태클이나 1:1 승자를 새로 만들지 않았고(MATCH-38/39 유지), 압박 시 동작은 MATCH-12 문구에 오히려 더 가까워졌습니다. 다만 '제쳐진 수비수는 5초간 압박하지 않음', '1:1에서 수비수가 드리블 방향을 막음', '압박 비트에서 공 뒤의 압박수비수는 등 뒤에서 압박'은 스테이징 쪽 선택입니다. MATCH-12 말고는 다른 결정 문구를 전부 확인하지 못했습니다.

## 알려진 약점
- '제친 뒤 되돌아오기'는 8건으로 줄지 않았습니다. 남은 사례는 대부분 기록 자체에 원인이 있습니다. 결과 경로가 만든 뒤로 가는 돌파(예: 15m 뒤로 가는 돌파), 30m 뒤로 가는 캐리, 같은 칸 사이를 같은 방향으로 여러 번 오가는 캐리(A→B, A→B…)가 있어서, 작성기는 3m 링크로 왕복할 수밖에 없습니다. 고치려면 결과 경로(MATCH-22)를 바꿔야 합니다.
- 빙글빙글 72건 중 상당수는 캐리를 여러 번 이어 붙인 사슬에서 나옵니다(방향이 바뀌는 연속 캐리).
- 압박 비트에서도 수비수를 자동으로 '제쳐짐' 처리하면 빙글빙글이 58건까지 줄었습니다. 하지만 `pressVisible`이 두 경기에서 0.9 밑으로 떨어져서 그 방식은 쓰지 않았습니다.
- 상대와 3m 안에 붙어 다니는 쌍은 줄었지만, 마킹이 오래 붙는 것(mark/support)은 여전합니다. 오너가 붙어 있는 것 자체는 괜찮다고 했기 때문에 손대지 않았습니다.
- 새 상수(BEATEN_SECONDS 5, BEATEN_GAP 1, BEATEN_BEHIND 0.5, HOLD_TURN π, TOWARD_MIN 0.6)는 모듈 상수입니다. `STAGING_CONFIG`에 넣으면 `apps/web` 랩 카탈로그(tunables.json/ko.json)가 stale이 되므로, 랩에서 조정할 수 없습니다.

## 실행한 검사 / 미룬 검사
- 실행해서 통과:
  - 스테이징 단위 테스트 전체(통합 `frames.match.test` 제외)와 `write.test.ts`
  - 변경 후 다시 돌린 `world.test`, `contest.test`, `pass.test` (28개)
  - `pnpm run typecheck`, eslint(staging 폴더), prettier
- 새 테스트와 갱신한 테스트:
  - 새 테스트: 제쳐진 수비수가 압박에서 빠지고, 시간이 지나거나 공 주인이 바뀌면 다시 압박함(`contest.test.ts`)
  - 갱신: 1:1 수비 위치 기대값(`contest.test.ts`), 압박 비트에서 공 뒤에 있는 압박수비수의 목표 위치(`world.test.ts`)
- 미룸(돌리지 않음, 통과로 보고하지 않음): 통합/contract 테스트(`staging/frames.match.test.ts`, `tests/fixtures/portable.contract.test.ts`), 포터블 골든 확인, 40경기 전체 stage 측정, e2e, `verify:batch`. 문구를 추가하지 않아서 `validate:i18n`도 돌리지 않았습니다.
- 마지막으로 측정한 export(위 표의 '지금')는 prettier와 테스트 수정 전의 엔진 코드로 만들었습니다. 그 뒤 엔진 코드에는 서식 변경만 있었습니다.

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
