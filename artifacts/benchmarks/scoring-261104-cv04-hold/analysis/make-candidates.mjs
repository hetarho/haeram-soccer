// T689 cv04-hold: node make-candidates.mjs — writes this window's candidates, each on cv04's ctl
// (arrHoldEZ60) or kl6kc8, with the keeper-hands switches (`decide.keeper.hold` seconds,
// `shape.candidate.handsOff` m) and the other settings named.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/';
const prior = root + 'artifacts/benchmarks/scoring-261104-cv04/candidates/';
const dir = root + 'artifacts/benchmarks/scoring-261104-cv04-hold/candidates/';
mkdirSync(dir, { recursive: true });
const base = (n) => JSON.parse(readFileSync(prior + n + '.json', 'utf8'));
const merge = (a, b) => {
  const out = structuredClone(a);
  for (const [k, v] of Object.entries(b))
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k] ?? {}, v) : v;
  return out;
};
const hands = (hold, off) => ({
  decide: { keeper: { hold } },
  ...(off ? { shape: { candidate: { handsOff: off } } } : {}),
});
const quick = { decide: { keeper: { quick: 1 } } };
const boxFoul = (v) => ({ duel: { candidate: { boxFoul: v } } });
const within = (m) =>({ decide: { candidate: { revision9: { clear: { within: m } } } } });
const scale = (v) => ({ decide: { candidate: { revision4: { shotScale: v } } } });
const list = {
  ctl: base('ctl'),
  kl6kc8: base('kl6kc8'),
  h4: merge(base('ctl'), hands(4, 0)),
  h4o16: merge(base('ctl'), hands(4, 16)),
  h6o20: merge(base('ctl'), hands(6, 20)),
  h4o16kl6kc8: merge(base('kl6kc8'), hands(4, 16)),
  h6o20kl6kc8: merge(base('kl6kc8'), hands(6, 20)),
  h6o20an12: merge(merge(base('ctl'), hands(6, 20)), within(12)),
  h6o20an12s14: merge(merge(merge(base('ctl'), hands(6, 20)), within(12)), scale(0.14)),
  kq: merge(base('ctl'), quick),
  h6o20kq: merge(merge(base('ctl'), hands(6, 20)), quick),
  h6o20kqan12: merge(merge(merge(base('ctl'), hands(6, 20)), quick), within(12)),
  pf: merge(base('ctl'), boxFoul(0.03)),
  h6o20kqpf: merge(merge(merge(base('ctl'), hands(6, 20)), quick), boxFoul(0.03)),
  h6o20kqpfan12: merge(merge(merge(merge(base('ctl'), hands(6, 20)), quick), boxFoul(0.03)), within(12)),
  h6o20kqpfan12s14: merge(
    merge(merge(merge(merge(base('ctl'), hands(6, 20)), quick), boxFoul(0.03)), within(12)),
    scale(0.14),
  ),
};
// The midfield line's shot weight (MATCH-16's order FW ≥ MF ≥ DF kept), on the last two.
const mf = (v) => ({ decide: { candidate: { revision4: { shotLine: { MF: v } } } } });
list.h6o20kqpfan12m1 = merge(list.h6o20kqpfan12, mf(1));
list.h6o20kqpfan12s14m1 = merge(list.h6o20kqpfan12s14, mf(1));
// The keeper's narrowing (revision 9, →MATCH-35): his reach either side and how far he comes out
// to a carrier in his box, on h6o20kqpf; with lower volume scales.
const reach = (v) => ({ shot: { revision9: { narrow: { reach: v } } } });
const out = (v) => ({ shape: { candidate: { revision9: { keeperOut: { share: v } } } } });
const B = list.h6o20kqpf;
list.nr10 = merge(B, reach(1));
list.nr05 = merge(B, reach(0.5));
list.ko25 = merge(B, out(0.25));
list.nr10ko25 = merge(merge(B, reach(1)), out(0.25));
list.nr05s07 = merge(merge(B, reach(0.5)), scale(0.07));
list.nr10ko25s07 = merge(merge(merge(B, reach(1)), out(0.25)), scale(0.07));
list.nr10ko25s06 = merge(merge(merge(B, reach(1)), out(0.25)), scale(0.06));
list.nr10ko25s05 = merge(merge(merge(B, reach(1)), out(0.25)), scale(0.05));
list.ko25s06 = merge(merge(B, out(0.25)), scale(0.06));
list.nr05s06 = merge(merge(B, reach(0.5)), scale(0.06));
list.nr10s08 = merge(merge(B, reach(1)), scale(0.08));
// With MATCH-16's alone clause held to 12 m of goal (the shot volume).
list.nr10ko25an12 = merge(list.nr10ko25, within(12));
list.nr10ko25an12s07 = merge(list.nr10ko25s07, within(12));
list.nr10an12 = merge(list.nr10, within(12));
list.nr05an12 = merge(list.nr05, within(12));
// The come-out share between a quarter and the released half.
list.ko30s06 = merge(merge(B, out(0.3)), scale(0.06));
list.ko35s06 = merge(merge(B, out(0.35)), scale(0.06));
list.ko25s04 = merge(merge(B, out(0.25)), scale(0.04));
list.ko25an12s07 = merge(merge(merge(B, out(0.25)), scale(0.07)), within(12));
// Every shot's chance alike (the position model's logit offset `SHOT_CONFIG.a`, released −1).
const logit = (v) => ({ shot: { a: v } });
list.nr10ko25a135 = merge(list.nr10ko25, logit(-1.35));
list.ko25s06a120 = merge(list.ko25s06, logit(-1.2));
list.nr10ko25an12s07a115 = merge(list.nr10ko25an12s07, logit(-1.15));
list.ko25s06a135 = merge(list.ko25s06, logit(-1.35));
list.nr10ko25an12s07a130 = merge(list.nr10ko25an12s07, logit(-1.3));
list.nr10ko25a150 = merge(list.nr10ko25, logit(-1.5));
// No narrowing at all (`reach` 0: every shot as with the keeper on his line), goals pulled back.
list.nr0an12s07a150 = merge(merge(merge(merge(B, reach(0)), scale(0.07)), within(12)), logit(-1.5));
list.nr0an12s07a170 = merge(merge(merge(merge(B, reach(0)), scale(0.07)), within(12)), logit(-1.7));
list.nr0s06a170 = merge(merge(merge(B, reach(0)), scale(0.06)), logit(-1.7));
// Allocation on the best band candidate: the striker waiting further out, the arrivals closer in.
const best = list.nr10ko25an12s07a130;
list.best_h18 = merge(best, { shape: { candidate: { hold: { out: 18 } } } });
list.best_ar10 = merge(best, { shape: { candidate: { arrive: { out: 10 } } } });
const arrive = (a) => merge(best, { shape: { candidate: { arrive: a } } });
list.best_ar08 = arrive({ out: 8 });
list.best_ar10f50 = arrive({ out: 10, from: 50 });
list.best_ar10n5 = arrive({ out: 10, narrow: 0.5 });
list.best_ar12f50 = arrive({ out: 12, from: 50 });
// The keeper half of the way only to a carrier through on goal, `set` of the way otherwise
// (`revision9.keeperOut.set`), on best_ar10f50: MATCH-29's press v counter.
const sit = (set) => ({ shape: { candidate: { revision9: { keeperOut: { share: 0.5, set } } } } });
list.sit20 = merge(list.best_ar10f50, sit(0.2));
list.sit20nr15 = merge(list.sit20, reach(1.5));
list.sit20a115 = merge(list.sit20, logit(-1.15));
list.sit20nr15a115 = merge(list.sit20nr15, logit(-1.15));
list.sit20a100 = merge(list.sit20, logit(-1));
list.sit20a090 = merge(list.sit20, logit(-0.9));
// best_ar10f50 without the keeper's release (hold, handsOff, quick): what the keeper fix does to MATCH-29.
list.nokq_ar10f50 = merge(
  merge(
    merge(merge(merge(merge(merge(base('ctl'), boxFoul(0.03)), reach(1)), out(0.25)), scale(0.07)), within(12)),
    logit(-1.3),
  ),
  { shape: { candidate: { arrive: { out: 10, from: 50 } } } },
);
for (const [n, c] of Object.entries(list)) writeFileSync(dir + n + '.json', JSON.stringify(c));
console.log(Object.keys(list).join(' '));
