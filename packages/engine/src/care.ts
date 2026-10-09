import type { CareKind, World } from '../../contracts/src/types';
import { activePlayers, clubOf, quote } from './world';
import { MORALE_START } from './morale';
import { clamp } from './primitives';

/** Display order. */
export const CARE_KINDS: readonly CareKind[] = [
  'rest-day',
  'medical',
  'team-dinner',
  'bonus',
  'owner-visit',
  'friendly',
];

/** CLUB-20: instant owner decisions. Costs and income are 1901 price units. */
export const CARE_INFO: Record<
  CareKind,
  {
    label: string;
    effect: string;
    cost: number;
    cooldown: number;
    fatigue: number;
    morale: number;
    trust: number;
  }
> = {
  'rest-day': {
    label: '휴식일',
    effect: '전원 피로 −6 · 사기 +2',
    cost: 0,
    cooldown: 4,
    fatigue: -6,
    morale: 2,
    trust: 0,
  },
  medical: {
    label: '집중 케어',
    effect: '전원 피로 −10',
    cost: 30,
    cooldown: 2,
    fatigue: -10,
    morale: 0,
    trust: 0,
  },
  'team-dinner': {
    label: '팀 회식',
    effect: '사기 +5',
    cost: 15,
    cooldown: 3,
    fatigue: 0,
    morale: 5,
    trust: 0,
  },
  bonus: {
    label: '특별 보너스',
    effect: '사기 +10',
    cost: 45,
    cooldown: 8,
    fatigue: 0,
    morale: 10,
    trust: 0,
  },
  'owner-visit': {
    label: '구단주 격려 방문',
    effect: '사기 +3 · 감독 신뢰 −1',
    cost: 0,
    cooldown: 4,
    fatigue: 0,
    morale: 3,
    trust: -1,
  },
  friendly: {
    label: '친선 경기 개최',
    effect: '수입 · 전원 피로 +8',
    cost: 0,
    cooldown: 4,
    fatigue: 8,
    morale: 0,
    trust: 0,
  },
};

/** Friendly gate income grows with supporters: 12 units plus one per 600 fans, at most 60. */
export function friendlyUnits(fans: number) {
  return Math.min(60, 12 + Math.floor(fans / 600));
}

/** Pure read model of one care action: price, income and whether it can be used now. */
export function careOffer(w: World, kind: CareKind) {
  const info = CARE_INFO[kind];
  if (!info) throw new Error('없는 선수단 케어입니다.');
  const club = clubOf(w);
  const last = w.events.findLast((event) => event.kind === `care:${kind}`);
  const since = last && last.year === w.year ? w.round - last.round : Infinity;
  const wait = Math.max(0, info.cooldown - since);
  const cost = info.cost ? quote(club.country, w.year, info.cost) : '0';
  const income = kind === 'friendly' ? quote(club.country, w.year, friendlyUnits(club.fans)) : '0';
  const affordable = BigInt(w.cash) >= BigInt(cost);
  return {
    kind,
    ...info,
    cost,
    income,
    /** Settled rounds until it can be used again. */
    wait,
    available: wait === 0 && affordable,
    reason: wait > 0 ? `${wait}라운드 뒤 다시 가능` : affordable ? undefined : '자금 부족',
  };
}

/** Effects only; the caller settles the cost or income first. */
export function applyCareEffects(w: World, kind: CareKind) {
  const info = CARE_INFO[kind];
  if (info.fatigue)
    for (const player of activePlayers(w))
      player.fatigue = Math.round(clamp(player.fatigue + info.fatigue));
  if (info.morale) w.morale = Math.round(clamp((w.morale ?? MORALE_START) + info.morale));
  if (info.trust) w.manager.trust = clamp(w.manager.trust + info.trust);
}

export function careEventDetail(kind: CareKind) {
  const info = CARE_INFO[kind];
  return `${info.effect} · ${info.cooldown}라운드 뒤 다시 가능`;
}
