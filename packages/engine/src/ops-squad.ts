import type { Command, World } from '../../contracts/src/types';
import { activePlayers, addEvent, clubOf, makePlayer, overall, quote } from './world';
import { hash, integer, random } from './primitives';
import { moneyLabel } from './finance';
import { setLineup } from './strategy';
import { setTrainingFocus } from './training';
import { staffEffects } from './staff';
import { promoteYouth, releaseYouth } from './academy';
import { assertTransferWindow, placeBid, respondBid, setTransferStance } from './transfers';
import { careOffer, outcomeText, resolveCare } from './care';
import { policyEffects, policyOf } from './policy';
import { buildEffects } from './build';
import { synergyEffects } from './synergy';
import { credit, debit } from './operations';

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
      | 'training'
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
export function transferOffers(w: World, year = w.year, legacy = false) {
  const roles = ['GK', 'DEF', 'MID', 'FWD'] as const;
  const profile = policyEffects(policyOf(w)).offer,
    scouting = staffEffects(w),
    build = buildEffects(w),
    synergy = synergyEffects(w);
  const count = Math.max(4, scouting.scoutCandidates + build.marketCandidates);
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
    ].join(','),
  )
    .toString(36)
    .padStart(7, '0');
  return Array.from({ length: count }, (_, i) => {
    const id = legacy ? `market:${year}:${i}` : `market:${year}:${sig}:${i}`;
    const r = random(`${w.seed}:${id}`);
    const p = makePlayer(
      clubOf(w).country,
      w.seed,
      id,
      year,
      Math.min(95, integer(r, profile.ability[0], profile.ability[1]) + build.marketAbility),
      roles[i % 4],
      integer(r, profile.age[0], profile.age[1]),
    );
    const potentialBonus =
      profile.potentialBonus +
      scouting.scoutPotential +
      build.marketPotential +
      synergy.marketPotential;
    // A ceiling is never below what the player already shows.
    p.potential = Math.max(overall(p), Math.min(99, p.potential + potentialBonus));
    return {
      player: p,
      fee: quote(
        clubOf(w).country,
        year,
        i === 0
          ? 0
          : Math.max(
              0,
              Math.round(
                ((overall(p) - 25) * 9 + (p.potential - overall(p)) * 3) *
                  profile.feeMultiplier *
                  scouting.feeMultiplier *
                  synergy.feeMultiplier,
              ),
            ),
      ),
      loanFee: quote(clubOf(w).country, year, Math.max(15, overall(p) * 1.5)),
      /** A player without a club signs outside transfer windows. */
      freeAgent: i === 0,
      available: !w.players.some((owned) => owned.id === p.id),
    };
  });
}
export function squadCommand(w: World, cmd: SquadCommand) {
  switch (cmd.type) {
    case 'contract-offer':
    case 'contract-decline':
      // Rules 1.16 commands are refused, never ignored, until their rules land.
      throw new Error(`${cmd.type} 명령은 아직 지원하지 않습니다.`);
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
    case 'training':
      setTrainingFocus(w, cmd.focus);
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
      if (activePlayers(w).length >= 26) throw new Error('선수단 정원은 26명입니다.');
      assertTransferWindow(w, o.freeAgent && !cmd.loan);
      const cost = cmd.loan ? o.loanFee : o.fee;
      debit(w, cost);
      if (cmd.loan) o.player.loanUntil = w.year + 1;
      w.players.push(o.player);
      addEvent(
        w,
        'transfer-in',
        `${o.player.name} ${cmd.loan ? '임대' : '영입'}`,
        `${o.player.role} · ${w.year - o.player.born}세 · 연봉 ${moneyLabel(w, o.player.wage)} · 계약 ${o.player.until}년`,
        cost,
      );
      break;
    }
    case 'transfer-stance':
      setTransferStance(w, cmd.id, cmd.stance);
      break;
  }
}
