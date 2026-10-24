# IDEATION match-viewing-pace-and-freedom
> st:converted@261025 | Open play readable at 1x, dead balls that do not drag, coherent corner defence, and players who leave their formation spot when football calls for it.

## vision
- Problem (owner, 261024, watching own matches in the live game): open play moves too fast to follow at 1x while corners, free kicks and goal kicks crawl; at a corner only the attacking side gathers at the goal while the defenders keep their formation; players hold their shape so well that an LB on the right wing, normal in real football, never happens.
- Target: the owner watching his own club's matches to judge players, manager and tactics.
- Core value: observation the owner can follow and believe — the time spent where the football is, and movement that looks like football rather than a moving formation diagram.

## explored
- [o] Base the discussion on the measured diagnosis below, not on assumptions ← owner asked first whether these are bugs and why
  - The live game plays the pre-feature match model: `MATCH_MODEL_RELEASE.enabled` is false (`packages/engine/src/match-model.ts`), so continuity, intentions and T348's set-piece defence (T274–T278, T348) exist only on the candidate model, which is not active until T286's gates pass.
  - Scratch probe (not kept; `buildFrames` samples on the 1x clock, 4 + 4 fixtures, ENG tier 1, all four tactics, 261024 on cd2a1c3c): on-screen player speed at 1x in pitch metres per real second, split by the sample's `restart` phase.
    - live (pre-feature): open play median 22.2, p90 66.3; dead ball median 3.4, p90 18.5 — open play about 6.5× faster than set pieces.
    - candidate: open play median 18.2, p90 55.7; dead ball median 9.3, p90 57.0, and dead balls take 45.5% of the drawn time (players sprint to their places, then stand).
  - 1 (fast open play, slow set pieces): half defect, half policy. Live path: a restart is one trace step (corner 32 s dead + 3.2 s kick); everyone is placed at once (`setPieceShape`), moves only 8 s (`moveAll(s, 8)`), and playback draws one straight line across the whole ~35 s, so players glide. Policy: WEB-32/MATCH-12 require one uniform speed in and out of play with no situation-based acceleration, so even the candidate draws every dead second at full length.
  - 2 (corner: attackers gather, defenders keep formation): a known live-path defect. `holdSetPiece` holds only the attackers who went up; `moveAll(s, 8)` walks the defenders back to their shape; the pre-feature trace never records the kick, so their marking places are never drawn. T348 measured it (10 m groups 6.43 attacking / 2.16 defending) and fixed it on the candidate only; its limit (2) keeps the live path unchanged until activation.
  - 3 (1x should be a third as fast): not a defect. WEB-32 sets 1x = 4 real s per match minute (15× real time; `WATCH_MINUTE_MS` in `apps/web/src/ui/presentationClock.ts`); a third is 12 s a minute (5× real time).
  - 4 (no positional freedom): confirmed. 자유도/규율/압박 성향/예측력 in the player inspector (`motionTraits`, `Pitch.tsx`) are display numbers no engine code reads. A player's target is his formation spot + tactic step + a fixed role offset (`ROLE_SHIFT`) + 25% of the ball's sideways offset + a 40% lean toward a man within 10 m; runs are role-only, 4–6 s, an overlap stays on his own flank; the candidate adds support within 22 m, zonal mark handover and recovery to shape within 6 s. Probe: the home LB/LWB never got more than 10 m into the other half of the width in any of the 8 fixtures (live: never past the centre line).
- [o] 1 → broadcast-style dead balls: open play at the chosen speed; a dead ball is drawn as a short visible preparation (about 1–2 real s) with players moving to their places, and the restart's kick and delivery play at the chosen speed again ← the owner's time belongs where the football is; reverses WEB-32/MATCH-12's uniform-speed policy (ideation/match-continuity-and-performance, 261021) by the owner's choice
  - Scope narrowed by the owner (261024): only the players' rush to their places before a set piece (the corner's walk-in and its like) is drawn fast; nothing else is compressed yet. The owner decides any further compression or exceptions (penalties, cards, injuries, substitutions) after seeing the change in play.
- [x] Cut dead balls with a caption ← players would appear to teleport, which MATCH-12 already treats as a bug
- [x] Draw dead balls continuously at ~4× ← saves too little of the owner's time
- [o] 3 → 1x = 12 real s per minute of open play (5× real time, a third of today's 4 s); a match opens at 2x ← 1x is for close reading, 2x (~7 min a match) for ordinary watching. Rough lengths with compressed dead balls: 1x ~13–14 min, 2x ~7 min (56.7 min ball in play × 12 s + ~100 stoppages × ~1.5 s)
- [x] 1x = 8 s ← the owner judged 1/3 the right reading speed
- [o] 4 → freedom is a real-football mechanic, drawn by probability but reading like real play: the manager grants a player more or less freedom, and the more he has the further he moves from his formation slot for football reasons — overlaps and underlaps, a forward dropping into midfield to join the build-up, a full-back stepping into the build-up ← owner's own examples (261024); the formation is where a player starts from, not a rail
- [o] Only the manager sets a player's freedom; the owner influences it only by which manager he employs ← the owner acts through his manager (STAFF-19/22)
  - Context checked 261024: today nobody instructs a single player in attack or defence. The manager picks one of four tactics, the tactic fixes the formation and every slot's role (STAFF-22), and a player's movement comes from that role and his own attributes and traits; the owner reaches players only through training suggestions (STAFF-19) and a manual XI (CLUB-6). The owner questioned why freedom alone was asked as a per-player instruction.
- [o] Freedom is not a new instruction control but a value the manager produces for each player: his style (the more flexible, the freer the whole side) × the slot's role (creative roles such as trequartista or false nine freer) × the player's ability (good 판단력 freer) — the same manager gives different players different freedom ← owner confirmed 261024; real managers give a star a free role
- [x] Manager's style alone, the whole side equally free ← players would differ only by role
- [x] The owner suggests or sets freedom per player ← the game has no per-player tactical instructions, and freedom alone would be the first; the owner acts through his manager
- [o] Freedom changes results, as a trade-off: a free player joins the build-up and creates more, but leaves space behind him for counters, and a player with poor 판단력 loses more than he gains ← the manager's choice must have consequences the owner can read; the candidate model then needs recalibration
- [x] Freedom changes only how play looks ← the manager's choice would have no consequence
- [o] v1 also includes situational disorder (on a transition, chasing a result late, straight after a set piece the shape loosens whatever a player's freedom) and position swaps (wingers switching flanks, full-back/winger rotation) ← owner's choice; real football's structure breaks and re-forms
- [o] All four inspector tendencies (자유도, 규율, 압박 성향, 예측력) drive real movement: 규율 holding his place, 압박 성향 how often he presses, 예측력 how early he reads play ← a shown number must do what it says; more work and calibration than freedom alone
- [x] Keep only 자유도 and remove the other three ← owner chose to make all four real
- [x] Leave the numbers as display only ← they suggest a mechanic that does not exist
- [o] The tendencies keep today's source: attributes plus each player's stable hidden personality (`motionTraits`) ← equal attributes still give different players; the values are shown in the inspector, so no hidden verdict decides results
- [x] Tendencies from attributes only ← equal attributes would give identical players
- [x] Tendencies as new formal player attributes with growth, training and adaptation ← largest change, not needed for v1
- [o] The freedom bundle (freedom, situational disorder, position swaps, four tendencies) is the model revision after the full model's activation, not part of it ← T286's calibration is not redone, and T348's corner defence and continuous movement reach the live game sooner
- [x] Put the freedom bundle in before activation ← redoing the calibration chain delays every candidate improvement
- [o] The owner sees freedom at work after the match in average positions and heat maps ← an LB on the right wing must show where the owner already reads a player's match
  - Context: MATCH-25 already keeps per-player and per-side heat maps and a pass network with average positions for own matches, built from touches; whether off-ball positions are added is open.
- [x] A 프리롤 mark in the lineup and the inspector number as the main view ← not chosen; the inspector number still becomes real (four tendencies above)
- [o] When the owner sees it: presentation (1, 3) changes on both models now; engine behaviour stays on the candidate model — the corner defence (2) reaches the live game at activation (T286), freedom (4) with the model revision after it ← no second implementation on the pre-feature path and no change to live results before the release gates
- [x] Correct the live path's corner defence now ← changes live results and duplicates T348
- [x] Wait for activation for everything ← presentation does not depend on the model

## shape
- flow: owner opens a match at 2x → open play at 12 s a minute ÷ speed → ball goes dead → short visible preparation → kick and delivery at the chosen speed → players with freedom leave their slot for overlaps, underlaps, dropping deep and stepping into the build-up, teammates cover
- v1 now (both models): 1x = 12 s per open-play minute, 2x start, the set-piece walk-in drawn fast, goal hold kept (WEB-94); the owner watches it before any further dead-ball decision
- at activation (T286, unchanged scope): T348's corner defence and continuous movement reach the live game
- next model revision after activation (candidate football): per-player freedom set by the manager (style × role × ability) with trade-offs in results, situational disorder, position swaps, four tendencies that drive movement; seen in post-match heat maps and average positions; recalibrated
- not: changing the live pre-feature engine's football; per-player tactical instructions; owner control of freedom

## domains
- WEB (now): WEB-32 running-speed policy (1x = 12 s per open-play minute, 2x start, the set-piece walk-in drawn fast) →WEB-32
- WEB (next model revision): inspector tendency labels →PLAYER-26
- MATCH (now): MATCH-12 uniform mapping with the set-piece walk-in as an explicit presentation exception; settled facts, added time and the engine's recorded dead time unchanged →MATCH-12
- MATCH (next model revision): MATCH-17 intentions with manager-set positional freedom, situational disorder and position swaps; tendencies in movement; MATCH-25 views showing it; recalibration under MATCH-28 →MATCH-17
- STAFF: how a manager sets each player's freedom (his philosophy/flexibility, the slot's role, the player's ability); no owner control →STAFF-46
- PLAYER: the four tendencies (자유도, 규율, 압박 성향, 예측력) — today attributes plus a hidden stable personality (`motionTraits`); their meaning beside 판단력/위치선정 →PLAYER-26

## open
- Beyond the set-piece walk-in: whether other dead time (ball retrieval, penalties, cards, injuries, substitutions) is compressed — the owner decides after seeing v1 in play.
- 예측력 overlaps the 판단력 and 위치선정 attributes the engine already reads (defenders' early read of a ball in behind): how it differs, so nothing counts twice.
- Post-match views: are the touch-based heat maps and pass-network positions enough, or are off-ball average positions added?
- Which manager values carry "style" (flexibility, philosophy) and how far the freest player may go — rules for update-ssot.
