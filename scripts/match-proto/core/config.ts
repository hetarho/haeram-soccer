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
} as const;
