import { registrationRoom } from './registration';
import type { Position } from '../../contracts/src/types';
import type { Command, World } from '../../contracts/src/types';
import { addEvent, clubOf, makePlayer, overall } from './world';
import { hash, integer, random, ratio } from './primitives';
import {
  declineContract,
  divisionFor,
  MARKET_CONFIG,
  marketValueAt,
  marketWageAt,
  offerContract,
  signingClauses,
} from './contracts';
import { moneyLabel } from './finance';
import { setLineup } from './strategy';
import { staffEffects } from './staff';
import { promoteYouth, releaseYouth } from './academy';
import { assertTransferWindow, placeBid, respondBid, setTransferStance } from './transfers';
import { careOffer, outcomeText, resolveCare } from './care';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { synergyEffects } from './synergy';
import { credit, debit } from './transactions';
import { noteSigning } from './signings';

/** Bids, offers, stances, lineup, training, the academy, owner requests and contract talks. */
export type SquadCommand = Extract<
  Command,
  {
    type:
      | 'bid'
      | 'respond-bid'
      | 'recruit'
      | 'transfer-stance'
      | 'lineup'
      | 'promote-youth'
      | 'release-youth'
      | 'care'
      | 'contract-offer'
      | 'contract-decline';
  }
>;

/**
 * The season market. Each combination of the settings that shape the list draws its own
 * candidates under its own IDs (→CLUB-14, →ECON-16), so switching a setting away and back shows
 * the same list again. `year` and `legacy` reproduce a list under the `market:<year>:<i>` IDs of
 * rules before 1.15.0 for the bids pending from then.
 */
/**
 * The positions market candidates cycle through (→CLUB-14): the lines in turn, as the four roles
 * were, and within each line its positions in turn.
 */
const MARKET_LINES: readonly (readonly Position[])[] = [
  ['GK'],
  ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  ['CM', 'DM', 'AM', 'LM', 'RM'],
  ['ST', 'LW', 'RW'],
];
const marketPosition = (i: number) => {
  const line = MARKET_LINES[i % MARKET_LINES.length]!;
  return line[Math.floor(i / MARKET_LINES.length) % line.length]!;
};
/** Marks a candidate from abroad in his id, so his origin stays with him after he signs. */
const FOREIGN_MARK = 'f';
export const isForeignCandidate = (id: string) => /^market:\d+:[^:]+:f\d+$/.test(id);
export function transferOffers(w: World, year = w.year, legacy = false) {
  const policy = policyEffects(policyOf(w)),
    profile = policy.offer,
    scouting = staffEffects(w),
    build = buildEffects(w),
    synergy = synergyEffects(w);
  // 해외 스카우트망 widens the list and lifts its ceilings (→ECON-16).
  const count = Math.max(
    4,
    scouting.scoutCandidates + build.marketCandidates + policy.scoutCandidates,
  );
  const sig = hash(
    [
      ...profile.ability,
      ...profile.age,
      profile.potentialBonus,
      profile.feeMultiplier,
      scouting.scoutCandidates,
      scouting.scoutPotential,
      scouting.feeMultiplier,
      build.marketCandidates,
      build.marketAbility,
      build.marketPotential,
      synergy.marketPotential,
      synergy.feeMultiplier,
      ...(policy.scoutCandidates ? [policy.scoutCandidates, policy.scoutPotential] : []),
    ].join(','),
  )
    .toString(36)
    .padStart(7, '0');
  const own = clubOf(w),
    feeMultiplier = profile.feeMultiplier * scouting.feeMultiplier * synergy.feeMultiplier;
  return Array.from({ length: count }, (_, i) => {
    // The candidates 해외 스카우트망 adds come from abroad (→PLAYER-11).
    const foreign = i >= count - policy.scoutCandidates;
    const id = legacy
      ? `market:${year}:${i}`
      : `market:${year}:${sig}:${foreign ? FOREIGN_MARK : ''}${i}`;
    const r = random(`${w.seed}:${id}`);
    const p = makePlayer(
      own.country,
      w.seed,
      id,
      year,
      Math.min(95, integer(r, profile.ability[0], profile.ability[1]) + build.marketAbility),
      marketPosition(i),
      integer(r, profile.age[0], profile.age[1]),
      own.tier,
    );
    const potentialBonus =
      profile.potentialBonus +
      scouting.scoutPotential +
      build.marketPotential +
      synergy.marketPotential +
      policy.scoutPotential;
    // A ceiling is never below what the player already shows.
    p.potential = Math.max(overall(p), Math.min(99, p.potential + potentialBonus));
    // He would join on our division's market wage; his club sells at the market of the division
    // his ability suits (→CLUB-25). A free agent has no club to ask a fee.
    p.wage = marketWageAt(own.country, year, own.tier, p);
    const value = marketValueAt(own.country, year, divisionFor(own.country, overall(p)), p);
    const share = (multiplier: number) =>
      i === 0 ? '0' : ratio(value, BigInt(Math.round(multiplier * 1000)), 1000n);
    return {
      player: p,
      fee: share(feeMultiplier),
      loanFee: share(MARKET_CONFIG.loan),
      /** A player without a club signs outside transfer windows. */
      freeAgent: i === 0,
      available: !w.players.some((owned) => owned.id === p.id),
    };
  });
}
export function squadCommand(w: World, cmd: SquadCommand) {
  switch (cmd.type) {
    case 'contract-offer':
      offerContract(w, cmd.player, cmd.wage, cmd.term);
      break;
    case 'contract-decline':
      declineContract(w, cmd.player);
      break;
    case 'promote-youth':
      promoteYouth(w, cmd.id);
      break;
    case 'release-youth':
      releaseYouth(w, cmd.id);
      break;
    case 'bid':
      placeBid(w, cmd.candidate, cmd.fee, cmd.loan);
      break;
    case 'respond-bid':
      respondBid(w, cmd.id, cmd.accept);
      break;
    case 'lineup':
      setLineup(w, cmd.ids);
      break;
    case 'care': {
      const offer = careOffer(w, cmd.kind);
      if (!offer.available) throw new Error(`${offer.label} · ${offer.reason}`);
      if (BigInt(offer.cost) > 0n) debit(w, offer.cost);
      if (BigInt(offer.income) > 0n) credit(w, offer.income);
      const outcome = resolveCare(w, cmd.kind);
      addEvent(
        w,
        `care:${cmd.kind}`,
        offer.label,
        `${offer.by} · ${outcomeText(outcome)}${offer.outcomes.length > 1 ? ` (${outcome.chance}% 결과)` : ''} · ${offer.cooldown}라운드 뒤 다시 가능`,
        BigInt(offer.cost) > 0n ? offer.cost : BigInt(offer.income) > 0n ? offer.income : undefined,
      );
      break;
    }
    case 'recruit': {
      const o = transferOffers(w)[cmd.candidate];
      if (!o?.available) throw new Error('이미 계약했거나 없는 선수입니다.');
      const room = registrationRoom(w, {
        ...o.player,
        joined: w.year,
        ...(cmd.loan ? { loanUntil: w.year + 1 } : {}),
      });
      if (room) throw new Error(room);
      assertTransferWindow(w, o.freeAgent && !cmd.loan);
      const cost = cmd.loan ? o.loanFee : o.fee;
      debit(w, cost);
      // A loan keeps his club's contract; a signing has its own clauses (→CLUB-29).
      if (cmd.loan) o.player.loanUntil = w.year + 1;
      else o.player.clauses = signingClauses(w, o.player);
      w.players.push(o.player);
      noteSigning(w, o.player);
      addEvent(
        w,
        'transfer-in',
        `${o.player.name} ${cmd.loan ? '임대' : '영입'}`,
        `${o.player.position} · ${w.year - o.player.born}세 · 연봉 ${moneyLabel(w, o.player.wage)} · 계약 ${o.player.until}년`,
        cost,
      );
      break;
    }
    case 'transfer-stance':
      setTransferStance(w, cmd.id, cmd.stance);
      break;
  }
}
