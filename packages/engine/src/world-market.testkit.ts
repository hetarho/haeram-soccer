/** Minimal synthetic market: three clubs and their present squads, no world generation/matches. */
import type { Club, World } from '../../contracts/src/types';
import { makeManager, makePlayer, squadPlaces } from './world';

export function worldMarketFixture(): World {
  const club = (id: string, country: string, strength: number): Club => ({
    id,
    country,
    strength,
    name: id,
    short: id,
    tier: 0,
    group: 0,
    color: '#224466',
    reputation: 40,
    fans: 800,
  });
  const clubs = [
    club('own', 'ENG', 40),
    club('foreign', 'ESP', 55),
    club('representative', 'HUN', 45),
  ];
  return {
    schema: 1,
    engine: '0.7.0',
    catalog: 'synthetic',
    catalogHash: 'synthetic',
    id: 'market-world',
    seed: 'market-unit',
    year: 1950,
    round: 0,
    revision: 1,
    calendar: { day: 3 },
    playerClub: 'own',
    level: 'easy',
    clubs,
    players: squadPlaces('balanced').map((slot, i) =>
      makePlayer('ENG', 'market-unit', `own:${i}`, 1950, 40, slot.position, 22, 0),
    ),
    manager: makeManager('ENG', 'market-unit', 1950, 1),
    tactic: 'balanced',
    fixtures: [],
    tables: {},
    ownMatches: [],
    history: [],
    events: [],
    cash: '999999999999',
    income: '0',
    expense: '0',
    currency: 'GBP',
    priceIndex: 1,
    support: 800,
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
    ticket: 0.05,
    campaigns: [],
    cupWinners: {},
    europe: [],
    lastChampions: [],
    lower: false,
    receiptIds: [],
  };
}
