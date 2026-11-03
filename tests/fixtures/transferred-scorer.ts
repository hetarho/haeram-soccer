/** Explicitly synthetic ability setup; every score and club contribution comes from real matches. */
import {
  activePlayers,
  advanceRound,
  MATCH_MODEL_RELEASE,
  ownLeagueClubs,
  respondBid,
  type MatchModelRelease,
} from '../../packages/engine/src/index';
import { careerWorld } from '../../packages/engine/src/career.testkit';
import { ATTRIBUTES } from '../../packages/contracts/src/player';
import type { World } from '../../packages/contracts/src/types';
/**
 * `prepare` sets the taken-over world up before anything is played, as a match model's activation;
 * `release` takes it over (default the switch as it stands).
 */
export function transferredScorerWorld(
  prepare?: (w: World) => unknown,
  release: MatchModelRelease = MATCH_MODEL_RELEASE,
) {
  // A seed where the summary-path own league (T224) still leaves him a top-ten scorer of the
  // takeover's 24-club division: 6th with seed d on the pre-feature path (T683), where c left him
  // 15th once careers became takeovers.
  const w = careerWorld({ country: 'ENG', seed: 'transferred-scorer-d' }, release);
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
