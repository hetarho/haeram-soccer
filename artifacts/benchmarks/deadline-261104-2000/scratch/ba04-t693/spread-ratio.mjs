// The strongest top-flight club's income and released wage bill against its top flight's median club.
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
const groups = new Map();
for (const r of rows) {
  const key = `${r.seed}|${r.year}|${r.code}`;
  groups.set(key, [...(groups.get(key) ?? []), r]);
}
const out = [];
for (const [key, group] of groups) {
  const flight = group.filter((r) => r.tier === 0).sort((a, b) => b.strength - a.strength);
  const mid = flight[flight.length >> 1];
  const top = flight[0];
  out.push({
    key,
    income: top.income / mid.income,
    wages: top.wages / mid.wages,
    strengths: `${top.strength}/${mid.strength}`,
  });
}
const by = new Map();
for (const o of out) {
  const year = o.key.split('|')[1];
  by.set(year, [...(by.get(year) ?? []), o]);
}
for (const [year, list] of [...by].sort()) {
  const inc = list.map((o) => o.income).sort((a, b) => a - b);
  const wag = list.map((o) => o.wages).sort((a, b) => a - b);
  console.log(
    `${year}: income #1/median ${inc[0].toFixed(2)}–${inc.at(-1).toFixed(2)} (median ${inc[inc.length >> 1].toFixed(2)}), wages #1/median ${wag[0].toFixed(1)}–${wag.at(-1).toFixed(1)} (median ${wag[wag.length >> 1].toFixed(1)}), n ${list.length}`,
  );
}
