import type { Command, World } from '../../../../packages/contracts/src/types';
import { lineupPreset, lineupSummary } from '../../../../packages/engine/src/strategy';
import { activePlayers, clubOf, startingSquad } from '../../../../packages/engine/src/world';
import { activeTrainingFocus } from '../../../../packages/engine/src/training';
import { MORALE_LABEL, moraleOf, moraleState } from '../../../../packages/engine/src/morale';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import type { Page, SquadTab } from './state';

export type Tone = 'good' | 'ok' | 'warn' | 'bad';
export interface StateAction {
  label: string;
  command?: Command;
  page?: Page;
  tab?: SquadTab;
}
export interface TeamStateItem {
  key: 'fatigue' | 'morale' | 'cash' | 'squad';
  label: string;
  value: string;
  status: string;
  tone: Tone;
  /** Why the state matters and what the owner can do about it now. */
  advice?: { text: string; actions: StateAction[] };
}

const rank: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, good: 3 };

/** Current club condition (not season statistics), each with actions when it needs care. */
export function teamStates(w: World): TeamStateItem[] {
  const fatigue = lineupSummary(startingSquad(w, clubOf(w))).fatigue;
  const morale = moraleOf(w),
    mood = moraleState(morale);
  const policy = policyOf(w);
  const runway = fixedCostRunway(w.cash, operatingCosts(w).annual);
  const squad = activePlayers(w).length;
  const fatigueActions: StateAction[] = [];
  if (activeTrainingFocus(w) !== 'recovery')
    fatigueActions.push({
      label: '회복 훈련으로',
      command: { type: 'training', focus: 'recovery' },
    });
  fatigueActions.push({
    label: '쉬게 할 선발로',
    command: { type: 'lineup', ids: lineupPreset(w, 'rest') },
  });
  const support = POLICY_INFO.support.levels[policy.support];
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
              actions: fatigueActions,
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
              text: `사기 ${morale} · 경기 전력이 떨어져요. 승리하거나 선수단 지원을 늘리면 회복돼요.`,
              actions: support
                ? [
                    {
                      label: `선수단 지원 · ${support.name}`,
                      command: {
                        type: 'policy',
                        key: 'support',
                        level: support.level,
                      },
                    },
                  ]
                : [{ label: '구단 운영 보기', page: 'business' }],
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
              actions: [
                ...(policy.marketing > 1
                  ? [
                      {
                        label: '마케팅 줄이기',
                        command: {
                          type: 'policy',
                          key: 'marketing',
                          level: (policy.marketing - 1) as 1 | 2 | 3 | 4,
                        } as Command,
                      },
                    ]
                  : []),
                { label: '구단 운영 보기', page: 'business' as Page },
              ],
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
              actions: [
                { label: '이적 시장', page: 'transfers' },
                { label: '유소년 보기', page: 'squad', tab: 'academy' },
              ],
            }
          : undefined,
    },
  ];
}
/** The most urgent state that has advice, if any. */
export function urgentState(states: TeamStateItem[]) {
  return [...states].filter((state) => state.advice).sort((a, b) => rank[a.tone] - rank[b.tone])[0];
}
