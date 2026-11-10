// Every tunable number of the prototype chain lives here under a name. Later tasks add one section
// each: shape, grammar, motion, ball, stage, limits, viewer.
//   tick:     simulation step in seconds
//   hz:       frame rate (1 / tick)
//   duration: staged seconds of the prototype
//   margin:   how far inside the lines players are kept, in metres
export const PROTO_CONFIG = { tick: 0.1, hz: 10, duration: 600, margin: 1.5 } as const;
