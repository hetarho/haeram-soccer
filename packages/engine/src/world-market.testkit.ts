/** Minimal synthetic market: three clubs and their present squads, no world generation/matches. */
import { CURRENT_ENGINE_VERSION } from '../../contracts/src/versions';
import type { Club, Position, World } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { invalidateNpcSquad, makeManager, makePlayer, squadPlaces } from './world';
import { scoutReach } from './scout-search';

/** An explicit eligible candidate at the scout's ceiling, enrolled at his club or in the pool. */
export function marketCandidate(w: World, club: Club | undefined, position: Position, age = 22) {
  const own = w.clubs.find((c) => c.id === w.playerClub)!;
  const level = scoutReach(w).ability[1];
  const p = makePlayer(
    club?.country ?? own.country,
    w.seed,
    `${club?.id ?? own.id}:fixture:${position}:${age}`,
    w.year,
    level,
    position,
    age,
    club?.tier ?? own.tier,
  );
  for (const attribute of ATTRIBUTES) p.attrs[attribute] = level;
  p.potential = 99;
  if (club) {
    ((w.squads ??= {})[club.id] ??= []).push(p);
    invalidateNpcSquad(w, club.id);
  } else w.freeAgents = [...(w.freeAgents ?? []), { ...p, freeSince: w.year }];
  w.revision++;
  return p;
}

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
    engine: CURRENT_ENGINE_VERSION,
    catalog: 'synthetic',
    catalogHash: 'synthetic',
    id: 'market-world',
    seed: 'market-unit',
    year: 1950,
    round: 0,
    revision: 1,
    calendar: { day: 3 },
    playerClub: 'own',
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
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
    ticket: 0.05,
    campaigns: [],
    cupWinners: {},
    europe: [],
    lastChampions: [],
    receiptIds: [],
  };
}
