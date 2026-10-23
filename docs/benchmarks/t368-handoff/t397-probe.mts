/**
 * T397 probe: plays core fixtures on the candidate grid of the tree given by --root and splits the
 * attacking counters by where they come from, through the tally's own events: box and front-of-box
 * entries and xT by pass (receiver past the deepest outfield defender as it is played, or not), by
 * cross and by carry; final-third pass attempts by start band and direction; receptions past the
 * line a team. A team a match throughout; one process, so keep --count modest.
 *
 *   pnpm exec tsx t397-probe.mts --root <tree> --partition calibration --round 57 --count 300
 *     [--patch <json>]
 */
const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const root = opt('root', '');
if (!root) throw new Error('--root');
const imp = (p: string) => import(`${root}/${p}`);

const { MATCH_MODEL_REVISION } = await imp('packages/contracts/src/match-model.ts');
const { playGrid } = await imp('packages/engine/src/grid/engine.ts');
const { buildGridSetup } = await imp('packages/engine/src/grid/setup.ts');
const { Tally } = await imp('packages/engine/src/grid/record.ts');
const { inBox, bandOf, attackFrame, cellOf } = await imp('packages/engine/src/grid/pitch.ts');
const { CELL_BASELINES } = await imp('packages/engine/src/grid/baselines.ts');
const { FORMATIONS } = await imp('packages/engine/src/player.ts');
const gb = await imp('scripts/grid-bands.ts');
const mp = await imp('scripts/lib/match-parity.ts');
const variants = await imp('scripts/t328-counter-roles-variants.ts');
const patch = opt('patch', '');
if (patch) for (const p of variants.behaviourOf('', patch)) variants.applyBehaviour(p);

type Point = [number, number];
const n: Record<string, number> = {};
const add = (k: string, v = 1) => (n[k] = (n[k] ?? 0) + v);
const xt = (from: Point, to: Point) =>
  Math.max(0, CELL_BASELINES[cellOf(to)].xT - CELL_BASELINES[cellOf(from)].xT);

/** The deepest outfield opponent's x in `side`'s attack frame. */
function lastLine(state: { players: unknown[][]; setup: { tactics: string[] } }, side: 0 | 1) {
  const foe = side === 0 ? 1 : 0;
  const slots = FORMATIONS[state.setup.tactics[foe]].slots;
  let x = -Infinity;
  for (const gp of state.players[foe] as {
    onPitch: boolean;
    sentOff?: boolean;
    slot: number;
    pos: Point;
  }[]) {
    if (!gp.onPitch || gp.sentOff || gp.slot < 0 || slots[gp.slot].position === 'GK') continue;
    x = Math.max(x, attackFrame(side, gp.pos)[0]);
  }
  return x;
}

const pass = Tally.prototype.passEvent;
Tally.prototype.passEvent = function (
  side: 0 | 1,
  idx: number,
  e: { from: Point; to: Point; ok: boolean; kind: string; receiverAt?: Point },
) {
  const state = (this as unknown as { state: never }).state;
  const line = lastLine(state, side);
  const past = e.receiverAt !== undefined && e.receiverAt[0] > line;
  const kind = e.kind === 'cross' ? 'cross' : past ? 'past' : 'onside';
  if (e.from[0] >= 70) {
    add('f3:attempts');
    add(`f3:band${bandOf(e.from[0])}`);
    const dx = e.to[0] - e.from[0],
      dy = e.to[1] - e.from[1];
    add(`f3:${dx > Math.abs(dy) ? 'forward' : -dx > Math.abs(dy) ? 'back' : 'lateral'}`);
  }
  if (past && e.kind !== 'cross') add('receptions:past');
  if (e.ok) {
    if (inBox(e.to) && !inBox(e.from)) add(`box:${kind}`);
    if (bandOf(e.to[0]) === 5 && bandOf(e.from[0]) < 5) add(`front:${kind}`);
    add(`xt:${kind}`, xt(e.from, e.to));
  }
  return pass.call(this, side, idx, e);
};
const restart = Tally.prototype.restartPass;
Tally.prototype.restartPass = function (...a: unknown[]) {
  add('restartPasses');
  return restart.apply(this, a);
};
const carry = Tally.prototype.carryEvent;
Tally.prototype.carryEvent = function (side: 0 | 1, idx: number, from: Point, to: Point) {
  if (inBox(to) && !inBox(from)) add('box:carry');
  if (bandOf(to[0]) === 5 && bandOf(from[0]) < 5) add('front:carry');
  add('xt:carry', xt(from, to));
  add('carries');
  if (bandOf(to[0]) > bandOf(from[0])) add('carries:progressive');
  return carry.call(this, side, idx, from, to);
};

const c = mp.conditionOf('core:equal-top-tier');
const partition = opt('partition', 'calibration');
const round = Number(opt('round', '57'));
const count = Number(opt('count', '300'));
const r = gb.conditionClubs(c, partition, round);
for (let i = 0; i < count; i++) {
  const { w, f } = gb.conditionFixture(c, partition, round, i, r);
  playGrid(buildGridSetup(w, f, { observe: false, recordPlayers: true, model: MATCH_MODEL_REVISION }));
}
const teams = 2 * count;
const rows = Object.entries(n)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k.padEnd(22)} ${(v / teams).toFixed(3)}`);
console.log(`core, ${count} matches, a team a match\n${rows.join('\n')}`);
