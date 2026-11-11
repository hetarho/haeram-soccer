// Every tunable number of the staging (→MATCH-17, MATCH-39) lives here under a name, ported from
// the match prototype's `PROTO_CONFIG` (scripts/match-proto/core/config.ts, T823). Later tasks add
// one section each: stage, motion, limits.
//   margin:   how far inside the lines players are kept, in metres
//   shape:    nominal places by phase (shape.ts); all x values are in the attack frame
//     ip:       in possession, read from the ball's attack x: the back line (`line*`, metres) and
//               the block's length (`depth*`, metres); `lateral` is how far the block follows the
//               ball across, as a share of the ball's distance from the long axis
//     oop:      out of possession, read from the ball's x in the defending side's own attack frame:
//               the back line (`line*`, with its tactic's bias), its width as a share of the
//               formation's, `lateral` as above and `behindBall`, how far behind a ball played in
//               behind it the line stands at most
//     block:    what each tactic's block (→MATCH-8) sets: `lineBias`, metres its out-of-possession
//               line stands higher; `depth`, its block's length out of possession; `pressFrom`, the
//               staging's press threshold (`press` below). The prototype's possession and counter
//               values stand; press is possession's with its line 2 m higher (a high line that
//               presses the build-up), balanced the midpoint of possession's and counter's (a mid
//               block engaging in the middle)
//     keeper:   in possession `gap`/`sweeperGap` metres behind the back line within `minX` and
//               `maxX`/`sweeperMaxX`, following the ball across by `lateral`; out of possession
//               `base + perMetre * distance to the ball` metres off his goal toward the ball, within
//               `minOut` and `maxOut`
//     onsideGap:      how far inside the offside line the side in possession keeps its players
//     shoulderGap:    how far inside it a role on the last shoulder stands
//     poacherLean:    how far that role leans across with the ball, as a share, up to `poacherMaxLean`
//     touchlineGap:   metres a player the touchline holds in possession keeps from a teammate higher
//                     in the block, dropping off him by what their gap falls short of it (T823)
//     phaseByBand:    the phase of the side in possession with the ball in each band of its attack
//                     (→MATCH-14): the prototype grammar's thresholds (attack x 38 and 72) read at
//                     each band's centre
//     press:    staging only: a defending side presses while the ball's x in its own attack frame
//               is at most its block's `pressFrom`; the presser stands `standoff` metres goal-side
//               of the ball (`tight` during a pressed beat), the cover `coverGap`; the nearest free
//               defender within `engage` metres of the man on the ball presses him wherever the
//               ball is; once engaged he closes from `standoff` to `close` over `closeIn` seconds,
//               then every `pokeEvery` seconds lunges for `pokeFor` seconds to `poke` metres (a
//               tackle that the script does not let win)
//     mark:     staging only: each free defender marks one man, one to one, nearest first: a man
//               within `radius` metres of his zone place, kept up to `keep` metres beyond it; he
//               stands by `blend` (per line) toward a point `goalSide` metres goal-side of his man
//               (the back line only across) and his place follows with a lag of at most `lag`
//               seconds
//     unmark:   staging only: a free attacker whose place lies within `radius` metres of an
//               opponent steps up to `step` metres across, away from him, keeping his depth
export const STAGING_CONFIG = {
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
    // Out of possession: the same from the ball's x in the defending side's own attack frame.
    oop: {
      lineBase: 3,
      lineSlope: 0.55,
      lineMin: 6,
      lineMax: 50,
      width: 0.9,
      lateral: 0.2,
      behindBall: 1.5,
    },
    block: {
      possession: { lineBias: 3, depth: 29, pressFrom: 105 },
      press: { lineBias: 5, depth: 29, pressFrom: 105 },
      counter: { lineBias: -3, depth: 26, pressFrom: 62 },
      balanced: { lineBias: 0, depth: 27.5, pressFrom: 83.5 },
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
    touchlineGap: 3,
    phaseByBand: [
      'buildUp',
      'buildUp',
      'buildUp',
      'progression',
      'progression',
      'finalThird',
      'finalThird',
      'finalThird',
    ],
    press: {
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
    mark: { radius: 10, keep: 3, goalSide: 1.5, blend: { DF: 0.6, MF: 0.6, FW: 0.3 }, lag: 0.3 },
    unmark: { radius: 4, step: 2.5 },
  },
} as const;
