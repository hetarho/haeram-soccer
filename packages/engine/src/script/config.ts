/**
 * Every value the script writer reads (→MATCH-38, T826), under the match prototype's names and
 * values (scripts/match-proto/core/config.ts `fit` and the `grammar` values the fitted writer read,
 * as T822 left them). Metres, seconds and shares; distances between cells are integer centimetres
 * (cells.ts), so the costs below are compared in centimetres.
 */
export const SCRIPT_CONFIG = {
  /** Seconds a touch takes at least and at most; a minute's time is shared out between its beats within these. */
  hold: [0.4, 5],
  /** Nominal seconds a restart takes off the minute, by kind. */
  dead: { kickOff: 40, throwIn: 12, goalKick: 20, corner: 25, freeKick: 20 },
  /** A carry with a minute of its own is moved at most this many minutes to find a release of its player. */
  carryWindow: 3,
  /** A floating carry joins its player's release only when it ends within this many metres (cell centre to cell centre) of where that touch starts; else it is a touch of its own. */
  carryJoin: 1000,
  /** A point inside a cell stays this far from the cell's edges (m). */
  cellMargin: 1.5,
  /** Metres a touch fixed to the minute being written is preferred by over a floating one; `fixedPush` once the minute's share of touches is played, when only its fixed touches keep it open (and a possession-ending touch of the other side as much). */
  fixedPull: 20,
  fixedPush: 300,
  /** Metres added to `fixedPull` as the minute's share of touches fills, all of it at the share. */
  fixedRamp: 0,
  /** Metres a possession-ending touch is preferred by when its side is `paceSlack` (a share of its touches) ahead of the other side; as much dearer when behind. */
  paceBias: 15,
  paceSlack: 0.02,
  /** A side whose share of its possession-ending rows played is this far ahead of the other side's loses the ball by a heavy touch instead of spending one more. */
  endsSlack: 0.03,
  /** Metres a touch releasing a flagged corner or free-kick delivery costs in open play: it waits for its restart. */
  setPieceWait: 0,
  /** Metres of cost per metre a pass's receiver stands from where it lands. */
  placeWeight: 0,
  /** Attack-x thresholds of the open-play phases (m). */
  phaseX: { progression: 38, finalThird: 72 },
  /** Nominal speeds (m/s) for the script clock. */
  speeds: { ground: 16, loft: 19, carry: 5, shot: 28 },
  /** An open-play pass to feet or into a stride is aimed at least this far from the ball (m). */
  minPass: 7,
  /** Metres across the goal a missed shot is aimed, either side of the middle. */
  missWide: 5,
  /**
   * Metres a row costs whose recorded winner has no touch left to play: he would lose the ball at
   * once by a heavy touch (T826). Measured on the ten over seeds fit/a/b/c with unnamed winners the
   * nearest man: 0 → 180.5 heavy touches a run of ten on average, 30 → 175.0, link metres within
   * 0.2%; with them the nearest man with a touch left (write.ts `winnerFor`) and 30: 171.8.
   */
  idleWinner: 30,
} as const;
