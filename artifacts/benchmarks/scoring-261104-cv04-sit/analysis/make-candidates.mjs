// T689 cv04-sit: node make-candidates.mjs — writes this window's candidates on cv04-hold's
// best_ar10f50, with the keeper's narrowing kept for a shooter through on goal and relieved only
// where a defender stands between (`shot.revision9.narrow.set` / `corridor`, this window's switch),
// and his come-out by the same situation (cv04-hold's `keeperOut.set`).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const prior = root + 'artifacts/benchmarks/scoring-261104-cv04-hold/candidates/';
const dir = root + 'artifacts/benchmarks/scoring-261104-cv04-sit/candidates/';
mkdirSync(dir, { recursive: true });
const base = (n) => JSON.parse(readFileSync(prior + n + '.json', 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k] ?? {}, v) : v;
  return out;
};
const narrow = (set, extra = {}) => ({ shot: { revision9: { narrow: { reach: 1.5, set, ...extra } } } });
const out = (set) => ({ shape: { candidate: { revision9: { keeperOut: { share: 0.5, set } } } } });
const logit = (v) => ({ shot: { a: v } });
const arrive = (a) => ({ shape: { candidate: { arrive: a } } });
const B = base('best_ar10f50');
const sn = (reachSet, outSet) => merge(merge(B, narrow(reachSet)), out(outSet));
const list = {
  // 1v1: released reach 1.5 m and half of the way; with a defender between: reach and come-out relieved.
  sn: sn(1, 0.25),
  sna110: merge(sn(1, 0.25), logit(-1.1)),
  sna100: merge(sn(1, 0.25), logit(-1)),
  sn08a110: merge(sn(0.8, 0.25), logit(-1.1)),
  sn08a100: merge(sn(0.8, 0.25), logit(-1)),
  snar12a110: merge(merge(sn(1, 0.25), logit(-1.1)), arrive({ out: 12, from: 50 })),
  // More relief where a defender stands between (reach 0.5 m, or none: 0.01 m), goals back up.
  sn05a100: merge(sn(0.5, 0.25), logit(-1)),
  sn01a100: merge(sn(0.01, 0.25), logit(-1)),
  sna085: merge(sn(1, 0.25), logit(-0.85)),
  sn05a085: merge(sn(0.5, 0.25), logit(-0.85)),
  sn01a090: merge(sn(0.01, 0.25), logit(-0.9)),
  // MATCH-29 decomposition on sna110: the control's arrivals (14 m from 60 m) | the alone clause off.
  snA: merge(merge(sn(1, 0.25), logit(-1.1)), arrive({ out: 14, from: 60 })),
  snW: merge(merge(sn(1, 0.25), logit(-1.1)), { decide: { candidate: { revision9: { clear: { within: 0 } } } } }),
  // … without the keeper's release (hold, handsOff, quick) | without the between-relief (released
  // narrowing for every shot) | the control's volume scale 0.1 | the released box fouls 0.046.
  snK: merge(merge(sn(1, 0.25), logit(-1.1)), {
    decide: { keeper: { hold: 0, quick: 0 } },
    shape: { candidate: { handsOff: 0 } },
  }),
  snR: merge(merge(sn(1, 0.25), logit(-1.1)), {
    shot: { revision9: { narrow: { set: 0 } } },
    shape: { candidate: { revision9: { keeperOut: { set: 0 } } } },
  }),
  snV: merge(merge(sn(1, 0.25), logit(-1.1)), { decide: { candidate: { revision4: { shotScale: 0.1 } } } }),
  snP: merge(merge(sn(1, 0.25), logit(-1.1)), { duel: { candidate: { boxFoul: 0.046 } } }),
  // sn01a100 with the alone clause within 16 m | 20 m (MATCH-16's shooting distance) instead of 12 m.
  sn01an16: merge(sn(0.01, 0.25), merge(logit(-1), { decide: { candidate: { revision9: { clear: { within: 16 } } } } })),
  sn01an20: merge(sn(0.01, 0.25), merge(logit(-1), { decide: { candidate: { revision9: { clear: { within: 20 } } } } })),
  // sn01a100 with MATCH-18's offside calls restored (base 0.05 → 0.1; a high line catching more,
  // `highLineFactor` 1.5 → 2.5): the line press holds catches counter's runners.
  sn01o10: merge(sn(0.01, 0.25), merge(logit(-1), { restart: { offside: { candidate: { base: 0.1 } } } })),
  sn01o08h25: merge(
    sn(0.01, 0.25),
    merge(logit(-1), { restart: { offside: { candidate: { base: 0.08, highLineFactor: 2.5 } } } }),
  ),
  // sn01o08h25 with "between" read on a 3 m corridor (a defender in the shot's path, not one
  // recovering beside a breakaway), for the narrowing and the come-out alike.
  snC3: merge(
    sn(0.01, 0.25),
    merge(logit(-1), {
      restart: { offside: { candidate: { base: 0.08, highLineFactor: 2.5 } } },
      shot: { revision9: { narrow: { corridor: 3 } } },
      shape: { candidate: { revision9: { keeperOut: { corridor: 3 } } } },
    }),
  ),
  // cv04's control, copied for this window's calibration MATCH-29 read beside the candidates.
  ctl: base('ctl'),
};
for (const [n, c] of Object.entries(list)) writeFileSync(dir + n + '.json', JSON.stringify(c));
console.log(Object.keys(list).join(' '));
