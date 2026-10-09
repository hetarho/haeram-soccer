import type { CareKind, Command, World } from '../../../../packages/contracts/src/types';
import { lineupPreset, lineupSummary } from '../../../../packages/engine/src/strategy';
import { activePlayers, clubOf, quote, startingSquad } from '../../../../packages/engine/src/world';
import { activeTrainingFocus } from '../../../../packages/engine/src/training';
import { MORALE_LABEL, moraleOf, moraleState } from '../../../../packages/engine/src/morale';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { careOffer } from '../../../../packages/engine/src/care';
import { academySummary } from '../../../../packages/engine/src/academy';
import { money } from './format';
import type { Page, SquadTab } from './state';

export type Tone = 'good' | 'ok' | 'warn' | 'bad';
export type StateKey = 'fatigue' | 'morale' | 'cash' | 'squad';
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
  morale: '사기 끌어올리기',
  cash: '자금 확보',
  squad: '선수단 채우기',
};

function care(w: World, kind: CareKind): Remedy {
  const offer = careOffer(w, kind),
    club = clubOf(w);
  return {
    id: kind,
    label: offer.label,
    effect:
      kind === 'friendly'
        ? `수입 +${money(offer.income, club.country, w.year)} · 전원 피로 +${offer.fatigue}`
        : offer.effect,
    cost: BigInt(offer.cost) > 0n ? money(offer.cost, club.country, w.year) : '무료',
    unavailable: offer.reason,
    command: { type: 'care', kind },
  };
}

/** Every choice for one state, available or not, in the order the sheet lists them. */
export function remedies(w: World, key: StateKey): Remedy[] {
  const club = clubOf(w),
    policy = policyOf(w),
    format = (value: string) => money(value, club.country, w.year);
  const supportUp = POLICY_INFO.support.levels[policy.support];
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
          id: 'recovery',
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
        care(w, 'rest-day'),
        care(w, 'medical'),
        {
          id: 'prepare',
          label: '전술·선발 직접 고르기',
          effect: '압박 전술은 피로가 더 쌓여요. 선발과 전술을 비교해 보세요',
          prepare: true,
        },
      ];
    }
    case 'morale':
      return [
        {
          id: 'support-up',
          label: supportUp ? `선수단 지원 · ${supportUp.name}` : '선수단 지원 최고 단계',
          effect: supportUp ? `${supportUp.summary} · 사기 기준점 +4` : '더 올릴 단계가 없어요',
          unavailable: supportUp ? undefined : '이미 최고 대우',
          command: supportUp
            ? { type: 'policy', key: 'support', level: supportUp.level }
            : undefined,
        },
        care(w, 'team-dinner'),
        care(w, 'bonus'),
        care(w, 'owner-visit'),
        care(w, 'rest-day'),
      ];
    case 'cash': {
      const marketing = POLICY_INFO.marketing.levels[policy.marketing - 2];
      const ticket = Math.min(0.5, Math.round(w.ticket * 1.2 * 1000) / 1000);
      const seasonSupport = w.events.filter(
        (event) => event.kind === 'support' && event.year === w.year,
      ).length;
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
          label: supportDown ? `선수단 지원 · ${supportDown.name}` : '선수단 지원 최저 단계',
          effect: supportDown ? `${supportDown.summary} · 사기 기준점 −4` : '더 줄일 단계가 없어요',
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
        care(w, 'friendly'),
        {
          id: 'owner-capital',
          label: '구단주 추가 출자',
          effect: `+${format(quote(club.country, w.year, 150))} · 클럽 평판 −2 · 시즌 3회까지`,
          cost: '무료',
          unavailable: seasonSupport >= 3 ? '이번 시즌 3회 모두 사용' : undefined,
          command: { type: 'support' },
        },
        {
          id: 'market',
          label: '선수 매각 살펴보기',
          effect: '이적 시장에서 제안과 매각 가능 선수를 확인해요',
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
          label: '이적 시장',
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

/** Current club condition (not season statistics), each with actions when it needs care. */
export function teamStates(w: World): TeamStateItem[] {
  const fatigue = lineupSummary(startingSquad(w, clubOf(w))).fatigue;
  const morale = moraleOf(w),
    mood = moraleState(morale);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const squad = activePlayers(w).length;
  // The two quick buttons are the first choices that can be used right now.
  const quick = (key: StateKey) =>
    remedies(w, key)
      .filter((remedy) => !remedy.unavailable && !remedy.prepare)
      .slice(0, 2);
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
              text: `선발 평균 피로 ${fatigue} · 경기력이 떨어지고 사기도 내려가요.${
                activeTrainingFocus(w) === 'recovery' ? ' 지금 회복 훈련 중이에요.' : ''
              }`,
              actions: quick('fatigue'),
            }
          : undefined,
    },
    {
      key: 'morale',
      label: '사기',
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
              text: `사기 ${morale} · 경기 전력이 떨어져요. 승리하거나 선수단을 챙기면 회복돼요.`,
              actions: quick('morale'),
            }
          : undefined,
    },
    {
      key: 'cash',
      label: '자금',
      value: runway >= 999 ? '999R+' : `${runway}R`,
      status:
        BigInt(w.cash) < 0n
          ? '적자'
          : runway >= 30
            ? '안정'
            : runway >= 12
              ? '보통'
              : runway >= 5
                ? '주의'
                : '위험',
      tone:
        BigInt(w.cash) < 0n || runway < 5
          ? 'bad'
          : runway < 12
            ? 'warn'
            : runway < 30
              ? 'ok'
              : 'good',
      advice:
        BigInt(w.cash) < 0n || runway < 12
          ? {
              text: `고정 지출 기준 ${Math.max(0, runway)}라운드분 자금만 남았어요.`,
              actions: quick('cash'),
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
              actions: quick('squad'),
            }
          : undefined,
    },
  ];
}
/** The most urgent state that has advice, if any. */
export function urgentState(states: TeamStateItem[]) {
  return [...states].filter((state) => state.advice).sort((a, b) => rank[a.tone] - rank[b.tone])[0];
}
