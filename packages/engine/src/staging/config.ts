/** Pitch metres and shape coefficients ported from the match prototype. */
export const STAGING_CONFIG = {
  tick: 0.1,
  hz: 10,
  margin: 1.5,
  shape: {
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
    oop: {
      lineBase: 3,
      lineSlope: 0.55,
      lineMin: 6,
      lineMax: 50,
      width: 0.9,
      lateral: 0.2,
      behindBall: 1.5,
    },
    /** Out-of-possession line bias (metres) and block depth (metres) by tactic. */
    block: {
      possession: { lineBias: 3, depth: 29 },
      press: { lineBias: 5, depth: 29 },
      counter: { lineBias: -3, depth: 26 },
      balanced: { lineBias: 0, depth: 27.5 },
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
    press: {
      from: { possession: 105, press: 105, counter: 62, balanced: 83.5 },
      standoff: 3.5,
      tight: 1.2,
      coverGap: 14,
      engage: 4,
      close: 2,
      closeIn: 1.2,
      pokeEvery: 1.6,
      pokeFor: 0.6,
      poke: 0.7,
    },
    mark: { radius: 10, keep: 3, goalSide: 1.5, blend: { DF: 0.8, MF: 0.8, FW: 0.3 }, lag: 0.3 },
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
    /** Piecewise-linear around 50: neutral keeps the prototype's coefficients. */
    tendency: {
      discipline: { min: 0.6, max: 1.5 },
      pressing: { reach: { min: 0.7, max: 1.3 } },
      freedom: { over: 1.3 },
      pace: { min: 0.85, max: 1.15 },
      fatigue: 0.08,
      fullMatchMinutes: 90,
    },
    /** Free players (stage/mind.ts). */
    own: {
      /** Seconds before he acts on a change: `base + perAnticipation * (100 - anticipation) / 100 + perMetre * metres to the ball`; a back-line player: `line`. */
      delay: { base: 0.15, perAnticipation: 0.35, perMetre: 0.008, line: 0.25 },
      /** Time constant (s) his place follows the wanted place with: `base + perMetre * metres to the ball`; a back-line player: `line`. */
      lag: { base: 0.5, perMetre: 0.02, line: 0.5 },
      /** The metres to the ball count up to this. */
      farCap: 50,
      /** Seconds he gives himself to reach his place: `near` at the ball, `far` from `farAt` metres. */
      arrive: { near: 1.2, far: 3, farAt: 40 },
      /** He stands within `hold` metres of his place; otherwise he moves at `minSpeed` at least. */
      hold: 0.2,
      minSpeed: 0.8,
      /** Seconds of inputs kept for the delay: at least the longest delay, `delay.base + delay.perAnticipation + (delay.perMetre + turn.delayPerMetre) * farCap`. */
      memory: 2.9,
    },
    /** After the ball changes sides in live play (stage/mind.ts). */
    turn: {
      /** Seconds a turnover shapes how free players move. */
      window: 6,
      /** A settled turnover is believed this many seconds later per metre from the ball (up to `own.farCap`). */
      delayPerMetre: 0.04,
      /** The place's time constant inside the window: at least `settled` after a settled turnover, at most `counter` after a counter; the back line keeps `own.lag.line`. */
      lag: { settled: 2, counter: 0.5 },
      /** Inside the window after a counter a free player runs to a place farther than `runBeyond` metres and sprints to one farther than `sprintBeyond`. */
      runBeyond: 3,
      sprintBeyond: 12,
    },
  },
  ball: {
    /** Presentation-only quadratic bend as a share of the flight chord (MATCH-12). */
    curve: { bend: [0.04, 0.16], loftVariation: [0.7, 1.3] },
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
    /** Metres a free presser/cover comes from; zone height remains shape.press.from. */
    press: {
      possession: { reach: 24, counterPress: true },
      press: { reach: 30, counterPress: true },
      counter: { reach: 16, counterPress: false },
      balanced: { reach: 20, counterPress: false },
    },
    counterPress: { seconds: 5 },
    /**
     * The man on the ball keeps it moving while he holds (`holdMove` in stage/pass.ts): m/s for his
     * first `carry` metres, then `slow`; `pressed` with an opponent within `press` metres; he bends
     * away from an opponent within `avoid` metres (by up to `shy` of his heading) and from a
     * teammate within `mates` metres (the huddle distance and a little more), keeps `room`
     * metres beyond `kickGap` from a pass's reception point and `edge` metres off the lines, and
     * turns from the line he arrived on toward the attack, a half turn taking `turn` seconds; in a
     * pressed beat he shields at `pressed` and keeps his line; `lead` is how far ahead his target sits.
     */
    holdMove: {
      speed: 2.6,
      carry: 7,
      slow: 1.3,
      pressed: 1.5,
      press: 3,
      avoid: 7,
      shy: 1.2,
      mates: 5,
      room: 1.5,
      edge: 3,
      turn: 2.2,
      lead: 2,
    },
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
    tackleRange: 1.5,
    tackleGrace: 2.5,
    tackleExtra: 2,
    /** A heavy touch (`carry:loose`) leaves the ball loose this far toward the named opponent (m). */
    heavyTouch: 3,
    foulFreeze: 1,
    takeOn: { side: 2, speed: 4.5, beatenSpeed: 2, beatenTime: 0.9 },
    pressVisible: 3,
    /** How far outside the lines a target may lie, and where the boards stop a player. */
    boards: 2,
    /** How far a free outfield player keeps his target from every outfield teammate (0 = off). */
    separation: 4,
    /** How far a free outfield player of the side in possession keeps his target from the man on the ball and from teammates under an order. */
    ownerRoom: 4,
    scene: {
      substitution: 30,
      card: 15,
      injury: 45,
      injuryDown: 8,
      penalty: 40,
      shootout: 25,
      /** Shared entrance/exit at halfway on the benches' touchline. */
      gate: [52.5, 0] as const,
      ready: 0.15,
      maxTravel: 180,
      penaltyDistance: 9.15,
      penaltyGap: 0.5,
      spotPlaces: {
        waitingKeeperX: 10,
        penaltyRowDepth: 5,
        penaltyFirstY: 6,
        penaltyStepY: 5,
        halfwayOffset: 1,
        halfwayFirstY: 9,
        halfwayStepY: 4.5,
      },
      corner: {
        back: [2, 3] as const,
        up: [1, 2] as const,
        backPlaces: [
          [52.5, -12],
          [47.5, 0],
          [42.5, 12],
        ] as const,
        defendX: 90,
      },
    },
    restart: {
      delay: { kickOff: 14, throwIn: 5, goalKick: 8, corner: 12, freeKick: 7 },
      maxExtra: 8,
      distance: {
        kickOff: 9.15,
        freeKick: 9.15,
        corner: 9.15,
        goalKick: 0,
        throwIn: 2,
      },
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
  limits: {
    /** Match seconds per staged second; reported by T831 and judged at the release verdict. */
    clockRate: [0.8, 1.25],
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
} as const;
