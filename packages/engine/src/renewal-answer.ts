/** One renewal calculation for every club (→CLUB-54); no global random draws. */
import type { Grade } from '../../contracts/src/player';
import type { Club, Player, World } from '../../contracts/src/types';
import { loyaltyTerm } from './loyalty';
import { divisionFor } from './market-prices';
import { ambitionWeight, wageRatio } from './personal-terms';
import { exp, log } from './portable-math';
import { overall } from './player-state';
import { random } from './primitives';
import { higherReputationBid, renewalWindow } from './renewal-bids';
import type { FactorLine } from './sale-answer';
import { startingSquad } from './world';

export const RENEWAL = {
  base: 1.5,
  wage: 1.5,
  wageCap: 2.5,
  division: -1.2,
  higherBid: -0.6,
  starter: 0.4,
  bench: -0.9,
  olderAge: 30,
  older: 0.5,
  veteranAge: 33,
  veteran: 1,
  distress: -0.5,
  prospectAge: 23,
  prospectAbove: 5,
  veteranTermAge: 31,
  maxTerm: 3,
} as const;
export interface RenewalContext {
  floor: string;
  offer: string;
  divisionsAbove: number;
  ambition: Grade;
  age: number;
  higherBid: boolean;
  starts: boolean;
  loyalty: number;
  distress: boolean;
}
export function renewalChance(c: RenewalContext) {
  const lines: FactorLine[] = [];
  const add = (
    factor: string,
    delta: number,
    message: FactorLine['message'],
    params: FactorLine['params'] = {},
  ) => lines.push({ factor, delta, message, params });
  const share = wageRatio({ demand: c.floor, offer: c.offer });
  if (BigInt(c.offer) > BigInt(c.floor))
    add('wage', RENEWAL.wage * log(Math.min(share, RENEWAL.wageCap)), 'renewal.factor.wage', {
      percent: Math.round(share * 100),
    });
  if (c.divisionsAbove > 0)
    add(
      'division',
      RENEWAL.division * c.divisionsAbove * ambitionWeight(c.ambition, c.age),
      'market.terms.division.suited',
      { divisions: c.divisionsAbove },
    );
  if (c.higherBid)
    add(
      'higherBid',
      RENEWAL.higherBid * ambitionWeight(c.ambition, c.age),
      'renewal.factor.higherBid',
    );
  add(
    'playingTime',
    c.starts ? RENEWAL.starter : RENEWAL.bench,
    c.starts ? 'renewal.factor.starter' : 'renewal.factor.bench',
  );
  if (c.age >= RENEWAL.olderAge)
    add(
      'age',
      c.age >= RENEWAL.veteranAge ? RENEWAL.veteran : RENEWAL.older,
      'renewal.factor.age',
      { age: c.age },
    );
  if (c.loyalty > 0) add('loyalty', c.loyalty, 'renewal.factor.loyalty');
  if (c.distress) add('distress', RENEWAL.distress, 'renewal.factor.distress');
  const logOdds = lines.reduce<number>((sum, l) => sum + l.delta, RENEWAL.base);
  return {
    chance: BigInt(c.offer) < BigInt(c.floor) ? 0 : 1 / (1 + exp(-logOdds)),
    logOdds,
    lines,
  };
}
export function renewalContext(
  w: World,
  club: Club,
  player: Player,
  floor: string,
  offer = floor,
  year = w.year,
): RenewalContext {
  return {
    floor,
    offer,
    divisionsAbove: Math.max(0, club.tier - divisionFor(club.country, overall(player))),
    ambition: player.personality.ambition,
    age: year - player.born,
    higherBid: higherReputationBid(w, player, club),
    starts: startingSquad(w, club).some((p) => p.id === player.id),
    loyalty: loyaltyTerm(player, year),
    distress: !!(club.id === w.playerClub ? w.distress : club.books?.distress)?.stage,
  };
}
/** Keyed solely by player, season and last real window; previews never consume a draw. */
export function renewalAnswer(w: World, p: Player, context: RenewalContext) {
  const { year, window } = renewalWindow(w);
  const read = renewalChance(context);
  return { ...read, accept: random(`${w.seed}:renew:${p.id}:${year}:${window}`)() < read.chance };
}
