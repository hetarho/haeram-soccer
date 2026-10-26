# IDEATION dead-balls-and-finishing
> st:converted@261027 | Dead balls that rush, settle and restart; sensible free-kick takers; forwards who shoot when the goal is open; corners that leave players back.

## vision
- Problem (owner, 261027, watching own matches on the live full model): when the ball goes out or a player is injured, everyone suddenly crawls instead of hurrying to their places, pausing and restarting; a forward walks back to his own end to take a free kick; players in front of goal pass to each other or fail to shoot into an open goal; at a corner almost every player gathers at the box.
- Target: the owner watching their club's matches, and the numbers those matches feed.
- Core value: what is seen reads as football — the same aim as ideation/match-engine-rebuild and ideation/match-viewing-pace-and-freedom.

## explored
- [o] Base the discussion on the measured diagnosis below, not on assumptions ← owner asked why each happens
  - Live game: `MATCH_MODEL_RELEASE.enabled` is true since T286 (`packages/engine/src/match-model-release.ts`), so every observation plays the grid candidate model (revision continuous-aggregate-3).
  - Scratch probes (not kept; b050ce93, 16 observed fixtures over 4 seeds, ENG tier 1, all four tactics, plus per-slot `actionMix` probes on an unpressured carrier).
  - 1 (crawling at dead balls): a presentation defect on top of a policy gap. Between the snapshot where the ball goes dead and the restart's kick (T359) every player except the taker is drawn on one straight line across the whole recorded dead time (`buildFrames` breakpoints: snapshots and the taker's route only), so nobody hurries and nobody arrives early. Drawn speed in pitch metres per match second (players who moved over 3 m): throw-in median 0.70 (dead 16 s), goal kick 0.53 (24 s), free kick 0.47 (28 s), corner 0.78 (32 s), kick-off after a goal 0.43 (55 s), injury drop ball 0.14 (75 s), penalty 0.10 (70 s) — walking pace or slower, against running play. WEB-32 compresses only corner, free-kick and goal-kick preparations into 1.5 real s (`SET_PIECE_PREPARATION_MS`, `PREPARED_RESTARTS` in `apps/web/src/ui/presentationClock.ts`); throw-ins, kick-offs, penalties, injuries, substitutions and cards run at running speed, e.g. an injury's 75 s glide lasts 7.5 real s at 2x. This is the open question ideation/match-viewing-pace-and-freedom left for the owner after seeing v1.
  - 2 (forward walks back for a free kick): an engine rule. Every free kick outside direct-shot range uses the manager's named taker wherever it is (`takerFor(... 'directFreeKick')`, best 0.5 결정력 + 0.5 크로스, usually a forward; wide or band 5+ uses the corner taker) (`packages/engine/src/grid/restarts.ts`). Measured: free kicks in the own third were taken by forwards 64 of 108 times (59%), the taker walking a median 34 m (p90 49 m); middle third 70 of 136 (51%), 22 m.
  - 3 (passing in front of goal, not shooting when open): a calibration side effect. The candidate shot weight by line is FW 0.3, MF 22.5, DF 4.5 (`DECISION_CONFIG.candidate.shotLine`, `packages/engine/src/grid/decide.ts`; the attacking midfielder counts as FW), lowered step by step (T321, T324, T371) to hold MATCH-23's goals by line (FW 50–60%) instead of changing how often forwards get the ball in the box. Per-decision shot share of an unpressured carrier with an unblocked view: central box (~14 m) ST 5–8%, wingers 5–8%, CB 55%, DM/CM 83–87% (real cell 56%); goal area central ST 18–27%, CM 95–96% (real 76%); front of the box ST 1–3%, CM 49–61%. So a forward in a clear position usually passes, often to a midfielder who then shoots.
  - 4 (corners crowd): partly design, partly placement. The defending side always keeps exactly one outfielder up (`SHAPE_CONFIG.setPiece.stayUp: 1`); the attacking side sends its 5 best aerial players to box spots and 1 to the edge, and the other 3 "hold the rest defence where they stand", i.e. at their shape target, which with the ball at the corner flag is high (`setPieceTargets`, `packages/engine/src/grid/shape.ts`). At the kick (133 corners), outfielders within 25 m of the goal line: attacking (taker included) 7: 40, 8: 42, 9: 48, 10: 3; defending 9 in 103 of 133. Typically 17–19 outfielders and the keeper are around the box; the rest stand a median 41 m (attacking) and 47 m (defending) from that goal line. The numbers never vary with score, time or manager.
- [o] 1 → every stoppage (throw-in, goal kick, corner, free kick, offside, kick-off after a goal, penalty, drop ball, injury, substitution, card) is drawn as: players rush to their places faster than running play → a brief still beat → the restart's kick and delivery at the chosen speed. The beat differs by kind: a throw-in very short, corners and free kicks a slightly longer still beat, injuries and substitutions with a short caption ← owner 261027; a crawl reads as a bug and the owner's time belongs where the football is. Answers the open question ideation/match-viewing-pace-and-freedom left after v1.
  - Presentation only, as WEB-32 already treats the set-piece preparation: the engine's recorded dead time, added time, ball in play and every settled fact stay as they are.
  - The rhythm follows the chosen speed: during the rush players move at least twice as fast as running play is drawn at that speed; then the still beat; then the clock returns to running speed ← owner 261027 (own answer); replaces today's fixed 1.5 real s preparation at every speed (`SET_PIECE_PREPARATION_MS`)
  - The still beat shortens with the chosen speed too ← owner 261027; at 16x a match's running play is about 42 s, so a fixed 0.5 s beat at ~100 stoppages would outlast the football
- [x] Fixed real-time beats at every speed (throw-in 0.5 + 0.2 s up to injury 1.0 + 1.5 s, or half or 1.5× that) ← owner wants the rhythm tied to the chosen speed
- [x] The same still beat at every speed ← at high speeds the pauses would outlast the football
- [x] One beat for every kind ← a throw-in and an injury would read the same
- [x] Only out-of-play and injuries, with kick-offs after goals and penalties kept long ← owner chose every stoppage
- [o] 2 → the manager's named taker takes a free kick only within direct-shot range or crossing range (where a delivery goes into the box); elsewhere the nearest suitable player takes it — in the own third a centre-back or the keeper ← owner 261027; a forward walking 34 m back to his own third (59% of own-third free kicks today) does not happen in football
- [x] Also take own-half and midfield free kicks quickly ← changes the recorded dead time and ball in play and needs recalibration for little visible gain; owner declined
- [x] Keep the named taker everywhere ← the observed defect
- [o] 3 → the shot choice starts from the chance (distance, angle, bodies in the way, pressure), and the player's position, the manager's instructions and his own traits bend it in ways the owner can read; the engine is recalibrated afterwards ← owner 261027 (own answer); today's line weights invert football (an unmarked striker shoots 5–8% of central box chances, a midfielder 86%)
  - Constraint: MATCH-23's goals by line is not held by suppressing a line's shot decision again ← that is what produced the defect
  - Position: in the same chance a forward is the keenest to shoot, a midfielder also looks for the pass, a defender is the most careful; the role refines it (a poacher or inverted winger keener, a false nine or playmaker looking more for the pass) ← owner 261027; strikers are the shooters in football
  - Manager: the manager's school (its existing shot bend, →STAFF-14) and his tactic set how readily the side shoots; no new control, so whom the owner hires decides how the side shoots ← owner 261027; the owner acts through his manager
  - Only the owner's club carries its manager's school, as today; other clubs differ by tactic ← owner 261027; other clubs' managers bending play touches the whole world's calibration and the aggregate path, a separate topic
- [x] Every club's manager school bends its side's shooting ← larger scope and calibration burden; owner kept today's rule
- [x] Small position differences, with roles and traits deciding most ← owner chose a clear forward > midfielder > defender order
- [x] A per-match shooting instruction the manager picks and the owner sees before kick-off ← larger scope; owner chose the school and tactic
- [x] The same shot rule for every line with only small role and trait nudges ← owner wants position, manager and traits to matter
- [x] Only a "clear chance" rule on top of today's weights ← leaves the inverted weights everywhere else (front of the box: striker 1–3%, midfielder 49–61%)
- [o] 4 → corners: by default the attacking side really keeps 2–3 back near halfway and the defending side 1–2 up; late in the match the score changes the numbers — a side chasing the game sends more up (the keeper too at the very end), a side protecting a lead keeps more back and, defending, brings everyone into the box ← owner 261027 (narrowed in the second round from "situation and manager" to score and time only); fixed numbers read as a diagram
  - Each corner draws its default numbers within the ranges (attacking 2–3 back, defending 1–2 up) ← owner 261027; scenes differ within a match, as the engine draws its other choices
  - "Late" starts at the 80th minute; the keeper goes up only in added time with his side one goal behind ← owner 261027; rare in football, so it is a moment when it happens
- [x] Fixed defaults (attacking 3 / defending 1, or 2 / 2) ← every corner would look the same
- [x] Late from the 85th or the 75th minute ← owner chose 80
- [x] The manager's school changes the numbers (attacking schools send more, counter-minded ones leave two up) ← owner did not choose it in the second round
- [x] The attacking side keeps one more back than the defenders left up ← owner did not choose it
- [x] Correct the fixed numbers only ← owner chose numbers that respond to the match
- [x] Keep as is ← owner sees too many players gathered

## shape
- flow: ball goes dead → players rush to their places faster than play → a brief still beat → restart at the chosen speed; on the ball near goal, the carrier shoots when the chance is clear whatever his line; set pieces taken by the player football would choose; corners leave a readable rest defence and outlet.
- v1: every stoppage drawn rush (≥ 2× running play at the chosen speed) → still beat per kind → running speed, with captions for injuries and substitutions; free kicks taken by place; shot choice from the chance, bent by position (forward > midfielder > defender, refined by role), the manager's school and tactic, and traits, then recalibrated; corner numbers by default and by score late on.
- not: changing recorded dead time or ball in play; owner control of takers, shooting or corner numbers; a per-match manager shooting instruction; manager-dependent corner numbers.

## domains
- [o] WEB: WEB-32 dead-ball presentation for every stoppage, tied to the chosen speed, a still beat per kind, captions for injuries and substitutions (WEB-32) →WEB
- [o] MATCH: MATCH-12 players hurry to their places and wait during dead time instead of a straight-line glide; MATCH-18 free-kick taker by place and corner numbers by default and late score; MATCH-16 shot choice from the chance, bent by position, role, the manager's school and tactic, and traits; MATCH-23/28 recalibration (MATCH-12, MATCH-16, MATCH-18, MATCH-23) →MATCH
- [x] STAFF: no change ← STAFF-14's existing shot bend already carries the manager's shooting habit, and only the owner's club carries it, as today

## open
- -
