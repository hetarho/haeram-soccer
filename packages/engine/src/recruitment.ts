import type { Role, World } from '../../contracts/src/types';
import { SEASON_ROUNDS, nextOwnFixture } from './calendar';
import { operatingCost, transferOffers } from './operations';
import { activePlayers, clubOf, overall, startingSquad } from './world';
import { compareIds } from './primitives';
import { lineupSummary, npcTactic, tacticalProfile } from './strategy';

export type TransferOffer = ReturnType<typeof transferOffers>[number];

/** A simple current-XI need, without claiming the role guarantees better match results. */
export function recruitmentRoleNeed(w: World): Role {
  const starters = startingSquad(w, clubOf(w));
  const roles: Role[] = ['GK', 'DEF', 'MID', 'FWD'];
  return roles
    .map((role, index) => {
      const players = starters.filter((player) => player.role === role);
      const quality = players.length
        ? players.reduce((sum, player) => sum + overall(player) - player.fatigue / 6, 0) /
          players.length
        : 0;
      return { role, index, quality };
    })
    .sort((a, b) => a.quality - b.quality || a.index - b.index)[0].role;
}

/** Pure hypothetical preview. Recruitment never changes a saved manual XI on its own. */
export function recruitmentPreview(w: World, offer: TransferOffer, loan = false) {
  const own = clubOf(w),
    before = startingSquad(w, own),
    manual = !!w.lineup,
    alreadyOwned = w.players.some((player) => player.id === offer.player.id),
    full = activePlayers(w).length >= 26;
  let after = before;
  if (!alreadyOwned) {
    if (manual) {
      const replacement = before
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => player.role === offer.player.role)
        .sort(
          (a, b) =>
            overall(a.player) - a.player.fatigue / 5 - (overall(b.player) - b.player.fatigue / 5) ||
            compareIds(a.player.id, b.player.id),
        )[0];
      if (replacement) {
        after = [...before];
        after[replacement.index] = offer.player;
      }
    } else {
      after = startingSquad({ ...w, players: [...w.players, offer.player] }, own);
    }
  }
  const fixture = nextOwnFixture(w),
    opponentId = fixture?.home === w.playerClub ? fixture.away : fixture?.home,
    opponent = w.clubs.find((club) => club.id === opponentId),
    opponentTactic = opponent ? npcTactic(opponent) : 'balanced';
  const beforeStrength = lineupSummary(before).strength,
    afterStrength = lineupSummary(after).strength,
    beforeFit = tacticalProfile(before, w.tactic, opponentTactic).fit,
    afterFit = tacticalProfile(after, w.tactic, opponentTactic).fit;
  const fee = loan ? offer.loanFee : offer.fee,
    wage = offer.player.wage,
    annualAfter = BigInt(operatingCost(w)) + BigInt(wage),
    cashAfter = BigInt(w.cash) - BigInt(fee),
    affordable = BigInt(w.cash) >= BigInt(fee),
    eligible = offer.available && !alreadyOwned && !full,
    willStart = !manual && !alreadyOwned && after.some((player) => player.id === offer.player.id);
  const runway =
    cashAfter > 0n && annualAfter > 0n ? (cashAfter * BigInt(SEASON_ROUNDS)) / annualAfter : 0n;
  const reason =
    !offer.available || alreadyOwned
      ? '이미 계약한 선수입니다.'
      : full
        ? '선수단 정원 26명입니다.'
        : !affordable
          ? '보유 자금이 부족합니다.'
          : manual
            ? '수동 선발 교체 시 예상입니다. 영입 후 선발을 직접 정하세요.'
            : willStart
              ? '현재 능력과 피로 기준으로 자동 선발 후보입니다.'
              : '현재 자동 선발은 유지됩니다. 로테이션 후보로 비교하세요.';
  return {
    beforeStrength,
    afterStrength,
    strengthDelta: afterStrength - beforeStrength,
    beforeFit,
    afterFit,
    fitDelta: afterFit - beforeFit,
    manual,
    willStart,
    fee,
    wage,
    annualAfter: annualAfter.toString(),
    cashAfter: cashAfter.toString(),
    runwayRounds: Number(runway > 999n ? 999n : runway),
    affordable,
    eligible,
    reason,
  };
}
