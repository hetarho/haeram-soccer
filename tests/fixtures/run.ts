import { detectMediations } from '../../packages/engine/src/mediation';
import { careerDate } from '../../packages/engine/src/person-careers';
import { transferOffers } from '../../packages/engine/src/index';
import { lineOf } from '../../packages/engine/src/player';
import { legacySettings } from '../../packages/engine/src/responsibilities';
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
import { DISABLED_RELEASE } from './worlds';
export interface FixtureDefinition {
  name: string;
  input: Founding;
  year?: number;
  cupQualification?: boolean;
  managerConflict?: boolean;
  currentRules?: boolean;
  setup?: 'announced-player' | 'financial-conflict';
  commands: Command[];
  expected?: unknown;
}
export function runFixture(definition: FixtureDefinition) {
  // Freeze the portable v1 scenarios to their original authority, independently of new-game
  // defaults: the pre-feature match model they were recorded on (the released full model of new
  // careers, T286, is not part of portable v1) and, unless asked, the original settings.
  const w = createWorld(definition.input, DISABLED_RELEASE);
  if (!definition.currentRules) w.settings = legacySettings(2);
  if (definition.year) {
    // A synthetic start epoch establishes identities there, rather than changing retained births.
    delete w.people;
    w.year = definition.year;
    w.currency = currency(definition.input.country, w.year).code;
    w.priceIndex = priceIndex(definition.input.country, w.year).value;
    w.manager.since = w.year;
    w.manager.until = w.year + 3;
    for (const p of w.players) {
      p.born = w.year - 24;
      p.joined = w.year;
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
  // Explicit synthetic setup is portable input, followed only by normal engine commands.
  if (definition.setup === 'announced-player') {
    const p = w.players[6],
      person = w.people![p.id];
    p.born = w.year - 35;
    p.retiring = w.year;
    p.qualities = { understanding: 4, teaching: 4, judgement: 4 };
    p.personality.professionalism = 4;
    Object.assign(person, {
      born: p.born,
      qualities: { ...p.qualities },
      professionalism: 4,
      intention: { at: careerDate(w), draw: 0.55, willing: false },
      retirement: { announced: careerDate(w), year: w.year },
    });
    w.cash = '999999999';
  }
  if (definition.setup === 'financial-conflict') {
    w.cash = '0';
    const offer = transferOffers(w).find((o) => o.available && lineOf(o.player.position) === 'MF')!;
    w.shortlist = {
      year: w.year,
      day: 0,
      entries: [{ playerId: offer.player.id, line: 'MF' }],
      requests: [{ kind: 'short', line: 'MF', pick: offer.player.id }],
    };
    detectMediations(w);
  }
  for (const command of definition.commands) {
    if (command.type === 'advance') for (let i = 0; i < command.rounds; i++) advanceRound(w);
    else if (command.type === 'season') for (let i = 0; i < command.count; i++) simulateSeason(w);
    else operate(w, command);
  }
  return facts(w, definition.currentRules);
}
function facts(w: World, currentRules = false) {
  return {
    ...(currentRules
      ? {
          settings: w.settings,
          direction: w.direction ?? {},
          careers: Object.values(w.people ?? {}).filter((p) => p.formerOwn),
          playingCoachProposals: w.playingCoachProposals ?? {},
          mediations: w.mediations ?? [],
          promises: w.promises ?? [],
          recruitmentArrivals: w.recruitmentArrivals ?? [],
        }
      : {}),
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
