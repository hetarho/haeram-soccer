import { squadRegistration } from './squadRegistration';
import { registrationRoom } from '../../../../packages/engine/src/registration';
import type {
  Player,
  TrainingCoach,
  TrainingFocus,
  World,
} from '../../../../packages/contracts/src/types';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import { activePlayers, clubOf, isInjured } from '../../../../packages/engine/src/player-state';
import { rating, startingSquad } from '../../../../packages/engine/src/world';
import { MORALE_LABEL, moraleOf, moraleState } from '../../../../packages/engine/src/morale';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { academySummary } from '../../../../packages/engine/src/academy';
import {
  focusLabel,
  playerTrainingCall,
  trainingCall,
} from '../../../../packages/engine/src/coach-training';
import { marketWage } from '../../../../packages/engine/src/market-prices';
import { staffMember, STAFF_INFO } from '../../../../packages/engine/src/staff-info';
import { ownLeagueIds } from './league';

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
  if (rounds >= 999) return '1년 이상';
  if (rounds < 13) return `약 ${Math.max(0, rounds)}주`;
  return `약 ${Math.round(rounds / 4.35)}개월`;
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
          ? `첫 프로 계약은 ${summary.promotionAge}세부터 맺을 수 있어요.`
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
  return { focus: focusLabel(coach, call.focus), by: '코치 판단', reason: call.reason };
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
    by: call.own ? '코치 판단' : '팀 훈련',
    reason: call.reason,
  };
}

/** The youth director's own call as the academy place reads it (→WEB-102): who, focus and why. */
export function youthCall(w: World) {
  const call = callLine(w, 'youth');
  return `${STAFF_INFO.youth.label} ${staffMember(w, 'youth')?.name ?? '공석'} · ${call.focus} · ${call.reason}`;
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
      ['선수 급여', costs.playerWages],
      ['감독 급여', costs.managerWage],
      ['스태프 급여', costs.staffWages],
      ['시설 유지', costs.maintenance],
      ['지역·글로벌 투자', costs.investment],
      ['유소년 투자', costs.academy],
      ['운영 경비', costs.expenses],
      ['인수 부채 상환', costs.loan],
    ] as const
  ).filter(([label, amount]) => label === '선수 급여' || BigInt(amount) !== 0n);
  return { nextRound: costs.nextRound, annual: costs.annual, kinds };
}

/** Cash is shown in the HUD, whose sheet explains it (→WEB-44); it has no summary tile. */
export function cashState(w: World): TeamStateItem {
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const deficit = BigInt(w.cash) < 0n;
  return {
    key: 'cash',
    label: '자금 여력',
    value: deficit ? '적자' : runwayText(runway),
    status: deficit
      ? '적자'
      : runway >= 30
        ? '안정'
        : runway >= 12
          ? '보통'
          : runway >= 5
            ? '주의'
            : '위험',
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
  const missing = out ? `부상 ${injured} · 정지 ${suspended}` : '';
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
      label: '팀 전력',
      value: String(strength),
      status: `리그 ${place.place}/${place.of}위`,
      // A comparison, not a condition to repair: it never needs the owner.
      tone: place.tone,
    },
    {
      key: 'fatigue',
      label: '피로',
      value: String(fatigue),
      status: fatigue < 20 ? '상쾌' : fatigue < 40 ? '양호' : fatigue < 60 ? '지침' : '탈진',
      tone: fatigue < 20 ? 'good' : fatigue < 40 ? 'ok' : fatigue < 60 ? 'warn' : 'bad',
      attention: fatigue >= 40,
    },
    {
      key: 'morale',
      label: '분위기',
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
      label: '감독 입지',
      value: interim ? '대행' : String(trust),
      status: interim
        ? '대행 체제'
        : trust >= 75
          ? '굳건'
          : trust >= 55
            ? '안정'
            : trust >= 35
              ? '흔들림'
              : '위기',
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
      label: '선수단',
      value: registered.value,
      status: squad < 20 ? '부족' : registered.full ? '가득' : missing || '여유',
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

/**
 * The clubhouse's current-club summary (→WEB-44): strength with its place in our division, who
 * can play of the whole first team with the injured and the suspended, the starters' fatigue,
 * 분위기 and the manager's standing. It only reads and offers no remedy (→WEB-44).
 */
export function clubSituation(w: World): SituationFact[] {
  const states = teamStates(w);
  const state = (key: StateKey) => states.find((item) => item.key === key)!;
  const squad = squadAvailability(w);
  const warning = (item: TeamStateItem) =>
    item.attention ? (item.tone === 'bad' ? ('위험' as const) : ('주의' as const)) : undefined;
  const fact = (key: SituationFact['key'], label: string): SituationFact => {
    const item = state(key);
    return {
      key,
      label,
      value: item.value,
      note: item.status,
      tone: item.tone,
      warning: warning(item),
    };
  };
  const strength = state('strength'),
    roster = state('squad');
  return [
    {
      key: 'strength',
      label: '팀 전력',
      value: strength.value,
      note: strength.status,
      tone: strength.tone,
    },
    {
      key: 'squad',
      label: '출전 가능',
      value: `${squad.available}/${squad.total}`,
      note: `부상 ${squad.injured} · 정지 ${squad.suspended}`,
      tone: roster.tone,
      warning: warning(roster),
    },
    fact('fatigue', '선발 피로'),
    fact('morale', '분위기'),
    fact('manager', '감독 입지'),
  ];
}
