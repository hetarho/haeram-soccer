# LAB Match lab
> r1 | Let the owner tune the detailed match engine's numbers against generated sides and see what each change does to the football.

## decisions
- LAB-1 [o] The match lab is an owner's tool outside the game. ← tuning needs quick what-if runs without a career, a save or a script
  - it has its own address (`/lab`) in development and deployed builds; no game screen links to it.
  - it never reads, writes or migrates a game save, and nothing it changes reaches a running game, another tab's game or the source code.
  - its screens are in Korean like the game; engine value names stay as the code names them.
- LAB-2 [o] Two sides, 좌측 팀 and 우측 팀, are generated players, not world clubs.
  - each side has a tactic of the four (→MATCH-8) with its formation, and a full matchday squad under the modern era's rules (→MATCH-20): starters for every formation slot plus the named substitutes.
  - a side's 평균 OVR (40–90) and 편차 (0–15) generate every player at his slot's position and role, each OVR drawn within the spread around the average and the squad then shifted so the starters' mean equals the average.
  - each player's OVR can then be set on its own (1–99); the side's shown average follows the players. Regenerating a side with a new average or spread replaces individual settings, after confirmation.
  - a player keeps his generated name, attributes and traits as the game would create them at that OVR, position and role; only OVR is edited, not single attributes.
  - every generation takes a seed shown with the side; the same seed and inputs give the same players.
  - both sides start fresh: no fatigue, no injury, full adaptation, neutral manager and no club style or synergy bend.
- LAB-3 [o] The tunable numbers are every numeric value of the detailed engine's configuration objects (the grid engine's `*_CONFIG` exports) as the latest release revision reads them.
  - grouped by configuration object, each value shows its code path, its code comment where one exists, its default and the current value; changed values are marked.
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
  - the →MATCH-23 table: each row's real band, the run's value for a team a match (both sides averaged), the left and right values, and pass/fail by →MATCH-23's tolerance. With sides of different averages the table notes that the bands assume equal top-tier sides.
  - each run value shows its 95% interval over the run's matches, so a change can be told from noise.
  - a 1-match run also lists the score, scorers with minutes, cards and the team stats of that match.
- LAB-6 [o] Runs are compared, not just read. ← changing one number at a time only works when the before and after sit side by side
  - the last 10 finished runs are kept with their sides, values (as the changed-value JSON) and run seed; any one can be pinned as the baseline.
  - the result table shows the baseline's value and the difference beside the current run, marking a difference beyond both runs' intervals.
  - a kept run's settings can be loaded back into the editors.
- LAB-7 [o] The lab's sides, values and kept runs persist in this browser between visits and can be cleared; they are never shared across devices or exported with game saves.
- LAB-8 [o] The lab does not tune the aggregate path (→MATCH-22), economy, progression or any other system; it does not edit single attributes, managers, traits or club context; and it shows no match playback.
- LAB-9 [?] Whether a 1-match run should open the match view to watch its playback (crowding and movement checks need sight, not just numbers).

## flow
- tune: /lab → 좌측·우측 팀 생성(평균 OVR·편차·전술) → 선수별 OVR 조정 → 수치 검색·수정 → 시뮬레이션(N경기) → 결과표(기준 실행 대비 차이) → 다음 수치 수정 | 변경값 JSON 복사

## constraints
- The lab never adds to the game's initial download (→ARCH-28): it loads as its own entry, and the engine runs in a lab-only worker.
- Value overrides exist only inside the lab's worker for the duration of its runs; the game's worker and module state never see them.

## chg
- r1 261029 initial
