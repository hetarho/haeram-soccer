import { useState } from 'react';
import type {
  Command,
  PolicyKey,
  PolicyLevel,
  TrainingFocus,
  World,
} from '../../../../packages/contracts/src/types';
import {
  POLICY_INFO,
  policyEffects,
  policyOf,
  policyPreview,
} from '../../../../packages/engine/src/policy';
import { trainingFocusInfo } from '../../../../packages/engine/src/training';
import { autoTrainingAdvice } from '../../../../packages/engine/src/staff';
import { ticketInvestmentPreview } from '../../../../packages/engine/src/investment';
import { gateProjection, operatingCosts } from '../../../../packages/engine/src/finance';
import { clubOf } from '../../../../packages/engine/src/world';
import { financeProjection } from '../../../../packages/engine/src/projection';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { money, number } from './format';
import s from './PolicyBoard.module.css';

/** Ordered presets keep the existing ticket rule; 0.05 is the founding price. */
export const TICKET_LEVELS = [
  { price: 0.02, name: '아주 저렴', summary: '관중을 최대한 모으고 입장 수입은 낮아요' },
  { price: 0.035, name: '저렴', summary: '관중이 늘고 1장당 수입은 줄어요' },
  { price: 0.05, name: '보통', summary: '창단 기본 가격' },
  { price: 0.08, name: '비싸게', summary: '관중은 줄고 1장당 수입은 늘어요' },
  { price: 0.12, name: '프리미엄', summary: '빈자리가 늘지만 경기당 입장 수입이 가장 커요' },
] as const;
const TRAINING_LEVELS: { focus: TrainingFocus | 'staff'; name: string; summary: string }[] = [
  {
    focus: 'staff',
    name: '스태프에 맡김',
    summary: '수석코치가 피로와 유망주를 보고 매 라운드 정해요',
  },
  { focus: 'recovery', name: '회복 집중', summary: '피로를 많이 풀고 라운드 성장은 쉬어요' },
  { focus: 'balanced', name: '균형', summary: '성장과 회복을 함께 챙겨요' },
  { focus: 'youth', name: '유망주 집중', summary: '27세 미만 성장이 빨라지고 회복은 줄어요' },
];

type Dial = {
  key: PolicyKey | 'training' | 'ticket';
  icon: string;
  label: string;
  question: string;
  levels: { name: string; summary: string }[];
  current: number;
  command: (index: number) => Command;
  preview: (index: number) => string[];
};

const signed = (value: string, format: (value: string) => string) =>
  BigInt(value) === 0n ? '변화 없음' : `${BigInt(value) > 0n ? '+' : ''}${format(value)}`;

function dials(w: World): Dial[] {
  const club = clubOf(w),
    policy = policyOf(w),
    format = (value: string) => money(value, club.country, w.year);
  const policyDial = (key: PolicyKey, icon: string, lines: (level: PolicyLevel) => string[]) => ({
    key,
    icon,
    label: POLICY_INFO[key].label,
    question: POLICY_INFO[key].question,
    levels: POLICY_INFO[key].levels,
    current: policy[key] - 1,
    command: (index: number): Command => ({
      type: 'policy',
      key,
      level: (index + 1) as PolicyLevel,
    }),
    preview: (index: number) => lines((index + 1) as PolicyLevel),
  });
  const gate = gateProjection(w);
  const outlook = (next: World) => {
    const p = financeProjection(next).nextYear;
    return `1시즌 뒤 예상 자금 ${p.low === p.high ? format(p.low) : `${format(p.low)} ~ ${format(p.high)}`}`;
  };
  const ticketIndex = TICKET_LEVELS.findIndex((level) => level.price === w.ticket);
  const focus = w.training || 'balanced';
  return [
    policyDial('support', '★', (level) => {
      const p = policyPreview(w, 'support', level);
      return [
        level === policy.support
          ? `선수 급여 연 ${format(operatingCosts(w).playerWages)}`
          : `연간 운영비 ${signed(p.annualCostChange, format)}`,
        `라운드 성장 ×${p.developmentMultiplier} · 피로 회복 ${p.recoveryBonus >= 0 ? '+' : ''}${p.recoveryBonus}`,
        outlook({ ...w, policy: { ...policy, support: level } }),
      ];
    }),
    {
      key: 'training',
      icon: '◆',
      label: '훈련 방향',
      question: '이번 라운드 훈련은 무엇에 집중할까요?',
      levels: TRAINING_LEVELS,
      current: w.delegation?.training
        ? 0
        : TRAINING_LEVELS.findIndex((level) => level.focus === focus),
      command: (index): Command => {
        const chosen = TRAINING_LEVELS[index].focus;
        return chosen === 'staff'
          ? { type: 'delegate', key: 'training', value: true }
          : { type: 'training', focus: chosen };
      },
      preview: (index) => {
        const chosen = TRAINING_LEVELS[index].focus;
        if (chosen === 'staff') {
          const advice = autoTrainingAdvice(w);
          return [`지금 수석코치의 선택: ${trainingFocusInfo[advice.focus].label}`, advice.reason];
        }
        const info = trainingFocusInfo[chosen];
        return [
          `라운드마다 피로 ${info.recovery} 회복`,
          info.developmentMultiplier
            ? `유망주 성장 ×${info.developmentMultiplier}`
            : '라운드 훈련 성장 없음',
        ];
      },
    },
    policyDial('recruitment', '⇄', (level) => {
      const p = policyPreview(w, 'recruitment', level),
        fee = policyEffects({ ...policy, recruitment: level }).offer.feeMultiplier;
      return [
        `이적 시장 후보 ${p.offerAge[0]}–${p.offerAge[1]}세 · 능력 ${p.offerAbility[0]}–${p.offerAbility[1]}`,
        `이적료 ×${fee} · 지금 바로 후보가 바뀌어요`,
      ];
    }),
    policyDial('marketing', '♪', (level) => {
      const p = policyPreview(w, 'marketing', level),
        annual = operatingCosts({ ...w, policy: { ...policy, marketing: level } }).marketing;
      return [
        level === policy.marketing
          ? `마케팅비 연 ${format(annual)}`
          : `마케팅비 연 ${format(annual)} (운영비 ${signed(p.annualCostChange, format)})`,
        `팬 약 +${number(p.fansPerRound)}명/라운드 · 관중 수요 +${Math.round(
          policyEffects({ ...policy, marketing: level }).gateBoost * 100,
        )}%`,
        outlook({ ...w, policy: { ...policy, marketing: level } }),
      ];
    }),
    {
      key: 'ticket',
      icon: '◎',
      label: '티켓 가격',
      question: '홈 경기 입장권을 얼마에 팔까요?',
      levels: TICKET_LEVELS.map(({ name, summary }) => ({ name, summary })),
      current: ticketIndex,
      command: (index) => ({ type: 'ticket', price: TICKET_LEVELS[index].price }),
      preview: (index) => {
        const after = ticketInvestmentPreview(w, TICKET_LEVELS[index].price).after;
        return [
          `홈 관중 ${number(after.attendanceLow)}–${number(after.attendanceHigh)}명 (지금 ${number(gate.attendanceLow)}–${number(gate.attendanceHigh)}명)`,
          `경기당 입장 수입 ${format(after.incomeLow)}–${format(after.incomeHigh)}`,
          outlook({ ...w, ticket: TICKET_LEVELS[index].price }),
        ];
      },
    },
  ];
}

/** Ongoing club decisions: one tap previews the consequence, a second tap applies it. */
export function PolicyBoard({ w, client }: { w: World; client: GameClient }) {
  const acting = useGameState((state) => !!state.pendingActions);
  const readonly = useGameState((state) => state.readonly);
  const error = useGameState((state) => state.error);
  const blocked = acting || readonly || !!error || !!w.critical;
  const [draft, setDraft] = useState<{ key: Dial['key']; index: number }>();
  const [failure, setFailure] = useState('');
  const apply = async (dial: Dial, index: number) => {
    const reply = await client.command(dial.command(index), { background: true });
    if (reply?.ok) {
      setDraft(undefined);
      setFailure('');
    } else setFailure(client.state.error || '방침을 적용하지 못했어요.');
  };
  return (
    <section className={s.board} aria-label="구단 운영 방침">
      <header className={s.head}>
        <h2>운영 방침</h2>
        <p>단계를 누르면 바뀌는 점을 먼저 보여드려요. 적용하면 다음 정산부터 반영돼요.</p>
      </header>
      {dials(w).map((dial) => {
        const chosen = draft?.key === dial.key ? draft.index : undefined;
        const shown = chosen ?? dial.current;
        return (
          <article key={dial.key} className={s.dial} data-policy={dial.key}>
            <div className={s.dialHead}>
              <span className={s.icon} aria-hidden="true">
                {dial.icon}
              </span>
              <div>
                <h3>{dial.label}</h3>
                <small>{dial.question}</small>
              </div>
              <b className={s.current}>
                {dial.current >= 0 ? dial.levels[dial.current].name : '사용자 지정'}
              </b>
            </div>
            <div
              className={s.steps}
              role="radiogroup"
              aria-label={dial.label}
              style={{ gridTemplateColumns: `repeat(${dial.levels.length}, 1fr)` }}
            >
              {dial.levels.map((level, index) => (
                <button
                  key={level.name}
                  role="radio"
                  aria-checked={index === dial.current}
                  aria-label={`${dial.label} ${level.name}`}
                  className={`${index <= dial.current ? s.filled : ''} ${index === chosen ? s.drafted : ''}`}
                  disabled={blocked}
                  onClick={() =>
                    setDraft(
                      index === dial.current || index === chosen
                        ? undefined
                        : { key: dial.key, index },
                    )
                  }
                >
                  <i aria-hidden="true" />
                  <span>{level.name}</span>
                </button>
              ))}
            </div>
            {shown >= 0 && (
              <div className={`${s.effect} ${chosen !== undefined ? s.previewing : ''}`}>
                <p>
                  {chosen !== undefined && <b>바꾸면 · </b>}
                  {dial.levels[shown].summary}
                </p>
                <ul>
                  {dial.preview(shown).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {chosen !== undefined && (
                  <div className={s.confirm}>
                    <button onClick={() => setDraft(undefined)}>그대로 두기</button>
                    <button
                      className={s.apply}
                      disabled={blocked}
                      onClick={() => void apply(dial, chosen)}
                    >
                      ‘{dial.levels[chosen].name}’ 적용
                    </button>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
      {failure && (
        <p className={s.failure} role="alert">
          {failure}
        </p>
      )}
    </section>
  );
}
