// Summarizes a match-parity --report --reference artifact (one part or the merged file): per
// condition matches, metric verdict counts, relationships and the re-measured pilot size.
const fs = require('fs');
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = [];
for (const c of j.conditions) {
  const eq = c.reference;
  const m = eq?.summary?.metrics ?? {};
  const r = eq?.summary?.relationships ?? {};
  const sizing = eq?.pilotValidationSize;
  rows.push({
    condition: c.condition,
    matches: c.matches,
    equivalent: m.equivalent ?? 0,
    different: m.different ?? 0,
    insufficient: m.insufficient ?? 0,
    underpowered: m.underpowered ?? 0,
    relationships: `${r.equivalent ?? 0}/${r.different ?? 0}/${r.insufficient ?? 0}`,
    pilot: sizing?.size,
    short: sizing?.size > c.matches,
  });
}
const total = rows.reduce(
  (t, r) => ({
    equivalent: t.equivalent + r.equivalent,
    different: t.different + r.different,
    insufficient: t.insufficient + r.insufficient,
    underpowered: t.underpowered + r.underpowered,
    matches: t.matches + r.matches,
  }),
  { equivalent: 0, different: 0, insufficient: 0, underpowered: 0, matches: 0 },
);
console.log(JSON.stringify(total));
for (const r of rows) console.log(Object.values(r).join(' | '));
if (!rows[0].pilot) {
  const c = j.conditions[0];
  console.log('condition keys', Object.keys(c), 'reference keys', Object.keys(c.reference ?? {}));
}
