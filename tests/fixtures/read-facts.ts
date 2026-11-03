import type { MatchRecord, World } from '../../packages/contracts/src/types';
import { refreshReadModels } from '../../packages/engine/src/read-models';

/** Synthetic facts only: no simulation or browser setup. */
export function facts(): World {
  return {
    year: 1930,
    tables: { own: { played: 0, won: 0 } },
    stadium: 0,
    round: 0,
    playerClub: 'own',
    lower: true,
    clubs: [
      { id: 'own', name: 'Town', country: 'ENG', tier: 0, group: 0, fans: 800 },
      { id: 'rival', name: 'City', country: 'ENG', tier: 0, group: 0 },
    ],
    players: [{ id: 'scorer', name: 'First Name' }],
    ownMatches: [],
    events: [],
    history: [],
    rankHistory: [],
  } as unknown as World;
}
export function result(w: World, n: number, goals = 1): MatchRecord {
  const metrics = () => Array<number>(12).fill(0);
  const player = metrics();
  player[0] = goals;
  player[10] = 90;
  return {
    id: `${w.year}:league:${n}`,
    year: w.year,
    round: n,
    kind: 'league',
    home: 'own',
    away: 'rival',
    score: { home: goals, away: 0 },
    metrics: [metrics(), metrics()],
    highlights: [],
    players: [{ id: 'scorer', metrics: player }],
  } as unknown as MatchRecord;
}
export function play(w: World, n: number, goals = 1) {
  w.round = n;
  w.ownMatches.push(result(w, n, goals));
  refreshReadModels(w);
}
