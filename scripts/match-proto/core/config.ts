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
//     press:    staging only (stage/world.ts): a defending side presses while the ball's x in its
//               own attack frame is at most `from` (per style); the presser stands `standoff`
//               metres goal-side of the ball (`tight` during a pressed beat), the cover `coverGap`
//     mark:     staging only: a defender leans by `blend` toward a point `goalSide` metres goal-side
//               of the nearest outfield opponent within `radius` of his place
//   motion:   bounded movement (stage/motion.ts): pace speeds in m/s (sprint = `sprintBase` +
//             `sprintPerPace` * pace / 100), acceleration and braking in m/s², the arrival ramp
//             (`arriveTime` seconds, still within `arriveRadius` metres), reaction time, when a
//             player jogs (target within `jogWithin` metres, `transitionSeconds` after a turnover)
//             and when a presser sprints (farther than `pressSprintBeyond` metres)
//   ball:     ball flight (stage/ball.ts): ground and lofted speeds and the slowest kick (m/s), the
//             shortest flight (s), a lofted ball's apex per metre within `loftMin`-`loftMax`, how far
//             ahead of the owner's feet a held ball sits and how fast a loose ball rolls to a player
//   stage:    performing beats (stage/): the passer's drift while holding, extra hold, receiving
//             slack, control range, settling time limit, dribbling speed, arrival distance and the
//             kick-off's half and centre-circle margins
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
    press: { from: { possession: 105, counter: 62 }, standoff: 3, tight: 1.2, coverGap: 8 },
    mark: { radius: 9, blend: 0.45, goalSide: 1.5 },
  },
  motion: {
    walk: 1.8,
    jog: 3.8,
    run: 6,
    sprintBase: 6.4,
    sprintPerPace: 2.4,
    accel: 5.5,
    decel: 8,
    arriveTime: 0.35,
    arriveRadius: 0.15,
    reactTime: 0.35,
    jogWithin: 10,
    transitionSeconds: 3,
    pressSprintBeyond: 6,
  },
  ball: {
    ground: 16,
    loft: 19,
    minSpeed: 8,
    minFlight: 0.25,
    loftPerMetre: 0.12,
    loftMin: 1.5,
    loftMax: 8,
    carryOffset: 0.6,
    roll: 3,
  },
  stage: {
    holdDrift: 2.5,
    maxExtraHold: 2,
    receiveSlack: 0.1,
    controlRange: 1,
    settleMax: 6,
    dribbleSpeed: 5,
    arrive: 0.6,
    kickOff: { halfMargin: 1, circle: 9.65 },
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
    hold: {
      build: [1.2, 2.6],
      restart: [0.8, 1.2],
      carry: [0.3, 0.8],
      pressed: [0.6, 1.0],
      recycle: [1.4, 2.4],
      through: [1.0, 1.8],
      cross: [0.8, 1.6],
      quick: [0.5, 1.0],
      combine: [0.8, 1.5],
      shot: [0.4, 0.9],
      edgeShot: [0.6, 1.2],
      firstTime: [0.2, 0.3],
      keeper: [2, 4],
    },
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
      // The catalogue's (script/moves.ts, script/follow.ts): a number is a completion chance before
      // the attribute term; a list is the chances of its outcomes in the order the move draws them.
      intoPivot: 0.93,
      wideOut: [0.92, 0.05],
      longWin: 0.45,
      longLose: 0.45,
      pressedBack: 0.97,
      interior: 0.9,
      dropLink: 0.85,
      layOffAfterLink: 0.6,
      layOff: 0.95,
      turn: 0.75,
      switchPlay: [0.8, 0.1],
      wideRelease: [0.9, 0.07],
      recycle: 0.96,
      through: 0.55,
      throughCut: 0.35,
      throughKeeper: 0.5,
      /** Cross: complete, cleared, claimed; the rest goes out. */
      cross: [0.28, 0.42, 0.15],
      crossOutGoalKick: 0.6,
      cutBack: [0.45, 0.45],
      takeOn: 0.5,
      takeOnFoul: 0.12,
      combine: 0.85,
      outlet: 0.8,
      /** Shot outcome chances by kind before the finishing term; wide takes the rest (at least 0.05). */
      shot: {
        oneOnOne: { goal: 0.36, saved: 0.38, blocked: 0 },
        header: { goal: 0.12, saved: 0.3, blocked: 0.13 },
        firstTime: { goal: 0.22, saved: 0.33, blocked: 0.25 },
        box: { goal: 0.14, saved: 0.36, blocked: 0.28 },
        edge: { goal: 0.05, saved: 0.35, blocked: 0.3 },
        freeKick: { goal: 0.07, saved: 0.38, blocked: 0.2 },
      },
      /** The `k` of the goal chance's finishing (heading for a header) term, per shot kind. */
      shotAttr: {
        oneOnOne: 0.004,
        header: 0.002,
        firstTime: 0.003,
        box: 0.003,
        edge: 0.0015,
        freeKick: 0.002,
      },
      /** After a save: the keeper holds it; otherwise a corner. */
      saveHold: 0.6,
      /** After a block: a corner, the blocker's ball, else the attack keeps it. */
      blockedCorner: 0.45,
      blockedDefender: 0.25,
      /** A defensive clearance: into touch, to a teammate; else the attack wins it back. */
      clearOut: 0.35,
      clearKeep: 0.3,
      /** Corner delivery: complete, cleared, claimed; the rest goes out. */
      cornerDelivery: [0.3, 0.45, 0.15],
      /** A keeper's long distribution, by style. */
      gkLong: { possession: 0.1, counter: 0.6 },
    },
    /** `prob(base, attr, k)`: `clamp(base + (attr - pivot) * k, min, max)`; `k` per attribute use. */
    prob: { pivot: 60, min: 0.02, max: 0.98, passK: 0.001, dribbleK: 0.002 },
    /** Move weights by phase (script/moves.ts); `boost` multiplies a move while its flag is set. */
    weights: {
      safe: 1,
      buildUp: {
        circulate: 3,
        intoPivot: 3,
        wideOut: 2,
        longBall: { possession: 0.6, counter: 2.5 },
        pressedBack: 0.8,
        carryForward: 1.2,
      },
      progression: {
        interior: 2,
        dropLink: 3,
        dropLinkNoLink: 1,
        switchPlay: 1.5,
        wideRelease: 2.5,
        recycle: 1.2,
        carryForward: 2,
        throughEarly: 0.5,
      },
      finalThird: {
        throughBall: 1.2,
        cross: 2.5,
        crossNarrow: 0.3,
        cutBack: 2.5,
        edgeShot: 1.2,
        edgeShotWide: 0.2,
        boxShot: 6,
        takeOn: 1.5,
        takeOnWide: 1.5,
        combine: 2,
        recycle: 1,
        carryForward: 1,
      },
      counter: { outlet: 3, carryForward: 2.5, throughEarly: 2.5 },
      boost: { long: 3, switch: 2, counterThrough: 2, counterShot: 1.5, beatManCombine: 0.5 },
    },
    /** Offside chance of a through ball's runner: `clamp(base * exp(-(decisions - pivot) / spread), min, max)`. */
    offside: { base: 0.22, pivot: 60, spread: 25, min: 0.04, max: 0.6 },
    /**
     * Through balls: a runner within `nearLine` of the line is preferred; the ball lands `behind`
     * metres past the line (at least 8 ahead of the runner), at most at `maxX`, drawn `narrow` toward
     * the long axis; lofted beyond `loftFrom` metres; a runner through carries up to `oneOnOneCarry`.
     */
    through: {
      nearLine: 8,
      behind: [9, 15],
      maxX: 100,
      narrow: 0.3,
      loftFrom: 28,
      oneOnOneCarry: 8,
    },
    /** A ball this far off the long axis is wide (crosses, take-ons). */
    wideFrom: 18,
    /** A cut-back needs the ball at least at this attack x and this far off the long axis. */
    cutBackFromX: 88,
    cutBackWide: 12,
    /** A switch finds a receiver at least this far across. */
    switchMin: 28,
    /** An edge shot is central within this many metres of the long axis. */
    edgeHalfWidth: 16,
    /** A blocker stands this far from the shooter toward goal. */
    blockAhead: 3,
    /** A free kick from this attack x, within `halfWidth` of the long axis, is struck at goal. */
    directFreeKick: { fromX: 75, halfWidth: 18 },
    /** Box zones as [attack x, y offset]; the offset is multiplied by the ball's side (+ = the ball's side of goal). */
    box: { near: [99, 4.5], far: [98, -6], spot: [94, -1], edge: [86.5, -3] },
    /** The showcase search (script/showcase.ts): what ten eventful minutes must show within `withinSeconds`. */
    showcase: {
      withinSeconds: 420,
      maxAttempts: 3000,
      lowIq: 50,
      highIq: 70,
      minShare: 0.3,
      quotas: {
        goals: 1,
        shots: 3,
        lowIqOffside: 1,
        highIqThrough: 1,
        crosses: 2,
        corners: 1,
        switchPlay: 1,
        dropLinkFalseNine: 2,
        invertedFullBackReceives: 3,
        counters: 1,
        recycles: 1,
        takeOns: 1,
      },
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
