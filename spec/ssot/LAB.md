# LAB Match lab
> r5 | Let the owner watch generated sides play in the game's own match view, change the detailed engine's numbers and see by eye — and by the numbers — what each change does to the football.

## decisions
- LAB-1 [o] The match lab is an owner's tool outside the game. ← tuning needs quick what-if runs without a career, a save or a script
  - it has its own address (`/lab`) in development and deployed builds; no game screen links to it.
  - it never reads, writes or migrates a game save, and nothing it changes reaches a running game, another tab's game or the source code.
  - its screens are in Korean like the game; engine value names stay as the code names them.
- LAB-2 [o] Two sides, 좌측 팀 and 우측 팀, are generated players, not world clubs.
  - each side has a tactic of the four (→MATCH-8) with its formation, and a full matchday squad under the modern era's rules (→MATCH-20): starters for every formation slot plus the named substitutes.
  - a side's 평균 OVR (40–90) and 편차 (0–15) generate every player at his slot's position and role, each OVR drawn within the spread around the average and the squad then shifted so the starters' mean equals the average.
  - each player's OVR can then be set on its own (20–92, the range the game's player generator lands on exactly); the side's shown average follows the players. Regenerating a side with a new average or spread replaces individual settings, after confirmation.
  - a player keeps his generated name, attributes and traits as the game would create them at that OVR, position and role; only OVR is edited, not single attributes.
  - every generation takes a seed shown with the side; the same seed and inputs give the same players.
  - both sides start as a club nobody owns would: no injury, full adaptation, no manager, morale or 조직력 term and no club style or synergy bend; fatigue 0, except that a pressing side carries the press load such a club carries (→MATCH-23's measurements play the same).
- LAB-3 [o] The tunable numbers are every numeric value of the detailed engine's configuration objects (the grid engine's `*_CONFIG` exports) as the latest release revision reads them.
  - grouped by configuration object, each value shows its code path, a Korean description of what it controls — its unit, and what raising or lowering it does in play — written from the code that reads it, its default and the current value; changed values are marked. The code comment stays available beside it. Every value and every group has a description; a value added to the engine without one fails the lab's tests.
  - the search also matches the Korean descriptions.
  - a search filters values by path or comment; a value resets alone, a group resets, everything resets.
  - only finite numbers are editable; non-numeric settings are not shown.
  - the changed values export as JSON (path → value) for copying and import from the same JSON; an unknown path or non-number is reported and skipped. Adopting a value into the game is an ordinary planning/task change, never a lab action.
- LAB-4 [o] 시뮬레이션 plays the current sides and values through the latest release revision of the detailed engine, the same code the own club's matches use (→MATCH-22).
  - a run plays N matches, N one of 1, 20, 100, 300 or 600 (default 100); left is home in odd matches and right in even ones, so home advantage cancels over a run. Era rules are the current season's (2024).
  - each match takes its own seed derived from the run seed; the same run seed, sides and values reproduce the same results.
  - runs execute off the page's main thread with visible progress and can be cancelled; a cancelled run keeps nothing.
  - changing values or sides during a run does not affect that run.
- LAB-5 [o] A finished run reports what the football did.
  - outcome: left wins, draws and right wins, and each side's goals a match.
  - the →MATCH-23 table: each row's real band, the run's value for a team a match (both sides averaged) and pass/fail by →MATCH-23's tolerance. With sides of different averages the table notes that the bands assume equal top-tier sides.
  - a side table gives left and right a match: goals, shots, on target, xG, possession, passes and completion, crosses, take-ons, tackles + interceptions, corners, fouls, offsides, yellow and red cards.
  - each run value in both tables shows its 95% interval over the run's matches, so a change can be told from noise.
  - a 1-match run also lists the score, scorers with minutes, cards and the team stats of that match.
- LAB-6 [o] Runs are compared, not just read. ← changing one number at a time only works when the before and after sit side by side
  - the last 10 finished runs are kept with their sides, values (as the changed-value JSON) and run seed; any one can be pinned as the baseline.
  - the result table shows the baseline's value and the difference beside the current run, marking a difference beyond both runs' intervals.
  - a kept run's settings can be loaded back into the editors.
- LAB-7 [o] The lab's sides, values and kept runs persist in this browser between visits and can be cleared; they are never shared across devices or exported with game saves.
- LAB-8 [o] The lab does not tune the aggregate path (→MATCH-22), economy, progression or any other system; it does not edit single attributes, managers, traits or club context.
- LAB-9 [o] 관전 is the lab's main use: one match between the current sides with the current values, watched in the game's own match observation component — the same pitch, figures, ball, speeds, pause, events, scoreboard and match details the game shows (→WEB-32, →MATCH-12/37) — so what looks awkward in the lab looks the same in the game. ← the purpose is to spot play that feels unnatural by eye; a look-alike view would hide or invent faults
  - the lab never forks, restyles or simplifies that component; a change to the game's match view shows in the lab without lab work. It is drawn in the theme the game uses in this browser.
  - the watched match is match 0 of its 관전 seed: 좌측 팀 at home on the left of the scoreboard, the latest release revision, era rules of LAB-4.
  - 다시 보기 plays the same seed again with the values as they are now, so a value change shows on the same match; 새 경기 draws a new seed. A playback under way never changes with later edits.
  - the sides and values panels stay usable while watching; the playback starts once its match is played (in the lab worker, with visible progress).
  - the scoreboard names the sides 좌측 팀 and 우측 팀; kits are two plainly different defaults.
- LAB-10 [o] The N-match 시뮬레이션 (LAB-4–6) stays as the lab's second use, for checking a change against →MATCH-23 after it looks right.

## flow
- watch: /lab → 좌측·우측 팀 생성(평균 OVR·편차·전술) → 관전 → 어색한 장면 발견 → 수치 검색·수정 → 다시 보기(같은 경기) → 비교 → 다음 수치 | 새 경기
- tune: /lab → 수치 수정 → 시뮬레이션(N경기) → 결과표(기준 실행 대비 차이) → 변경값 JSON 복사

## constraints
- The lab never adds to the game's initial download (→ARCH-28): it loads as its own entry, and the engine runs in a lab-only worker.
- Value overrides exist only inside the lab's worker for the duration of its runs; the game's worker and module state never see them.

## chg
- r1 261029 initial
- r2 261029 LAB-2✎ a player's own OVR 1–99 → 20–92
- r3 261029 LAB-2✎ fresh sides with no fatigue → a pressing side carries a club nobody owns' press load
- r4 261029 LAB-9✎ [?] playback → [o] 관전 in the game's own match view as the main use; LAB-8✎ drops "shows no match playback"; LAB-10+ N-match runs as the second use
- r5 261029 LAB-3✎ code comment where one exists → a Korean description for every value and group, searchable
