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
//     mark:     staging only (stage/mark.ts): each free defender marks one man, one to one, nearest
//               first: a man within `radius` metres of his zone place, kept up to `keep` metres
//               beyond it; he stands by `blend` (per line) toward a point `goalSide` metres goal-side
//               of his man (the back line only across) and his place follows with a lag of at most
//               `lag` seconds
//     unmark:   staging only: a free attacker whose place lies within `radius` metres of an
//               opponent steps up to `step` metres across, away from him, keeping his depth
//   motion:   bounded movement (stage/motion.ts): pace speeds in m/s (sprint = `sprintBase` +
//             `sprintPerPace` * pace / 100), acceleration and braking in m/s², the arrival ramp
//             (`arriveTime` seconds, still within `arriveRadius` metres), reaction time, when a
//             player jogs (target within `jogWithin` metres, `transitionSeconds` after a turnover)
//             and when a presser sprints (farther than `pressSprintBeyond` metres); these paces
//             drive the direct players (orders, cues, keepers, presser, cover, the last shoulder
//             and everyone at a dead ball)
//     own:      free players (stage/mind.ts): the seconds before one acts on a change of the
//               shape's inputs (`delay`: a base, more for low `decisions`, more per metre from the
//               ball; one value for the back line), the time constant his own place follows the
//               wanted place with (`lag`, likewise), the metres to the ball counted up to `farCap`,
//               the seconds he gives himself to reach his place (`arrive`: `near` at the ball, `far`
//               from `farAt` metres), the distance within which he stands (`hold`), his slowest
//               move (`minSpeed`, m/s) and the seconds of inputs kept for the delay (`memory`)
//     turn:     after the ball changes sides in live play, for `window` seconds: a settled turnover
//               is believed `delayPerMetre` seconds later per metre from the ball and the place
//               follows with a lag of at least `lag.settled`; after a counter the lag is at most
//               `lag.counter`, a place farther than `runBeyond` metres is run to and one farther than
//               `sprintBeyond` sprinted to (the back line keeps its own delay and lag)
//   ball:     ball flight (stage/ball.ts): ground and lofted speeds and the slowest kick (m/s), the
//             shortest flight (s), a lofted ball's apex per metre within `loftMin`-`loftMax`, how far
//             ahead of the owner's feet a held ball sits, how fast a loose ball rolls to a player
//             and how fast a dead ball is brought back to its restart spot (`retrieval`, m/s); a
//             through ball's top speed, a shot's and a header's speed and a header's apex
//   stage:    performing beats (stage/): the length of the passer's one touch while holding, at
//             most (`holdDrift`), the least distance between the ball and an ordinary pass's
//             reception point, which his touch never closes (`kickGap`), extra hold, receiving
//             slack, control range, settling time limit, dribbling speed, arrival distance and the
//             kick-off's half and centre-circle margins; contests (stage/contest.ts): the shadow
//             point on a pass lane (`shadowAt` along it, `shadowOff` goal-side), the share of a
//             path an interceptor may meet it on (`cutMin`-`cutMax`, a keeper from `keeperCutMin`),
//             how late he may be (`cutSlack`, s) and the lunge (m/s); tackles: the jockey distance,
//             the share of the carry before the tackle, its range, the extra seconds before and
//             after a nearer man takes it over and the foul's freeze; take-ons: the side step, the
//             attacker's and the beaten defender's speed caps and time; `pressVisible`, how near
//             the presser is before a pressed pass is kicked; `boards`, how far outside the lines a
//             target may lie and where a player stops; `separation`, how far a free outfield player
//             keeps his target from his outfield teammates, and `ownerRoom`, how far a free outfield
//             player of the side in possession keeps it from the man on the ball and from
//             teammates under an order; restarts (stage/scenes.ts): the dead
//             time per kind, its extra allowance, the distance the other team keeps, how near the
//             taker and receiver must be, the taker's offset from the spot and how far past the line
//             a ball out runs; through balls (stage/through.ts): where the runner waits behind the
//             line (`setBack`), when he goes (`runLead` s before the kick, `earlyBy` earlier when he
//             is caught offside), the onside window he is kicked in, how far beyond the line an
//             offside runner is, the flag's delay and the longest extra wait; shots (stage/shot.ts):
//             the shooter's set step, the blocker's place and range, the net's depth, a beaten
//             keeper's speed, the save's share of the path and nudge, a parry's width and time, a
//             wide ball's run, a blocked ball's roll and deflection speed; crosses: the receiver's
//             run-up; corners (stage/scenes.ts): both sides' places
//   grammar:  the script generator (script/): phase thresholds, nominal speeds and holds for its
//             clock, where a lost ball is nominally won, receiver showing and jitter, the least
//             distance from the ball an open-play pass to feet or into a stride is aimed at
//             (`minPass`), counters,
//             restart durations and completions, carry lengths and the outcome chances of moves
//   limits:   the thresholds the staging metrics are judged by (check/metrics.ts); the naturalness
//             ones read open play (live, no set piece, no restart beat): passes kicked to a man
//             standing almost on the passer (`shortKick`), outfield teammates sticking together
//             (`huddle`: their distance, the allowed seconds, episodes a minute and the longest),
//             players starting and stopping as one (`motion`: the rest and go speeds, starts a
//             player-minute, the window and count that make starts simultaneous, the share of such
//             starts and the mean correlation of two players' speeds), players turning as one
//             after a turnover (`turn`: the seconds before it a mover is read over, the moving
//             speed, the seconds after it a turn counts within, the share that turn, the running
//             speed, when it is read and the running shares after a settled turnover and after a
//             counter) and attackers in the last part of the pitch left unmarked (`mark`: the
//             attack x they are read from, the marking distance and the share marked)
//   viewer:   the page that plays a playback (viewer/, build.ts): the metres shown around the
//             pitch (`pad`), player and ball radii in metres with their pixel floors, how long a
//             flash and the ball's trail last (s), the speeds offered, the seek step (s), the
//             serving port, the widest canvas (px), the HUD bar's height and font sizes (px), the
//             shirt number's size as a share of the player radius, the facing tick's length as a
//             share of it, how far a lofted ball is drawn up-screen per metre of height and how
//             much larger it grows, the stillness below which a player keeps his last facing (m)
//             and how many frames back that facing is looked for, the longest frame step (s), the
//             pitch markings (m) and the colours
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
      width: 0.9,
      lateral: 0.2,
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
    shoulderGap: 0.5,
    poacherLean: 0.25,
    poacherMaxLean: 10,
    press: { from: { possession: 105, counter: 62 }, standoff: 3.5, tight: 1.2, coverGap: 14 },
    mark: { radius: 10, keep: 3, goalSide: 1.5, blend: { DF: 0.6, MF: 0.6, FW: 0.3 }, lag: 0.3 },
    unmark: { radius: 4, step: 2.5 },
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
    /** Free players (stage/mind.ts). */
    own: {
      /** Seconds before he acts on a change: `base + perIq * (100 - decisions) / 100 + perMetre * metres to the ball`; a back-line player: `line`. */
      delay: { base: 0.15, perIq: 0.35, perMetre: 0.008, line: 0.25 },
      /** Time constant (s) his place follows the wanted place with: `base + perMetre * metres to the ball`; a back-line player: `line`. */
      lag: { base: 0.5, perMetre: 0.02, line: 0.5 },
      /** The metres to the ball count up to this. */
      farCap: 50,
      /** Seconds he gives himself to reach his place: `near` at the ball, `far` from `farAt` metres. */
      arrive: { near: 1.2, far: 3, farAt: 40 },
      /** He stands within `hold` metres of his place; otherwise he moves at `minSpeed` at least. */
      hold: 0.2,
      minSpeed: 0.8,
      /** Seconds of inputs kept for the delay: at least the longest delay, `delay.base + delay.perIq + (delay.perMetre + turn.delayPerMetre) * farCap`. */
      memory: 2.2,
    },
    /** After the ball changes sides in live play (stage/mind.ts). */
    turn: {
      /** Seconds a turnover shapes how free players move. */
      window: 6,
      /** A settled turnover is believed this many seconds later per metre from the ball (up to `own.farCap`). */
      delayPerMetre: 0.026,
      /** The place's time constant inside the window: at least `settled` after a settled turnover, at most `counter` after a counter; the back line keeps `own.lag.line`. */
      lag: { settled: 2, counter: 0.5 },
      /** Inside the window after a counter a free player runs to a place farther than `runBeyond` metres and sprints to one farther than `sprintBeyond`. */
      runBeyond: 3,
      sprintBeyond: 12,
    },
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
    retrieval: 8,
    through: 22,
    shot: 28,
    header: 18,
    headerApex: 0.6,
  },
  stage: {
    /** The length of the passer's one touch while holding, at most. */
    holdDrift: 1.5,
    /** The least distance between the ball and the point an ordinary pass is received at, and how near to that point the passer's touch may take him. */
    kickGap: 5.5,
    maxExtraHold: 1.5,
    receiveSlack: 0.1,
    controlRange: 1,
    settleMax: 6,
    dribbleSpeed: 5,
    arrive: 0.6,
    kickOff: { halfMargin: 1, circle: 9.65 },
    // Where on the lane the scripted interceptor waits, and how far goal-side of it.
    shadowAt: 0.7,
    shadowOff: 1.5,
    cutMin: 0.5,
    cutMax: 0.92,
    keeperCutMin: 0.8,
    cutSlack: 0.35,
    lunge: 2,
    jockey: 2.5,
    tackleAfter: 0.3,
    tackleRange: 1.2,
    tackleGrace: 2.5,
    tackleExtra: 2,
    foulFreeze: 1,
    takeOn: { side: 2, speed: 4.5, beatenSpeed: 2, beatenTime: 0.9 },
    pressVisible: 3,
    /** How far outside the lines a target may lie, and where the boards stop a player. */
    boards: 2,
    /** How far a free outfield player keeps his target from every outfield teammate (0 = off). */
    separation: 3,
    /** How far a free outfield player of the side in possession keeps his target from the man on the ball and from teammates under an order. */
    ownerRoom: 4,
    restart: {
      delay: { kickOff: 14, throwIn: 5, goalKick: 8, corner: 12, freeKick: 7 },
      maxExtra: 8,
      distance: { kickOff: 9.15, freeKick: 9.15, corner: 9.15, goalKick: 0, throwIn: 2 },
      takerReady: 0.8,
      receiverReady: 2,
      takerOffset: 0.7,
      outRun: 1.5,
    },
    through: {
      setBack: 2.5,
      runLead: 0.8,
      earlyBy: 0.3,
      onsideGap: 0.3,
      window: 1.6,
      offsideGap: 0.6,
      flagDelay: 0.9,
      maxWait: 5,
    },
    shot: {
      setStep: 1,
      blockDist: 2.5,
      blockMin: 1.5,
      blockMax: 8,
      netDepth: 1.5,
      beatenKeeper: 3.5,
      saveMin: 0.75,
      saveNudge: 0.25,
      parryWide: 7,
      parryTime: 0.5,
      wideRun: 2,
      looseRoll: 3,
      looseTime: 0.4,
      deflectSpeed: 12,
    },
    cross: { runUp: 6 },
    /** Corner places as [attack x, y offset]; the offset is multiplied by the corner's side (+1 when the corner is at attack y = 68). */
    corner: {
      attack: [
        [99.5, 4.5],
        [97, 0],
        [98.5, -5.5],
        [93.5, -1.5],
        [86, 7],
        [84.5, -8],
        [62, -8],
        [56, 8],
      ],
      keeper: [104, 1],
      zonal: [
        [103.5, 3.5],
        [100.5, 0],
      ],
      up: [
        [64, -9],
        [60, 9],
      ],
      goalSide: 1.2,
    },
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
    /** An open-play pass to feet or into a stride is aimed at least this far from the ball. */
    minPass: 7,
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
      /** `producePlayback` (stage/pipeline.ts) stages at most this many showcase candidates. */
      maxStaged: 20,
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
  // Thresholds of the staging metrics (check/metrics.ts); distances in metres, speeds in m/s.
  limits: {
    /** Staged seconds a playback covers at least. */
    duration: 599.5,
    /** The fastest ball step between frames, and how far outside the pitch a player may stand. */
    ballSpeed: 45,
    outside: 2.5,
    /** A held ball within `ownerDistance` of its owner in at least `ownerShare` of held frames. */
    ownerDistance: 1.2,
    ownerShare: 0.99,
    /** The receiver within `reception` of the ball at a reception, in `receptionShare` of them. */
    reception: 1.6,
    receptionShare: 0.98,
    /** The opponent within `contest` of the ball at an interception, tackle, save or block. */
    contest: 1.6,
    contestShare: 0.95,
    /** Contested events whose opponent was replaced, or needed the lunge, at most these shares. */
    recastRate: 0.25,
    stretchRate: 0.1,
    /** A swarm: `count` outfield players within `radius` of the ball, in at most `share` of frames. */
    swarm: { radius: 10, count: 7, share: 0.02 },
    /** The median attack-x spread of a team's outfield players lies in this range. */
    teamLength: [22, 52],
    /** Two outfield teammates closer than `distance`, in at most `share` of frames. */
    spacing: { distance: 1.5, share: 0.03 },
    /** The inverted full-back at least `ifbInside` nearer the long axis than the other full-back, within `ifbPivotGap` of the pivot in attack x. */
    ifbInside: 8,
    ifbPivotGap: 8,
    /** The false nine at least `falseNineDrop` short of the offside line; the poacher within `poacherGap` of it. */
    falseNineDrop: 5,
    poacherGap: 3.5,
    /** A pass from attack x `fromX` played at least `back` metres backward needs a reason. */
    backPass: { fromX: 80, back: 8 },
    /** A pressed pass is kicked with an opponent within `stage.pressVisible + pressedSlack` in `pressedShare` of them. */
    pressedShare: 0.9,
    pressedSlack: 0.5,
    /** An ordinary pass kicked with its receiver nearer than `distance`, in at most `share` of them. */
    shortKick: { distance: 5, share: 0.05 },
    /** Two outfield teammates within `distance` for longer than `seconds`: at most `perMinute` such episodes an open-play minute, none longer than `longest` seconds. */
    huddle: { distance: 3, seconds: 2, perMinute: 0.6, longest: 4 },
    /** A player rests below `rest` m/s and starts when he next exceeds `go`: at most `restarts` starts a player-minute; a start is in step when `together` starts fall within ± `window` seconds, in at most `startSync` of them; the mean correlation of two players' speeds is at most `speedSync`. */
    motion: {
      rest: 0.5,
      go: 1,
      restarts: 4,
      window: 0.2,
      together: 8,
      startSync: 0.2,
      speedSync: 0.3,
    },
    /** A turnover in open play: of the players moving at `moving` m/s along the pitch in the `before` seconds before it, at most `reverseShare` have turned `within` seconds after a settled one; `runAt` seconds after it at most `runShare` of the outfield players are faster than `runSpeed` (at least `counterRunShare` after a counter). */
    turn: {
      before: 0.5,
      moving: 0.8,
      within: 1,
      reverseShare: 0.3,
      runSpeed: 4.5,
      runAt: 1.5,
      runShare: 0.4,
      counterRunShare: 0.5,
    },
    /** An attacker without the ball at attack x `fromX` or beyond has a defender within `distance`, in at least `share` of the samples. */
    mark: { fromX: 65, distance: 4, share: 0.5 },
  },
  // The viewer (viewer/, build.ts): presentation only, never read by the script or the staging.
  viewer: {
    pad: 3,
    playerRadius: 1.1,
    ballRadius: 0.45,
    minPlayerPx: 7,
    minBallPx: 3,
    flashSeconds: 1.8,
    trailSeconds: 1.5,
    speeds: [1, 2, 5],
    seekStep: 5,
    port: 4310,
    maxWidth: 1180,
    hud: 34,
    hudFontPx: 15,
    captionFontPx: 12,
    roleFontPx: 9,
    numberScale: 1.05,
    facingTick: 0.55,
    ballLift: 0.6,
    ballGrow: 0.12,
    still: 0.02,
    lookBack: 30,
    maxFrameSeconds: 0.1,
    /** Centre circle radius, goal area depth and width, a goal's depth outside the line, a spot's radius. */
    markings: { circle: 9.15, goalArea: [5.5, 18.32], goalDepth: 2, spot: 0.3 },
    colours: {
      grassA: '#2f7d3b',
      grassB: '#2a7235',
      line: '#e8f2e9',
      home: '#d7263d',
      away: '#1b4dd8',
      keeperHome: '#f2c14e',
      keeperAway: '#2ec4b6',
      number: '#ffffff',
      ball: '#ffffff',
      ballEdge: '#111111',
      shadow: 'rgba(0,0,0,0.35)',
      owner: '#ffe066',
      offside: '#ff3b30',
      hud: 'rgba(0,0,0,0.6)',
      hudText: '#ffffff',
    },
  },
} as const;
