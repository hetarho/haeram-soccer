# Grid match engine — implementation design (rules 4.0.0)

Implementation contract for tasks T200–T233. Policy lives in the SSOTs (MATCH r11, PLAYER r9, STAFF r34, CLUB r42, LEAGUE r10, WEB r90, HIST r14, SAVE r48, ARCH r11). This document fixes how the code is built.

- Every number here is an **initial value**. The explore tasks T215, T216 and T224 tune them, and every tunable constant lives in one exported `*_CONFIG` object.
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
- `packages/engine/src/motion.ts` is replaced by `grid/playback.ts` in T217–T218. Its `MATCH_MOTION_CONFIG.formations` and `ball` sub-objects move to `grid/shape.ts` and `grid/playback.ts`, and stay re-exported under the same names for the UI (`FormationPitch.tsx` and `Pitch.tsx` import them).

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
- `skill(side, idx, a, t) = base[a] + shift[side] − drainRate(p) × minutesOnPitch(t)`
- `drainRate(p) = (100 − stamina) / 12 × (pressing ? 1.3 : 1) × drain[side] / 90` per minute.

These are the existing constants from `matchSkills`.

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
  lateral: 0.25, keeperPull: 0.08, keeperMax: { sweeperKeeper: 22, other: 14 },
  markBlend: 0.4, markRadius: 10, counterPressSeconds: 5,
  speed: { base: 5.2, pace: 2.8, tired: 0.25 },        // m/s = base + pace·pace/99, × (1 − tired·fatigueShare)
  run: { chance: 0.04, seconds: [4, 6], behindDepth: 6, overlapAhead: 10, boxX: 95 },
} as const;
```

### 4.3 Targets

`targetOf(state, side, idx): Point` in the side's attack frame. `b` is the ball in that frame.

- **Goalkeeper:**
  - `x = clamp(4 + (b.x − 52.5) × keeperPull, 2, keeperMax)`, where `keeperMax` is 22 for a sweeper keeper while the own line is at or above 40, else 14.
  - `y = 34 + (b.y − 34) × 0.15`.
- **In possession:**
  - `spot + [advance, 0] + roleShift`.
  - Then `x += (b.x − 52.5) × compact` and `y += (b.y − 34) × lateral`.
  - Then `x ≤ offsideLine − 0.5` for players not on a run, where `offsideLine` is the opponent's second-last player.
- **Out of possession:**
  - `spot + [defend, 0]`, then `x += (b.x − 52.5) × compact` and `y += (b.y − 34) × lateral`.
  - DF-line players are clamped to `line[0] ≤ x ≤ line[1]`.
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
    - `box`: box-to-box, mezzala, shadow striker, only while b is in band ≥ 5. Target `[boxX, 30 + 8·u]`.
  - Run draws come from the match stream and happen in roster order.

### 4.4 Movement

`moveAll(state, dt)`: every player on the pitch moves toward his target by `min(distance, speed × dt)`, with `speed` from `SHAPE_CONFIG.speed`. `fatigueShare = minutesOnPitch / 90`, capped at 1.

The carrier moves only through his own action (§6.1). Positions are clamped to the pitch.

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
   - In the cut-back cells (`goalArea` band × half-space lanes): `cutBack = 0.35 × cross`, `cross = 0.65 × cross`
2. **Position profile** (`POSITION_PROFILES[profileKey(position)]` against `OVERALL`):
   - `takeOn × (takeOnPerPass / 0.045)`
   - `cross × (crossShare / 0.025)`, clamped to 0.2–3
3. **Line factor on `shot`:** GK 0, DF 0.6, MF 1, FW 1.25.
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
   - `inBehind` in bands ≥ 5, central or half-space lanes: `shot ×1.6`, `carry ×1.3`
   - `pocket`: `takeOn ×1.2`, shot from band 5 `×1.2`
7. **Score and time:**
   - leading and `minute ≥ 75`: `takeOn ×0.8`, `clearance ×1.3` in bands 0–2
   - trailing and `minute ≥ 70`: `shot ×1.2`, `cross ×1.2`
8. **Decisions on shots:**
   - in a cell with xG per shot < 0.05: `shot × (1 − (판단력 − 50)/200)`
   - in a cell with xG per shot ≥ 0.12: `shot × (1 + (판단력 − 50)/300)`
9. **Hard restrictions:**
   - no `shot` from bands 0–3 except a direct free kick
   - no `cross` or `cutBack` outside bands 5–7
   - no `clearance` in bands 5–7

### 6.3 Pass target

`choosePass(state, side, idx, tags, r)` scores teammates on the pitch (not the carrier), within 60 m (70 m for GK and CB).

- `gain = (xT(cell_j) − xT(cell_carrier)) × 100`
- `open = min(1, nearestOpponent_j / 8)`
- `risk = Σ_opp exp(−d_lane / 2)`, where `d_lane` is the opponent's distance to the pass segment (only opponents projecting inside it)
- `score_j = 1.0·gain + 0.8·open − 0.6·risk − max(0, dist − 15)/10 + through_j`
- `through_j = 0.8 × actionWeight(role, traits, 'key')` when j is on a `behind` run or `inBehind`, else 0

**Direction prior.** `dir_j` is forward, lateral or back by ±45° in the attack frame.

```
prior_j = CELL_BASELINES[cell][dir] × sqrt(profile[dir] / OVERALL[dir]) / n_dir
```

`n_dir` is the number of candidates in that direction. When scores are flat, the choice reproduces the cell's real direction mix.

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

- **Carry.** Pick among 5 headings (0°, ±30°, ±90° from goal-ward) by `exp((xT gain − 0.5·pressure_at_point)/τ)`.
  - Length 6–12 m (`6 + 6·r()`), clamped inside the pitch.
  - A carry ending past the box line in bands 5–7 is allowed.
- **Take-on.** Against the nearest opponent in front within 4.6 m. On success the carrier ends 5–8 m past him toward goal.

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
  pass: { passer: 1/250, marker: 1/300, risk: 0.08, distance: 1/200, pressure: 0.03, min: 0.25, max: 0.97,
          lost: { intercepted: 0.55, loose: 0.30, out: 0.15 } },
  cross: { base: 0.24, skill: 1/150, crowd: 0.03, min: 0.08, max: 0.6, claim: 0.12 },
  cutBack: { base: 0.43, skill: 1/200, min: 0.2, max: 0.7 },
  takeOn: { skill: 1/140, min: 0.2, max: 0.85, fail: { tackle: 0.70, foul: 0.22, loose: 0.08 } },
  carry: { lostScale: 3, skill: 1/120, min: 0.01, max: 0.35, foul: 0.15 },
  holdUp: { base: 0.6, skill: 1/150, min: 0.3, max: 0.85 },
  aerial: { skill: 1/150, base: 0.5 },
  clearance: { out: 0.30 },
} as const;
```

- **Pass.** `p = clamp(cell.passCompletion + (passer − 60)·passer − (marker − 60)·marker − risk·risk − max(0, dist − 20)·distance − pressure·pressure + bends, min, max)`.
  - `passer` is 패스, or (패스 + 시야)/2 for long, through, switch or line-breaking passes, or 발밑 for a goalkeeper.
  - `marker` is 위치선정 of the opponent nearest the segment.
  - On failure, split by `lost`:
    - `intercepted`: the marker wins it at his projection point.
    - `loose`: the nearest player to the landing point wins it, by 1/distance weights.
    - `out`: the ball goes out past the target's side (§7.2).
  - Before resolving, check offside (§7.3).
- **Cross.**
  - Delivery: `p = clamp(base + (크로스 − 60)·skill − (defenders − attackers in box)·crowd, min, max)`. The keeper claims a delivered cross first with `claim + (공중볼 처리 − 60)/400`.
  - Then an aerial duel between the target (the attacker with the highest `0.6 공중볼 + 0.4 몸싸움` in the box, the cross weight from `chooseHeader` logic) and the best defender: `p = clamp(0.5 + (att − def)·aerial.skill, 0.15, 0.85)`.
  - Attacker wins: a header shot (§7.4). Defender wins: a loose ball at the box edge.
  - A failed delivery goes to the defender (or out: 30% → corner).
- **Cut-back.** `p = clamp(base + (크로스 − 60)·skill, min, max)` to a teammate in the box. The next action is forced to `shot` with `cutBack: true`.
- **Take-on.**
  - `p = clamp(cell.takeOnSuccess ?? 0.5 + (0.7 드리블 + 0.3 속도 − 0.7 태클 − 0.3 속도)·skill, min, max)`.
  - On failure, split by `fail`. `tackle` counts a tackle for the defender. `foul` goes to §7.5.
- **Carry under pressure** (pressure ≥ 1).
  - Dispossession `p = clamp(cell.lostPer100/100 × lostScale × (1 + (태클 − 드리블)·skill), min, max)`.
  - On dispossession, a foul happens with `carry.foul`, otherwise the defender wins it.
- **Hold-up.** `p = clamp(base + (몸싸움 − 몸싸움_def)·skill, min, max)`. On success the next action is a pass with the back-direction prior × 3. On failure the defender wins it.
- **Clearance.** Lands 25–45 m up-field.
  - `out` → throw-in. Otherwise an aerial or loose-ball contest decides the second ball (nearest 2 of each side, `0.5 공중볼 + 0.5 몸싸움`).

### 7.2 Out of play (`restarts.ts`)

- Over a touchline → throw-in for the other side at the crossing point.
- Over the byline:
  - attackers touched last → goal kick
  - defenders touched last → corner on that side
  - a saved or blocked shot that goes out → corner

Dead time (seconds, counted on the clock, not as ball in play):

| restart | dead time |
|---|---|
| throw-in | 18 |
| goal kick | 30 |
| corner | 37 |
| free kick | 32 |
| penalty | 70 |
| goal (to kick-off) | 55 |
| substitution | 30 |
| injury | 75 |
| card | 25 |
| offside | 22 |

### 7.3 Offside (MATCH-18)

When a pass is played in the opponent half to a target that stands beyond the second-last opponent and beyond the ball:

- Offside with `p = clamp(0.45 − (판단력 − 60)/200 − (linebreaker ? 0.1 : 0) + (opponent line ≥ 40 m ? 0.05 : 0), 0.1, 0.7)`.
- Offside gives an indirect free kick to the defenders at the target spot, and counts `offsides` for the target.

### 7.4 Shots and xG

```ts
export const SHOT_CONFIG = { a: -1.0, b: -0.11, c: 1.6, header: 0.55, cutBack: 1.25, pressure: 0.12,
  onTargetSkill: 1/250, block: { base: 0.25, perDefender: 0.06, skill: 1/300, min: 0.05, max: 0.5 },
  save: { hold: 0.55, corner: 0.25, loose: 0.20 } } as const;
```

- **Chance xG:**

  ```
  xg = sigmoid(a + b·dist + c·angle) × (header ? 0.55 : 1) × (cutBack ? 1.25 : 1) × (1 − 0.12·pressure)
  ```

  `dist` is to the goal centre (105, 34); `angle` is the angle the posts subtend. This gives about 0.23 at the penalty spot, 0.068 at 20 m central and 0.52 at 6 m.
- **Shooting skill:** `shooting = 0.8 슈팅 + 0.2 침착성`, or `0.65/0.35` when `pressure ≥ 1` or `xg ≥ 0.3`. Use 공중볼 in place of 슈팅 for headers.
- **Outcome:** `goal = goalChance(xg, shooting, keeper 선방)`, with the existing `finishing`/`goalChance`/`targetChance` functions. Then:
  - block chance `clamp(base + perDefender · defendersInShotLane + (위치선정 − 55)·skill, min, max)` on misses; real blocks are 24–29% of shots
  - a save is split by `save`
  - a miss → goal kick
  - a block → corner 35%, loose 65%
- **Recorded xG** (`xg` in the record and `PD.xg`) = chance xG × `levelFactor`, as today.
- **Penalty:** `p = clamp(0.78 + ((0.6 슈팅 + 0.4 침착성) − 선방)/300, 0.6, 0.92)`, recorded with xG 0.76.
- **Direct free kick:** `xg = sigmoid(a + b·dist + c·angle) × 0.6` (the wall).

### 7.5 Fouls (T210) and cards (T213)

- A foul comes from a take-on failure or a carry dispossession (§7.1), with ×1.2 under press.
- A **tactical foul** is a foul in `phase = counter` by a player goal-side of the ball. Its probability from a failed defensive action in a counter is +0.15 on top.
- **Free kick:** at the spot. Inside the box → penalty.
- **Card per foul** (`discipline.ts`, `CARD_CONFIG`):
  - yellow: 0.14 base; tactical 0.6; the booked player's fouls 0.10 (he is more careful: his foul chance ×0.6)
  - DOGSO (inBehind or central band ≥ 6 with no defender goal-side): red 0.8, or 0.3 inside the box
  - serious foul play: red 0.006 per foul
  - dissent: yellow 0.06 per side per half, red 0.002 per side per match
  - second yellow → red (`secondYellow`)
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

When `observe` is set, `trace.ts` appends one `TraceEntry` per action, restart and incident:

```ts
{ period, t, kind, side, actor, receiver?, opponent?, from, to, ok, lost, outcome, xg, header, restart, card,
  cell, tags: { betweenLines, inBehind, pocket, channel, phase }, positions: Float32Array /* 22×2 engine-frame metres, NaN when off */ }
```

### 10.2 Frames

`buildFrames(result, setup): MatchFrame[]` makes one frame per match minute of each period, including added minutes, so a frame count of 90 + added (+ extra time) is expected. For each minute:
- `score`, `metrics` and `xg` are cumulative at the minute's end.
- `side` is the side in possession longest during the minute.
- `player` and `action` come from its last entry. Labels: 패스, 크로스, 컷백, 운반, 돌파, 슛, 골, 선방, 태클, 인터셉트, 걷어내기, 파울, 경고, 퇴장, 교체, 부상, 오프사이드, 스로인, 골킥, 코너킥, 프리킥, 페널티킥.
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
- `period`, `label`, `pace` and `onPitch` (§2.4).

### 10.3 Commentary (`commentary.ts`, MATCH-24)

`describe(entry, names): string` uses the cell name (`cellName` in `pitch.ts`, MATCH-14), the tags and only the Korean terms verified in `docs/MATCH-BASELINES.md`. Examples:
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

- **Cards.** Per side, yellows ~ `Poisson(1.9)` and reds ~ `Poisson(0.06)`, drawn from `random(`${seed}:discipline:${f.id}`)`, assigned to starters by line weight: GK 0.2, DF 1.3, MF 1.2, FW 0.8. The draws stop at 2 yellows → red for one player.
- **Injuries.** Each starter is injured with →CLUB-23's `injuryChance` from `random(`${seed}:injury:${f.id}`)` at minute `1 + floor(90·u)`.
- **Named lines when `keepPlayers`.** 22 lines (no substitutions), each with minutes 90. Goals and assists are assigned with the duel chain's line weights (shooters FW 3, MF 1.1, DF 0.2 by 슈팅; assisters by key-pass weight). `lineCounts = [11, 11]`, and `incidents` hold cards and injuries.
- **Extra time and shoot-out** (§8.4): 30 more team-level minutes, then kicks with p = 0.76 each.

---

## 12. Dispatch (T218, T224)

```ts
export const OWN_LEAGUE_ENGINE: 'grid' | 'summary' = 'grid';   // T224 sets it from the measured 125% budget
simulateMatch(w, f, observe = false, keepPlayers = false, decide?: DecideRule): MatchPlayback
  own club in the fixture            → playGrid
  keepPlayers (own-league scoring)   → OWN_LEAGUE_ENGINE === 'grid' ? playGrid : summaryMatch(named)
  otherwise                          → summaryMatch
```

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
- **Benchmark** (T232): `docs/benchmarks/T232-rules4-storage.json`, plus the existing `T010-storage.json` for `first-play.mjs`.

---

## 15. Tests (every task)

- Engine units: Vitest next to the module (`grid/*.test.ts`).
- Determinism: the same setup gives an identical record; `observe` true and false give identical records.
- Schema: every produced record passes `validateWorld` in `world.test.ts` after a season.
- Golden: after a task changes engine output, run `pnpm exec tsx scripts/update-golden.ts --write`, then `pnpm run test:contract`.
- Task-level run: the task's own test files plus `pnpm run typecheck` and `pnpm run lint`. Full `pnpm run verify` runs at T233.
