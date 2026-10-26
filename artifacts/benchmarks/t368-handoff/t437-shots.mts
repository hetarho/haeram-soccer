/**
 * T437 shot diagnostic: the core condition's fixtures of a calibration round on the candidate,
 * observed; every shot classified by where it was struck (goal area / rest of box / outside), how it
 * came (carried before the kick or first time; after a pass, a delivery, a carry action, a
 * rebound, a set piece), with counts, xG and goals per team a match.
 *   pnpm exec tsx shots.mts <root> <round> <n> [<patch json>]
 */
const [root, roundArg, nArg, patch] = process.argv.slice(2) as [string, string, string, string?];
const round = Number(roundArg),
  n = Number(nArg);
const { applyBehaviour } = await import(`${root}/scripts/t328-counter-roles-variants.ts`);
const { readFileSync } = await import('node:fs');
if (patch) applyBehaviour(JSON.parse(patch.startsWith('@') ? readFileSync(patch.slice(1), 'utf8') : patch));
const { MATCH_MODEL_REVISION } = await import(`${root}/packages/contracts/src/match-model.ts`);
const { playGrid } = await import(`${root}/packages/engine/src/grid/engine.ts`);
const { buildGridSetup } = await import(`${root}/packages/engine/src/grid/setup.ts`);
const { conditionFixture, conditionClubs } = await import(`${root}/scripts/grid-bands.ts`);
const { conditionOf } = await import(`${root}/scripts/lib/match-parity.ts`);
const c = conditionOf('core:equal-top-tier');
const r = conditionClubs(c, 'calibration', round);
type Tally = { shots: number; xg: number; goals: number; blocked: number; carried: number; carry: number };
const tallies: Record<string, Tally> = {};
const add = (key: string, e: any, carriedM: number) => {
  const t = (tallies[key] ??= { shots: 0, xg: 0, goals: 0, blocked: 0, carried: 0, carry: 0 });
  t.shots++;
  t.xg += e.xg ?? 0;
  if (e.result === 'goal') t.goals++;
  if (e.result === 'block') t.blocked++;
  if (carriedM > 0) {
    t.carried++;
    t.carry += carriedM;
  }
};
for (let i = 0; i < n; i++) {
  const { w, f } = conditionFixture(c, 'calibration', round, i, r);
  const setup = buildGridSetup(w, f, { observe: true, recordPlayers: true, model: MATCH_MODEL_REVISION });
  const res = playGrid(setup);
  const tr = (res.trace as any[]).filter((e) => e.outcome !== 'incident');
  tr.forEach((e, k) => {
    if (e.result === undefined) return;
    const knots = (e.knots ?? []) as { kind: string; ball: [number, number] }[];
    const kick = [...knots].reverse().find((x) => x.kind === 'kick')?.ball ?? e.from;
    const firstCarry = knots.find((x) => x.kind === 'carry')?.ball;
    const carriedM = firstCarry && kick ? Math.hypot(kick[0] - firstCarry[0], kick[1] - firstCarry[1]) : 0;
    const p = e.side === 0 ? kick : [105 - kick[0], 68 - kick[1]];
    const place = p[0] >= 99.5 && Math.abs(p[1] - 34) <= 9.16 ? 'GA' : p[0] >= 88.5 && Math.abs(p[1] - 34) <= 20.16 ? 'box' : 'out';
    const prev = tr[k - 1];
    let how = 'other';
    if (e.spot) how = 'setPiece';
    else if (prev && prev.result !== undefined && prev.side === e.side) how = 'rebound';
    else if (prev && prev.result !== undefined) how = 'afterShotOpp';
    else if (prev && prev.side === e.side && (prev.action === 'cross' || prev.action === 'cutBack') && prev.receiver === e.idx)
      how = prev.action;
    else if (prev && prev.side === e.side && prev.receiver === e.idx) how = `pass:${prev.kind ?? prev.action}`;
    else if (prev && prev.side === e.side && prev.idx === e.idx) how = `own:${prev.action}`;
    else if (prev && prev.side !== e.side) how = `won:${prev.action}`;
    else if (prev && prev.side === e.side) how = 'loose';
    add(`${place}`, e, carriedM);
    add(`${place} ${how}${e.header ? ' (head)' : ''}`, e, carriedM);
    add(`all ${e.header ? 'head' : 'foot'}`, e, carriedM);
    add('all', e, carriedM);
  });
}
const teams = 2 * n;
const rows = Object.entries(tallies).sort((a, b) => b[1].shots - a[1].shots);
console.log('key\tshots/team\txG/team\tgoals/match\txG/shot\tgoal%\tblocked%\tcarried%\tcarry m');
for (const [k, t] of rows)
  console.log(
    [
      k,
      (t.shots / teams).toFixed(2),
      (t.xg / teams).toFixed(3),
      (t.goals / n).toFixed(3),
      (t.xg / t.shots).toFixed(3),
      ((100 * t.goals) / t.shots).toFixed(1),
      ((100 * t.blocked) / t.shots).toFixed(1),
      ((100 * t.carried) / t.shots).toFixed(1),
      t.carried ? (t.carry / t.carried).toFixed(2) : '-',
    ].join('\t'),
  );
