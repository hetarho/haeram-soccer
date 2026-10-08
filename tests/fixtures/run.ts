import type { Founding, World, Command } from '../../packages/contracts/src/types';
import {
  createWorld,
  prepareSeason,
  advanceRound,
  simulateSeason,
  operate,
  clubOf,
} from '../../packages/engine/src/index';
import { currency, priceIndex } from '../../packages/catalogs/src/index';
export interface FixtureDefinition {
  name: string;
  input: Founding;
  year?: number;
  cupQualification?: boolean;
  managerConflict?: boolean;
  commands: Command[];
  expected?: unknown;
}
export function runFixture(definition: FixtureDefinition) {
  const w = createWorld(definition.input);
  if (definition.year) {
    w.year = definition.year;
    w.currency = currency(definition.input.country, w.year).code;
    w.priceIndex = priceIndex(definition.input.country, w.year).value;
    w.manager.since = w.year;
    w.manager.until = w.year + 3;
    for (const p of w.players) {
      p.born = w.year - 24;
      p.until = w.year + 2;
    }
  }
  if (definition.managerConflict) {
    w.manager.philosophy = 'balanced';
    w.manager.flexibility = 0;
    w.manager.pride = 90;
    w.manager.trust = 30;
    w.tactic = 'balanced';
  }
  if (definition.cupQualification)
    w.lastChampions = [
      {
        country: definition.input.country,
        club: w.clubs.find((c) => c.country === definition.input.country && c.tier === 0)!.id,
        cup: w.playerClub,
      },
    ];
  prepareSeason(w);
  for (const command of definition.commands) {
    if (command.type === 'advance') for (let i = 0; i < command.rounds; i++) advanceRound(w);
    else if (command.type === 'season') for (let i = 0; i < command.count; i++) simulateSeason(w);
    else if (command.type !== 'advance-to-event') operate(w, command);
  }
  return facts(w);
}
function facts(w: World) {
  return {
    year: w.year,
    round: w.round,
    revision: w.revision,
    cash: w.cash,
    currency: w.currency,
    income: w.income,
    expense: w.expense,
    tactic: w.tactic,
    manager: {
      id: w.manager.id,
      name: w.manager.name,
      trust: w.manager.trust,
      conflicts: w.manager.conflicts,
      interim: w.manager.interim,
      pending: w.manager.pending || null,
    },
    club: { id: w.playerClub, tier: clubOf(w).tier, fans: clubOf(w).fans, lower: w.lower },
    players: w.players.map((p) => ({ id: p.id, status: p.status, wage: p.wage, career: p.career })),
    matches: w.ownMatches.map((m) => ({
      id: m.id,
      score: m.score,
      metrics: m.metrics,
      players: m.players,
      highlights: m.highlights,
      tactics: m.tactics,
    })),
    history: w.history.map((h) => ({
      year: h.year,
      rank: h.rank,
      points: h.points,
      cash: h.cash,
      currency: h.currency,
      champions: h.champions,
      europe: h.europe,
    })),
    events: w.events.map((e) => ({ kind: e.kind, title: e.title, amount: e.amount || null })),
    euro: w.europe.map((t) => ({
      key: t.key,
      field: t.field,
      clubs: t.clubs,
      fixtures: t.fixtures.map((f) => ({
        id: f.id,
        home: f.home,
        away: f.away,
        round: f.round,
        score: f.score || null,
      })),
    })),
  };
}
