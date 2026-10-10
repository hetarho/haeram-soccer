import type { CareKind, Command, World } from '../../../../packages/contracts/src/types';
import { lineupPreset, lineupSummary } from '../../../../packages/engine/src/strategy';
import { activePlayers, clubOf, quote, startingSquad } from '../../../../packages/engine/src/world';
import { activeTrainingFocus } from '../../../../packages/engine/src/training';
import { MORALE_LABEL, moraleOf, moraleState } from '../../../../packages/engine/src/morale';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { careOffer, effectText, outcomeText } from '../../../../packages/engine/src/care';
import { academySummary } from '../../../../packages/engine/src/academy';
import { buildEffects } from '../../../../packages/engine/src/build';
import { money } from './format';
import type { Page, SquadTab } from './state';

export type Tone = 'good' | 'ok' | 'warn' | 'bad';
export type StateKey = 'fatigue' | 'morale' | 'manager' | 'squad' | 'cash';
export interface StateAction {
  label: string;
  command?: Command;
  page?: Page;
  tab?: SquadTab;
  /** Opens the tactic and lineup preparation sheet. */
  prepare?: boolean;
}
/** One choice of a remedy sheet: what it costs and does, stated before commit (→WEB-44). */
export interface Remedy extends StateAction {
  id: string;
  effect: string;
  cost?: string;
  /** Who carries a request out, for owner requests. */
  by?: string;
  /** Each possible result with its chance, for requests that can go differently. */
  chances?: { chance: number; text: string }[];
  /** Why it cannot be chosen now (cooldown, cash, already applied). */
  unavailable?: string;
}
export interface TeamStateItem {
  key: StateKey;
  label: string;
  value: string;
  status: string;
  tone: Tone;
  /** Why the state matters and what the owner can do about it now. */
  advice?: { text: string; actions: StateAction[] };
}

const rank: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, good: 3 };
export const STATE_TITLES: Record<StateKey, string> = {
  fatigue: '피로 관리',
  morale: '분위기 끌어올리기',
  manager: '감독과의 관계',
  squad: '선수단 채우기',
  cash: '자금 확보',
};

/** Weeks of fixed costs as football finance pages say it: weeks when short, months otherwise. */
export function runwayText(rounds: number) {
  if (rounds >= 999) return '1년 이상';
  if (rounds < 13) return `약 ${Math.max(0, rounds)}주`;
  return `약 ${Math.round(rounds / 4.35)}개월`;
}

function request(w: World, kind: CareKind): Remedy {
  const offer = careOffer(w, kind),
    club = clubOf(w);
  const format = (value: string) => money(value, club.country, w.year);
  const single = offer.outcomes.length === 1;
  const effect =
    kind === 'friendly'
      ? `수입 +${format(offer.income)} · 전원 피로 +${offer.outcomes[0].fatigue}`
      : kind === 'win-bonus'
        ? `${offer.summary} · 이길 때마다 ${format(offer.perWin)} · 분위기 +2`
        : single
          ? `${offer.summary} · ${effectText(offer.outcomes[0])}`
          : offer.summary;
  return {
    id: kind,
    label: offer.label,
    by: offer.by,
    effect,
    ...(single
      ? {}
      : {
          chances: offer.outcomes.map((outcome) => ({
            chance: outcome.chance,
            text: outcomeText(outcome),
          })),
        }),
    cost:
      kind === 'win-bonus'
        ? `승리할 때마다 ${format(offer.perWin)}`
        : BigInt(offer.cost) > 0n
          ? format(offer.cost)
          : '무료',
    unavailable: offer.reason,
    command: { type: 'care', kind },
  };
}

/** Every choice for one state, available or not, in the order the sheet lists them. */
export function remedies(w: World, key: StateKey): Remedy[] {
  const club = clubOf(w),
    policy = policyOf(w),
    format = (value: string) => money(value, club.country, w.year);
  const supportDown = POLICY_INFO.support.levels[policy.support - 2];
  switch (key) {
    case 'fatigue': {
      const current = lineupSummary(startingSquad(w, club)).fatigue;
      const rest = lineupPreset(w, 'rest');
      const restFatigue = Math.round(
        rest.reduce((sum, id) => sum + (w.players.find((p) => p.id === id)?.fatigue || 0), 0) /
          Math.max(1, rest.length),
      );
      return [
        {
          id: 'recovery-training',
          label: '회복 훈련으로 전환',
          effect: '라운드마다 회복이 커지고 성장 기회는 줄어요',
          cost: '무료',
          unavailable: activeTrainingFocus(w) === 'recovery' ? '이미 회복 훈련 중' : undefined,
          command: { type: 'training', focus: 'recovery' },
        },
        {
          id: 'rest-lineup',
          label: '쉬게 할 선발',
          effect: `선발 평균 피로 ${current} → ${restFatigue} · 즉시 전력은 조금 낮아져요`,
          cost: '무료',
          unavailable: restFatigue >= current ? '이미 가장 덜 지친 선발' : undefined,
          command: { type: 'lineup', ids: rest },
        },
        request(w, 'rest-day'),
        request(w, 'recovery'),
        request(w, 'camp'),
        {
          id: 'prepare',
          label: '전술·선발 직접 고르기',
          effect: '전방 압박은 피로가 더 쌓여요. 선발과 전술을 비교해 보세요',
          prepare: true,
        },
      ];
    }
    case 'morale':
      return [
        request(w, 'meeting'),
        request(w, 'bonding'),
        request(w, 'win-bonus'),
        request(w, 'owner-visit'),
        request(w, 'camp'),
        request(w, 'rest-day'),
      ];
    case 'manager':
      return [
        request(w, 'backing'),
        {
          id: 'office',
          label: '감독실에서 전술 이야기하기',
          effect: '감독의 철학과 신뢰를 보고 전술을 제안하거나 조건을 받아들여요',
          page: 'manager',
        },
        {
          id: 'candidates',
          label: '다른 감독 후보 살펴보기',
          effect: '성향이 다른 감독 네 명의 장단점과 선임 비용을 비교해요',
          page: 'manager',
        },
      ];
    case 'cash': {
      const marketing = POLICY_INFO.marketing.levels[policy.marketing - 2];
      const ticket = Math.min(0.5, Math.round(w.ticket * 1.2 * 1000) / 1000);
      const seasonSupport = w.events.filter(
        (event) => event.kind === 'support' && event.year === w.year,
      ).length;
      const limit = buildEffects(w).ownerCapital;
      return [
        {
          id: 'marketing-down',
          label: marketing ? `마케팅 · ${marketing.name}` : '마케팅 지출 없음',
          effect: marketing ? marketing.summary : '이미 추가 지출이 없어요',
          unavailable: marketing ? undefined : '이미 입소문',
          command: marketing
            ? { type: 'policy', key: 'marketing', level: marketing.level }
            : undefined,
        },
        {
          id: 'support-down',
          label: supportDown
            ? `${POLICY_INFO.support.label} · ${supportDown.name}`
            : `${POLICY_INFO.support.label} 최저 단계`,
          effect: supportDown
            ? `${supportDown.summary} · 분위기 기준점 −4`
            : '더 줄일 단계가 없어요',
          unavailable: supportDown ? undefined : '이미 긴축',
          command: supportDown
            ? { type: 'policy', key: 'support', level: supportDown.level }
            : undefined,
        },
        {
          id: 'ticket-up',
          label: '티켓 가격 20% 인상',
          effect: '홈 경기 입장 수입이 늘고 관중 수요는 줄어요',
          unavailable: ticket <= w.ticket ? '티켓 가격 상한' : undefined,
          command: { type: 'ticket', price: ticket },
        },
        request(w, 'friendly'),
        {
          id: 'owner-capital',
          label: '구단주 추가 출자',
          effect: `+${format(quote(club.country, w.year, 150))} · 클럽 평판 −2 · 시즌 ${limit}회까지`,
          cost: '무료',
          unavailable: seasonSupport >= limit ? `이번 시즌 ${limit}회 모두 사용` : undefined,
          command: { type: 'support' },
        },
        {
          id: 'market',
          label: '선수 매각 살펴보기',
          effect: '이적시장에서 제안과 매각 가능 선수를 확인해요',
          page: 'transfers',
        },
      ];
    }
    case 'squad': {
      const academy = academySummary(w);
      const best = academy.players[0];
      return [
        {
          id: 'market',
          label: '이적시장',
          effect: '자유계약 선수는 언제든, 이적료 선수는 이적시장 기간에 영입해요',
          page: 'transfers',
        },
        {
          id: 'academy',
          label: '유소년 보기',
          effect: `아카데미 ${academy.players.length}명 · 1군 자리 ${academy.room}개`,
          page: 'squad',
          tab: 'academy',
        },
        {
          id: 'promote',
          label: best ? `${best.player.name} 승격` : '승격할 유망주 없음',
          effect: best
            ? `${best.player.role} · ${best.age}세 · 능력 ${best.overall} · 잠재력 ${best.potential}`
            : '3월 15일 유소년 입단을 기다려요',
          unavailable: !best
            ? '아카데미가 비어 있어요'
            : academy.room
              ? undefined
              : '1군 정원 26명',
          command: best ? { type: 'promote-youth', id: best.player.id } : undefined,
        },
      ];
    }
  }
}

/** The first choices that can be used right now, for the urgent card's two quick buttons. */
function quick(w: World, key: StateKey) {
  return remedies(w, key)
    .filter((remedy) => !remedy.unavailable && !remedy.prepare)
    .slice(0, 2);
}

/** Cash is shown in the HUD; it joins the state card only when it needs the owner. */
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
    advice:
      deficit || runway < 12
        ? {
            text: deficit
              ? '운영 자금이 바닥났어요. 지출을 줄이거나 자금을 마련해야 경기를 이어갈 수 있어요.'
              : `급여·운영비 기준으로 ${runwayText(runway)}분 자금만 남았어요.`,
            actions: quick(w, 'cash'),
          }
        : undefined,
  };
}

/** Current club condition (not season statistics), each with actions when it needs care. */
export function teamStates(w: World): TeamStateItem[] {
  const fatigue = lineupSummary(startingSquad(w, clubOf(w))).fatigue;
  const morale = moraleOf(w),
    mood = moraleState(morale);
  const trust = Math.round(w.manager.trust),
    interim = w.manager.interim;
  const squad = activePlayers(w).length;
  return [
    {
      key: 'fatigue',
      label: '피로',
      value: String(fatigue),
      status: fatigue < 20 ? '상쾌' : fatigue < 40 ? '양호' : fatigue < 60 ? '지침' : '탈진',
      tone: fatigue < 20 ? 'good' : fatigue < 40 ? 'ok' : fatigue < 60 ? 'warn' : 'bad',
      advice:
        fatigue >= 40
          ? {
              text: `선발 평균 피로 ${fatigue} · 경기력이 떨어지고 분위기도 가라앉아요.${
                activeTrainingFocus(w) === 'recovery' ? ' 지금 회복 훈련 중이에요.' : ''
              }`,
              actions: quick(w, 'fatigue'),
            }
          : undefined,
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
      advice:
        mood === 'low' || mood === 'crisis'
          ? {
              text: `분위기 ${morale} · 경기 전력이 떨어져요. 감독에게 선수단 미팅을 요청하거나 분위기를 바꿀 계기를 만들어 주세요.`,
              actions: quick(w, 'morale'),
            }
          : undefined,
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
      advice: interim
        ? {
            text: '감독대행이 팀을 이끌고 있어요. 새 감독을 선임해야 전술과 성장이 제자리를 찾아요.',
            actions: [{ label: '감독 후보 보기', page: 'manager' }],
          }
        : trust < 55
          ? {
              text: `감독 신뢰 ${trust} · 신뢰가 낮으면 전술 요청을 거절하고 분위기 기준점도 내려가요. 자존심 강한 감독은 떠날 수 있어요.`,
              actions: quick(w, 'manager'),
            }
          : undefined,
    },
    {
      key: 'squad',
      label: '선수단',
      value: `${squad}/26`,
      status: squad < 16 ? '부족' : squad >= 26 ? '가득' : '여유',
      tone: squad < 15 ? 'bad' : squad < 16 ? 'warn' : 'good',
      advice:
        squad < 16
          ? {
              text: `선수 ${squad}명 · 부상이나 피로가 겹치면 선발을 채우기 어려워요.`,
              actions: quick(w, 'squad'),
            }
          : undefined,
    },
  ];
}
/**
 * The most urgent state that has advice, if any. Cash competes even though it has no tile, and
 * wins ties: a club out of money cannot play on.
 */
export function urgentState(states: TeamStateItem[], cash?: TeamStateItem) {
  return [...(cash ? [cash] : []), ...states]
    .filter((state) => state.advice)
    .sort((a, b) => rank[a.tone] - rank[b.tone])[0];
}
