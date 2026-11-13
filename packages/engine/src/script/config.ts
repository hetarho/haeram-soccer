/** The prototype writer's values; costs below are converted to integer centimetres. */
export const SCRIPT_CONFIG = {
  hold: [0.4, 5],
  dead: {
    kickOff: 40,
    throwIn: 12,
    goalKick: 20,
    corner: 25,
    freeKick: 20,
    penalty: 30,
    stoppage: 20,
  },
  shootout: { saved: 0.7, seconds: 30 },
  carryWindow: 3,
  carryJoin: 1000,
  cellMargin: 1.5,
  fixedPull: 20,
  fixedPush: 300,
  fixedRamp: 0,
  paceBias: 15,
  paceSlack: 0.02,
  endsSlack: 0.03,
  setPieceWait: 0,
  placeWeight: 0,
  /** A player's floating touches spread over his window: metres of pull per touch behind its share, at most `cap` touches. */
  spread: { weight: 4, cap: 10 },
  phaseX: { progression: 38, finalThird: 72 },
  speeds: { ground: 16, loft: 19, carry: 5, shot: 28 },
  /** Metres a recorded carry that starts and ends in one cell takes the ball (`writeFitted`). */
  cellCarry: 5,
  minPass: 7,
  /** Metres a pass lands behind its start for the writer to give it a reason (`passReason`). */
  backPass: 5,
  /** Reserve a recorded delivery rather than spending the last usable release in open play. */
  restartPull: 300,
  /** Keep a release available for a player whose recorded ball wins are still ahead of him. */
  winnerPull: 20,
  /** Seeded point variation in metres; costs still read only integer cell distances. */
  cellJitter: 0.01,
  /** A broken touch chain returns problems instead of keeping a worker busy forever. */
  maxStepsPerTouch: 20,
} as const;
