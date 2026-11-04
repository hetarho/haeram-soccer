// T689 cv04-rec: node make-candidates.mjs — writes `candidates/<name>.json`, each cv04-sit's
// `sn01o08h25` (copied here beside cv04's control `ctl`) with this window's default-off switches set:
// `shape.candidate.drop` (the back line's drop after a loss with the ball unpressed) and
// `duel.candidate.crossBlockBehind` (a pressed cross blocked behind for a corner).
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../candidates/', import.meta.url);
const base = JSON.parse(readFileSync(new URL('sn01o08h25.json', dir), 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] ? merge(out[k], v) : v;
  return out;
};
const drop = (seconds, line, free = 6) => ({ shape: { candidate: { drop: { seconds, line, free } } } });
const cb = (v) => ({ duel: { candidate: { crossBlockBehind: v } } });
const hb = (v) => ({ duel: { candidate: { headBehind: v } } });
const ahead = (m) => ({
  shot: { revision9: { narrow: { ahead: m } } },
  shape: { candidate: { revision9: { keeperOut: { ahead: m } } } },
});
const sw = (step, most) => ({ shape: { candidate: { sweepAll: 1 }, sweeperStep: step, keeperMax: { sweeperKeeper: most } } });
const variants = {
  dr4l35: drop(4, 35),
  dr6l30: drop(6, 30),
  dr8l30f8: drop(8, 30, 8),
  cb3: cb(0.3),
  cb5: cb(0.5),
  cb8: cb(0.8),
  cb5dr6l30: merge(cb(0.5), drop(6, 30)),
  hb2: hb(0.2),
  hb35: hb(0.35),
  hb35cb8: merge(hb(0.35), cb(0.8)),
  sw: sw(0.3, 22),
  sw5m28: sw(0.5, 28),
  dr10l25f10: drop(10, 25, 10),
  // The volume lever split: cv04-sit's `soVol` is both of these (shots 16.2 a team).
  s10: { decide: { candidate: { revision4: { shotScale: 0.1 } } } },
  w0: { decide: { candidate: { revision9: { clear: { within: 0 } } } } },
  // A defender relieves the keeper's narrowing and come-out only `ahead` m or more goal-side of
  // the shooter (carrier) along his line to the goal, not a man chasing level with him.
  ah3: ahead(3),
  ah6: ahead(6),
  ah3hb35: merge(ahead(3), hb(0.35)),
  // The alone clause anywhere (press's shots against a deep block back) with the narrowing's
  // `ahead` (counter's breaks narrowed), the volume held by the scale.
  w0ah3: merge(ahead(3), { decide: { candidate: { revision9: { clear: { within: 0 } } } } }),
  w0ah3s05: merge(ahead(3), {
    decide: { candidate: { revision9: { clear: { within: 0 } }, revision4: { shotScale: 0.05 } } },
  }),
  w0ah3s05hb35: merge(merge(ahead(3), hb(0.35)), {
    decide: { candidate: { revision9: { clear: { within: 0 } }, revision4: { shotScale: 0.05 } } },
  }),
  // The alone clause anywhere but wider: nobody within `alone` m (MATCH-16's 5 m).
  w0a6ah3: merge(ahead(3), { decide: { candidate: { revision9: { clear: { within: 0, alone: 6 } } } } }),
  w0a7ah3: merge(ahead(3), { decide: { candidate: { revision9: { clear: { within: 0, alone: 7 } } } } }),
  // With the set-piece lever and, for goals, a higher `shot.a`.
  w0a7ah3hb35: merge(merge(ahead(3), hb(0.35)), {
    decide: { candidate: { revision9: { clear: { within: 0, alone: 7 } } } },
  }),
  w0a7ah3hb35a090: merge(merge(ahead(3), hb(0.35)), {
    decide: { candidate: { revision9: { clear: { within: 0, alone: 7 } } } },
    shot: { a: -0.9 },
  }),
};
for (const [name, v] of Object.entries(variants))
  writeFileSync(new URL(name + '.json', dir), JSON.stringify(merge(base, v)) + '\n');
console.log(Object.keys(variants).join(' '));
