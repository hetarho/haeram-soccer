// Each T450 cut's share of a season's saving, from a before and an after .cpuprofile of the same
// season: the inclusive time (by function name and file) of the functions each cut changed.
// usage: node docs/benchmarks/t450/shares.cjs <before.cpuprofile> <after.cpuprofile>
const fs = require('fs');
const [fa, fb] = process.argv.slice(2);
function inclusive(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byId = new Map(p.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of p.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
  const dt = new Map();
  p.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)));
  const out = new Map();
  for (const [id, us] of dt) {
    const seen = new Set();
    for (let at = id; at !== undefined; at = parent.get(at)) {
      const cf = byId.get(at).callFrame;
      const name = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}`;
      if (seen.has(name)) continue;
      seen.add(name);
      out.set(name, (out.get(name) ?? 0) + us / 1000);
    }
  }
  return out;
}
const a = inclusive(fa),
  b = inclusive(fb);
const of = (m, names) => names.reduce((sum, n) => sum + (m.get(n) ?? 0), 0);
const CUTS = [
  {
    cut: "NPC squads read the people registry once (`peopleOf`) and each club's active players from an index (`playingFor`)",
    functions: ['continuousSquad src/npc-continuity.ts'],
  },
  {
    cut: 'managerial entry reads only people who ever coached (`coachingPeople`); grade and role helpers without allocation; season starts memoized; no coaching job means no service',
    functions: ['qualifyManagers src/manager-entry.ts'],
  },
  {
    cut: 'mentor sync: people who ever coached, clubs by ID, one date per sync',
    functions: ['syncMentorExposures src/person-careers.ts'],
  },
  {
    cut: "NPC coaching: a day with no ended contract skips the walk, the active coaching index survives other roles' job changes and is built from people who coached; the market reads only people with a coaching profile",
    functions: ['settleNpcCoaching src/coaching-market.ts', 'refreshCoachingMarket src/coaching-market.ts'],
  },
  {
    cut: "aggregate kernel without per-call closures (participation's stoppage decision as methods, team.ts pass completion and carry groups as module functions)",
    functions: [
      '__name aggregate/participation.ts',
      '__name aggregate/team.ts',
      'decide aggregate/participation.ts',
      'carriesFrom aggregate/team.ts',
    ],
  },
  {
    cut: 'grid tags and coordination without per-call closures; each shape place read once per plan',
    functions: [
      'computeTags grid/tags.ts',
      'defend grid/coordination.ts',
      'attack grid/coordination.ts',
    ],
  },
  {
    cut: 'prepareMatch rates the XIs it chose (`ratingOf`): the XI availability work once per club and fixture',
    functions: ['startingSquad src/world.ts'],
    minus: ['squad src/world.ts'],
  },
];
const season = ['simulateSeason src/index.ts'];
const total = of(a, season) - of(b, season);
const rows = CUTS.map(({ cut, functions, minus = [] }) => {
  const before = of(a, functions) - of(a, minus),
    after = of(b, functions) - of(b, minus);
  return {
    cut,
    functions: minus.length ? `${functions.join(' + ')} − ${minus.join(' − ')}` : functions,
    beforeMs: Math.round(before),
    afterMs: Math.round(after),
    savedMs: Math.round(before - after),
    shareOfSaving: +(((before - after) / total) * 100).toFixed(1),
  };
});
console.log(
  JSON.stringify(
    {
      seasonBeforeMs: Math.round(of(a, season)),
      seasonAfterMs: Math.round(of(b, season)),
      savedMs: Math.round(total),
      cuts: rows,
      unattributedMs: Math.round(total - rows.reduce((s, r) => s + r.savedMs, 0)),
    },
    null,
    1,
  ),
);
