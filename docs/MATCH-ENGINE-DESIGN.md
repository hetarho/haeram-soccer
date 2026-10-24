# Grid match engine — implementation design (rules 4.0.0)

Implementation contract for tasks T200–T233. Policy lives in the SSOTs (MATCH r13, PLAYER r9, STAFF r34, CLUB r42, LEAGUE r10, WEB r93, HIST r15, SAVE r49, ARCH r15 at T233). This document fixes how the code is built.

- The numbers here are the values the explore tasks T215, T216 and T224 settled (T233 checked them against the code). Every tunable constant lives in one exported `*_CONFIG` object; where this document and that object differ, the code is the record and this document is corrected.
- If this document and an SSOT disagree, the SSOT wins and the task stops for update-ssot.

Reference data:
- `docs/match-baselines-40.json`: the 40-cell real-football tables.
- `docs/MATCH-BASELINES.md`: the source tables and the vocabulary.

---

## 1. Conventions

### 1.1 Frames and units

- **Engine frame.** Metres on a 105 × 68 pitch, `x` along the length and `y` across it. The home side (side 0) attacks toward x = 105 for the whole match in the engine frame. Changing ends at half-time is a presentation transform only (§10.2).
- **Attack frame of side s.** `attackFrame(0, p) = p` and `attackFrame(1, [x, y]) = [105 − x, 68 − y]`. The function is its own inverse.
- **Where the attack frame is used.** Every cell, band, lane, xT value, distance-to-goal and tag is computed in the acting side's attack frame. In that frame:
  - y = 0 is the attacking side's left touchline.
  - The opponent goal mouth is x = 105, 30.34 ≤ y ≤ 37.66.
- **Playback units.** Frames carry 0–100 units on both axes, as today: `ux = x · 100/105`, `uy = y · 100/68`. In the second half and the second extra-time half, both are mirrored (`100 − ux`, `100 − uy`), so the sides change ends on screen.
- **Time.** `t` is match-clock seconds within the current period; periods are 1, 2 (regulation) and 3, 4 (extra time). The match minute shown is `floor(t / 60) + 1`, plus 45 for period 2, 90 for period 3 and 105 for period 4, with added time as `45+n` and `90+n` (§7.3).
- **Randomness.**
  - One stream drives everything that decides football: `random(`${w.seed}:match:${f.id}`)`, consumed in a fixed order.
  - Playback-only randomness (flight bend and loft) uses `random(`${w.seed}:${f.id}:ball-decisions`)` and never touches the match stream.
  - `observe` never changes which draws happen. Positions, tags and material are computed for every grid match.
- **Floating-point math (T358, ARCH-5, ARCH-9).** The candidate model's positions, distances, angles, odds and recorded values give the same bits on every host and JavaScript engine (and a Dart port): `packages/engine/src/portable-math.ts` builds `exp`, `log`, `tanh`, `sin`, `cos`, `atan2`, `hypot` and whole powers (`powInt`) from IEEE basic operations, `Math.sqrt` and exact integer and bit operations in a fixed order (fdlibm's algorithms; `hypot` is V8's own, bit for bit). The host's `Math.*` (and `**`) are each CPU's C library, fused multiply-adds included, and `Math.hypot` differs between engines, so a match drifted in the last bit between linux-x64 and darwin-arm64 and between Node and Firefox or WebKit until a fact or a recorded scene changed.
  - Each match binds its table once: `GridState.math` is `PORTABLE_MATH` on the candidate model and `HOST_MATH` (the host's `Math.*`) on the pre-feature path, whose settled facts and digests stay as they were. Code both models share reads `s.math`; candidate-only code (`movement.ts`, `coordination.ts`) imports the portable functions; stateless helpers (`goalDistance`, `goalAngle`, `chanceXg`, `passProbabilities`, `coverPoint`) take the table, defaulting to the host's for measurement scripts.
  - Outside the grid the candidate's own match reads the same table where it plays: `prepareMatch`'s day's form (`log`) and strength gap (`powInt`), so every skill's shift, and the finishing curve (`bend`'s `tanh`, `finishing`'s `exp`) behind recorded xG and goal odds. Their defaults keep `Math.*` for the summary and aggregate paths. The observed trace's motion states and the playback frames use the portable `hypot` too, so a page in any browser shows the samples Node computes for the same match.
  - The aggregate path (`aggregate/team.ts`, `aggregate/participation.ts`) keeps `Math.exp`, `Math.log`, `Math.tanh` and `Math.cos`: each value there is compared once with a fresh draw (or scales one), so a last-bit difference changes an outcome only when a draw lands on that boundary, with no positions to carry it on; its recorded values may still differ in the last bit between hosts. Season and world code outside matches (finance, fans, sponsors, contracts, growth curves, catalogs) is not in the match engine and keeps `Math.*`.
- **Rosters and indexes.** A side's roster is its 11 starters in formation-slot order (index 0–10, index 0 is the goalkeeper), followed by the named substitutes in bench order.
  - Engine code addresses players as `(side, idx)`, with `idx` a roster index.
  - Records and playback events carry player **ids**.

### 1.2 Module layout (`packages/engine/src/grid/`)

| file | owns | task |
|---|---|---|
| `pitch.ts` | lanes, bands, cells, Korean cell names, geometry helpers | T204 |
| `baselines.ts` + `baselines.json` | typed access to the 40-cell tables and position profiles | T204 |
| `setup.ts`, `spots.ts` | `GridSetup`, `eraRules`, rosters, bench, takers, formation spots | T205 |
| `state.ts` | `GridState`, `GridPlayer`, state creation, skill lookup | T205 |
| `shape.ts` | tactic shapes, off-ball targets, movement, runs | T206 |
| `movement.ts` | candidate model: bounded player motion, ball speeds, action timing, restart preparation (`prepareOnClock`) | T274, T348 |
| `intentions.ts` | candidate model: individual intentions, their lifecycle, priorities and reasons, set-piece jobs (`defendSetPiece`) | T276, T348 |
| `coordination.ts` | candidate model: each side's support, press, cover, mark, recover and run jobs, planned from one snapshot | T277 |
| `box.ts` | candidate model: the box scene's zones, its attackers' zone runs and its defenders' line and guards (`BOX_CONFIG`) | T443 |
| `tags.ts` | per-touch tags | T207 |
| `decide.ts` | action mix, target choice | T208 |
| `resolve.ts` | duels and the xG model | T209 |
| `restarts.ts` | out of play, kick-off, goal kick, throw-in, corner, free kick, penalty, offside, fouls | T210 |
| `record.ts` | metrics, TD/PD counters, highlights, incidents, material accumulation | T211, T212, T223 |
| `engine.ts` | `playGrid` main loop, periods, added time | T211 |
| `discipline.ts` | fouls to cards in the match | T213 |
| `changes.ts` | substitutions and in-match injuries | T214 |
| `shootout.ts` | extra time and the penalty shoot-out | T222 |
| `trace.ts` | trace entries for playback | T211 |
| `commentary.ts` | Korean event sentences | T217 |
| `playback.ts` | trace to `MatchFrame[]` | T217 |

- `packages/engine/src/match.ts` keeps `simulateMatch`, the setup of strength/form/shift (§3.1), the probabilistic path (`summaryMatch`, §11) and the path dispatch (§12). `duelMatch` and the zone helpers are deleted in T218.
- `packages/engine/src/motion.ts` is replaced by `grid/playback.ts` in T217–T218. `MATCH_MOTION_CONFIG` now lives in `grid/playback.ts` (`formations` from `grid/spots.ts` in pitch units, `ball.maxLoft` from `PLAYBACK_CONFIG`) with `motionTraits` and `teamMotionProfile`, and `match.ts` re-exports them for the UI (`FormationPitch.tsx` and `Pitch.tsx` import them).

---

## 2. Contracts (T202)

### 2.1 Attributes (T201)

- `ATTRIBUTES` gains `'decisions'` and `'composure'` **at the end** of the array. Generation order of the existing 14 stays, so the first 14 draws of `generateAttributes` are unchanged.
- Labels: `decisions: '판단력'`, `composure: '침착성'`.
- `ATTRIBUTE_GROUPS` adds `{ label: '정신', attributes: ['decisions', 'composure'] }` after `신체` and before `GK`.
- Do not reuse the name `judgement`, which belongs to `OffPitchQualities`.

### 2.2 Detail arrays (`packages/contracts/src/detail.ts`)

The existing indexes stay; new indexes are appended.

```ts
export const TD = { keyPasses: 0, bigChances: 1, bigChancesScored: 2, boxShots: 3, finalThirdPasses: 4,
  finalThirdCompleted: 5, progressivePasses: 6, takeOns: 7, highTurnovers: 8, buildUpPasses: 9,
  pressActions: 10, boxEntries: 11, frontOfBoxEntries: 12, lineBreakingPasses: 13, xtAdded: 14,
  crosses: 15, crossesCompleted: 16, cutBacks: 17, throughBalls: 18, throughBallsCompleted: 19,
  progressiveCarries: 20, fouls: 21, yellowCards: 22, redCards: 23, corners: 24, offsides: 25,
  throwIns: 26, goalKicks: 27, freeKicks: 28, penalties: 29, penaltiesScored: 30 } as const;
export const TEAM_DETAIL_SIZE = 31;
export const PD = { xg: 0, xa: 1, keyPasses: 2, bigChancesCreated: 3, finalThirdPasses: 4,
  finalThirdCompleted: 5, progressivePasses: 6, takeOns: 7, highTurnovers: 8, boxEntries: 9,
  frontOfBoxEntries: 10, lineBreakingPasses: 11, xtAdded: 12, crosses: 13, crossesCompleted: 14,
  cutBacks: 15, throughBalls: 16, throughBallsCompleted: 17, progressiveCarries: 18, fouls: 19,
  foulsWon: 20, yellowCards: 21, redCards: 22, offsides: 23 } as const;
export const PLAYER_DETAIL_SIZE = 24;
```

- `xtAdded` is in thousandths and counts **positive** gains only (§9.2).
- `detailConsistent` (schema) gains these checks:
  - `crossesCompleted ≤ crosses`
  - `throughBallsCompleted ≤ throughBalls`
  - `penaltiesScored ≤ penalties`
  - with every player line present, the per-player sums of `yellowCards` and `redCards` equal the team values

### 2.3 Match record additions (`types.ts`, all optional, rules 4.0.0)

```ts
export interface Incident {
  minute: number;            // match minute 1..120 (added time counts as the period's last minute)
  added?: number;            // n for 45+n / 90+n / 105+n / 120+n
  side: 0 | 1;
  kind: 'yellow' | 'secondYellow' | 'red' | 'sub' | 'injury';
  player: string;            // player id (for 'sub' the player who left)
  other?: string;            // 'sub': the substitute who came on
  reason?: 'reckless' | 'tactical' | 'dissent' | 'dogso' | 'serious' | 'violent';
}
export interface MatchRecord extends Fixture {
  // ...existing fields...
  incidents?: Incident[];          // cards, substitutions, injuries in time order
  lineCounts?: [number, number];   // player lines per side in `players` (home lines first)
  added?: number[];                // added minutes per period played: [first, second] or 4 entries
  regulation?: Score;              // the 90-minute score when extra time was played
  shootout?: Score;                // kicks scored in a shoot-out
  material?: MatchMaterial;        // own current-season matches only (§9.4)
}
export interface Fixture { /* existing */ shootout?: Score }   // set on knockout fixtures decided on penalties
```

- `players` holds every player who played: starters first, then substitutes in the order they came on, home side lines before away side lines.
- `metrics[side][10]` is 90, or 120 with extra time. A player's `metrics[10]` is his minutes on the pitch, regulation and extra time, without added time.
- `metrics[side][11]` is possession expressed as minutes of the team total: home `round(total · share)`, away `total − home`.

`MatchMaterial` is defined in §9.4.

### 2.4 Playback contracts (T217 builds them, T218 replaces the old `MatchEvent`)

```ts
export interface MatchEvent {
  t: number;                       // seconds into the minute, 0–60
  kind: 'kickoff' | 'pass' | 'cross' | 'cutBack' | 'carry' | 'takeOn' | 'shot' | 'clearance' | 'holdUp'
      | 'restart' | 'foul' | 'card' | 'sub' | 'injury' | 'offside' | 'whistle';
  side: 0 | 1;                     // the acting side
  actor: string;                   // player id
  receiver?: string; opponent?: string;
  from: [number, number]; to: [number, number];   // playback units of that minute's period
  ok?: boolean; lost?: boolean;
  outcome?: 'goal' | 'save' | 'block' | 'miss';
  restart?: 'kickoff' | 'throwIn' | 'goalKick' | 'corner' | 'freeKick' | 'penalty';
  card?: 'yellow' | 'red';
  xg?: number; header?: boolean;
  text: string;                    // Korean commentary (§10.3)
}
export interface MatchFrame {      // existing fields keep their meaning; added:
  period: 1 | 2 | 3 | 4;
  label: string;                   // '23', '45+2', '90+4', '105+1'
  pace: number;                    // presentation weight, mean 1 over the match (§10.4)
  onPitch: [string[], string[]];   // player ids on the pitch at minute end, slot order where filled
}
export interface MatchPlayback { record: MatchRecord; frames: MatchFrame[]; squads: [Player[], Player[]] } // squads = whole matchday rosters
```

- `MatchFrame.players[side]` holds the players on the pitch, so there are 10 or fewer after a red card or a man-short injury.
- `PlayerMotion.id` identifies each player. The UI looks names up by id in `squads`, never by array position.

---

## 3. Setup (T205)

### 3.1 What `simulateMatch` computes, unchanged

The following stay exactly as today (`match.ts` L475–539):
- `context`, `form`, `base`, `ease`, `strength`, `shift`, `multiplier` and `drain`.
- The own club's style and synergy values.

Two changes:
- `possessionChance`, `profiles` and `lines` are used only by the probabilistic path (§11).
- The grid engine receives `shift`, `multiplier`, `drain`, the style bends (§6.6) and the rosters.

### 3.2 `GridSetup`

```ts
export interface GridSetup {
  w: World; f: Fixture; r: () => number;              // the match stream
  tactics: [Tactic, Tactic];
  rosters: [Player[], Player[]];                      // 11 starters in slot order + bench
  bench: [number, number];                            // bench sizes
  takers: [Takers, Takers];
  shift: [number, number]; multiplier: [(p: Player) => number, (p: Player) => number];
  drain: [number, number];                            // style drain multipliers (1 for NPC)
  bends: [StyleBend, StyleBend];                      // §6.6
  managers: [SubPolicy, SubPolicy];                   // §8.1
  pressing: [boolean, boolean];                       // tactic === 'press'
  era: EraRules;
  own?: 0 | 1;                                        // side of the owner's club
  decide?: DecideRule;                                // §8.4
  observe: boolean; recordPlayers: boolean;
}
export interface Takers { penalty: number; directFreeKick: number; corner: number } // roster idx, re-picked when the taker leaves
export interface EraRules { named: number; maxSubs: number; injuryOnly: boolean; windows: number | undefined; cards: boolean }
export interface DecideRule { first?: Score; awayGoals: boolean } // first-leg score oriented to this fixture's home/away
```

**`eraRules(year)`** (MATCH-20, MATCH-19):

| from season | named | maxSubs | injuryOnly | windows |
|---|---|---|---|---|
| before 1965 | 0 | 0 | false | — |
| 1965 | 1 | 1 | true | — |
| 1967 | 1 | 1 | false | — |
| 1987 | 2 | 2 | false | — |
| 1995 | 3 | 3 | false | — |
| 1996 | 5 | 3 | false | — |
| 2008 | 7 | 3 | false | — |
| 2022 | 9 | 5 | false | 3 |

`cards` is `year >= 1970` and only affects wording. Cautions and sendings-off apply in every era.

**Bench** (CLUB-6):
- Own club: from the active, fit, unbanned players outside the XI.
  - If `named ≥ 3`, the best goalkeeper by 실효 OVR at GK comes first.
  - Then pick in turn, cycling DF → MF → FW, the player whose best 실효 OVR at any slot of that line in the applied formation is highest, until `named` are chosen.
- NPC: squad places 11–17 (`npcSquad` order), skipping the unavailable (§13.3), up to `named`.

**Takers** (CLUB-6, MATCH-18), picked from the XI by these keys:
- penalty: 0.6 슈팅 + 0.4 침착성
- direct free kick: 0.5 슈팅 + 0.5 크로스
- corner and wide free kick: 크로스

### 3.3 Skill table

For each roster player and his current slot (bench players use the slot they enter):

- `base[a] = attrs[a] × levelFactor(positions, slot.position) × multiplier(p) − load/8 (load/10 for reflexes and handling) − unhappyPenalty(p)`, with `load = fatigueLoad(p.fatigue)`.
- `raw(side, idx, a, t) = base[a] + shift[side] − drainRate(p) × minutesOnPitch(t)`
- `drainRate(p) = (100 − stamina) / 12 × (pressing ? 1.3 : 1) × drain[side] / 90` per minute.
- `skill = anchor + (raw − level) × skillScale` (`STRENGTH_CONFIG`, T216): `level` is the mean 실효 OVR of both starting XIs at kick-off, so a strength gap plays the same at every tier, and `anchor` (76) is the level T215 set the distributions at.
- Candidate model (T357, T365): `skill = anchor + (raw − level − pull[side]) × candidate.skillScale` (1.8), with `pull[side] = (1 − candidate.side) × (XI mean 실효 OVR + shift[side] − level)` fixed at kick-off and `candidate.side` 0.8. Each side keeps 0.8 of its distance from the level, so the gap, home, manager, morale and form points shrink alike (a strength point still counts the same wherever it comes from, MATCH-2) and the spread inside a side is unchanged. T357 found the gradient set in pass completion, shared with the pre-feature path; at `side` 1 favourites won 4–7 points too often at every gap of 10 or more. The pre-feature path keeps `pull` 0 and `skillScale`.

`base` and the drain are the existing constants from `matchSkills`.

The 16 attribute keys are those of `ATTRIBUTES`. Recompute `base` when a substitute enters or when a player changes slot.

---

## 4. Off the ball (T206)

### 4.1 Formation spots

- `SPOTS[tactic][slot]` = today's `MATCH_MOTION_CONFIG.formations[tactic][slot]` converted to metres: `x = u · 1.05`, `y = u · 0.68`. This is side 0's attack frame; side 1 uses its own attack frame.
- `ROLE_SHIFT[role] = [forward, inward]` = today's `roleShift` × `[1.05, 0.68]` metres. Inward means toward the centre: the sign comes from the spot's side of y = 34.

### 4.2 Tactic shapes (MATCH-8)

```ts
export const SHAPE_CONFIG = {
  tactic: {
    possession: { advance: 8, defend: -2, line: [28, 55], press: 12, counterPress: 18, compact: 0.35 },
    press:      { advance: 6, defend:  4, line: [30, 58], press: 16, counterPress: 18, compact: 0.40 },
    counter:    { advance: 2, defend: -10, line: [18, 38], press: 8,  counterPress: 0,  compact: 0.30 },
    balanced:   { advance: 4, defend: -4, line: [24, 45], press: 10, counterPress: 8,  compact: 0.33 },
  },
  lateral: 0.25,
  deepLine: { behindBall: 4, min: 6 },                 // T215
  keeperPull: 0.08, keeperMax: { sweeperKeeper: 22, other: 14 }, sweeperStep: 0.3,
  markBlend: 0.4, markRadius: 10, counterPressSeconds: 5,
  transitionSeconds: 4, recoverySpeed: 1.15,
  speed: { base: 5.2, pace: 2.8, tired: 0.25 },        // m/s = base + pace·pace/99, × (1 − tired·fatigueShare)
  run: { chance: 0.04, seconds: [4, 6], behindDepth: 6, overlapAhead: 10, boxX: 95 },
  setPiece: {                                          // T215, attack-frame metres of the attacking side
    box: [[98.5, 30.5], [98.5, 37.5], [95, 34], [93, 27], [93, 41]], edge: [86.5, 34],
    mark: 0.8, zonal: [[101.5, 31], [101.5, 37], [100.5, 34]], stayUp: 1, stay: 8,
    zone: 3, keeper: { share: 0.25, depth: 4, line: 1, wide: 4.66 }, area: 30,   // T348, candidate model only
  },
} as const;
```

### 4.3 Targets

`targetOf(state, side, idx): Point` in the side's attack frame. `b` is the ball in that frame.

- **Goalkeeper:**
  - `x = clamp(4 + (b.x − 52.5) × keeperPull, 2, keeperMax)`, where `keeperMax` is 22 for a sweeper keeper while the own line is at or above 40, else 14; at that line a sweeper keeper also steps up `sweeperStep` (0.3) m per metre the line stands above 20 m.
  - `y = 34 + (b.y − 34) × 0.15`.
- **In possession:**
  - `spot + [advance, 0] + roleShift`.
  - Then `x += (b.x − 52.5) × compact` and `y += (b.y − 34) × lateral`.
  - Then `x ≤ offsideLine − 0.5` for players not on a run, where `offsideLine` is the opponent's second-last player.
- **Out of possession:**
  - `spot + [defend, 0]`, then `x += (b.x − 52.5) × compact` and `y += (b.y − 34) × lateral`.
  - On the candidate model, in a shape with three centre-backs and the ball at least `SHAPE_CONFIG.candidate.flank.wide` (18) m off the centre line and no further up than `upTo` (60) m, the ball-side wing-back closes `follow` (0.4) of the way to the ball's line, the ball-side wide centre-back steps `channel` (3) m toward the touchline to cover the channel between them, and the far wing-back tucks `tuck` (0) of the way in (T399, →MATCH-8). With the pressed cross below, balanced's xG conceded against the other three's mean moved −0.041 (outside) → −0.017 and the crosses balanced concedes 21.5 → 21.2 a match.
  - DF-line players are clamped to `line[0] ≤ x ≤ line[1]`. With the ball played behind that line, the line drops to `deepLine.behindBall` (4) m goal-side of the ball, never deeper than `deepLine.min` (6) m (T215: back lines used to stay above their 18–30 m floor and left box shots unmarked).
  - For `transitionSeconds` (4) after losing the ball, the side's players move at `recoverySpeed` (1.15) times their speed (§4.4).
  - Pressers:
    - The nearest opponent to the ball within `press` m runs at the ball, 1.2 m goal-side.
    - Under press, a second player within `0.6 × press` also presses.
    - For `counterPressSeconds` after losing the ball, `counterPress` replaces `press` when it is larger.
  - Every other outfielder blends `markBlend` toward the goal-side point 1.5 m from the nearest attacker within `markRadius` of his spot.
- **Runs (in possession, non-carrier):**
  - Each decision, while the ball is in band ≥ 3, a player starts a run with probability `run.chance × runWeight`. `runWeight = ROLE_ACTION.run × TRAIT_ACTION.run` (the existing tables).
  - A run lasts 4–6 s and overrides his target. Its kind:
    - `behind`: FW line, AM, shadow striker. Target `[offsideLine + behindDepth, his y]`.
    - `overlap`: overlapping full-back, attacking wing-back. Target `[b.x + overlapAhead, wide-lane centre on his side]`.
    - `box`: box-to-box, mezzala, shadow striker, only while b is in band ≥ 5. Target `[boxX, 30 + 8·u]`. On the candidate model a box run starts `SHAPE_CONFIG.candidate.boxRun.odds` (1.3, T398) times as often, from band `from` (5) and for the `extra` roles too (none): midfielders arriving late take 34% of the box shots (30% before) and score 34% of the goals, forwards 57% (61%), with `DECISION_CONFIG.candidate.shotScale` 0.43 (0.475) holding the volume. T398 also screened, and left neutral, a second striker standing `secondStriker.drop` m deeper in a two-striker shape (0) and a bonus for a teammate arriving on a box run as a cross's target (`DUEL_CONFIG.candidate.crossArriving`, 0) and as a cut-back's (`DECISION_CONFIG.candidate.arriving`, 0). While the box scene is on (§4.8, T443) its zone runs replace this target.
  - Run draws come from the match stream and happen in roster order.
- **Set pieces** (a corner, or a free kick crossed into the box; MATCH-18, T215):
  - The attacking side's five best headers (0.6 공중볼 + 0.4 몸싸움) take the `setPiece.box` spots and the sixth waits at `edge`; the rest hold where they stand.
  - The defending side's most advanced `stayUp` (1) outfielder stays upfield. The others, best headers first, stand `mark` (0.8) m goal-side of each man in the box, then on the three six-yard `zonal` spots, then goal-side of the man at the edge. A man-marker's place names the attacker he marks (`opponent`), and the scene names the defending keeper; only players on the pitch take part.
  - The players who went up hold their spots for `stay` (8) s after the delivery for the second ball. On the pre-feature path the defenders are then released into the shape (`moveAll(s, 8)` after the restart); on the candidate model they keep their jobs for as long (§4.7).

### 4.4 Movement

`moveAll(state, dt)`: every player on the pitch moves toward his target by `min(distance, speed × dt)`, with `speed` from `SHAPE_CONFIG.speed`. `fatigueShare = minutesOnPitch / 90`, capped at 1. The side that lost the ball within `transitionSeconds` moves at `speed × recoverySpeed`.

The carrier moves only through his own action (§6.1). Positions are clamped to the pitch.

On the candidate match model (`GridSetup.model` set) `movement.ts` replaces this step: players accelerate, brake and turn within `GRID_MOVEMENT_CONFIG` up to the same top speed, every action and restart lasts until its route is done and nobody is placed outside a period's start (docs/MATCH-MODEL-CONTRACT.md, "Detailed movement").

### 4.5 Intentions (candidate model, T276)

On the candidate model `intentions.ts` gives each player an individual intention (MATCH-17) in place of §4.3's per-update pressers and run draws; the pre-feature path is unchanged. `GridPlayer.intention` holds `kind` (`INTENTION_KINDS`), `priority`, `target` (engine frame), an optional `teammate`/`opponent` roster index, a run's kind, `since` and `until`. `GridPlayer.ended` keeps the last one that ended, with its ending (`INTENTION_ENDS`) and reason. A run is an intention whose `GridPlayer.run` view `decide.ts` still reads.

- **One lifecycle.** An intention keeps its target and references through ordinary updates while it is feasible. A tracked target follows its reference: a press goes goal-side of the carrier, a mark goal-side of the runner, a cover `coverDepth` (8) m behind the presser toward goal. Everything else holds the target it was given.
  - It ends **achieved** on arrival (within 1 m), when what it answered is over (`cleared`), or when a marker hands his runner to a teammate (`handover`, §4.6). A committed run is the exception: it holds its spot (a box spot kept for the second ball) and never ends on arrival. It ends **expired** at `until`, or **infeasible** when the target cannot be reached by `until` + 1 s, its carrier no longer has the ball (`moved`), the pass or ball went elsewhere (`lost`), an opponent took the space a combination needed (`closed`, §4.6), or a reference left (`departed`).
  - It is **displaced** only by a higher priority (`replaced`, `danger`) or a reasoned event: a turnover, a restart, a substitution, an injury or a sending-off. `INTENTION_REASONS` maps every reason to its ending.
- **Priority**, highest first (`INTENTION_PRIORITIES`):
  - `exit`: leaving the pitch.
  - `restart`: the taker and the restart's scene walking to their places.
  - `danger`: an urgent defensive job.
  - `committed`: receiving or carrying the ball, holding a set-piece job for the second ball after a delivery: a box spot, a mark, a zone or the goal (§4.7), or a box-scene run to a zone (§4.8).
  - `tactical`: support, run, press, mark, cover, recover, screen, a box-scene guard (§4.8).
  - A new intention never displaces a higher one, and tactical choices go only to free players, so one tactical job never replaces another at an ordinary update.
- **Events** (`engine.ts`):
  - Every new owner commits to the ball (`receive`, with the passer as `teammate`). A carrier commits to his carry's end; the reception he reached first is achieved (`arrival`).
  - A pass, cut-back or offside that does not reach its receiver cancels his chance as `lost`. The intention he was played into (a run) ends with that reason. A receiver with none records a zero-length `receive` from the passer, ended `lost`.
  - A change of side interrupts every intention below `restart` on both sides (`turnover`).
  - A dead ball interrupts every intention below `exit` (`restart`). Its taker and scene then take `restart` intentions, achieved as the kick is taken, and the players who went up hold their box spots for `setPiece.stay` (8) s as committed box runs; the defending scene keeps its marks, zones and goal for the same 8 s (§4.7).
  - A player who leaves ends his intention with his reason (`substitution`, `injury`, `dismissal`). Every intention that names him as teammate or opponent ends as `departed`, so a roster index never outlives a change.
- **Update.** `updateIntentions` runs once per action, after the action has been applied and before anyone moves, so everyone reacts to the pass, carry or turnover as it happens. It first reviews every intention against the same state and only then ends the ones that are over; a cover whose presser stopped, or a mark whose runner stopped, ends in the same update. Then it gives out the jobs `planCoordination` planned for both sides (§4.6). The choices:
  - **Danger.** The defending side is in danger when the carrier is within `danger` (30) m of its goal, or a runner is already beyond its second-last player. In danger the first presser and the markers of runners take `danger` priority and displace tactical jobs. When the danger starts while the carrier is already pressed, the presser nearest him keeps his intention, raised to `danger`. An urgent presser leaves his line's bounds. A danger intention ends `cleared` once the danger passes.
  - **Press.** The carrier is pressed by the man with the lowest distance ÷ (press weight × freshness) within the tactic's press reach (counter-press reach just after a loss). Under press a second presser comes within 0.6 × reach. A tactical press ends when the carrier is 1.6 × reach away.
  - **Cover.** One defender or DM steps behind the presser nearest the carrier; a side never has two covers for one carrier. Only a man whose shape place is within `coverNear` (10) m of the cover point is eligible. A covering role (cover defender, anchor ×1.5; ball-winner, defensive full-back ×1.2) is chosen first.
  - **Mark.** Each runner has one marker. Free men within 20 m pick up runners nearest pair first, and a marker gives his runner up past 28 m or hands him over (§4.6).
  - **Recover.** For 6 s after a loss, a free player further than 14 × (1 − 0.4 × 판단력) m from his shape target goes back to it.
  - **Support.** A carrier with an opponent within 4.6 m gets one teammate to show (`support: 'show'`). The teammate is the nearest within 22 m, by distance ÷ his `key` weight, outside the rest defence (§4.6). He shows with odds 0.45 + 0.45 × 침착성, 9 m from the carrier. With odds 판단력 he shows on the side away from the presser, otherwise on his own line, never beyond the offside line. The draw is named by the carrier and the spell of possession, so it does not reroll at every touch.
  - **Runs.** §4.3's run kinds and targets (`runPlan`, shared with `startRuns`). The chance is scaled by 판단력 timing (0.8–1.2) × freshness. Freshness is 1 − 0.5 × min(1, minutes/90) × (100 − 체력)/100. An overlap names the carrier as its teammate; one flank takes one overlap.
- Attribute odds read `skill` (slot, day and in-match drain) as a 0–1 share. Draws come from `${seed}:${fixture}:intention:${decision}:${side}:${player}:${moment}`, never from the match stream, an update order or an observer. Ties break by player ID (T277; T276 broke them by roster index).
- Measured on grid-bands' 600 equal-strength 2024 fixtures (all 16 tactic pairings), compared with T274's recorded candidate values on the same population (not a paired rerun):
  - Ball in play 58.5 → 59.5 min, goals 2.94 → 2.74.
  - Tackles + interceptions 27.6 → 25.7, throw-ins 17.0 → 16.2, possessions 95.2 → 95.4.
  - Forward passes 33.7 → 35.3%, added time 10.6 → 10.2 min.
  - Passes 469.8 → 472.6, completion 76.4 → 77.2%, shots 11.6 → 11.8.
  - Set-piece goals are 20.1%, headed goals 20.8%. Before the box hold was fixed, players who went up were released at the kick, giving 19.2% and 19.2%.
  - Outside their MATCH-23 bands: goal-area shots 11.3%, crosses 21.4, throw-ins 16.2, goal kicks 9.2, fouls 9.6, yellow cards 3.26, penalty goals 5.1%, headed goals 20.8%, FW goals 62%, ball in play 59.5 min.
  - Press still beats every other tactic (press v counter: home wins 92%).
  - T278 calibrates `INTENTION_CONFIG` and the tactic balance; the bands stay.

### 4.6 Coordination (candidate model, T277)

`coordination.ts` turns §4.5's individual choices into team jobs (MATCH-16, MATCH-17). After the review, `planCoordination(state, danger)` reads one snapshot and plans every job of both sides. It changes nothing: inspecting a plan, or tracing it, changes no outcome. `applyCoordination` then gives the jobs out. Each job goes to a different player, so the order they are given out in changes nothing. Candidates are ranked by cost, and equal costs break by player ID, never by roster index or the order players are visited. A player claimed for one job takes no other in the same plan. Values are `COORDINATION_CONFIG`.

- **Pressing.** The defending tactic sets how many press: `pressers` (press 2, the others 1), the second from within `second` (0.6) × reach. Existing pressers count toward the number. Reach is §4.2's `press`, or `counterPress` just after a loss: possession and press counter-press, counter does not.
- **Cover behind the press.** The cover steps `coverDepth` behind the presser nearest the carrier (§4.5). It ends `cleared` in the same update as that press.
- **Cover shadow** (T442, MATCH-32, `grid/lanes.ts`'s `SHADOW_CONFIG`). The carrier's dangerous option is the teammate within `near` (25) m whose pass gains the most threat (`threatGain`: the cells' xT difference, more than none; equal gains by player ID) and whose path nobody reaches as everyone stands (`dangerousOption`, using `pathReached`: `reachOnPath`'s first reach, stopping at the first opponent).
  - A tactical press within the press reach names that option (`Intention.shadow`). `pressPoint` then bends its goal-side point toward the point of the carrier–option line as far from the carrier, never past the option, by at most `curve` (1.5) m (`coverShadow`). He approaches between the carrier and the option and leaves the backward or wide pass open. A defender's line bounds apply after the bend.
  - The press keeps its option while it stays a nearby option that gains threat. His own shadow is what puts a reaching man on its path, so re-picking each action would swing him between lanes. The plan sets an existing presser's option through `CoordinationPlan.shadows`.
  - No shadow in a danger (the urgent press goes straight goal-side) or for a presser beyond his tactic's press reach.
- **Screen** (T442, MATCH-32). While some presser is within the press reach of the carrier, and no teammate already screens him, one free midfielder or defender takes a tactical `screen` job (`seconds.screen` 6). Its `opponent` is the carrier and its `shadow` the receiver.
  - Receivers: the carrier's outfield teammates whose pass gains threat and who stand in a half-space or between the opponents' midfield and back lines in the central lane (`screenable`, MATCH-15's tag as `computeTags` reads it), other than an option a presser shadows. They are taken by gain, then ID.
  - Screeners: free (no intention, not claimed in this plan, so never a marker), never the side's deepest outfielder, and with a shape place between the lane's ends within `screen.reach` (10) m of it. The first receiver with an eligible man gets the one nearest his screen point.
  - The screen point (`screenPoint`) is the foot of the lane from his shape place, at most `screen.step` (6) m from it. A defender keeps the back line's bounds; a midfielder never stands behind his back line. Its target follows the lane once an action.
  - It ends `cleared` when the carrier no longer has the ball or the lane is no longer screenable for him, and `departed` with its receiver. A receiver who leaves the pitch also takes a press's shadow away. It is traced as `mark`, and the inspector names it 길목 차단.
  - Calibration round 70 (core, 120 observed matches, per team, before → after): completion 77.50 → 77.74%, completed passes received between the lines 117.9 → 121.4, interceptions 7.75 → 7.68, tackles + interceptions 21.83 → 21.84, PPDA 18.25 → 18.32, goals a match 3.76 → 3.62. Paired 300-match runs put every change within about two standard errors. MATCH-29 went 12 / 0 / 13 → 14 / 0 / 11 inside / outside / insufficient.
  - The lane term (`LANE_CONFIG.risk`) and the interception split are untouched, so the carrier mostly plays around a shut lane. T437 calibrates. The planning costs about 7–8% of an observed match's time.
- **Marking and handover.** Runners are matched to markers by their distance, nearest pair first, so no runner gets two markers and no marker two runners. A tactical marker hands his runner over once the runner enters a teammate's zone. The teammate must be free and within 20 m of the runner. His shape place (`shapePlace`) must be within `mark.zone` (12) m of the runner and at least `mark.handover` (6) m nearer than the marker's own. The marker's intention ends `handover` (achieved), and his ended record names the teammate who took over. The teammate marks with tactical priority. An urgent danger mark is never handed over.
- **Showing and clearing the lane.** When a teammate shows for a pressured carrier, another teammate may stand within `open.lane` (3) m of the line the ball would travel to the show. He steps `open.distance` (8) m out of it at a right angle, taking his marker along (`support: 'open'`, same carrier, `seconds.support`). Only one teammate shows and one clears per carrier.
- **Legality.** A show or a clearance never goes beyond the offside line, the ball or halfway, whichever is furthest upfield. While the ball is in the opponent's half, the rest defence (`rest`: CB and DM slots) stays home: it neither shows nor runs. Runs in behind keep §4.3's target, timed on the line. Defensive jobs keep §4.3's bounds (a defender presses inside his line unless the danger is urgent), and only DF and DM players cover. Every job is an intention, so it moves through the same bounded scheduler (`movement.ts`, §4.4).
- **Closing a combination.** A show, or an overlap that names a carrier, is a combination. It ends `closed` (infeasible) when an opponent stands within `combination.closed` (2.5) m of its target. An overlap also ends `moved` once its carrier plays the ball or loses it. A player who gave up a job as closed takes no job of that kind for `combination.retry` (3) s.
- **Settled runs past halfway** (`settledRuns`, T356, T357, T365). Outside a break, with the ball from band 4 (halfway) on, a listed side's outfielders start their runs `odds` times as often: possession ×2.5. This is how the engine reads MATCH-8's possession row: patient short passing and recycling in its own half, then runners in behind and into the box once it is in the other half. In its own half nothing changes, so press keeps its lead in high regains. Without it possession made about 10 shots and 1.06 xG a match against 13 and 1.31 and sat 0.20 points below the four tactics' mean (outside MATCH-29); with it 11.1 shots and 1.26 xG, −0.07 (T365, rounds 23 and 24 pooled). Counter's runs straight after a regain stay `transition`'s.
- **The carrier's choice** (`decide.ts`, §6.3). The pass options read the teammates' intentions as they are, not a forecast. A teammate showing for this carrier scores `combination.show` (0.6) more. An overlap that names him scores `combination.release` (0.9) more once the overlapper is level with him or ahead. While it is still arriving behind him, an unpressured carrier carries `combination.wait` (1.5) times as often. A clearance, or a combination with another carrier, bends nothing. Without intentions (the pre-feature path) nothing changes.
- Measured on grid-bands' 600 equal-strength 2024 fixtures (all 16 tactic pairings), paired with the T276 tree on the same fixtures:
  - Goals 2.74 → 2.75, tackles + interceptions 25.66 → 25.67, ball in play 59.49 → 59.56 min, passes 472.6 → 474.4, completion 77.2 → 77.5%, forward passes 35.3 → 34.5%, shots 11.82 → 11.74.
  - Goal-area shots 11.3 → 10.0%, crosses 21.4 → 20.6, FW goals 62.2 → 58.5% (now inside its band), penalty goals 5.1 → 3.8%.
  - Press against counter: home wins 92 → 81%; counter against press 24 → 13%.
  - Per observed match: about 335 shows, 5 lane clearances, 346 covers (124 cleared with their press), 0.2 handovers, 7 shows and 0.2 overlaps closed, 24 overlaps ended once the carrier played on.
  - T278 calibrates `COORDINATION_CONFIG`, `DECISION_CONFIG.combination` and the tactic balance; the bands stay.

### 4.7 Set-piece defence (candidate model, T348)

A corner, or a free kick crossed into the box, keeps both sides' jobs through the preparation, the delivery, the aerial contest and the second ball (MATCH-17/18). Measured with `docs/benchmarks/set-piece-motion-261022.md`'s probes, rerun on 261023 at c2f5aa9 (main with T325 and T345):

- The pre-feature path is as recorded at 70eec53: 37 corners, mean largest 10 m group 6.43 attacking and 2.16 defending; the isolated placement goes 6/9 → 6/1. `placeAtOnce` places `scene.up` and `scene.marks`, `holdSetPiece` keeps runs for `scene.up` only, and after the delivery `playGrid` calls `moveAll(s, 8)`: the defenders, holding nothing, walk 8 s toward `shapePlace`.
- The candidate before this change: 43 corners, 5.40 and 5.19 (the recorded 52 corners, 5.38 and 5.44, predate T345). The responsible stage was `restartTaken` at the kick. It ended every `restart` place on both sides as `arrival` and re-committed only `scene.up` as box runs. Once the delivery resolved, `planCoordination` re-paired runners nearest pair first, and only while the attackers kept the ball. The zonal and edge defenders and the keeper went back to the shape during the delivery's flight. The isolated stage: the defending group fell from 9 at the kick to 6 after the 3.2 s delivery; the scene stood 6.2 m from its places after 3.2 s and 12 m after 5.7 s. Neither side was stationary, and no corner snapshot had 7 teammates within 5 m: no whole-team collapse.

The lifecycle now (`prepareOnClock` in `movement.ts`, `defendSetPiece` in `intentions.ts`, `guardPoint` in `shape.ts`):

- **Preparation.** Unchanged: the taker and the scene walk to their places on the clock as `restart` intentions; the keeper keeps his shape place (§4.3). An observed match records every slot at the kick, as `restartTaken` is about to run (`TraceEntry.kick`, §10.1, T359). Playback draws the walk-in ending there and the delivery starting there, and the preparation's samples show the restart's places.
- **The kick.** `restartTaken` ends every restart place (`arrival`) and holds `scene.up` on its box spots as committed runs until the kick + `setPiece.stay` (8 s). `defendSetPiece` gives the defending scene committed jobs to the same end:
  - each man-marker marks the attacker his place names, `markGoalSide` (1.5) m goal-side of him wherever he goes;
  - each zonal or edge defender guards his spot (a `cover` with a `zone`): on it, or goal-side of the opponent nearest it within `setPiece.zone` (3) m. Meeting a runner in his zone is no marking assignment: the runner keeps his one marker;
  - the keeper guards his goal (a `cover` whose `zone` is his goal line's middle) on the line from there to the ball: `keeper.share` (0.25) of its distance out, at most `keeper.depth` (4) m, at least `keeper.line` (1) m off his line and within `keeper.wide` (4.66) m of the middle. The update after the delivery resolves reads where it goes, so he answers the delivery.
- **The kick's own update.** Everyone reacts to the kick at its instant (`updateIntentions` once the restart resolves, before the delivery moves anyone), so an urgent danger there (`inDanger`: an attacker on the ball within `danger` (30) m of goal, as after a short corner, or a runner in behind) may displace a job as it starts: an urgent press on the man on the ball, or an urgent mark on a runner nobody marks. The displaced job lasted no time, so no snapshot holds it; the trace and playback show the urgent job from the kick on (`since` the kick, priority `danger`, the mark's 8 s). A set-piece job is a committed mark or cover since the kick; T366 found that `grid/playback.test.ts` once counted an urgent mark given at the kick as one on the trace side only, while no playback stage drops a job.
- **The urgent pairing keeps the markers (T367).** A man on a set-piece mark is taken for the urgent pairing (`defend` in `coordination.ts`), at the kick and through the second ball: an unmarked runner gets the nearest defender with no mark within `mark.pick` (20) m (a zone or edge guard, or a man of the shape), never a marker off the runner his place names, and with none in reach he waits for a later update. A runner nobody's place names is usually the edge runner of a side a man short: `setPieceTargets` gives the edge mark to the ninth defender back. Before, the pairing counted a committed mark as free for an urgent one, so in `set-piece-1` (T366) the marker `p:10` left runner 9 for the edge runner 8 at three deliveries and the central zone's guard `p:8` took 9 2.3 s later; now `p:8` takes 8 at once and `p:10` keeps 9. The urgent press is unchanged.
- **A delivered taker is no carrier (T373).** A delivery whose outcome hands the ball to nobody at the kick (a header resolved there, a ball out, a foul) leaves the taker recorded on the ball until the next restart. The update that reads that kick (`playGrid` passes `updateIntentions` its `inFlight`: a corner or a crossed free kick, and `setOwner` wrote no new owner) reads no carrier: no urgent danger and no jobs, so nobody presses the taker at the flag or the spot while the ball is in the air, and the scene keeps its set-piece jobs through the flight. A delivery that reaches someone (a receiver, an interceptor, a second ball's winner, the taker himself on a loose ball) is read as before, so its man on the ball is pressed as usual. The outcome rules are unchanged.
- **The delivery and the aerial contest.** Resolved from the positions at the kick as before (`resolveCross` is unchanged). A turnover (a claim, an interception, a loose ball to a defender) ends every set-piece job on both sides. A cross the attackers keep leaves both scenes in place; the urgent press on the man on the ball may displace one of the jobs (`danger`).
- **The second ball.** A mark ends `cleared` with its runner's hold (he receives, or his 8 s run out). A zone or goal guard ends `cleared` once the ball is more than `setPiece.area` (30) m from the goal line it was delivered at (`secondBallOver`, the defenders' danger distance), so a ball played back out frees the zones and the goal while the markers stay with men still in the box. An urgent danger may send a guard to an unmarked runner, never a marker (T367). Every job also ends at expiry, at a turnover, at the next restart and when a player leaves (references end `departed`). Nobody holds a set-piece job once the defenders have the ball or another restart is taken, and nobody off the pitch marks or is marked.

Limits:

- **Default path.** The pre-feature path is unchanged: grid-throughput's pre-feature facts digests are identical. Settled and queued matches, and every career until the full model activates prospectively (SAVE-23), keep the released defensive placement (`holdSetPiece`, then `moveAll(s, 8)`). No settled match is replayed.
- **A marker re-paired at the kick (seen in T366, fixed in T367).** The urgent pairing no longer moves a marker (above). In 96 observed candidate matches of the playback world (all sixteen tactic pairings) the kick's own update gave 56 urgent marks, 55 to a man-marker, before T367 and 57, none to a man-marker, after.
- **The urgent press at the kick (seen in T367, fixed in T373).** `inDanger` read the man the restart leaves on the ball, so the kick's own update sent the nearest defender, with no reach limit, to press a taker whose delivery had handed the ball to nobody, at the corner flag or the free kick's spot while the ball was in the air; the press counts a committed mark as free. In the same 96 matches 311 of the 445 urgent presses at a kick went to the taker, 219 of them by a man-marker whose runner still held his box spot (about one delivery in seven). After T373 (the same 96 matches): 137 urgent presses at a kick, 1 to the taker (he had won a short corner's loose ball himself), and 46 by a man-marker whose runner still held his spot (all on the man the delivery reached); urgent marks at a kick 57 → 16. The header was resolved at the kick, so this moved the flight's positions, not the delivery's outcome.
- **Other restarts' takers.** The rule covers deliveries only. A direct free kick's shot or a throw-in out of play also leaves the taker recorded on the ball for the kick's update; they are not measured here.

Measured after the change (c2f5aa9 with T348):

- The recorded probes: the pre-feature path is unchanged (37 corners, 6.43 and 2.16; 6/9 → 6/1). The candidate gives 43 corners, 5.40 and 5.12 at the corner's entry. The aggregate barely moves because most deliveries end at once in a turnover, after which both sides leave their places as before: 184 of 268 delivered set pieces in 16 candidate matches of the probe's world and pairings.
- Deliveries the attackers keep, in those 16 matches: after completed crosses the defending group is 8.50 at the delivery (8.30 before) and 7.50 an action later (6.20); after headers it is 7.70 (6.78). At a completed cross the defending outfielders now hold 5 scene marks, 3 zone guards and 1 urgent press, the stay-up man has no job, and the keeper guards his goal. Before, they held 5.6 re-paired danger marks, 0.7 covers behind the press and 1 press, and 2.7 had no job.
- The isolated candidate stage (the recorded corner): the defending group stays 9 through the delivery and 2.5 s of the second ball; the scene stands 0.4 m and 1.4 m from its places. The keeper moves from (103.0, 29.0) to (103.4, 33.1), toward a delivery to the first box spot.
- 600 equal-strength 2024 candidate fixtures (`scripts/grid-bands.ts --candidate`, the same fixtures before → after): goals 2.65 → 2.61, set-piece goals 23.2 → 22.6%, headed goals 18.7 → 17.7%, shots 12.13 → 12.28, corners 4.66 → 4.74, yellow cards 3.54 → 3.65, goals by FW/MF/DF 62.4/26.7/10.9 → 61.4/27.8/10.8%, ball in play 56.82 → 56.73 min. 35 of 37 rows are now in band (34 before): MF goals came back in, while goal kicks (9.13) and FW goals (61.4%) remain out. No band changed. T323 must refresh the detailed reference and the parity after this change.

Measured after T367's urgent pairing (fresh validation round 44, `scripts/t328-counter-roles.ts --set all --per 600 --core 2400 --gap 600`, the same 21,600 matches on 885d336 and on the change): 1,147 of the 12,000 tactic and core records differ (602 scores) and 406 of the 9,600 gap samples. MATCH-29 17/1/7 → 18/1/6 inside/outside/insufficient, MATCH-23 core 33 → 34 of 38 inside, the MATCH-2 curve 1.87 → 1.91 points; no row moved from inside to outside. Set-piece goals 21.59 → 21.85% (paired change +0.26 pp, 95% interval −0.01 to +0.52), headed goals 17.94 → 18.10% (+0.16 pp, −0.11 to +0.43), goals 2.762 → 2.748 a match. Every status that moved sits at a band's edge: possession–press draws, the possession–press and press–balanced win-share gaps and red cards came inside, and the possession–counter win-share gap (paired change −0.003, −0.012 to +0.005) and press's high-regain lead over counter (−0.011, −0.040 to +0.018) became insufficient. T286's registry judges the combined source.

Measured after T373's delivered taker (fresh validation round 46, the same script and sizes, 217a861 against the change): 998 of the 12,000 tactic and core records differ (713 scores). MATCH-29 18/1/6 → 17/1/7, the only move being press–press draws going from inside to insufficient (0.258 → 0.267, paired change +0.008, −0.002 to +0.018). The MATCH-23 core holds 33 of 38 inside with every status unchanged, and the MATCH-2 curve goes 1.77 → 1.86 points. Set-piece goals 20.58 → 20.55% (paired −0.02 pp, −0.29 to +0.25), headed goals 17.05 → 17.04% (−0.01 pp, −0.27 to +0.25), goals 2.813 → 2.810 a match; in the 96-match census the defenders win 88.5 → 88.3% of second balls.

### 4.8 The box scene (candidate model, T443)

In open play, once the ball is wide in the final third or in a cut-back zone, the attack occupies the box's zones with runs timed to the delivery and the defence protects the same zones goal-side (MATCH-33, MATCH-34). `grid/box.ts` holds the scene and `BOX_CONFIG`; `planCoordination` gives out its jobs (§4.6), `intentions.ts` keeps and ends them (§4.5), `shape.ts` moves the players. The pre-feature path is unchanged. Movement only: the decision tables, duels and xG are untouched, and the delivery still draws its target the existing way until T444.

- **When it is on** (`boxSide`). The candidate model, the side on the ball and the ball (its attack frame) in a wide lane from `wideFrom` (70) m up or in a cut-back zone (the goal-area band's half-spaces, MATCH-14). A set piece's jobs keep §4.7's scene: while any restart place, set-piece box spot, mark or guard holds, the scene is off.
- **The zones** (`boxZones`), points in the attacking frame named by the ball's side of the goal: the near post 3.5 m out and 3 m inside the near post, the far post 3 m out and 1 m beyond the far post, the penalty spot (11 m) and the edge (19 m) on the goal's middle. A post stands `post` (3.66) m from the middle. T444 aims deliveries at them, T445 drops second balls near them.
- **The attack** (`boxScene`). Each zone gets at most one attacker. A runner already on its run keeps it; the free zones go nearest suitable pair first, equal distances by player ID: the forwards take the posts, then a midfielder whose role makes box runs (box-to-box, mezzala, shadow striker and attacking midfielder, `BOX_ROLES` plus `roles`) or the far-side winger (LW/LM or RW/RM) takes the spot or a post left free, then another midfielder takes the edge. Never the carrier, the rest defence (`COORDINATION_CONFIG.rest`), a man holding anything but a tactical run (a show, a reception), or one more than `reach` (30) m from the zone.
  - Each takes a committed box run (`Intention.box` names the zone and the ball's side) for `seconds` (8) to his load point `load` (4) m short of the zone toward halfway. While the scene is on these runs replace the box run's `[boxX, 30 + 8u]` (§4.3): a box-run role the scene leaves out makes no box run.
  - Once the carrier's decided action is a cross or a cut-back, read at the decision as the defenders read the decided pass (T426), every runner attacks his zone itself (`attackZones`, called by `playGrid` before the in-stride carry), so he arrives as the ball does. The next update with the scene on sends him back to wait at his load point.
  - A run ends `cleared` when the ball leaves the final third (the scene's area, from `wideFrom` up), goes to the other side of the goal while the scene is on, or is cleared (a turnover). With the ball central in the area (a delivery that reached the middle) the runs hold until they expire.
- **The defence** (`boxGuards`, `defendingBox`). While the opponent's scene is on, or one of its guards still holds, the back line drops to `boxLineDepth`: `defend.line`'s 5.5 m with the ball on the byline to its 11 m with the ball `wideFrom` up, linear in between. It narrows to `defend.narrow` (0.6) of its distance from the centre line (`boxBackLine`, read by `shapePlace` for every back-line player without a job).
  - The guards are tactical covers with a `box` job, planned after the press and before the cover behind it, for `seconds` (8): the ball-side centre-back (by his slot's spot) the near post, the most central other centre-back the middle (between the posts' zones), the far full-back or wing-back the far post, all on the line's depth at their zone's line, and the nearest free holding or central midfielder the edge, or the spot when the attack fills the spot and not the edge (`boxGuardPoint`). Only free men take a guard, and a guard nobody holds.
  - A guard whose zone a runner attacks stands between him and the zone, `markGoalSide` (1.5) m from him (`boxGuardTarget`, `boxMarkPoint`), so that runner needs no other marker; the mark pairing skips him, and never takes a guard. Every other runner on a box-scene run is marked the same way, between him and his zone; a zone without a runner is held by position.
  - A guard ends `cleared` when the ball leaves the final third, goes to the other side of the goal or is cleared, and the line steps up together into the shape. An urgent press may still take a guard (§4.5's danger rule); guards never take danger priority themselves.
- Calibration round 71 (core, 600 observed matches, the pre-change source 09621a66 → this change, per team a match; reported, not gated): box entries 32.27 → 32.68, crosses 19.41 → 22.29 with completion 22.0 → 22.7%, cut-backs 0.31 → 0.26, shots 14.24 → 14.27 with goal area / rest of the box / outside 9.2 / 54.1 / 36.6 → 12.4 / 51.8 / 35.8%, xG per shot 0.126 → 0.131, xG 1.79 → 1.87, goals a match 3.52 → 3.72, headed goals 14.4 → 15.2%, goals by FW / MF / DF 51.3 / 40.8 / 7.8 → 57.0 / 37.0 / 6.0%.
  - Open-play crosses with an attacker within 3 m of each zone as the ball arrives (the trace's snapshot after the delivery): near post 7.2 → 31.4%, far post 1.4 → 10.4%, spot 23.2 → 27.1%, edge 15.1 → 20.5%; cut-backs 10.3 / 2.0 / 24.1 / 5.7 → 62.0 / 29.5 / 35.4 / 39.9%.
  - With the attack's runs off (`reach` −1, the defence alone) goals were 3.50 and goal-area shots 9.8%: the extra goals come from the runs' close-range chances. T437 calibrates before T286; bands.test's candidate goal guard stands at its measured 4.0 until then.

---

## 5. Tags (T207)

`computeTags(state, side, idx): Tags`, in the carrier's attack frame.

```ts
export interface Tags {
  cell: number; band: Band; lane: Lane;
  phase: 'buildUp' | 'progression' | 'finalThird' | 'counter' | 'settled' | 'setPiece' | 'contest';
  pressure: number;            // Σ over opponents within 4.6 m: 1 if goal-side of the carrier, else 0.5
  nearest: number;             // metres to the nearest opponent
  orientation: 'facing' | 'halfTurn' | 'backToGoal';
  betweenLines: boolean; pocket: boolean; inBehind: boolean; channel: boolean;
  overload: number;            // own players − opponents within 15 m of the ball
  lead: number; minute: number; menDiff: number;   // own − opponent
}
```

- `phase`:
  - `setPiece` while a restart is being taken.
  - `counter` within 8 s of a regain if at most 5 opponents are goal-side of the ball.
  - Otherwise by band: 0–2 `buildUp`, 3–4 `progression`, 5–7 `finalThird`.
  - Otherwise `settled`. `contest` is used for loose balls.
- `orientation`:
  - `backToGoal` when the last received pass travelled toward the own goal (its dx < 0) and an opponent is within 3 m goal-side.
  - `halfTurn` when it travelled laterally with no opponent within 3 m goal-side.
  - Otherwise `facing`.
- `betweenLines`: the carrier's x lies between the opponent MF-line mean x and DF-line mean x (outfield slots by `lineOf`), in lanes 1–3. `pocket`: `betweenLines` and `nearest ≥ 6`.
- `inBehind`: x is greater than the opponent's second-last player x.
- `channel`: in a half-space lane, within 6 m of the opponent DF-line x, between that side's CB and FB by y.

---

## 6. Decisions (T208)

### 6.1 Actions

```ts
export type Action = 'pass' | 'cross' | 'cutBack' | 'carry' | 'takeOn' | 'shot' | 'holdUp' | 'clearance';
```

How each action resolves:
- `pass`: covers short, long, switch, through and line-breaking passes. The type is decided by the target geometry (§6.3).
- `carry`: moves 6–12 m (§6.4).
- `holdUp`: a shielding duel, then a lay-off.

The goalkeeper's distribution is `pass` with the GK rules (§6.5).

### 6.2 Action mix

`actionMix(state, side, idx, tags) → Record<Action, number>` (then normalised):

1. **Base from `CELL_BASELINES[cell]`:**
   - `pass × (1 − crossOfPasses)`, `cross = pass × crossOfPasses`
   - `carry`, `takeOn`, `shot`, `clearance`
   - `holdUp = 0.03`, or 0.15 for FW/AM in central lanes when `backToGoal`
   - In the cut-back cells (`goalArea` band × half-space lanes): `cutBack = cutBackShare × cross`, `cross = (1 − cutBackShare) × cross`, `cutBackShare` 0.1 (0.5 on the candidate model, `DECISION_CONFIG.candidate.cutBackShare`, T397)
2. **Position profile** (`POSITION_PROFILES[profileKey(position)]` against the league's overall, `factorRange` 0.2–3):
   - `takeOn × clamp(profile.takeOnPerPass / 0.075)`
   - `cross` and `cutBack × clamp(profile.crossShare / 0.025) × crossScale`, `crossScale` 7.2 (the cells' own cross shares gave under one cross a side, T215)
3. **Shot volume:** `shot × shotLine[line] × shotScale × (band 6 ? shotBox : 1) × exp(−max(0, goalDistance − 28)/6)` with `shotLine` GK 0, DF 1, MF 3.8, FW 0.9, `shotScale` 0.19 (the first engine made about 25 shots a side), `shotBox` 0.42 (shoot in the box band rather than carry into the goal area) and `longShot` 28 m / 6 m (a cell's shots come from its near end), all T215. On the candidate model (`DECISION_CONFIG.candidate`) `shotScale` is 0.43 (0.45 at T370, 0.475 at T371, 0.43 since T398's late box runs) and the long-shot fall-off 3.5 m (T370), and a shot in the box is also weighed by its chance: × min(1, (xG/0.3)^0.5), its xG from §7.4 with the pressure on him (`shotQuality`, T370, →MATCH-16). A carrier passes up a weak angle or a pressured look and a big chance keeps its weight, so box shots and key passes fall into MATCH-30's bands with goals unchanged; the scales hold the volume and keep the shot places inside MATCH-23.
4. **Role and traits:** multiply by `actionWeight(role, traits, x)` for:
   - `shot ← 'shot'`
   - `takeOn ← 'dribble'`
   - `cross` and `cutBack ← 'cross'`
   - `holdUp ← 'hold'`
   - `shot` outside the box `← 'long'`
5. **Tactic** (`DECISION_CONFIG.tactic`):
   - possession: `pass ×1.10`, `takeOn ×0.90`, shot from band 5 `×0.80`
   - counter in `phase = counter`: `shot ×1.10`
   - press after a regain in band ≥ 5 within 6 s: `shot ×1.20`
6. **Tags:**
   - `pressure ≥ 1`: `carry ×0.6`, `takeOn ×1.3` for a player with 드리블 ≥ 65, `clearance ×2` in bands 0–2
   - `backToGoal`: `takeOn ×0.5`, `shot ×0.3`
   - `inBehind` in bands ≥ 5, central or half-space lanes: `shot ×0.8`, `carry ×1.3`
   - `pocket`: `takeOn ×1.2`, shot from band 5 `×1.6`
7. **Score and time:**
   - all match long, `shot × 0.6^lead` for a side ahead and `shot × 1.4^deficit` for a side behind, by at most 3 goals (`leading.shot`, `trailing.push`, `maxLead`; T216)
   - leading and `minute ≥ 75`: `takeOn ×0.8`, `clearance ×1.3` in bands 0–2
   - trailing and `minute ≥ 70`: `shot ×1.2`, `cross ×1.2`
8. **Decisions on shots:**
   - in a cell with xG per shot < 0.05: `shot × (1 − (판단력 − 50)/200)`
   - in a cell with xG per shot ≥ 0.12: `shot × (1 + (판단력 − 50)/300)`
9. **Hard restrictions:**
   - no `shot` from bands 0–3 except a direct free kick
   - no `cross` or `cutBack` outside bands 5–7
   - no `clearance` in bands 5–7
10. **First touch** (candidate model, T397, `DECISION_CONFIG.candidate.firstTouch`): the receiver of a completed pass, on his first decision (`GridState.received`, cleared when he acts), facing play with pressure below 1 and below the box band, carries `carry` 6 times as often. He takes the ball forward in his stride, so progressive carries rise (40.8 → 46 a team) with fewer passes per possession.

### 6.3 Pass target

`choosePass(state, side, idx, tags, r)` scores teammates on the pitch (not the carrier), within 60 m (70 m for GK and CB).

- `gain = (xT(cell_j) − xT(cell_carrier)) × 100`
- `open = min(1, nearestOpponent_j / 8)`
- `risk = Σ_opp exp(−d_lane / 2)`, where `d_lane` is the opponent's distance to the pass segment (only opponents projecting inside it); on the candidate model (T441, →MATCH-16, MATCH-31) `risk` is the lane's reach weight from `reachOnPath` (§7.1), read from where everyone stands as he chooses, so a cooler temperature (better 판단력) avoids a reached lane more surely
- `score_j = 1.0·gain + 0.8·open − 0.6·risk − max(0, dist − 15)/10 + through_j`
- `through_j = 0.8 × actionWeight(role, traits, 'key')` when j is on a `behind` run or `inBehind`, else 0
- candidate model only: `+ combination.show` (0.6) when j shows for the carrier, `+ combination.release` (0.9) when j's overlap combines with him and j is level with him or ahead (§4.6)
- candidate model only (T397): `through_j` uses `candidate.through.score` 2 (0.4 before) in place of 0.8, times `candidate.past.through` 0.5 when j already stands past the opponents' offside line as the ball is played, so the pull goes to a run still level with the line; such a j's prior is also multiplied by `candidate.past.prior` (1, kept). `gain` is multiplied by `candidate.gain` (1; T397 screened lower weights: fewer final-third passes and entries, but fewer shots and goals). Completed through balls rose 0.46 → 0.67 a team (MATCH-30 0.60–0.85); `RESTART_CONFIG.offside.candidate.base` fell 0.055 → 0.05 so calls stay at 1.85 a team (§7.3).

**Direction prior.** `dir_j` is forward, lateral or back by ±45° in the attack frame.

```
prior_j = CELL_BASELINES[cell][dir] × sqrt(profile[dir] / OVERALL[dir]) / n_dir
```

`n_dir` is the number of candidates in that direction. When scores are flat, the choice reproduces the cell's real direction mix. Backward options take `backPrior` (2.2) on top, since the threat gain alone kept back passes near 9% (T215); after a hold-up they take `backBias` (3) more and at a kick-off `RESTART_CONFIG.kickoffBackBias` (10). On the candidate model `DECISION_CONFIG.candidate.finalThird` can weigh a passer's lateral and backward options from 70 m on (`lateral`, `back`), a forward pass into the final third from below it (`entry`), a carrier's choice to pass there (`pass`) and a carry's length outside the box (`carry`); all are neutral at 1. T408 kept none: fewer entries moved the final-third and box counts toward MATCH-30 but took offsides, ball in play and MATCH-29's high-regain ordering outside their bands.

**Temperature:**

```
τ = clamp(1.0 × (1 + (60 − 판단력)/80) × (1 + pressure × (60 − 침착성)/150), 0.4, 2.5)
```

**Choice:** `P_j ∝ prior_j × exp(score_j / τ)`, drawn with one `r()`.

**Pass type**, from geometry:
- `long`: distance > 30 m
- `switch`: |Δy| > 30 m
- `through`: `through_j > 0`
- `lineBreaking`: the end x is beyond the deepest player of an opponent outfield line that the start x was not beyond

### 6.4 Carry and take-on

- Candidate model (T397): a heading that takes a carry from outside the box into it scores `candidate.boxCarry` less in xT points (0, neutral). Screened at 5–20 it brought box entries inside MATCH-30 (carries into the box were 14.8 of 25.9 a team), but goals fell to about 2.3 a match: the grid's chances come from those carries.

- **Carry.** Pick among 5 headings (0°, ±30°, ±90° from goal-ward) by `exp((xT gain − 0.5·pressure_at_point)/τ)`.
  - Length 6–12 m (`6 + 6·r()`), or 3–6 m (`boxLength`) for a carry that starts in the box (T215), kept `margin` (0.5 m) inside the pitch.
  - A carry ending past the box line in bands 5–7 is allowed.
- **Take-on.** Against the nearest opponent in front within 4.6 m. On success the carrier ends 6.5 m past him toward goal (the middle of `takeOn.past` 5–8 m, no draw). With nobody in front it is a carry, and only a take-on against a defender counts as one (MATCH-13, T215).

### 6.5 Goalkeeper distribution

- Short to a CB or FB with probability:
  - sweeper keeper: 0.70
  - shot stopper: 0.45
  - 0.15 less when the opponent tactic is press
- Otherwise long: the target is chosen among FW and wide players in the opponent half, with the same scoring, `risk × 0.5`.
- A long ball ends in an aerial duel at the landing point (§7.1, aerial).

### 6.6 Style bends (STAFF-14)

`StyleBend` comes from `managerStyleEffects(w)` for the own side; neutral for NPC sides. The profile points map onto the grid like this:

| effect | grid meaning |
|---|---|
| `pass` | pass completion + `pass/100` |
| `possession` | pass mix × `(1 + possession/50)` and carry × `(1 − possession/100)` |
| `shot` | shot mix × `(1 + shot/20)` |
| `defense` | opponent shot mix × `(1 − defense/20)` |
| `lineHigh` / `lineLow` | own `line` bounds + `lineHigh × 100` m / opponent final-third completion − `lineLow` |
| `drain` | drain multiplier |
| `strength` | unchanged, inside `shift` |

Synergy `pass`, `possession`, `defense` and `lineHigh` add the same way.

---

## 7. Resolution (T209, T210)

`bend(m) = 30 × tanh(m/30)`, as today. `a`, `d` below are skills from §3.3.

### 7.1 Open play

```ts
export const DUEL_CONFIG = {
  pass: { base: 0.07, passer: 1/250, marker: 1/300, risk: 0.03, distance: 1/400, pressure: 0.015, min: 0.25, max: 0.97,
          lost: { intercepted: 0.07, loose: 0.81, out: 0.12 }, receiverLoose: 0.35 },
  cross: { base: 0.55, skill: 1/150, crowd: 0.015, min: 0.08, max: 0.6, claim: 0.1, failOut: 0.15, intercept: 0.4,
           targetSpread: 8, control: { open: 0.8, setPiece: 0.05 } },
  cutBack: { base: 0.43, skill: 1/200, min: 0.2, max: 0.7 },
  takeOn: { skill: 1/285, min: 0.2, max: 0.62, fail: { tackle: 0.35, foul: 0.55, loose: 0.1 }, past: [5, 8] },
  boxFoul: 0.035, thirdFoul: 0.3, looseFoul: 0.08,
  carry: { lostScale: 2, skill: 1/120, min: 0.01, max: 0.35, foul: 0.8 },
  holdUp: { base: 0.6, skill: 1/150, min: 0.3, max: 0.85 },
  aerial: { skill: 1/150, base: 0.5, min: 0.15, max: 0.85 },
  clearance: { out: 0.35, reach: [25, 45] },
} as const;
```

- **Pass.** `p = clamp(cell.passCompletion + base + (passer − 60)·passer − (marker − 60)·marker − risk·laneRisk − max(0, dist − 20)·distance − pressure·tags.pressure + bend.pass/100, min, max)`; `base` is T215's offset on every cell's real completion rate.
  - `passer` is 패스, or (패스 + 시야)/2 for long, through, switch or line-breaking passes, or 발밑 for a goalkeeper.
  - `marker` is 위치선정 of the opponent nearest the segment.
  - On failure, split by `lost`:
    - `intercepted` (only when there is a marker): the marker wins it at his projection point. On the candidate model a pass played from below 70 m (the passer's build-up) is intercepted by the defending side's tactic's share instead (`DUEL_CONFIG.candidate.intercept`, T370: possession 0.175, press 0.195, counter 0.155, balanced 0.175), taken from the loose balls so as many passes still leave play; press reads the build-up most and counter, which engages around halfway, least (→MATCH-8). It brings PPDA and high turnovers into MATCH-30's bands.
    - `loose`: a 50/50 at the target among the two nearest players of each side by `1/(distance + 1)`, where the receiver the pass missed weighs `receiverLoose` (T215: he won most of them back and possessions reached 83 a team).
    - `out`: the ball leaves the pitch along the pass line (§7.2).
  - Before resolving, check offside (§7.3).
- **Lanes on the candidate model (T441, →MATCH-11, MATCH-31, `grid/lanes.ts`).** A pass is cut out only by an opponent who reaches its path.
  - `reachOnPath(s, side, from, to, kickAt)`: for each opponent, the first point of the ball's path (at `GRID_BALL_CONFIG.pass`, 20 m/s, kicked `kickAt` s from now) he can get within `LANE_CONFIG.reach` (1.2 m) of, or only at full stretch within `stretch` (2.2 m), before the ball gets there; his `spare` is the most time he has in hand from that point on. He keeps his velocity until his read (`readAt`, T324: up to `GRID_MOVEMENT_CONFIG.read` × his 위치선정 share of the wind-up before the kick), then runs straight there in closed form (`runSeconds`: his speed toward the point carried over, acceleration 4 m/s² up to `speedOf`). The scan covers only the stretch of path he could get within `stretch` of at top speed (a quadratic in the distance along it), at 1 m steps, halved 5 times at the first reach. The ball meets first the opponent with the smallest such distance along the path.
  - Weight: `min(1, spare / weight.full)` (0.5 s), × `weight.stretch` (0.5) at full stretch; a lane's weight is the sum over its reaching opponents. The marker is the first of them, on his 위치선정 (none: 60), for a keeper's distribution as for any pass (MATCH-11 r29). The lane term `LANE_CONFIG.risk` (0.033) × the lane's weight replaces `risk · laneRisk`. The value holds the candidate's completion at its frame (calibration round 69: 77.32% before, 77.43% after).
  - The failure split is unchanged but its interception branch needs a reaching opponent: below `u < intercepted` (the tactic's build-up share below 70 m, else `lost.intercepted`) the first one wins it at his reach point when he gets within `reach` with `LANE_CONFIG.sure` (0.25 s) to spare, else deflects it loose there (a 50/50 by `looseBall`); with nobody reaching it the pass is lost at the receiver (the loose ball weighted by `receiverLoose`) or out. The interceptor's recorded flight ends at his reach point and he runs to it within the action (§10).
  - After an in-stride carry the kick is at once (`kickAt` 0); a first-time ball or a keeper's distribution is kicked after the wind-up its flight leaves of the action. `GridResult.diagnostics.passLosses` counts each side's failed open-play passes as intercepted, deflected, lost at the receiver or out.
  - Calibration round 69 (core, 120 observed matches, per team a match, before → after): passes 407.2 → 407.0, interceptions 13.6 → 7.5, tackles + interceptions 27.9 → 21.3, PPDA 14.5 → 18.2, high turnovers 7.4 → 6.0, final-third passes 141.1 → 137.1, box entries 33.8 → 32.0, shots 14.5 → 13.8, xG 1.82 → 1.73, goals a match 3.46 → 3.49. Of the failed open-play passes 5.4% are won in the lane, 4.7% deflected, 75.7% lost at the receiver and 12.6% go out (12.6% intercepted, 73.1% at the receiver and 12.5% out before). About 70% of passes have an opponent who reaches their path, 14% of those at the passer's feet and 26% just before the receiver.
- **Loose balls.** Outside the boxes a 50/50 ends in a foul on its winner by the nearest opponent `looseFoul` of the time (T215).
- **Cross.**
  - The target is drawn first among the attackers in the box, weighted `e^((rating − best)/targetSpread)` with `rating = (0.6 공중볼 + 0.4 몸싸움) × aerial habit`.
  - Delivery: `p = clamp(base + (크로스 − 60)·skill − max(0, defenders − attackers in box)·crowd, min, max)`. On the candidate model a crosser under pressure loses `DUEL_CONFIG.candidate.crossPressure` (0.15, T399) × his `pressure` tag (up to 1) more: the closed-down cross is blocked, and cross completion falls 24.4 → 22.2% (MATCH-23 20–30%).
  - A failed delivery (or no target) goes out over the byline `failOut` of the time (a goal kick); otherwise the nearest defender to the target intercepts it `intercept` of the time and heads it clear as a loose ball the rest.
  - A delivered cross: the keeper claims it with `claim + (공중볼 처리 − 60)/400`, else the target duels his nearest marker in the air, `p = clamp(0.5 + (att − def)·aerial.skill, 0.15, 0.85)` on 0.6 공중볼 + 0.4 몸싸움. A marker who wins it heads it to a loose ball at the box edge (x = 88.5 m).
  - The attacker who wins it brings it down (`control.open` 0.8 in open play, `control.setPiece` 0.05 at a set piece) or heads at goal, under `SHOT_CONFIG.headerPressure` when a marker contested it (§7.4).
- **Cut-back.** `p = clamp(base + (크로스 − 60)·skill, min, max)` to a teammate in the box, else the nearest defender intercepts. The next action is forced to `shot` with `cutBack: true`.
- **Take-on.**
  - `p = clamp((cell.takeOnSuccess ?? 0.5) + (0.7 드리블 + 0.3 속도 − 0.7 태클 − 0.3 속도)·skill, min, max)`.
  - On failure, split by `fail`. `tackle` counts a tackle for the defender, `loose` is a 50/50 where he stands. Of the `foul` share the defender keeps `× 0.6` when booked and `× boxFoul` in his own box or `× thirdFoul` in his own third; the rest become clean tackles (T215: 80% of fouls came in the fouled side's attacking 40 m).
- **Carry under pressure** (pressure ≥ 1, against the opponent nearest the carry's line).
  - Dispossession `p = clamp(cell.lostPer100/100 × lostScale × (1 + (태클 − 드리블)·skill), min, max)`.
  - On dispossession, a foul with `carry.foul` × the same booked and box/third factors; the challenges held back that way leave the carrier on the ball, the rest are tackles.
- **Hold-up.** `p = clamp(base + (몸싸움 − 몸싸움_def)·skill, min, max)`. On success the next action is a pass with the back-direction prior × `backBias` (§6.3). On failure the defender wins it.
- **Clearance.** Lands `reach` 25–45 m up-field.
  - `out` → throw-in. Otherwise a 50/50 at the landing point decides the second ball (nearest 2 of each side, as for loose balls).

### 7.2 Out of play (`restarts.ts`)

- Over a touchline → throw-in for the other side at the crossing point.
- Over the byline:
  - attackers touched last → goal kick
  - defenders touched last → corner on that side
  - a saved or blocked shot that goes out → corner

Dead time (seconds, counted on the clock, not as ball in play):

| restart | dead time |
|---|---|
| throw-in | 16 |
| goal kick | 24 |
| corner | 32 |
| free kick | 28 |
| penalty | 70 |
| goal (to kick-off) | 55 |
| substitution | 30 |
| injury | 75 |
| card | 25 |
| offside | 22 |

On the candidate match model these are the least a restart takes: `prepareRestart` carries the ball back to the spot and walks the taker and the set-piece or kick-off scene there, and the dead time grows when that takes longer.

### 7.3 Offside (MATCH-18)

When a pass (not a throw-in, goal kick or corner) is played to a target in the opponent half who stands beyond the second-last opponent and beyond the ball:

- Offside with `p = clamp(0.03 − (판단력 − 60)/360 − (linebreaker ? 0.1 : 0) + (opponent DF line ≥ 40 m ? 0.05 : 0), 0.012, 0.7)` (`RESTART_CONFIG.offside`; 360 is the raw scale's 200 times the grid's skill scale, T216).
- The candidate model calls it on the receiver's own 판단력 attribute (MATCH-18 r21, T384): `p = clamp(base × e^(−(판단력 − pivot)/spread) × (linebreaker ? linebreakerFactor : 1) × (opponent DF line ≥ 40 m ? highLineFactor : 1), min, max)` (`RESTART_CONFIG.offside.candidate`). On the duels' scale the match's level, the day's form, the slot and fatigue outweigh a player's 판단력, so no slope there separated the attribute's quarters (1.5× at every slope T384 screened); on the attribute, the lowest quarter of receptions from an offside position is called about four times as often as the highest. The aggregate path credits offsides with the same weight on the receiver's own 판단력, its exponent times `AGGREGATE_ATTRIBUTION_CONFIG.offsideCall`, so the calls fall where the grid's do.
- Offside gives an indirect free kick to the defenders at the target spot, and counts `offsides` for the target. `GridSetup.offsideDraws`, set only by measurements, records every draw (side, receiver, chance, called, 판단력 on the duels' scale) outside the record.

### 7.4 Shots and xG

```ts
export const SHOT_CONFIG = { a: -1.0, b: -0.11, c: 1.6, header: 0.47, cutBack: 1.25, pressure: 0.25, pressureFloor: 0.2,
  freeKickWall: 0.6, headerPressure: 1, onTargetSkill: 1/250, saveShare: 0.5,
  block: { base: 0.4, perDefender: 0.06, skill: 1/300, min: 0.05, max: 0.6, lane: 2 },
  save: { hold: 0.3, corner: 0.5, loose: 0.2 }, blockThen: { corner: 0.65 },
  penalty: { base: 0.78, min: 0.6, max: 0.92, xg: 0.76 }, maxXg: 0.8 } as const;
```

- **Chance xG:**

  ```
  xg = sigmoid(a + b·dist + c·angle) × (header ? 0.47 : 1) × (cutBack ? 1.25 : 1) × (freeKick ? 0.6 : 1)
       × max(0.2, 1 − 0.25·pressure)
  ```

  `dist` is to the goal centre (105, 34); `angle` is the angle the posts subtend. Unpressured, this gives about 0.23 at the penalty spot, 0.068 at 20 m central and 0.52 at 6 m. The pressure floor keeps two or more close markers from making xG negative (T215); a header won against a marker is taken under pressure 1 (`headerPressure`, T215/T216).
- **Shooting skill:** `shooting = 0.8 슈팅 + 0.2 침착성`, or `0.65/0.35` when `pressure ≥ 1` or `xg ≥ 0.3`. Use 공중볼 in place of 슈팅 for headers.
- **Outcome:** `goal = goalChance(xg, shooting, keeper 선방)` and `onTarget = targetChance(goal, shooting)`, the shared functions. Then:
  - a save with `(onTarget − goal) × saveShare`: the grid keeps half the shared model's saves and the rest go wide (T215), split by `save`
  - otherwise a miss, unless a defender stands within `block.lane` (2) m of the line to the goal centre: block chance `clamp(base + perDefender · defendersInLane + (위치선정 − 55)·skill, min, max)` for the nearest of them; real blocks are 24–29% of shots
  - a miss → goal kick
  - a block → corner `blockThen.corner` (65%), loose 35%
- **Recorded xG** (`xg` in the record and `PD.xg`) = chance xG × `levelFactor`, capped at `maxXg` (0.8).
- **Penalty:** `p = clamp(0.78 + ((0.6 슈팅 + 0.4 침착성) − 선방)/300, 0.6, 0.92)`, recorded with xG 0.76.
- **Direct free kick:** `xg = sigmoid(a + b·dist + c·angle) × 0.6` (the wall).

### 7.5 Fouls (T210) and cards (T213)

- A foul comes from a failed take-on or a carry dispossession, each with the booked and box/third care factors of §7.1, or from a 50/50 outside the boxes (`looseFoul`).
- A **tactical foul** is one within `counterSeconds` (8) of the fouled side's regain by a player goal-side of the ball. It changes only the card chance.
- **Free kick:** at the spot. Inside the box → penalty.
- **Card per foul** (`discipline.ts`, `CARD_CONFIG`), drawn in this order:
  - serious foul play: red 0.002
  - DOGSO (the fouled player beyond the fouler side's offside line, or central in band ≥ 6 with no other outfield defender goal-side): red 0.05, or 0.015 inside the box, where the penalty already restores the chance
  - caution: yellow 0.12, tactical 0.6; a booked player's foul 0.02 and then a second yellow (`secondYellow`), sent off
  - dissent, at each period's end: per side one player, yellow 0.06, red 0.001
- **After a red card:** the player leaves; that side plays one fewer. The empty slot stays empty and §8.1 rebalances.

---

## 8. Match flow (T211, T213, T214, T222)

### 8.1 Substitutions and injuries (`changes.ts`, T214)

**`SubPolicy` (STAFF-45):** `{ fatigueFrom: number; laterFrom: number; earlyPress: boolean; protectLead: boolean; chaseWhenBehind: boolean; youth: boolean; data: boolean; delay: number }`. It is derived from the style and selection trait as in the STAFF-45 table, so NPC and interim managers get the default.

**In-match fatigue:** `matchFatigue = p.fatigue + (100 − 체력) × minutes/90 × 0.35 × (pressing ? 1.3 : 1) × drain`. "Past excess fatigue 15" means `matchFatigue − 20 > 15`.

**At every dead ball and at half-time, in this order:**
1. Injured players are replaced.
2. After a red card, rebalance at the next stoppage: if down to ten and level or ahead, a MF/DF replaces a FW.
3. Policy changes, until `maxSubs` and `windows` are used.
- A substitute takes the slot of the player he replaces, choosing the bench player with the best 실효 OVR there.
- `injuryOnly` eras allow injury replacements only.
- Draws for policy ties use the match stream.

**Injuries.** Per player on the pitch per action of duration `dt`:

```
p = injuryChance(p, pressing) × dt/5400 × (0.7 + 0.6 × minute/90)
```

- Over a full match this sums to the →CLUB-23 probability.
- An injury raises a stoppage and an `injury` incident. The player leaves when no substitute is left, so the side is a man short.
- Severity is not drawn in the match (§13.2).

### 8.2 Main loop (`engine.ts`, T211)

```
playGrid(setup): GridResult
  kick-off (period 1: side 0; period 2: side 1; ET halves alternate)
  loop:
    tags = computeTags(carrier)
    decision = decide(...)          // §6
    outcome = resolve(...)          // §7
    apply outcome: ball, owner, positions, counters (§9), trace (§10.1)
    t += duration(action) + deadTime(restart)
    moveAll(dt = duration(action))
    injuries hazard (§8.1), dissent draws at period boundaries
    if period over (t ≥ periodLength + added): next period or finish
  after period 2: §8.4 if decide
```

**Action durations** (seconds, then × `0.85 + 0.3·r()`):

| action | seconds |
|---|---|
| short pass | 2.3 |
| long pass, switch | 3.6 |
| through | 2.8 |
| cross | 3.2 |
| cut-back | 2.4 |
| carry | 3.0 |
| take-on | 2.6 |
| shot | 2.0 |
| hold-up | 3.0 |
| clearance | 2.8 |

Ball in play is the sum of action durations, with a target of 54–58 min a match.

On the candidate match model a duration is the longest of this draw, the ball's flight at `GRID_BALL_CONFIG` speeds and the new owner's run to the ball; a restart's kick follows its preparation (§7.2), which is already on the clock.

### 8.3 Added time

Each period counts credits:

| event | seconds |
|---|---|
| goal | 45 |
| substitution | 30 |
| injury | 90 |
| card | 20 |
| penalty | 60 |

- `added = clamp(ceil(credits/60), min, max)`. First half 1–6, second half 2–10, extra-time halves 0–3.
- On the candidate match model the credits are the dead seconds really charged: goal 55, substitution 30, injury 75, a card that stops play 25, and every restart's wait beyond its nominal dead time.
- The period ends at the first dead ball or the first completed action after `45·60 + added·60` seconds.

### 8.4 Extra time and shoot-out (`shootout.ts`, T222)

- **When:** with `decide` set, after period 2, if the tie is level. Level means aggregate equal (including `first`) and, under `awayGoals`, away goals equal.
- **Extra time:** two 15-minute periods, same engine, `added` 0–3 each.
- **Shoot-out:** if still level after extra time.
  - Kicks alternate, five each, then sudden death.
  - Order: the manager's order by 0.6 슈팅 + 0.4 침착성 among players on the pitch, the goalkeeper last.
  - Each kick uses the penalty formula of §7.4.
- **Record:**
  - `score` = regulation + extra time goals.
  - `regulation` = the 90-minute score.
  - `shootout` = kicks scored.
  - The highlight `{minute: 120, player: '승부차기', action: '승부차기 홈 승리' | '승부차기 원정 승리'}` is kept for existing UI.
- **Fixtures:** `Fixture.shootout` is set on the fixture. `decideTie` and `resolveTie` use it instead of the coin flip. The coin flip remains only for an unrecorded legacy fixture, which cannot exist under 4.0.0.

---

## 9. Records (T211, T212)

### 9.1 Metrics (12)

| index | meaning |
|---|---|
| 0 | goals |
| 1 | assists (the key pass, MATCH-11) |
| 2 | passes attempted (passes, crosses, cut-backs) |
| 3 | passes completed |
| 4 | shots |
| 5 | shots on target |
| 6 | tackles (won take-on duels and dispossessions) |
| 7 | interceptions |
| 8 | dribbles (successful take-ons) |
| 9 | saves |
| 10 | minutes |
| 11 | possession minutes |

The schema invariants of today still hold.

### 9.2 Counters (TD/PD, MATCH-13)

All counters are in the acting side's attack frame.

| counter | rule |
|---|---|
| final-third pass | the pass starts at x ≥ 70 |
| progressive pass | completed, and the end band is greater than the start band |
| high turnover | the ball is won at x ≥ 70 in the winner's frame |
| PPDA | `buildUpPasses` = the side's pass attempts at x < 70; the other side's `pressActions` = tackles and interceptions at x ≥ 35 in the presser's frame |
| big chance | chance xG ≥ 0.30 |
| box shot | the shot point is in the penalty box |
| box entry | a completed pass or carry ending in the box from outside it |
| front-of-box entry | ending in band 5 from a lower band |
| line-breaking pass | §6.3 |
| xT added | for completed passes and carries, `max(0, xT(end) − xT(start)) × 1000`, rounded per action |
| cross, cut-back, through ball | as §6 |
| progressive carry | the carry ends in a higher band |
| fouls / fouls won / cards / offsides | as §7 |
| corners, throw-ins, goal kicks, free kicks | awarded to the side that takes them |
| penalties | awarded; penalties scored |

### 9.3 Highlights and incidents

- Goals push `{minute, side, player: name, action: '골'}`, as today. `minute` is the match minute (added time counts as the period's last minute).
- Cards, substitutions and injuries push `Incident`s (§2.3).

### 9.4 Material (`MatchMaterial`, own matches only, T223)

```ts
export interface MatchMaterial {
  shots: number[];        // per shot 7 ints: side, playerIdxInLines, x10, y10 (attack frame ×10), xg100, outcome(0 goal 1 save 2 block 3 miss), header(0|1)
  heat: number[];         // own side: per own line 40 cell touch counts, then 40 for the own side total, then 40 for the opponent total
  network: number[];      // own side: per own line [avgX10, avgY10, touches], then pairs [fromLine, toLine, completed] for pairs ≥ 2
  report: number[];       // per side 30 ints: final-third entries by lane (5), box entries by lane (5), regains by third (3), losses by third (3), set-piece shots, set-piece goals, aerials won, aerials, take-ons won, take-ons, tackles won, tackles, counter-attacks, counter shots, high regains, crosses into box, cut-backs, through balls
}
```

- A "touch" is any action start or completed reception.
- `playerIdxInLines` indexes the record's `players` lines.

---

## 10. Playback (T217)

### 10.1 Trace

When `observe` is set, `trace.ts` appends one `TraceEntry` per action and restart, and one per incident (a card, a substitution, an injury, each period's start and end whistle; `outcome: 'incident'`). A card found while an action resolves follows that action's entry. Tracing only reads the state and never draws from the match stream.

```ts
{ elapsed, period, t, side, idx /* -1 for a whistle */, action, outcome, from?, ball,
  receiver?, by?: [side, idx] /* interceptor, tackler, keeper, blocker, loose winner, fouler */, on?, to? /* where the ball ended */,
  kind? /* pass kind, or how a restart was played */, lineBreaking?, spot?, dead?, shotAt?, result?, xg?, header?, other?, reason?,
  cell?, tags?: { phase, orientation, betweenLines, pocket, inBehind, channel, overload },
  positions: Float32Array /* 22×2 engine-frame metres by slot, NaN when empty */, slots: Int8Array /* roster index per slot */,
  targets: Float32Array, states: Uint8Array /* MOTION_STATES index */, totals: Float64Array /* Tally.running() */,
  knots?: { kind, at /* elapsed s */, ball }[] /* candidate model: retrieve, place, kick, touch, receive, arrive, carry, tackle */,
  transition?: 'period' | 'entry' | 'exit' /* candidate model: start whistle, substitution (entry point in `to`), injury or sending-off */,
  intentions?: (Intention | EndedIntention | null)[] /* candidate model, by slot like `slots`: the intention held (its target is the slot's `targets`), else one that ended since the last entry (§4.5) */,
  left?: EndedIntention /* candidate model, on an exit or entry: the leaver's ended intention and why he left (substitution, injury, dismissal) */,
  kick?: { elapsed, positions, slots, targets, states, intentions? } /* candidate model, on a restart prepared on the clock: every slot at its kick (T359) */ }
```

On the candidate model a slot's `targets` is its intention's target, the one its movement used, and its `states` come from the intention's kind: support and receive show as `support`, cover as `mark`, restart as `shape`, exit as `recover`; the others keep their own name. Only press intentions press there.

A restart's entry comes after its delivery. On the candidate model `prepareOnClock` hands the observed match's `Tracer.kick` the state at the kick, after the walk-in and before `restartTaken` ends the places (T359), and that entry carries it as `kick`. Its intentions are the restart's places. An ended intention it shows does not count as traced there, so the entry still shows it. Recording it reads the state only: no draw, stream or play arithmetic changes, so every facts digest is unchanged. Period kick-offs and the pre-feature path record none. Playback (§10.2) moves every player but the actor from the snapshot before the dead ball to the kick, then on to the entry. It always draws a sample at the kick, and the taker stands on the spot by then. A sample during the preparation shows the kick's targets, states and intentions; one during the delivery, and after it until the next entry, shows the entry's, whose jobs start at the kick (an urgent job the kick's own update gave included, §4.7). A trace without `kick` (older traces) plays exactly as before: one straight move from the dead ball to the restart's entry, showing the previous entry's intentions.

### 10.2 Frames

`buildFrames(result, setup, seed): MatchFrame[]` (`seed` is the world seed) makes one frame per match minute of each period, including added minutes, so a frame count of 90 + added (+ extra time) is expected; `MatchEvent`/`MatchFrame` are §2.4's shapes in the contracts (T218). For each minute:
- `score`, `metrics` and `xg` are cumulative at the minute's end.
- `side` is the side in possession longest during the minute.
- `player` and `action` come from its last notable entry: a goal, else a sending-off, else a shot, card, substitution, injury, offside, foul or set piece, else its last touch; a minute without entries keeps the previous one. Labels: 패스, 크로스, 컷백, 운반, 돌파, 슛, 골, 선방, 태클, 인터셉트, 걷어내기, 파울, 경고, 퇴장, 교체, 부상, 오프사이드, 스로인, 골킥, 코너킥, 프리킥, 페널티킥.
- `events` are the minute's entries as `MatchEvent` (§2.4), in playback units of their period (§1.1).
- `motion`: 8 samples, interpolating the 22 positions linearly between trace snapshots by time.
- `ballTrack`: 80 points.
  - The ball sits at the carrier during carries, take-ons and hold-ups.
  - Passes, crosses, shots and clearances fly from `from` to `to` on today's quadratic curve.
  - Bend and loft come from the playback stream; passes of 18+ units rise with distance up to 9, about 30% of long balls are driven low, shots stay low.
  - Speeds are passes about 48, turnovers 44, restarts 60, shots 84 units per motion second (MATCH-12).
- `players`: `PlayerMotion` for the players on the pitch.
  - `state`: `carry` for the owner, `press` for pressers, `run` for runners, `mark` for markers, `keeper` for the GK, `recover` for players more than 15 m behind their target, `support` for attackers within 20 m of the ball, else `shape`.
  - `intent` is the target in units.
  - `intention` (candidate model): the traced intention as `IntentionObservation`. Its target is in units, `teammate`/`opponent` are player IDs, `since`/`until` are elapsed seconds, and `ended` is set once it has ended.
- `period`, `label`, `pace` and `onPitch` (§2.4).

### 10.3 Commentary (`commentary.ts`, MATCH-24)

`describe(entry, ctx): string` (`ctx`: names by side and roster index, and the ball's side for near and far post) uses the cell name (`cellName` in `pitch.ts`, MATCH-14), the tags and only the Korean terms verified in `docs/MATCH-BASELINES.md`. Examples:
- `'{actor}, {cellName}에서 {receiver}에게 패스'`
- through ball: `'{actor}의 침투 패스 — {receiver}가 뒷공간으로'`
- `betweenLines`: `'라인 사이에서 받은 {actor}'`
- `'{actor}의 컷백'`
- `'{actor}의 헤더 — 골!'`
- `'{actor} 경고'`
- `'{actor} 퇴장'`
- `'{out} ↔ {in} 교체'`
- `'{actor} 오프사이드'`
- cut-back zone: `'컷백 구역'`

Never use `골든 존` or `존 5`.

### 10.4 Pacing (WEB-32)

```
weight = 0.6 if the minute's entries are all in the own half of the side in possession with no restart;
         1.6 if the minute has a shot, a penalty, a corner, a free kick in band ≥ 5 or a red card;
         else 1.0
pace = weight / mean(weight over the match)
```

The UI spends `4000 ms × pace / speed` on a minute.

---

## 11. Probabilistic path (T221, MATCH-22)

`summaryMatch` keeps its calibrated team-level minutes. It adds:

- **Cards** (every fixture). Per side, yellows ~ `Poisson(1.97)` and reds ~ `Poisson(0.07)` (`SUMMARY_DISCIPLINE`, the grid's measured 3.93 yellows and 0.14 reds a match, T215), drawn from `random(`${seed}:discipline:${f.id}`)`, assigned to starters by line weight: GK 0.2, DF 1.3, MF 1.2, FW 0.8.
  - Cautions go only to players not yet booked. Of the reds, 30% are a second yellow (a caution first if he had none), 50% DOGSO and 20% serious foul play (T221: drawing yellows onto booked players sent off about 0.13 a team against the 0.07 target).
- **Injuries.** Each starter is injured with →CLUB-23's `injuryChance` from `random(`${seed}:injury:${f.id}`)` at minute `1 + floor(90·u)`.
- **Named lines when `keepPlayers`** (the own league, T224). One line per starter (no substitutions) with the match's minutes; the shots, shots on target, goals, assists and saves are those of the shooter and creator the chance model already picks, so no new draws are made and every score is unchanged. Grid-only counters stay absent (MATCH-26). `lineCounts` holds the two starter counts.
- **Extra time and shoot-out** (§8.4): 30 more team-level minutes, then kicks with p = 0.76 each.

---

## 12. Dispatch (T218, T224)

```ts
export const OWN_LEAGUE_ENGINE: 'grid' | 'summary' = 'summary';   // T224 measured it against MATCH-22's 125% budget
simulateMatch(w, f, observe = false, keepPlayers = false, decide?: DecideRule): MatchPlayback
  own club in the fixture            → playGrid
  keepPlayers (own-league scoring)   → OWN_LEAGUE_ENGINE === 'grid' ? playGrid : summaryMatch(named)
  otherwise                          → summaryMatch
```

T224 measured a season at 42.7 s with the own league on the grid against rules 3.0.0's 5.1 s (8.4×, past the 125% budget) and 8.4 s on the summary path, so the own league plays `summaryMatch(named)` (docs/CALIBRATION.md); T232's century benchmark measured 8.2–8.5 s of engine time a season on the same path. `setOwnLeagueEngine` switches the path for measurement scripts only (`scripts/season-throughput.ts`).

---

## 13. World integration (T219, T220)

### 13.1 `recordMatch`

- `saved.players` = own lines (starters and substitutes).
- Adaptation: `settleStarts` for starters, `settleSubs` (`MATCH_GAIN.sub`) for substitutes who played.
- Fatigue added: `round(fatigueCost × minutes/90)`, at least 1 for anyone who played.
- `recordScorers`: one appearance for every line with minutes > 0, both sides.
- Injuries come from incidents (§13.2). `injuriesAfterMatch` is removed.
- `applyDiscipline` (§13.3) and `serveBans`.
- The match `material` is kept on the saved record (§9.4).

### 13.2 Injuries from incidents

- **Own player:** `injure(w, p, random(`${seed}:injury:${m.id}:${p.id}`))`. This keeps the CLUB-23 severity bands, the inbox item and the event.
- **NPC player:** `w.discipline.out.push({ player, club, kind: 'injury', until: {year, day} })`, with days from the same bands and stream.

### 13.3 Discipline state (`packages/engine/src/discipline.ts`)

```ts
export interface DisciplineState {
  year: number;
  yellows: Record<string, Partial<Record<CompetitionKey, number>>>;   // player id → competition → count
  bans: Ban[];
  out: Unavailable[];                                                // NPC injuries
}
export type CompetitionKey = 'league' | `cup:${string}` | 'europe';
export interface Ban { player: string; club: string; matches: number; scope: 'domestic' | CompetitionKey; reason: Incident['reason'] | 'secondYellow' | 'yellows' }
export interface Unavailable { player: string; club: string; until: { year: number; day: number } }
// World: discipline?: DisciplineState
```

- **`competitionOf(f)`:**
  - `league` for kinds `league`, `lower` and `playoff`
  - `` `cup:${f.groupKey}` `` for `cup`
  - `europe` for `europe`
- **Domestic scope:** league plus every `cup:*`. A red card in Europe has scope `europe`.
- **League accumulation**, with `rounds` the club's league rounds and `round = f.round`:
  - 5 yellows with `round ≤ ceil(rounds/2)` → 1 match
  - 10 with `round ≤ round(0.84 × rounds)` → 2 matches
  - 15 → 3 matches
- **Cups and Europe:** every 3rd yellow in the competition → 1 match in it.
- **Red bans:** `secondYellow` 1, `dogso` 1, `dissent` 2, `serious` and `violent` 3.
- **`serveBans(w, f)`:** after a club's fixture, every ban of that club whose scope covers `competitionOf(f)` loses one match. A ban at 0 is removed.
- **`isUnavailable(w, player, club, f)`:** injured (own `injury`, NPC `out`) or banned for `competitionOf(f)`.
- **Season close:**
  - `yellows` reset.
  - `out` is cleared when the NPC squads are generated for the new season.
  - `bans` carry over by player id.
- **Selection:**
  - `ownStarters(w, f?)` and `lineupPreset` skip the unavailable.
  - `startingSquad(w, c, f?)` for NPC replaces an unavailable starter with the best available bench place of the same line, then any.
  - Callers pass the fixture being played.
- **Inbox and events:** an own player's ban → an inbox item and an event, naming the matches and competitions. The yellow warning (one short of a league ban) is a read model for the UI (`yellowWarning(w, p)`).

### 13.4 Season close (T223)

- For each own player: `SeasonArchive.heat[playerId] = 40 ints`, the sums of his cells over the season's own matches.
- Then delete `material` from that season's `ownMatches`.

---

## 14. Storage (T203, T231, T232)

- **Layout per SAVE-3/4** (T231):
  - active localStorage key `haeram-soccor:slot:a`
  - IndexedDB `haeram-soccor` store `checkpoints`, key `previous`
  - limits: checkpoint 3 MiB, total 3.5 MiB, import 8 MiB, inflate 32 MiB
- **New `MatchRecord` fields need packed streams** (T203). The packer blanks `ownMatches` and rebuilds them from streams, so a field without a stream is lost and the lossless round-trip test fails.
  - `incidents`: bit columns, width 7: `minute, added, side, kind, playerRef, otherRef, reason`. Player refs go through the string dictionary.
  - `lineCounts`, `added`, `regulation`, `shootout`: one small integer stream with presence flags.
  - `material`: per-match flag plus bit columns per array.
  - Widened TD/PD use the existing `matchDetail` stream with the new sizes.
- **World fields** (`discipline`, `SeasonArchive.heat`, `Fixture.shootout`): `world` is inline JSON, except `history` heat, which gets a bit-column stream `seasonHeat` (width 40) with per-season player counts.
- **Benchmark** (T232): `docs/benchmarks/T232-rules4-storage.json`, plus the existing `T010-storage.json` for `first-play.mjs`. Every checkpoint fits: the worst, the baseline century, is 2,382,876 of 3,145,728 B, its largest streams `matchDetail.players`, `statBits.data`, `careers.jobs` and `matchIncidents.rows` (docs/VERIFICATION.md).

---

## 15. Tests (every task)

- Engine units: Vitest next to the module (`grid/*.test.ts`).
- Determinism: the same setup gives an identical record; `observe` true and false give identical records.
- Schema: every produced record passes `validateWorld` in `world.test.ts` after a season.
- Golden: after a task changes engine output, run `pnpm exec tsx scripts/update-golden.ts --write`, then `pnpm run test:contract`.
- Verification tiers follow ARCH-30: a task runs typecheck, lint, format and its changed unit tests (plus `pnpm run build` for UI, storage or worker changes) and never a browser spec; unit, contract, catalog, build and every Chromium journey run once before a push to main; CI runs every browser after it. T233 ran that batch on the final rebuild source.
