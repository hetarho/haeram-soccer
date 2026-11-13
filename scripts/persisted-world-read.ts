/** T863's first viability read. Run only at the coordinator's final integrated gate. */
import { writeFileSync } from 'node:fs';
import { COUNTRIES } from '../packages/catalogs/src/index';
import { historyWorld, liveHistory } from '../packages/engine/src/history';
import { FREE_AGENT_FLOW, originClub } from '../packages/engine/src/free-agents';
import { CLUB_LEVELS } from '../packages/engine/src/persisted-squads';
import { NPC_YOUTH } from '../packages/engine/src/npc-careers';
import { HISTORY_START } from '../packages/engine/src/history';
import { generateClubs } from '../packages/engine/src/world';

const args = process.argv.slice(2);
const option = (key: string, fallback: string) => {
  const index = args.indexOf(`--${key}`);
  return index < 0 ? fallback : args[index + 1] ?? fallback;
};
const seed = option('seed', 'persisted-world-viability');
const until = Number(option('until', '1980'));
const w = historyWorld(seed);
const founding = new Map(generateClubs(seed).map((c) => [c.id, c.strength]));
const flows = new Map<string, { release: number; sign: number; retire: number }>();
FREE_AGENT_FLOW.observe = (kind, p, club) => {
  const code = w.clubs.find((c) => c.id === club)?.country ?? originClub(w, p.id)?.country;
  const key = `${Math.floor(w.year / 10) * 10}:${code ?? 'unknown'}`;
  const row = flows.get(key) ?? { release: 0, sign: 0, retire: 0 };
  row[kind]++;
  flows.set(key, row);
};
const rows: object[] = [];
const sample = () => {
  for (const { code } of COUNTRIES) {
    const clubs = w.clubs.filter((c) => c.country === code && !c.representative);
    const titles = new Map<string, number>();
    for (const h of w.history)
      for (const champion of h.champions)
        if (champion.country === code) titles.set(champion.club, (titles.get(champion.club) ?? 0) + 1);
    rows.push({
      country: code,
      year: w.year,
      divisions: [...new Set(clubs.map((c) => c.tier))].sort((a, b) => a - b).map((tier) => {
        const division = clubs.filter((c) => c.tier === tier);
        // Compare against the original division's founding level, not the promoted clubs' old tier.
        const original = [...founding].filter(([id]) => id.startsWith(`${code}:${tier}:`));
        const mean = division.reduce((sum, c) => sum + c.strength, 0) / division.length;
        const level = original.reduce((sum, [, strength]) => sum + strength, 0) / original.length;
        const sizes = division.map((c) => w.squads![c.id]!.length);
        return { tier, mean, founding: level, change: mean - level,
          squadMin: Math.min(...sizes), squadMean: sizes.reduce((a, b) => a + b, 0) / sizes.length,
          squadMax: Math.max(...sizes) };
      }),
      champions: w.history.map((h) => ({ year: h.year, club: h.champions.find((c) => c.country === code)?.club })),
      differentChampions: titles.size,
      mostTitles: Math.max(0, ...titles.values()),
      freeAgents: (w.freeAgents ?? []).filter((p) => originClub(w, p.id)?.country === code).length,
      flowByDecade: [...flows].filter(([key]) => key.endsWith(`:${code}`)).map(([key, counts]) => ({
        decade: Number(key.split(':')[0]), ...counts,
      })),
    });
  }
};
try {
  sample();
  liveHistory(w, until, (year) => { if (year % 10 === 0 || year === until) sample(); });
} finally {
  delete FREE_AGENT_FLOW.observe;
}
const output = JSON.stringify({ seed, from: HISTORY_START, until, measured: true,
  initialConfigs: { clubLevels: { investment: CLUB_LEVELS.investment, decay: CLUB_LEVELS.decay }, youth: NPC_YOUTH },
  rows }, null, 2);
const out = option('out', '');
if (out) writeFileSync(out, output + '\n');
process.stdout.write(output + '\n');
