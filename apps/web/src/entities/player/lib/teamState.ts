import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { squadRegistration } from './squadRegistration';
import { registrationRoom } from '../../../../../../packages/engine/src/registration';
import type {
  Player,
  TrainingCoach,
  TrainingFocus,
  World,
} from '../../../../../../packages/contracts/src/types';
import { lineupSummary } from '../../../../../../packages/engine/src/strategy';
import {
  activePlayers,
  clubOf,
  isInjured,
} from '../../../../../../packages/engine/src/player-state';
import { rating, startingSquad } from '../../../../../../packages/engine/src/world';
import { MORALE_LABEL, moraleOf, moraleState } from '../../../../../../packages/engine/src/morale';
import { fixedCostRunway } from '../../../../../../packages/engine/src/investment';
import { operatingCosts, seasonResult } from '../../../../../../packages/engine/src/finance';
import { academySummary } from '../../../../../../packages/engine/src/academy';
import {
  focusLabel,
  playerTrainingCall,
  trainingCall,
} from '../../../../../../packages/engine/src/coach-training';
import { marketWage } from '../../../../../../packages/engine/src/market-prices';
import { staffMember, STAFF_INFO } from '../../../../../../packages/engine/src/staff-info';
import { ownLeagueIds } from '../../league/@x/player';

export type Tone = 'good' | 'ok' | 'warn' | 'bad';
export type StateKey = 'strength' | 'fatigue' | 'morale' | 'manager' | 'squad' | 'cash';
export interface TeamStateItem {
  key: StateKey;
  label: string;
  value: string;
  status: string;
  tone: Tone;
  /** The state needs the owner's attention (→WEB-44); strength is a comparison and never does. */
  attention?: boolean;
}

/** Weeks of fixed costs as football finance pages say it: weeks when short, months otherwise. */
export function runwayText(rounds: number) {
  if (rounds >= 999) return sourceMessage('copy.teamState.5ab7975f97');
  if (rounds < 13) return sourceMessage('copy.teamState.7248c0ff80', { p0: Math.max(0, rounds) });
  return sourceMessage('copy.teamState.e8e5e6104e', { p0: Math.round(rounds / 4.35) });
}

/** The same prospect/readiness/registration preview as the authoritative academy workflow. */
export function placeAcademy(w: World) {
  const summary = academySummary(w);
  return {
    ...summary,
    players: summary.players.map((prospect) => ({
      ...prospect,
      promotionWage: marketWage(w, prospect.player),
      promotionUnavailable:
        prospect.age < summary.promotionAge
          ? sourceMessage('copy.teamState.56c3e9d63b', { p0: summary.promotionAge })
          : registrationRoom(w, { ...prospect.player, graduate: true, joined: w.year }),
    })),
  };
}

/**
 * A coach's own call for his group, read only (→CLUB-13, CLUB-31): the focus he sets by his rule,
 * that he decides it and why.
 */
export function callLine(w: World, coach: TrainingCoach) {
  const call = trainingCall(w, coach);
  return {
    focus: focusLabel(coach, call.focus),
    by: sourceMessage('copy.teamState.44992f35c1'),
    reason: call.reason,
  };
}
/**
 * One first-team player's focus, read only (→CLUB-11, CLUB-13): the squad's, or his own when the
 * assistant's player rule takes him off it; `squad` is the squad's focus when already known.
 */
export function playerCallLine(w: World, player: Player, squad?: TrainingFocus) {
  const call = playerTrainingCall(w, player, squad);
  return {
    focus: focusLabel('assistant', call.focus),
    own: call.own,
    by: call.own
      ? sourceMessage('copy.teamState.44992f35c1')
      : sourceMessage('copy.teamState.2b780c0a93'),
    reason: call.reason,
  };
}

/** The youth director's own call as the academy place reads it (→WEB-102): who, focus and why. */
export function youthCall(w: World) {
  const call = callLine(w, 'youth');
  return `${STAFF_INFO.youth.label} ${staffMember(w, 'youth')?.name ?? sourceMessage('team.vacant')} · ${call.focus} · ${call.reason}`;
}

/**
 * Our place among the division's strengths (→WEB-44): equal ratings share a place, the top third
 * reads good and the bottom third a warning; a field under three clubs has no bottom third.
 */
export function strengthPlace(ratings: readonly number[], own: number) {
  const of = Math.max(1, ratings.length),
    place = 1 + ratings.filter((value) => value > own).length,
    third = Math.ceil(of / 3);
  const tone: Tone = place <= third ? 'good' : of >= 3 && place > of - third ? 'warn' : 'ok';
  return { place, of, tone };
}

/**
 * The HUD cash sheet's facts (→WEB-44): the next round's fixed costs and a year's by kind, the
 * players' wages always and the other kinds only while they cost anything.
 */
export function fixedCosts(w: World) {
  const costs = operatingCosts(w);
  const kinds = (
    [
      [sourceMessage('copy.FinancialBreakdown.4bdab1482a'), costs.playerWages],
      [sourceMessage('copy.FinancialBreakdown.db1fa5856a'), costs.managerWage],
      [sourceMessage('copy.FinancialBreakdown.cc06b9815f'), costs.staffWages],
      [sourceMessage('copy.FinancialBreakdown.be5fd48c10'), costs.maintenance],
      [sourceMessage('copy.FinancialBreakdown.614f1dbc56'), costs.investment],
      [sourceMessage('copy.FinancialBreakdown.d4527c802c'), costs.academy],
      [sourceMessage('copy.FinancialBreakdown.2d914c9be2'), costs.expenses],
      [sourceMessage('copy.FinancialBreakdown.ddebd211b6'), costs.loan],
    ] as const
  ).filter(
    ([label, amount]) =>
      label === sourceMessage('copy.FinancialBreakdown.4bdab1482a') || BigInt(amount) !== 0n,
  );
  return { nextRound: costs.nextRound, annual: costs.annual, kinds };
}

/**
 * This season's books so far as the club earned and spent them: the owner's injections and
 * dividends move money between his pots, so the result is the dividend's own (→OWNER-11).
 */
export function seasonBooks(w: World) {
  const result = BigInt(seasonResult(w));
  const injected = w.events
    .filter(
      (e) =>
        e.kind === 'owner-injection' && e.year === w.year && e.currency === w.currency && e.amount,
    )
    .reduce((sum, e) => sum + BigInt(e.amount!), 0n);
  const income = BigInt(w.income) - injected;
  return {
    income: income.toString(),
    expense: (income - result).toString(),
    result: result.toString(),
  };
}

/** Cash is shown in the HUD, whose sheet explains it (→WEB-44); it has no summary tile. */
export function cashState(w: World): TeamStateItem {
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const deficit = BigInt(w.cash) < 0n;
  return {
    key: 'cash',
    label: sourceMessage('copy.teamState.4e19f743f8'),
    value: deficit ? sourceMessage('copy.teamState.566c315292') : runwayText(runway),
    status: deficit
      ? sourceMessage('copy.teamState.566c315292')
      : runway >= 30
        ? sourceMessage('copy.teamState.ab2a3b2d53')
        : runway >= 12
          ? sourceMessage('copy.teamState.666599febd')
          : runway >= 5
            ? sourceMessage('copy.teamState.acc90fbf66')
            : sourceMessage('copy.teamState.baaff05e43'),
    tone: deficit || runway < 5 ? 'bad' : runway < 12 ? 'warn' : runway < 30 ? 'ok' : 'good',
    attention: deficit || runway < 12,
  };
}

/**
 * Who can play now (→WEB-44): the active first team, its injured and its suspended players — a
 * player with a ban to serve in any competition (→CLUB-45) — and everyone else available.
 */
export function squadAvailability(w: World) {
  const active = activePlayers(w);
  const banned = new Set(w.discipline?.bans.map((ban) => ban.player));
  const injured = active.filter((p) => isInjured(w, p)).length,
    suspended = active.filter((p) => banned.has(p.id)).length,
    out = active.filter((p) => isInjured(w, p) || banned.has(p.id)).length;
  return { total: active.length, available: active.length - out, injured, suspended, out };
}

/** Current club condition (not season statistics), each marked when it needs the owner. */
export function teamStates(w: World): TeamStateItem[] {
  const fatigue = lineupSummary(startingSquad(w, clubOf(w)), w.tactic).fatigue;
  const morale = moraleOf(w),
    mood = moraleState(morale);
  const trust = Math.round(w.manager.trust),
    interim = w.manager.interim;
  const { total: squad, available: fit, injured, suspended, out } = squadAvailability(w);
  const missing = out
    ? sourceMessage('copy.teamState.69bfe75bb3', { p0: injured, p1: suspended })
    : '';
  const registered = squadRegistration(w);
  const club = clubOf(w),
    strength = rating(w, club),
    field = ownLeagueIds(w).flatMap((id) => {
      if (id === club.id) return [strength];
      const other = w.clubs.find((c) => c.id === id);
      return other ? [rating(w, other)] : [];
    }),
    place = strengthPlace(field, strength);
  return [
    {
      key: 'strength',
      label: sourceMessage('copy.teamState.209c1e2619'),
      value: String(strength),
      status: sourceMessage('copy.teamState.ceebce4632', { p0: place.place, p1: place.of }),
      // A comparison, not a condition to repair: it never needs the owner.
      tone: place.tone,
    },
    {
      key: 'fatigue',
      label: sourceMessage('team.column.fatigue'),
      value: String(fatigue),
      status:
        fatigue < 20
          ? sourceMessage('copy.teamState.f865f026e5')
          : fatigue < 40
            ? sourceMessage('copy.teamState.826801054e')
            : fatigue < 60
              ? sourceMessage('copy.teamState.5852750b88')
              : sourceMessage('copy.teamState.40d82ae497'),
      tone: fatigue < 20 ? 'good' : fatigue < 40 ? 'ok' : fatigue < 60 ? 'warn' : 'bad',
      attention: fatigue >= 40,
    },
    {
      key: 'morale',
      label: sourceMessage('copy.teamState.b0d7b29bb8'),
      value: String(morale),
      status: MORALE_LABEL[mood],
      tone:
        mood === 'peak' || mood === 'good'
          ? 'good'
          : mood === 'steady'
            ? 'ok'
            : mood === 'low'
              ? 'warn'
              : 'bad',
      attention: mood === 'low' || mood === 'crisis',
    },
    {
      key: 'manager',
      label: sourceMessage('copy.ClubOverview.32d0fec1ea'),
      value: interim ? sourceMessage('team.interim') : String(trust),
      status: interim
        ? sourceMessage('copy.teamState.444f8ec4a8')
        : trust >= 75
          ? sourceMessage('copy.teamState.e7056f67a8')
          : trust >= 55
            ? sourceMessage('copy.teamState.ab2a3b2d53')
            : trust >= 35
              ? sourceMessage('copy.teamState.32bf4be8e6')
              : sourceMessage('copy.teamState.32baa3b7ac'),
      tone: interim
        ? 'warn'
        : trust >= 75
          ? 'good'
          : trust >= 55
            ? 'ok'
            : trust >= 35
              ? 'warn'
              : 'bad',
      attention: interim || trust < 55,
    },
    {
      key: 'squad',
      label: sourceMessage('copy.areas.f33435e513'),
      value: registered.value,
      status:
        squad < 20
          ? sourceMessage('copy.shortlist.da5d28ca3f')
          : registered.full
            ? sourceMessage('copy.teamState.260476e013')
            : missing || sourceMessage('copy.teamState.6652674430'),
      tone: fit < 14 || squad < 16 ? 'bad' : squad < 20 || out >= 3 ? 'warn' : 'good',
      attention: squad < 20 || fit < 14 || out >= 3,
    },
  ];
}
/** One fact of the clubhouse's current-club summary (→WEB-44). */
export interface SituationFact {
  key: Exclude<StateKey, 'cash'>;
  label: string;
  value: string;
  note: string;
  tone: Tone;
  /** A state that needs the owner, in plain words; strength is a comparison and has none. */
  warning?: '주의' | '위험';
}

/** A state that needs attention, labelled plainly (→WEB-44): critical when its tone is bad. */
export function stateWarning(item: TeamStateItem) {
  return item.attention
    ? item.tone === 'bad'
      ? sourceMessage('copy.teamState.baaff05e43')
      : sourceMessage('copy.teamState.acc90fbf66')
    : undefined;
}

/**
 * The clubhouse's current-club summary (→WEB-44): strength with its place in our division, who
 * can play of the whole first team with the injured and the suspended, the starters' fatigue,
 * 분위기 and the manager's standing. It only reads and offers no remedy (→WEB-44).
 */
export function clubSituation(w: World): SituationFact[] {
  const states = teamStates(w);
  const state = (key: StateKey) => states.find((item) => item.key === key)!;
  const squad = squadAvailability(w);
  const fact = (key: SituationFact['key'], label: string): SituationFact => {
    const item = state(key);
    return {
      key,
      label,
      value: item.value,
      note: item.status,
      tone: item.tone,
      warning: stateWarning(item),
    };
  };
  const strength = state('strength'),
    roster = state('squad');
  return [
    {
      key: 'strength',
      label: sourceMessage('copy.teamState.209c1e2619'),
      value: strength.value,
      note: strength.status,
      tone: strength.tone,
    },
    {
      key: 'squad',
      label: sourceMessage('copy.ClubOverview.be76cc2bb7'),
      value: `${squad.available}/${squad.total}`,
      note: sourceMessage('copy.teamState.69bfe75bb3', { p0: squad.injured, p1: squad.suspended }),
      tone: roster.tone,
      warning: stateWarning(roster),
    },
    fact('fatigue', sourceMessage('copy.teamState.dece7a18fa')),
    fact('morale', sourceMessage('copy.teamState.b0d7b29bb8')),
    fact('manager', sourceMessage('copy.ClubOverview.32d0fec1ea')),
  ];
}
