// T689 cv04: writes candidate behaviour patches (JSON) on nx04's arrHoldEZ60 base.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const dir = root + 'artifacts/benchmarks/scoring-261104-cv04/candidates/';
mkdirSync(dir, { recursive: true });
const base = JSON.parse(
  readFileSync(root + 'artifacts/benchmarks/scoring-261104-nx04/candidates/arrHoldEZ60.json', 'utf8'),
);
const clone = () => JSON.parse(JSON.stringify(base));
const set = (o, path, v) => {
  const ks = path.split('.');
  let t = o;
  for (const k of ks.slice(0, -1)) t = t[k] ??= {};
  t[ks.at(-1)] = v;
  return o;
};
const variants = {
  ctl: [],
  // A sharper box shot-quality filter: a shot into bodies (xG ~0.02) weighs far less.
  q10: [['decide.candidate.revision4.shotQuality', { ref: 0.12, power: 1, most: 2 }]],
  q10s14: [
    ['decide.candidate.revision4.shotQuality', { ref: 0.12, power: 1, most: 2 }],
    ['decide.candidate.revision4.shotScale', 0.14],
  ],
  q15s20: [
    ['decide.candidate.revision4.shotQuality', { ref: 0.12, power: 1.5, most: 2 }],
    ['decide.candidate.revision4.shotScale', 0.2],
  ],
  // q10s14 with the long-shot fall-off of 6 m (released 3.5 m): more shots from outside the box.
  q10s14L6: [
    ['decide.candidate.revision4.shotQuality', { ref: 0.12, power: 1, most: 2 }],
    ['decide.candidate.revision4.shotScale', 0.14],
    ['decide.candidate.longShotScale', 6],
  ],
  // Diagnostic: MATCH-16's "nobody within 5 m" clear chance off (corridor rule kept).
  alone0: [['decide.candidate.revision9.clear.alone', 0]],
  // Regains: a pressed defender in his own box clears 6 times (released 2) as often.
  clr6: [['decide.pressure.clearance', 6]],
  // The keeper's open-play distribution: a short ball only to a receiver nobody is within 3 / 5 m
  // of and along a lane nobody reaches cleanly, else long, to such a receiver when one exists.
  ks3: [['decide.keeper.safe', 3]],
  ks5: [['decide.keeper.safe', 5]],
  // MATCH-16's "nobody within 5 m" clear chance only with that share of the goal unblocked
  // (MATCH-35). (The first view5/view7/view5ks5 runs, logs `*floor*`, gated only the shot floor.)
  view5: [['decide.candidate.revision9.clear.view', 0.5]],
  view7: [['decide.candidate.revision9.clear.view', 0.7]],
  view3: [['decide.candidate.revision9.clear.view', 0.3]],
  view5ks5: [
    ['decide.candidate.revision9.clear.view', 0.5],
    ['decide.keeper.safe', 5],
  ],
  // Nobody reaches the first 8 / 12 m of a keeper's distribution.
  kc8: [['duel.pass.keeperClear', 8]],
  kc12: [['duel.pass.keeperClear', 12]],
  view5kc8: [
    ['decide.candidate.revision9.clear.view', 0.5],
    ['duel.pass.keeperClear', 8],
  ],
  // The keeper plays only along a lane no opponent reaches at all (and to a receiver nobody is
  // within 5 m of), short else long, else as before; with and without keeperClear 8.
  kf5: [
    ['decide.keeper.safe', 5],
    ['decide.keeper.free', 1],
  ],
  kf5kc8: [
    ['decide.keeper.safe', 5],
    ['decide.keeper.free', 1],
    ['duel.pass.keeperClear', 8],
  ],
  // Nobody within 6 / 10 m of the keeper as he distributes reaches his ball.
  kl6: [['duel.pass.keeperLeave', 6]],
  kl10: [['duel.pass.keeperLeave', 10]],
  kl6kc8: [
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
  ],
  // MATCH-16's "nobody within 5 m" clear chance only within 12 / 14 m of the goal centre, with the
  // volume scale back toward the released 0.28 so the shots it frees come from where real ones do.
  an12: [['decide.candidate.revision9.clear.within', 12]],
  an12s16: [
    ['decide.candidate.revision9.clear.within', 12],
    ['decide.candidate.revision4.shotScale', 0.16],
  ],
  an14s16: [
    ['decide.candidate.revision9.clear.within', 14],
    ['decide.candidate.revision4.shotScale', 0.16],
  ],
  a0s20: [
    ['decide.candidate.revision9.clear.alone', 0],
    ['decide.candidate.revision4.shotScale', 0.2],
  ],
  // The keeper fix with the 12 m clear chance.
  an12kl6kc8: [
    ['decide.candidate.revision9.clear.within', 12],
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
  ],
  // Outside shots: the box band's extra shot weight down, the volume scale up (and the long-shot
  // fall-off longer), on the keeper fix with and without the 12 m clear chance.
  o1: [
    ['decide.candidate.revision9.clear.within', 12],
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
    ['decide.candidate.revision4.shotScale', 0.18],
    ['decide.candidate.shotBox', 0.3],
  ],
  o2: [
    ['decide.candidate.revision9.clear.within', 12],
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
    ['decide.candidate.revision4.shotScale', 0.25],
    ['decide.candidate.shotBox', 0.2],
    ['decide.candidate.longShotScale', 6],
  ],
  o3: [
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
    ['decide.candidate.revision4.shotScale', 0.18],
    ['decide.candidate.shotBox', 0.3],
  ],
  o4: [
    ['decide.candidate.revision9.clear.within', 12],
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
    ['decide.candidate.revision4.shotScale', 0.35],
    ['decide.candidate.shotBox', 0.12],
    ['decide.candidate.longShotScale', 8],
  ],
  o5: [
    ['decide.candidate.revision9.clear.within', 12],
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
    ['decide.candidate.revision4.shotScale', 0.3],
    ['decide.candidate.shotBox', 0.15],
    ['decide.candidate.longShotScale', 6],
  ],
  o6: [
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
    ['decide.candidate.revision4.shotScale', 0.3],
    ['decide.candidate.shotBox', 0.15],
    ['decide.candidate.longShotScale', 6],
  ],
  // The keeper's release as movement: his presser stands off 10 / 16 m goal-side of a keeper on
  // the ball instead of closing him; with and without the resolution-side keeper switches.
  ko10: [['shape.candidate.keeperOff', 10]],
  ko16: [['shape.candidate.keeperOff', 16]],
  ko16kl6kc8: [
    ['shape.candidate.keeperOff', 16],
    ['duel.pass.keeperLeave', 6],
    ['duel.pass.keeperClear', 8],
  ],
  // Diagnostic combination (alone0 contradicts MATCH-16 as written): volume and the keeper.
  a0kc8: [
    ['decide.candidate.revision9.clear.alone', 0],
    ['duel.pass.keeperClear', 8],
  ],
};
for (const [name, edits] of Object.entries(variants)) {
  const o = clone();
  for (const [p, v] of edits) set(o, p, v);
  writeFileSync(dir + name + '.json', JSON.stringify(o) + '\n');
  console.log(name);
}
