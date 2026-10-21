/** Explicitly synthetic ability setup; every score and club contribution comes from real matches. */
import {
  createWorld,
  activePlayers,
  advanceRound,
  ownLeagueClubs,
  respondBid,
} from '../../packages/engine/src/index';
import { ATTRIBUTES } from '../../packages/contracts/src/player';
import type { World } from '../../packages/contracts/src/types';
/** `prepare` sets the founded world up before anything is played, as a match model's activation. */
export function transferredScorerWorld(prepare?: (w: World) => unknown) {
  const w = createWorld({
    country: 'ENG',
    name: 'Synthetic Transfer Scorer',
    color: '#224433',
    // A seed where the summary-path own league (T224) still leaves him a top-ten scorer.
    seed: 'transferred-scorer-c',
    level: 'easy',
  });
  prepare?.(w);
  w.cash = '999999999999';
  const player = activePlayers(w).find((p) => p.position === 'ST')!;
  for (const key of ATTRIBUTES) player.attrs[key] = 99;
  player.potential = 99;
  for (let round = 0; round < 3; round++) advanceRound(w, undefined, false);
  // The league's strongest club makes the most chances, so he stays among the season's top ten.
  const buyer = ownLeagueClubs(w)
    .filter((c) => c.id !== w.playerClub)
    .reduce((best, c) => (c.strength > best.strength ? c : best));
  (w.bids ??= []).push({
    id: 'in:scorer-transfer',
    direction: 'in',
    playerId: player.id,
    club: buyer.id,
    fee: '100000',
    year: w.year,
    day: w.calendar!.day,
    due: w.calendar!.day + 3,
    status: 'pending',
  });
  respondBid(w, 'in:scorer-transfer', true);
  advanceRound(w, undefined, false);
  return { w, playerId: player.id, buyer: buyer.id };
}
