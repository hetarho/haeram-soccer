import type { CareKind, MatchRecord, World } from '../../contracts/src/types';
import { activePlayers, addEvent, clubOf, quote } from './world';
import { MORALE_START } from './morale';
import { clamp, random } from './primitives';
import { managerStyleEffects } from './styles';
import { debit } from './operations';

/**
 * Owner requests (→CLUB-20). The owner does not run the dressing room: most requests go through
 * the manager or the staff, and the ones that depend on people can work, do little or backfire.
 * Every chance is stated before the request is made.
 */

/** Display order: morale requests first, then fitness, then money. */
export const CARE_KINDS: readonly CareKind[] = [
  'meeting',
  'bonding',
  'win-bonus',
  'owner-visit',
  'backing',
  'camp',
  'rest-day',
  'recovery',
  'friendly',
];

export interface CareOutcome {
  /** Percent, summing to 100 across a request's outcomes. */
  chance: number;
  label: string;
  morale: number;
  fatigue: number;
  trust: number;
}

interface CareRule {
  label: string;
  /** Who carries the request out. */
  by: '감독' | '스태프' | '구단주' | '운영팀';
  /** One line on what happens, before chances. */
  summary: string;
  /** 1901 price units paid at once (win bonus: per win). */
  cost: number;
  cooldown: number;
  outcomes: (w: World) => (Omit<CareOutcome, 'chance'> & { weight: number })[];
}

const effect = (
  weight: number,
  label: string,
  morale = 0,
  fatigue = 0,
  trust = 0,
): Omit<CareOutcome, 'chance'> & { weight: number } => ({ weight, label, morale, fatigue, trust });

/** Win bonus paid per win while a promise lasts, in 1901 units. */
export const WIN_BONUS_UNITS = 8;
export const WIN_BONUS_MATCHES = 5;

export const CARE_INFO: Record<CareKind, CareRule> = {
  meeting: {
    label: '선수단 미팅 요청',
    by: '감독',
    summary: '감독이 선수단을 모아 문제를 털어놓고 다음 경기를 준비해요',
    cost: 0,
    cooldown: 4,
    outcomes: (w) => {
      const style = managerStyleEffects(w).meeting,
        trust = (w.manager.trust - 50) / 200,
        low = (w.morale ?? MORALE_START) < 45 ? 0.1 : 0;
      const works = clamp(0.5 + style + trust + low, 0.2, 0.9);
      const backfires = clamp(0.22 - style / 2 - trust / 2, 0.05, 0.3);
      return [
        effect(works, '분위기 반전에 성공', 7),
        effect(Math.max(0, 1 - works - backfires), '무난하게 마무리', 2),
        effect(backfires, '선수들이 압박으로 받아들임', -3, 0, -2),
      ];
    },
  },
  bonding: {
    label: '팀 빌딩 데이',
    by: '스태프',
    summary: '훈련장을 벗어나 선수단이 함께 시간을 보내요',
    cost: 15,
    cooldown: 3,
    outcomes: () => [effect(0.75, '단합이 단단해짐', 5), effect(0.25, '무난한 하루', 2)],
  },
  'win-bonus': {
    label: `승리 수당 걸기 (다음 ${WIN_BONUS_MATCHES}경기)`,
    by: '구단주',
    summary: `다음 ${WIN_BONUS_MATCHES}경기 동안 이길 때마다 수당을 주고 분위기를 더 끌어올려요`,
    cost: 0,
    cooldown: 8,
    outcomes: () => [effect(1, '선수단이 동기부여됨', 3)],
  },
  'owner-visit': {
    label: '구단주 라커룸 방문',
    by: '구단주',
    summary: '구단주가 직접 라커룸을 찾아 선수들을 격려해요',
    cost: 0,
    cooldown: 4,
    // Owners addressing the squad directly tend to undermine the manager more than they help.
    outcomes: () => [
      effect(0.35, '격려가 힘이 됨', 4),
      effect(0.3, '의례적인 방문', 1),
      effect(0.35, '감독 권위를 건드려 부담', -3, 0, -3),
    ],
  },
  backing: {
    label: '감독 재신임 발표',
    by: '구단주',
    summary: '구단주가 감독을 공개적으로 신임해 흔들림을 막아요',
    cost: 0,
    cooldown: 10,
    outcomes: () => [effect(1, '감독과 선수단이 안정을 찾음', 2, 0, 8)],
  },
  camp: {
    label: '단기 전지훈련 캠프',
    by: '스태프',
    summary: '따뜻한 곳에서 며칠 훈련하며 체력과 분위기를 함께 다져요',
    cost: 60,
    cooldown: 12,
    outcomes: () => [effect(1, '체력과 분위기를 함께 회복', 5, -8)],
  },
  'rest-day': {
    label: '휴식일 부여 요청',
    by: '감독',
    summary: '감독에게 훈련을 쉬고 이틀 휴식을 주자고 요청해요',
    cost: 0,
    cooldown: 4,
    outcomes: () => [effect(1, '휴식으로 회복', 2, -6)],
  },
  recovery: {
    label: '회복 집중 지원',
    by: '스태프',
    summary: '의무팀에 회복 장비와 마사지 인력을 더 붙여요',
    cost: 30,
    cooldown: 2,
    outcomes: () => [effect(1, '회복 속도가 빨라짐', 0, -10)],
  },
  friendly: {
    label: '친선 경기 개최',
    by: '운영팀',
    summary: '주중 친선 경기로 입장 수입을 벌지만 선수들이 지쳐요',
    cost: 0,
    cooldown: 4,
    outcomes: () => [effect(1, '친선 경기 개최', 0, 8)],
  },
};

/** Friendly gate income grows with supporters: 12 units plus one per 600 fans, at most 60. */
export function friendlyUnits(fans: number) {
  return Math.min(60, 12 + Math.floor(fans / 600));
}

/** Whole percentages that sum to 100, largest remainders first. */
function percentages(weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const raw = weights.map((w) => (w / total) * 100);
  const result = raw.map(Math.floor);
  let left = 100 - result.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    result[index]++;
    left--;
  }
  return result;
}

/** Pure read model of one request: price, chances and whether it can be made now. */
export function careOffer(w: World, kind: CareKind) {
  const info = CARE_INFO[kind];
  if (!info) throw new Error('없는 구단주 요청입니다.');
  const club = clubOf(w);
  const last = w.events.findLast((event) => event.kind === `care:${kind}`);
  const since = last && last.year === w.year ? w.round - last.round : Infinity;
  const wait = Math.max(0, info.cooldown - since);
  const perWin = kind === 'win-bonus' ? quote(club.country, w.year, WIN_BONUS_UNITS) : '0';
  const cost = info.cost ? quote(club.country, w.year, info.cost) : '0';
  const income = kind === 'friendly' ? quote(club.country, w.year, friendlyUnits(club.fans)) : '0';
  const affordable = BigInt(w.cash) >= BigInt(cost);
  const listed = info.outcomes(w).filter((outcome) => outcome.weight > 0);
  const chances = percentages(listed.map((outcome) => outcome.weight));
  const outcomes: CareOutcome[] = listed.map(({ weight: _weight, ...outcome }, i) => {
    void _weight;
    return { ...outcome, chance: chances[i] };
  });
  const blocked =
    kind === 'win-bonus' && w.winBonus
      ? `이미 승리 수당이 걸려 있어요 (남은 ${w.winBonus.matches}경기)`
      : kind === 'backing' && w.manager.trust >= 85
        ? '감독 신뢰가 이미 굳건해요'
        : kind === 'backing' && w.manager.interim
          ? '임시 감독은 재신임 대상이 아니에요'
          : undefined;
  return {
    kind,
    label: info.label,
    by: info.by,
    summary: info.summary,
    cooldown: info.cooldown,
    cost,
    /** Win bonus only: paid after each win while the promise lasts. */
    perWin,
    income,
    outcomes,
    /** Settled rounds until it can be asked again. */
    wait,
    available: wait === 0 && affordable && !blocked,
    reason:
      blocked ?? (wait > 0 ? `${wait}라운드 뒤 다시 가능` : affordable ? undefined : '자금 부족'),
  };
}

const signed = (value: number) => (value > 0 ? `+${value}` : `−${-value}`);
/** What an outcome changes: "분위기 +7 · 감독 신뢰 −2". */
export function effectText(outcome: Omit<CareOutcome, 'chance'>) {
  const parts: string[] = [];
  if (outcome.morale) parts.push(`분위기 ${signed(outcome.morale)}`);
  if (outcome.fatigue) parts.push(`전원 피로 ${signed(outcome.fatigue)}`);
  if (outcome.trust) parts.push(`감독 신뢰 ${signed(outcome.trust)}`);
  return parts.join(' · ');
}
/** One line per outcome, as shown before the request: "분위기 반전에 성공 · 분위기 +7". */
export function outcomeText(outcome: Omit<CareOutcome, 'chance'>) {
  const effect = effectText(outcome);
  return effect ? `${outcome.label} · ${effect}` : outcome.label;
}

/**
 * Picks the outcome from the world's own stream for this round and revision, applies it and
 * returns it. The caller settles cost or income first.
 */
export function resolveCare(w: World, kind: CareKind): CareOutcome {
  const { outcomes } = careOffer(w, kind);
  const draw = random(`${w.seed}:care:${kind}:${w.year}:${w.round}:${w.revision}`)() * 100;
  let at = 0;
  const outcome =
    outcomes.find((candidate) => (at += candidate.chance) > draw) ?? outcomes[outcomes.length - 1];
  if (outcome.fatigue)
    for (const player of activePlayers(w))
      player.fatigue = Math.round(clamp(player.fatigue + outcome.fatigue));
  if (outcome.morale) w.morale = Math.round(clamp((w.morale ?? MORALE_START) + outcome.morale));
  if (outcome.trust) w.manager.trust = clamp(w.manager.trust + outcome.trust);
  if (kind === 'win-bonus') w.winBonus = { matches: WIN_BONUS_MATCHES };
  return outcome;
}

/** After each own match while a win bonus is promised: wins are paid and lift morale. */
export function settleWinBonus(w: World, m: MatchRecord) {
  if (!w.winBonus) return;
  const own = m.home === w.playerClub ? m.score.home : m.score.away,
    other = m.home === w.playerClub ? m.score.away : m.score.home;
  if (own > other) {
    const amount = quote(clubOf(w).country, w.year, WIN_BONUS_UNITS);
    // A promised bonus is owed even when cash is short.
    debit(w, amount, true);
    if (w.morale !== undefined) w.morale = Math.round(clamp(w.morale + 2));
    addEvent(w, 'win-bonus', '승리 수당 지급', `${m.id} · 분위기 +2`, amount);
  }
  w.winBonus.matches--;
  if (w.winBonus.matches <= 0) delete w.winBonus;
}
