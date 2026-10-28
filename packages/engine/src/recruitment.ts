import { registrationRoom } from './registration';
import type { Line, World } from '../../contracts/src/types';
import { LINES } from '../../contracts/src/player';
import { SEASON_ROUNDS, nextOwnFixture } from './calendar';
import { operatingCost } from './transactions';
import { transferOffers } from './ops-squad';
import { clubOf, fatigueLoad, formationOf, lineOfPlayer, overall, slotOvr } from './player-state';
import { startingSquad } from './world';
import { compareIds } from './primitives';
import { adaptationMultiplier, adaptationStart, ADAPTATION_NEUTRAL } from './player';
import { isForeignCandidate } from './ops-squad';
import { lineupSummary, npcTactic, tacticalProfile } from './strategy';

export type TransferOffer = ReturnType<typeof transferOffers>[number] & { foreign?: boolean };

/** A simple current-XI need, without claiming the line guarantees better match results. */
export function recruitmentLineNeed(w: World): Line {
  const starters = startingSquad(w, clubOf(w));
  return LINES.map((role, index) => {
    const players = starters.filter((player) => lineOfPlayer(player) === role);
    const quality = players.length
      ? players.reduce(
          (sum, player) => sum + overall(player) - fatigueLoad(player.fatigue) / 6,
          0,
        ) / players.length
      : 0;
    return { role, index, quality };
  }).sort((a, b) => a.quality - b.quality || a.index - b.index)[0].role;
}

/** Shared baseline for fit filtering: compute our XI and opponent once per query. */
export function recruitmentContext(w: World) {
  const before = startingSquad(w, clubOf(w));
  const fixture = nextOwnFixture(w),
    opponentId = fixture?.home === w.playerClub ? fixture.away : fixture?.home,
    opponent = w.clubs.find((club) => club.id === opponentId),
    opponentTactic = opponent ? npcTactic(opponent) : 'balanced';
  return {
    before,
    opponentTactic,
    beforeStrength: lineupSummary(before, w.tactic).strength,
    beforeFit: tacticalProfile(before, w.tactic, opponentTactic).fit,
  };
}

/** Only selection/fit facts, without registration, financial runway or a full signing preview. */
export function recruitmentFit(w: World, offer: TransferOffer, context = recruitmentContext(w)) {
  const { before, opponentTactic, beforeStrength, beforeFit } = context;
  const manual = !!w.lineup,
    alreadyOwned = w.players.some(
      (player) => player.id === offer.player.id && player.status === 'active',
    );
  // He arrives at the adaptation his signing starts him at (→PLAYER-11), not settled.
  const arriving = {
    ...offer.player,
    adaptation: adaptationStart(
      offer.player.personality.adaptability,
      (offer.foreign ?? isForeignCandidate(offer.player.id)) ? 'abroad' : 'domestic',
    ),
  };
  let after = before;
  if (!alreadyOwned) {
    if (manual) {
      const replacement = before
        .map((player, index) => ({ player, index }))
        .filter(({ player }) => lineOfPlayer(player) === lineOfPlayer(offer.player))
        .sort(
          (a, b) =>
            overall(a.player) - a.player.fatigue / 5 - (overall(b.player) - b.player.fatigue / 5) ||
            compareIds(a.player.id, b.player.id),
        )[0];
      if (replacement) {
        after = [...before];
        after[replacement.index] = arriving;
      }
    } else {
      // A returning player replaces his retained historical row rather than adding a second ID.
      after = startingSquad(
        { ...w, players: [...w.players.filter((p) => p.id !== arriving.id), arriving] },
        clubOf(w),
      );
    }
  }
  // The slot he would take (→CLUB-14): where he beats the starter by most at the slot, else the
  // weakest of his main position's; his 실효 OVR there on arrival and once settled (→PLAYER-11).
  const slots = formationOf(w.tactic);
  const scored = slots.map((place, index) => ({
    index,
    place,
    gain: slotOvr(arriving, place) - slotOvr(before[index]!, place),
  }));
  const best = [...scored].sort((a, b) => b.gain - a.gain || a.index - b.index)[0]!;
  const home = scored
    .filter(({ place }) => place.position === offer.player.position)
    .sort((a, b) => b.gain - a.gain || a.index - b.index)[0];
  const taken = best.gain > 0 || !home ? best : home;
  const slot = {
    index: taken.index,
    position: taken.place.position,
    role: taken.place.role,
    arrival: Math.round(slotOvr(arriving, taken.place, adaptationMultiplier(arriving.adaptation))),
    settled: Math.round(slotOvr(arriving, taken.place, adaptationMultiplier(ADAPTATION_NEUTRAL))),
  };
  const afterStrength = lineupSummary(after, w.tactic).strength,
    afterFit = tacticalProfile(after, w.tactic, opponentTactic).fit;
  return {
    slot,
    beforeStrength,
    afterStrength,
    strengthDelta: afterStrength - beforeStrength,
    beforeFit,
    afterFit,
    fitDelta: afterFit - beforeFit,
    manual,
    willStart: !manual && !alreadyOwned && after.some((player) => player.id === offer.player.id),
  };
}

/** Pure hypothetical preview. Recruitment never changes a saved manual XI on its own. */
export function recruitmentPreview(w: World, offer: TransferOffer, loan = false) {
  const alreadyOwned = w.players.some(
      (player) => player.id === offer.player.id && player.status === 'active',
    ),
    registrationReason = registrationRoom(w, {
      ...offer.player,
      joined: w.year,
      ...(loan ? { loanUntil: w.year + 1 } : {}),
    }),
    full = !!registrationReason,
    fit = recruitmentFit(w, offer);
  const fee = loan ? offer.loanFee : offer.fee,
    wage = offer.player.wage,
    annualAfter = BigInt(operatingCost(w)) + BigInt(wage),
    cashAfter = BigInt(w.cash) - BigInt(fee),
    affordable = BigInt(w.cash) >= BigInt(fee),
    eligible = offer.available && !alreadyOwned && !full;
  const runway =
    cashAfter > 0n && annualAfter > 0n ? (cashAfter * BigInt(SEASON_ROUNDS)) / annualAfter : 0n;
  const reason =
    !offer.available || alreadyOwned
      ? '이미 계약한 선수입니다.'
      : full
        ? registrationReason!
        : !affordable
          ? '보유 자금이 부족합니다.'
          : fit.manual
            ? '수동 선발 교체 시 예상입니다. 영입 후 선발을 직접 정하세요.'
            : fit.willStart
              ? '현재 능력과 피로 기준으로 자동 선발 후보입니다.'
              : '현재 자동 선발은 유지됩니다. 로테이션 후보로 비교하세요.';
  return {
    ...fit,
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
