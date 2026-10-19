import type { ReactNode } from 'react';
import type { PolicyKey, PolicyLevel, World } from '../../../../packages/contracts/src/types';
import {
  INVESTMENT_ROWS,
  policyEffects,
  policyOf,
  policyPreview,
  marketingFanGain,
} from '../../../../packages/engine/src/policy';
import { gateProjection, operatingCosts } from '../../../../packages/engine/src/finance';
import { clubOf } from '../../../../packages/engine/src/world';
import { financeProjection } from '../../../../packages/engine/src/projection';
import { academyIntakeOutlook } from '../../../../packages/engine/src/academy';
import { globalReachOf, localBaseOf, tourTerms } from '../../../../packages/engine/src/bases';
import {
  dialInfo,
  dialLabel,
  dialPreview,
  stepIndex,
  stepName,
  stepValue,
  type DirectionChange,
  type PolicyChange,
  type TicketChange,
} from './board';
import { DIRECTION_INFO } from '../../../../packages/engine/src/direction';
import { number } from './format';
import { Money } from './Money';
import { TICKET_LEVELS } from './ticketLevels';
import s from './PolicyBoard.module.css';

export { TICKET_LEVELS };
// The dial steps live in board.ts; the strategy screens still read them from here.
export { dialInfo, dialLabel, stepIndex, stepValue };

import type { DialKey } from './areas';
export type { DialKey };

const isInvestment = (key: DialKey): key is (typeof INVESTMENT_ROWS)[number] =>
  (INVESTMENT_ROWS as readonly DialKey[]).includes(key);

/** Amounts in the one money notation, the exact value a tap away (→WEB-67). */
function amounts(w: World) {
  const code = clubOf(w).country;
  const money = (value: string) => <Money value={value} code={code} year={w.year} />;
  const signed = (value: string) =>
    BigInt(value) === 0n ? (
      '변화 없음'
    ) : (
      <>
        {BigInt(value) > 0n ? '+' : ''}
        {money(value)}
      </>
    );
  const range = ({ low, high }: { low: string; high: string }) =>
    low === high ? (
      money(low)
    ) : (
      <>
        {money(low)} ~ {money(high)}
      </>
    );
  return { money, signed, range };
}

/**
 * The lines under a dial for the step shown: its running cost and what it buys; a drafted step
 * adds the change in yearly costs and the cash at season end (→ECON-18).
 */
export function DialLines({ w, dialKey, index }: { w: World; dialKey: DialKey; index: number }) {
  const { money, signed, range } = amounts(w);
  const policy = policyOf(w),
    current = dialInfo(w, dialKey).current,
    drafted = index !== current,
    value = stepValue(dialKey, index);
  const nextPolicy = dialKey === 'ticket' ? policy : { ...policy, [dialKey]: value as PolicyLevel },
    effects = policyEffects(nextPolicy),
    next: World = { ...w, policy: nextPolicy, ticket: dialKey === 'ticket' ? value : w.ticket };
  const change = (key: PolicyKey) =>
    drafted ? (
      <> (운영비 {signed(policyPreview(w, key, value as PolicyLevel).annualCostChange)})</>
    ) : null;
  const lines: ReactNode[] = [];
  if (dialKey === 'support')
    lines.push(
      <>
        운영 경비 ×{effects.operatingFactor} · 연 {money(operatingCosts(next).expenses)}
        {change('support')}
      </>,
    );
  else if (dialKey === 'recruitment') {
    if (drafted) lines.push('적용하면 이적 시장 후보가 바로 바뀌어요');
  } else if (dialKey === 'tour') {
    const terms = tourTerms(w, effects.tour);
    if (effects.tour)
      lines.push(
        <>
          시즌 시작에 투어 수입 약 {money(terms.income)} · 글로벌 인지도 +{terms.reach} · 모든 선수
          피로 +{terms.fatigue}
        </>,
      );
  } else if (isInvestment(dialKey)) {
    // Each investment row's own spend: the line's total less the line without this row.
    const without: World = { ...next, policy: { ...nextPolicy, [dialKey]: 1 } },
      spend = (
        BigInt(operatingCosts(next).investment) - BigInt(operatingCosts(without).investment)
      ).toString(),
      local = dialKey === 'localInvest' || dialKey === 'grassroots',
      target = local ? effects.baseTargets.local : effects.baseTargets.global,
      base = `${local ? '지역 기반' : '글로벌 인지도'} 목표 ${target} (지금 ${Math.round(
        local ? localBaseOf(w) : globalReachOf(w),
      )})`;
    lines.push(
      <>
        투자비 연 {money(spend)}
        {change(dialKey)}
      </>,
      dialKey === 'localInvest'
        ? `관중 수요 +${Math.round(effects.gateBoost * 100)}% · ${base}`
        : dialKey === 'grassroots'
          ? `유스 입단 잠재력 +${effects.grassrootsPotential} · ${base}`
          : dialKey === 'globalMarketing'
            ? `팬 약 +${number(marketingFanGain(clubOf(w).fans, effects.fanGrowth))}명/라운드 · ${base}`
            : `이적 시장 후보 +${effects.scoutCandidates}명 · 후보 잠재력 +${effects.scoutPotential} · ${base}`,
    );
  } else if (dialKey === 'academy') {
    const intake = academyIntakeOutlook(next),
      now = academyIntakeOutlook(w);
    lines.push(
      <>
        유소년 투자 연 {money(operatingCosts(next).academy)}
        {change('academy')}
      </>,
      `다음 유스 입단 ${intake.size}명 · 잠재력 80+ 유망주가 나올 확률 ${Math.round(intake.golden * 100)}%${
        drafted ? ` (지금 ${Math.round(now.golden * 100)}%)` : ''
      }`,
    );
  } else {
    const after = gateProjection(next),
      before = gateProjection(w);
    lines.push(
      `홈 관중 ${number(after.attendanceLow)}–${number(after.attendanceHigh)}명${
        drafted ? ` (지금 ${number(before.attendanceLow)}–${number(before.attendanceHigh)}명)` : ''
      }`,
      <>
        경기당 입장 수입 {money(after.incomeLow)}–{money(after.incomeHigh)}
      </>,
    );
  }
  if (drafted && dialKey !== 'recruitment' && dialKey !== 'tour')
    lines.push(<>시즌 말 예상 자금 {range(financeProjection(next).seasonEnd)}</>);
  if (!lines.length) return null;
  return (
    <ul>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * A changed dial in the draft bar: from and to, its cost per round (and a year, since a round's
 * share of a small budget rounds to nothing) and the cash at season end with only that dial
 * moved; the ticket shows its gate instead of a cost (→WEB-60).
 */
export function DialChange({ w, change }: { w: World; change: PolicyChange | TicketChange }) {
  const { signed, money, range } = amounts(w);
  const key: DialKey = change.kind === 'ticket' ? 'ticket' : change.key;
  const preview = dialPreview(w, change);
  return (
    <li className={s.change} data-change={key}>
      <b>
        {dialLabel(key)} {stepName(key, change.from)} → {stepName(key, change.to)}
      </b>
      <span>
        {preview.gate ? (
          <>
            홈 관중 {number(preview.gate.attendanceLow)}–{number(preview.gate.attendanceHigh)}명 ·
            경기당 입장 수입 {money(preview.gate.incomeLow)}–{money(preview.gate.incomeHigh)}
          </>
        ) : key === 'recruitment' ? (
          '비용 변화 없음 · 이적 시장 후보가 바로 바뀌어요'
        ) : key === 'tour' ? (
          <TourChange w={w} level={change.to} />
        ) : (
          <>
            라운드마다 {signed(preview.perRound)} · 연 {signed(preview.annual)}
          </>
        )}
        {key !== 'recruitment' && key !== 'tour' && (
          <> · 시즌 말 예상 자금 {range(preview.seasonEnd)}</>
        )}
      </span>
    </li>
  );
}

/** A drafted tour's terms: what it pays and does as the next season starts. */
function TourChange({ w, level }: { w: World; level: number }) {
  const { money } = amounts(w);
  const terms = tourTerms(w, level - 1);
  return level > 1 ? (
    <>
      다음 시즌 시작에 투어 수입 약 {money(terms.income)} · 글로벌 인지도 +{terms.reach} · 모든 선수
      피로 +{terms.fatigue}
    </>
  ) : (
    '다음 시즌부터 투어 없음'
  );
}

/** A changed direction row in the draft bar: from → to, then what the new option has the staff do. */
export function DirectionChangeLine({ change }: { change: DirectionChange }) {
  const info = DIRECTION_INFO[change.key],
    name = (id: string) => info.options.find((option) => option.id === id)!.name,
    to = info.options.find((option) => option.id === change.to)!;
  return (
    <li className={s.change} data-change={change.key}>
      <b>
        {info.label} {name(change.from)} → {to.name}
      </b>
      <span>{to.summary}</span>
    </li>
  );
}
