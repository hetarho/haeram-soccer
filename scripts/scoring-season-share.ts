/**
 * T689 diagnostic (measurement only, no engine change): MATCH-23's season scorer concentration on the
 * grid engine. Each run takes over a top-flight club in `--year` (a fresh world, `careerWorld`, every
 * business responsibility as a new career holds it) and plays its whole league season as a career
 * does — the manager's selection, fatigue, injuries, suspensions and substitutions — then reads the
 * own club's league top scorer's share of its league goals from the season's settled ledger (→HIST-17),
 * checked against its fixtures' scores. Unlike `scoring-concentration.ts`, nobody plays every match
 * fresh; only the own club's fixtures play the grid engine (→MATCH-22), so only its share is read.
 *
 *   pnpm exec tsx scripts/scoring-season-share.ts --country ENG --clubs 0,1,2 --seeds a,b
 *     [--seasons 1] [--year 2024] --out FILE
 */
import { writeFileSync } from 'node:fs';
import { activeMatchModel } from '../packages/contracts/src/match-model';
import type { Fixture, World } from '../packages/contracts/src/types';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { M } from '../packages/engine/src/match/record';
import { advanceRound, closeSeason } from '../packages/engine/src/season';
import { findClub, rating } from '../packages/engine/src/world';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : fallback;
};
const country = opt('country', 'ENG') as 'ENG';
const clubs = opt('clubs', '0').split(',').map(Number);
const seeds = opt('seeds', 't689-season-1').split(',');
const seasons = Number(opt('seasons', '1'));
const year = Number(opt('year', '2024'));
const out = opt('out', '');

interface SeasonRow {
  seed: string;
  club: string;
  year: number;
  tier: number;
  rating: number;
  matches: number;
  goals: number;
  conceded: number;
  ledgerGoals: number;
  topScorer: string | null;
  topPosition: string | null;
  topGoals: number;
  topShare: number;
  topApps: number;
  topStarts: number;
  hatTricks: number | null;
  seconds: number;
}

const rows: SeasonRow[] = [];
const t0 = Date.now();
let model = '';
for (const seed of seeds)
  for (const idx of clubs) {
    const id = `${country}:0:0:${idx}`;
    const w: World = careerWorld({ country, seed, club: id, year });
    model = String(activeMatchModel(w));
    for (let s = 0; s < seasons && !w.bankrupt; s++) {
      const began = Date.now();
      const own = w.playerClub;
      const club = findClub(w, own);
      const tier = club.tier;
      const strength = rating(w, club);
      while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
      if (w.bankrupt) break;
      const league = w.fixtures.filter(
        (f): f is Fixture & { score: NonNullable<Fixture['score']> } =>
          f.kind === 'league' && f.score !== undefined && (f.home === own || f.away === own),
      );
      const groupKey = league[0]?.groupKey;
      let goals = 0,
        conceded = 0;
      for (const f of league) {
        const us = f.home === own ? f.score.home : f.score.away;
        goals += us;
        conceded += f.home === own ? f.score.away : f.score.home;
      }
      const comp = w.npcSeason?.competitions.find(
        (c) => c.kind === 'league' && c.groupKey === groupKey,
      );
      let ledgerGoals = 0;
      let top: {
        id: string;
        position: string;
        goals: number;
        apps: number;
        starts: number;
      } | null = null;
      for (const p of comp?.players ?? [])
        for (const x of p.clubs) {
          if (x.club !== own) continue;
          const g = x.metrics[M.goals] ?? 0;
          ledgerGoals += g;
          if (!top || g > top.goals)
            top = {
              id: p.id,
              position: p.position,
              goals: g,
              apps: x.appearances,
              starts: x.starts,
            };
        }
      // Own matches keep their records (→HIST-1): hat-tricks where the season's records hold them.
      let hatTricks: number | null = 0;
      for (const f of league) {
        const record = (f as { record?: { players?: { metrics: number[] }[] } }).record;
        if (!record?.players) {
          hatTricks = null;
          break;
        }
        hatTricks += record.players.filter((p) => (p.metrics[M.goals] ?? 0) >= 3).length;
      }
      rows.push({
        seed,
        club: id,
        year: w.year,
        tier,
        rating: Math.round(10 * strength) / 10,
        matches: league.length,
        goals,
        conceded,
        ledgerGoals,
        topScorer: top?.id ?? null,
        topPosition: top?.position ?? null,
        topGoals: top?.goals ?? 0,
        topShare: goals > 0 ? (top?.goals ?? 0) / goals : 0,
        topApps: top?.apps ?? 0,
        topStarts: top?.starts ?? 0,
        hatTricks,
        seconds: (Date.now() - began) / 1000,
      });
      const r = rows[rows.length - 1]!;
      console.log(
        `${seed} ${id} ${r.year} tier ${tier}: ${r.matches} league matches, ${goals} goals (ledger ${ledgerGoals}), top ${r.topGoals} (${r.topPosition}, ${r.topStarts}/${r.topApps} starts/apps) = ${(100 * r.topShare).toFixed(1)}% in ${r.seconds.toFixed(1)} s`,
      );
      closeSeason(w);
      w.revision++;
    }
  }

const valid = rows.filter((r) => r.tier === 0 && r.matches > 0);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const shares = valid.map((r) => r.topShare);
const m = mean(shares);
const sd = Math.sqrt(shares.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, shares.length - 1));
const summary = {
  kind: 't689-season-share',
  model,
  design: `${country} top-flight takeovers in ${year}, whole league seasons as a career plays them`,
  seeds,
  clubs,
  seasons,
  clubSeasons: valid.length,
  goalsPerMatch: mean(valid.map((r) => (r.goals + r.conceded) / r.matches)),
  ownGoalsPerMatch: mean(valid.map((r) => r.goals / r.matches)),
  topShare: {
    mean: m,
    sd,
    ci: [m - (1.96 * sd) / Math.sqrt(shares.length), m + (1.96 * sd) / Math.sqrt(shares.length)],
  },
  topGoals: mean(valid.map((r) => r.topGoals)),
  topStartShare: mean(valid.map((r) => r.topStarts / Math.max(1, r.matches))),
  ledgerMismatches: valid.filter((r) => r.ledgerGoals !== r.goals).length,
  seconds: (Date.now() - t0) / 1000,
  rows,
};
console.log(
  `${valid.length} club-seasons: own goals ${summary.ownGoalsPerMatch.toFixed(2)} a match, top share ${(100 * m).toFixed(1)}% [${(100 * summary.topShare.ci[0]).toFixed(1)}, ${(100 * summary.topShare.ci[1]).toFixed(1)}], top ${summary.topGoals.toFixed(1)} goals, starts ${(100 * summary.topStartShare).toFixed(0)}%, ledger mismatches ${summary.ledgerMismatches}`,
);
if (out) writeFileSync(out, JSON.stringify(summary, null, 1) + '\n');
