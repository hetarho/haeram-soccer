// Every tunable number of the prototype chain lives here under a name. Later tasks add one section
// each: shape, grammar, motion, ball, stage, limits, viewer.
//   tick:     simulation step in seconds
//   hz:       frame rate (1 / tick)
//   duration: staged seconds of the prototype
//   margin:   how far inside the lines players are kept, in metres
//   shape:    nominal places by phase (core/shape.ts); all x values are in the attack frame
//     ip:       in possession, read from the ball's attack x: the back line (`line*`, metres) and
//               the block's length (`depth*`, metres); `lateral` is how far the block follows the
//               ball across, as a share of the ball's distance from the long axis
//     oop:      out of possession, read from the ball's x in the defending team's own attack frame:
//               the back line (`line*`, with a per-style bias), the block's length per style, its
//               width as a share of the formation's, `lateral` as above and `behindBall`, how far
//               behind a ball played in behind it the line stands at most
//     keeper:   in possession `gap`/`sweeperGap` metres behind the back line within `minX` and
//               `maxX`/`sweeperMaxX`, following the ball across by `lateral`; out of possession
//               `base + perMetre * distance to the ball` metres off his goal toward the ball, within
//               `minOut` and `maxOut`
//     onsideGap:      how far inside the offside line the team in possession keeps its players
//     shoulderGap:    how far inside it a role on the last shoulder stands
//     poacherLean:    how far that role leans across with the ball, as a share, up to `poacherMaxLean`
//   grammar:  the script generator (script/): phase thresholds, nominal speeds and holds for its
//             clock, where a lost ball is nominally won, receiver showing and jitter, counters,
//             restart durations and completions, carry lengths and the outcome chances of moves
export const PROTO_CONFIG = {
  tick: 0.1,
  hz: 10,
  duration: 600,
  margin: 1.5,
  shape: {
    // In possession: the back line's attack x and the block's length, both read from the ball's attack x.
    ip: {
      lineBase: 12,
      lineSlope: 0.52,
      lineMin: 12,
      lineMax: 58,
      depthBase: 32,
      depthSlope: 0.06,
      depthMin: 32,
      depthMax: 38,
      lateral: 0.15,
    },
    // Out of possession: the same from the ball's x in the defending team's own attack frame.
    oop: {
      lineBase: 3,
      lineSlope: 0.55,
      lineMin: 6,
      lineMax: 50,
      lineBias: { possession: 3, counter: -3 },
      depth: { possession: 29, counter: 26 },
      width: 0.75,
      lateral: 0.5,
      behindBall: 1.5,
    },
    keeper: {
      gap: 14,
      sweeperGap: 10,
      minX: 4,
      maxX: 18,
      sweeperMaxX: 30,
      lateral: 0.2,
      base: 1.5,
      perMetre: 0.06,
      minOut: 1.5,
      maxOut: 7,
    },
    onsideGap: 0.5,
    shoulderGap: 0.7,
    poacherLean: 0.25,
    poacherMaxLean: 10,
  },
  // The probabilistic script (script/): nominal clock, casting, carries, restarts and outcome chances.
  grammar: {
    /** Attack-x thresholds of the open-play phases. */
    phaseX: { progression: 38, finalThird: 72 },
    /** Nominal speeds (m/s) for the script clock only; the staging has its own. */
    speeds: { ground: 16, loft: 19, carry: 5, shot: 28 },
    /** Where along a failed pass / carry the ball is nominally lost (0–1). */
    interceptAt: 0.7,
    tackleAt: 0.6,
    /** A receiver shows this far toward the ball; reception points get ± jitter metres. */
    showFor: 3,
    jitter: 1.5,
    shortRange: 18,
    /** A turnover below `fromX` (attack x of the winners) after the losers' progression or final third may start a counter. */
    counter: {
      fromX: 55,
      chance: { possession: 0.3, counter: 0.6 },
      beats: [2, 3],
    },
    /** Nominal seconds a restart adds to the clock. */
    dead: { kickOff: 14, throwIn: 5, goalKick: 8, corner: 12, freeKick: 7 },
    restart: {
      throwComplete: 0.92,
      throwRange: [6, 14],
      goalKickComplete: 0.98,
      freeKickComplete: 0.97,
      cornerShortComplete: 0.95,
    },
    hold: { build: [1.2, 2.6], restart: [0.8, 1.2], carry: [0.3, 0.8] },
    carry: {
      buildUp: [6, 10],
      progression: [8, 14],
      finalThird: [5, 9],
      counter: [14, 22],
      setPiece: [5, 9],
      drift: 4,
    },
    p: {
      circulate: 0.985,
      safe: 0.9,
      hoof: 0.2,
      carryFoul: 0.04,
      /** A carry's tackle chance never falls below this. */
      tackledMin: 0.01,
      carry: { buildUp: 0.95, progression: 0.9, finalThird: 0.8, counter: 0.85, setPiece: 0.85 },
    },
    /** `prob(base, attr, k)`: `clamp(base + (attr - pivot) * k, min, max)`; `k` per attribute use. */
    prob: { pivot: 60, min: 0.02, max: 0.98, passK: 0.001, dribbleK: 0.002 },
    /** Weights of the basic moves (T794 replaces the catalogue). */
    weights: {
      safe: 1,
      circulate: 3,
      carry: { buildUp: 1.2, progression: 2, finalThird: 1, counter: 2.5 },
    },
    /** A pass this far behind the ball in attack x reads as a reset. */
    resetBehind: 6,
    /** A carry ends at most at this attack x; in the final third it drifts this share toward the long axis. */
    carryMaxX: 100,
    carryInfield: 0.25,
    /** A hoof into touch lands this far ahead of the ball in attack x. */
    hoofAhead: [15, 30],
    /** Restart and out aims, in the attack frame of the team concerned. */
    aim: {
      /** Kick-off to this attack x, ± `spread` across the long axis. */
      kickOff: { x: 45, spread: 6 },
      /** Goal kick to attack x in `x`, `wide` metres off the long axis on the receiver's side. */
      goalKick: { x: [10, 16], wide: [16, 22] },
      /** Goal kick spot: the six-yard line `x`, `side` metres off the long axis. */
      goalKickSpot: { x: 5.5, side: 6 },
      /** Throw-in spots along the touchline. */
      touchX: [1, 104],
      /** A ball leaving over a touchline is aimed this far beyond it; over a goal line, to this attack x. */
      outBy: 1,
      bylineX: 106.5,
    },
    /** Validator bounds: a beat's hold, and how far outside the pitch its `to` may lie (metres). */
    validate: { hold: [0.1, 6], toSlack: 8 },
    /** `generateScript` writes this many times `PROTO_CONFIG.duration` nominal seconds, so staging never runs out of beats. */
    nominalFactor: 1.5,
    maxBeats: 2000,
  },
} as const;
