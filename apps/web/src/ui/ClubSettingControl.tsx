import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BuildSlot } from '../../../../packages/contracts/src/build';
import { BUILD_OPTIONS } from '../../../../packages/contracts/src/build';
import type {
  BudgetResponsibility,
  Command,
  DirectionKey,
  FinanceChoice,
  PolicyLevel,
  WageResponsibility,
  World,
} from '../../../../packages/contracts/src/types';
import {
  BUILD_CARDS,
  BUILD_SLOT_INFO,
  type BuildEffects,
} from '../../../../packages/engine/src/build';
import {
  annualWageLimit,
  DIRECTION_INFO,
  directionOf,
  financeChoiceOf,
  financeStance,
} from '../../../../packages/engine/src/direction';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { SALE_BARS } from '../../../../packages/engine/src/transfer-policy';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { TICKET_LEVELS } from './ticketLevels';
import { Money } from './Money';
import { number } from './format';
import { compactMoney } from './format';
import { useOfficeRead } from './useOfficeRead';
import s from './ClubSettingControl.module.css';

export function useClubSettingAction(client: GameClient) {
  const blocked = useGameState(gameActionsBlocked);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const apply = async (command: Command, success: string) => {
    if (blocked || pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const reply = await client.command(command, { background: true });
      if (!reply?.ok)
        throw new Error(client.state.error || '변경하지 못했어요. 다시 선택해 주세요.');
      setMessage(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { blocked: blocked || busy, busy, error, message, apply };
}

export function InvestmentSlider<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly { value: T; name: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[index];
  return (
    <label className={s.slider}>
      <b>{selected.name}</b>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        aria-label={label}
        aria-valuetext={selected.name}
        disabled={disabled}
        onChange={(event) => onChange(options[Number(event.currentTarget.value)].value)}
      />
      <span
        className={s.names}
        data-many={options.length > 6 || undefined}
        style={{
          gridTemplateColumns: `repeat(${options.length > 6 ? 2 : options.length}, minmax(0, 1fr))`,
        }}
        aria-hidden="true"
      >
        {options.map((option) => (
          <span key={option.value} data-selected={value === option.value || undefined}>
            {option.name}
          </span>
        ))}
      </span>
    </label>
  );
}

/** Named alternatives have no numeric order; one checked button is the selected radio. */
export function SettingRadioGroup<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly { value: T; name: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className={s.radioGroup} role="radiogroup" aria-label={label} data-ui="choices">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-ui={value === option.value ? 'secondary' : undefined}
          tabIndex={
            value === option.value || (!options.some((item) => item.value === value) && index === 0)
              ? 0
              : -1
          }
          disabled={disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? (index + 1) % options.length
                    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                      ? (index + options.length - 1) % options.length
                      : undefined;
            if (next === undefined) return;
            event.preventDefault();
            onChange(options[next].value);
            const buttons =
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                '[role="radio"]',
              );
            buttons?.[next]?.focus();
          }}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

type Choice<T> = { value: T; name: string; summary: string };
function ChoiceSetting<T extends string | number>({
  id,
  label,
  current,
  options,
  client,
  command,
  note,
  preview,
  applyLabel = '지침 적용',
  sequential = false,
}: {
  id: string;
  label: string;
  current: T;
  options: readonly Choice<T>[];
  client: GameClient;
  command: (value: T) => Command;
  note?: string;
  applyLabel?: string;
  sequential?: boolean;
  preview?: (value: T) => ReactNode;
}) {
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [current]);
  const action = useClubSettingAction(client);
  const currentName = options.find((option) => option.value === current)?.name ?? '사용자 지정';
  const option = options.find((option) => option.value === selected) ?? options[0];
  return (
    <section className={s.setting} data-control={id} aria-label={label}>
      <header>
        <h4>{label}</h4>
        <small>현재 · {currentName}</small>
      </header>
      {sequential ? (
        <InvestmentSlider
          label={label}
          value={selected}
          options={options}
          disabled={action.blocked}
          onChange={setSelected}
        />
      ) : (
        <SettingRadioGroup
          label={label}
          value={selected}
          options={options}
          disabled={action.blocked}
          onChange={setSelected}
        />
      )}
      <p className={s.summary}>{option.summary}</p>
      {preview?.(selected)}
      <footer>
        {note && <small>{note}</small>}
        <button
          type="button"
          data-ui="primary"
          disabled={action.blocked || selected === current}
          onClick={() =>
            void action.apply(command(selected), `${label} · ${option.name} 적용했어요.`)
          }
        >
          {action.busy ? '적용 중…' : applyLabel}
        </button>
      </footer>
      {action.error && <p role="alert">{action.error}</p>}
      {action.message && (
        <p role="status" className={s.message}>
          {action.message}
        </p>
      )}
    </section>
  );
}

export function DirectionSetting({
  w,
  client,
  directionKey,
}: {
  w: World;
  client: GameClient;
  directionKey: DirectionKey;
}) {
  const info = DIRECTION_INFO[directionKey];
  const options =
    directionKey === 'debut'
      ? ['early', 'standard', 'ready', 'late'].map((id) =>
          info.options.find((option) => option.id === id)!,
        )
      : info.options;
  return (
    <ChoiceSetting
      id={`direction:${directionKey}`}
      label={info.label}
      current={directionOf(w, directionKey)}
      client={client}
      sequential={
        directionKey === 'finance' || directionKey === 'coaches' || directionKey === 'debut'
      }
      options={options.map((option) => ({
        value: option.id,
        name: option.name,
        summary: option.summary,
      }))}
      command={(choice) => ({ type: 'club-direction', key: directionKey, choice })}
      note="이후 담당자의 판단에 적용됩니다. 이미 맺은 계약은 유지됩니다."
    />
  );
}

function financeSummary(w: World, responsibility: BudgetResponsibility, choice: FinanceChoice) {
  const sample = {
    ...w,
    decisionBudgets: {
      ...w.decisionBudgets,
      [responsibility]: { ...w.decisionBudgets?.[responsibility], finance: choice },
    },
  };
  const rule = financeStance(sample, responsibility);
  if (responsibility === 'sales')
    return `운영자금이 고정비 ${rule.sellSteps[0]} / ${rule.sellSteps[1]}라운드분보다 적으면 매각 수락선을 낮춰요.`;
  if (responsibility === 'academy')
    return `운영자금이 연간 운영비 ${rule.promotionYears}년분 이상일 때 승격해요.`;
  const common = `계약금·보상금을 낸 뒤 고정비 ${rule.runway}라운드분을 남겨요.`;
  if (responsibility === 'manager' || responsibility === 'staff') return common;
  const player = `${common} 연간 인건비가 최근 수입의 ${Math.round(rule.wageShare * 100)}% 안이어야 해요.`;
  return responsibility === 'recruitment'
    ? `${player} 이적료는 여유 자금의 ${Math.round(rule.signing.feeShare * 100)}%까지 · ${rule.signing.margin === undefined ? '빈자리만 보강' : `주전보다 ${rule.signing.margin} 이상 우수한 선수를 시장마다 ${rule.signing.upgrades}명까지 보강`}`
    : player;
}
export function DecisionFinanceSetting({
  w,
  client,
  responsibility,
}: {
  w: World;
  client: GameClient;
  responsibility: BudgetResponsibility;
}) {
  return (
    <ChoiceSetting<FinanceChoice>
      id={`finance:${responsibility}`}
      label="이 업무의 지출 기준"
      sequential
      current={financeChoiceOf(w, responsibility)}
      client={client}
      options={DIRECTION_INFO.finance.options.map((option) => ({
        value: option.id as FinanceChoice,
        name: option.name,
        summary: financeSummary(w, responsibility, option.id as FinanceChoice),
      }))}
      command={(choice) => ({ type: 'decision-finance', responsibility, choice })}
      note="이 업무에만 적용됩니다. 다른 업무의 기준은 바뀌지 않습니다."
    />
  );
}

const WAGE_LABELS: Record<WageResponsibility, string> = {
  manager: '감독 1명당 연봉 한도',
  staff: '스태프 1명당 연봉 한도',
  contracts: '재계약 선수 1명당 연봉 한도',
  recruitment: '영입 선수 1명당 연봉 한도',
  academy: '승격 선수 1명당 연봉 한도',
};
const WAGE_NOTES: Record<WageResponsibility, string> = {
  manager:
    '한도를 넘는 감독은 자동 선임·재계약하지 않습니다. 대체 후보가 없어도 한도를 넘겨 계약하지 않습니다.',
  staff:
    '단장·스카우트·코치에게 각각 적용합니다. 자동 채용·재계약에서 한도를 넘으면 예산 안의 후보를 찾고, 없으면 자원봉사자가 맡습니다.',
  contracts:
    '요구 연봉이 한도를 넘으면 자동 재계약·계약 개선을 거절합니다. 재계약 기조의 시장가 기준과 이 금액 중 낮은 한도를 적용합니다.',
  recruitment:
    '요구 연봉이 한도를 넘는 선수는 자동 영입하지 않습니다. 이적료·임대료는 별도이며 이 업무의 지출 기준을 따릅니다.',
  academy: '프로 계약 연봉이 한도를 넘으면 자동 승격을 미룹니다.',
};
export function WageBudgetSetting({
  w,
  client,
  responsibility,
}: {
  w: World;
  client: GameClient;
  responsibility: WageResponsibility;
}) {
  const current = annualWageLimit(w, responsibility) ?? 'unlimited';
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [current]);
  const action = useClubSettingAction(client);
  const club = clubOf(w);
  const office = useOfficeRead(w);
  if (!office) return <p role="status">연봉 기준을 불러오는 중…</p>;
  const reference = BigInt(office.wageReference[responsibility]);
  const base = reference > 0n ? reference : 1n;
  const amounts = [
    ...new Set([
      ...[0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500].map((percent) =>
        ((base * BigInt(percent)) / 100n).toString(),
      ),
      ...[current, selected].filter((value) => value !== 'unlimited'),
    ]),
  ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  const format = (value: string) => compactMoney(value, club.country, w.year);
  const options = [
    ...amounts.map((value) => ({ value, name: value === '0' ? '무급' : `${format(value)} / 년` })),
    { value: 'unlimited', name: '별도 상한 없음' },
  ];
  const currentTotal =
    responsibility === 'manager'
      ? BigInt(w.manager.wage)
      : responsibility === 'staff'
        ? (w.staff ?? []).reduce((sum, person) => sum + BigInt(person.wage), 0n)
        : responsibility === 'academy'
          ? 0n
          : w.players
              .filter((player) => player.status === 'active')
              .reduce((sum, player) => sum + BigInt(player.wage), 0n);
  return (
    <section
      className={`${s.setting} ${s.wageBudget}`}
      data-control={`wage:${responsibility}`}
      aria-label={WAGE_LABELS[responsibility]}
    >
      <header>
        <h4>{WAGE_LABELS[responsibility]}</h4>
        <small>
          현재 · {current === 'unlimited' ? '별도 상한 없음' : `${format(current)} / 년`}
        </small>
      </header>
      <InvestmentSlider
        label={WAGE_LABELS[responsibility]}
        options={options}
        value={selected}
        disabled={action.blocked}
        onChange={setSelected}
      />
      <dl className={s.facts}>
        <div>
          <dt>1인당 연간 상한</dt>
          <dd>
            {selected === 'unlimited' ? (
              '별도 상한 없음'
            ) : (
              <Money value={selected} code={club.country} year={w.year} plain />
            )}
          </dd>
        </div>
        {responsibility !== 'academy' && (
          <div>
            <dt>
              {responsibility === 'manager'
                ? '현재 감독 연봉'
                : responsibility === 'staff'
                  ? '현재 스태프 연봉 합계'
                  : '현재 선수 연봉 합계'}
            </dt>
            <dd>
              <Money value={currentTotal} code={club.country} year={w.year} plain />
            </dd>
          </div>
        )}
      </dl>
      <p className={s.summary}>{WAGE_NOTES[responsibility]}</p>
      <footer>
        <small>
          기존 계약은 유지됩니다. 이후 자동 판단에 적용하며 직접 결재할 때는 개별 계약을 선택할 수
          있습니다.
        </small>
        <button
          type="button"
          data-ui="primary"
          disabled={action.blocked || selected === current}
          onClick={() =>
            void action.apply(
              {
                type: 'decision-wage-limit',
                responsibility,
                amount: selected === 'unlimited' ? null : selected,
              },
              '연봉 한도를 적용했어요.',
            )
          }
        >
          {action.busy ? '적용 중…' : '연봉 한도 적용'}
        </button>
      </footer>
      {action.error && <p role="alert">{action.error}</p>}
      {action.message && (
        <p role="status" className={s.message}>
          {action.message}
        </p>
      )}
    </section>
  );
}

export function RecruitmentGuideline({ w, client }: { w: World; client: GameClient }) {
  const info = POLICY_INFO.recruitment;
  return (
    <ChoiceSetting<PolicyLevel>
      id="policy:recruitment"
      label={info.label}
      current={policyOf(w).recruitment}
      client={client}
      options={info.levels.map((option) => ({
        value: option.level,
        name: option.name,
        summary: option.summary,
      }))}
      command={(level) => ({ type: 'club-policy', key: 'recruitment', level })}
      note="담당자가 찾는 후보의 성향입니다. 이 지침 자체에는 투자비나 이적료 할증·할인이 없습니다."
    />
  );
}

const EFFECT_LABELS: Record<keyof BuildEffects, string> = {
  academyIntake: '입단 인원',
  academyPotential: '입단 잠재력',
  youthGrowth: '1군 유망주 성장',
  marketCandidates: '영입 후보',
  marketPotential: '후보 잠재력',
  marketAbility: '후보 능력',
  incomingBids: '이적 제안 빈도',
  saleFee: '매각 수입',
  sponsor: '후원 제안',
  campaignIncome: '기존 캠페인 수입',
  marketingFans: '마케팅 팬 증가',
  localBaseRate: '지역 기반 변화 속도',
  gateDemand: '관중 수요',
  winFans: '승리 시 팬 증가',
  homeStrength: '홈 전력',
  wage: '신규 연봉 요구',
  moraleBaseline: '분위기 기준점',
};
const MULTIPLIERS = new Set<keyof BuildEffects>([
  'youthGrowth',
  'incomingBids',
  'saleFee',
  'sponsor',
  'campaignIncome',
  'marketingFans',
  'localBaseRate',
  'winFans',
  'wage',
]);
function effectsSummary(effects: Partial<BuildEffects>) {
  return (
    (Object.entries(effects) as [keyof BuildEffects, number][])
      .map(
        ([key, value]) =>
          `${EFFECT_LABELS[key]} ${
            MULTIPLIERS.has(key)
              ? `×${value}`
              : key === 'gateDemand'
                ? `${value >= 0 ? '+' : ''}${Number((value * 100).toFixed(2))}%`
                : `${value >= 0 ? '+' : ''}${value}`
          }`,
      )
      .join(' · ') || '추가 보정 없이 기본 효과를 적용해요.'
  );
}
export function BuildSetting({
  w,
  client,
  slot,
}: {
  w: World;
  client: GameClient;
  slot: BuildSlot;
}) {
  const cards = BUILD_CARDS[slot] as Record<
    string,
    { label: string; effects: Partial<BuildEffects> }
  >;
  const options = [
    { value: 'standard', name: '표준', summary: effectsSummary({}) },
    ...BUILD_OPTIONS[slot].map((value) => ({
      value,
      name: cards[value].label,
      summary: effectsSummary(cards[value].effects),
    })),
  ];
  return (
    <ChoiceSetting
      id={`build:${slot}`}
      label={BUILD_SLOT_INFO[slot].label}
      current={w.build?.[slot] ?? 'standard'}
      client={client}
      applyLabel={slot === 'market' ? '지침 적용' : '운영 방식 적용'}
      options={options}
      command={(choice) => ({ type: 'club-build', slot, choice })}
      note={
        slot === 'market'
          ? '담당자의 수락 기준과 매각 효과에 함께 적용됩니다.'
          : '현재 운영 방식의 상시 효과입니다. 이미 맺은 계약의 금액은 유지됩니다.'
      }
      preview={
        slot === 'market'
          ? (value) => (
              <p className={s.summary}>
                자동 매각 기본 수락선 · 일반 선수 가치의 {SALE_BARS[value][0]}% / 유망주{' '}
                {SALE_BARS[value][1]}%{value === 'hold' ? ' · 주전 매각 금지' : ''}
              </p>
            )
          : undefined
      }
    />
  );
}

export function TicketSetting({ w, client }: { w: World; client: GameClient }) {
  const club = clubOf(w);
  const office = useOfficeRead(w);
  if (!office) return null;
  const custom = TICKET_LEVELS.some((option) => option.price === w.ticket)
    ? []
    : [{ value: w.ticket, name: '현재 사용자 지정', summary: '이전 저장의 현재 가격입니다.' }];
  return (
    <ChoiceSetting<number>
      id="ticket"
      label="티켓 가격"
      current={w.ticket}
      client={client}
      applyLabel="가격 적용"
      sequential
      options={[
        ...custom,
        ...TICKET_LEVELS.map((option) => ({
          value: option.price,
          name: option.name,
          summary: option.summary,
        })),
      ]}
      command={(price) => ({ type: 'club-ticket', price })}
      note="이후 홈 경기의 관중 수요와 입장 수입에 적용됩니다."
      preview={(price) => {
        const gate = office.ticketGates[String(price)];
        return (
          <dl className={s.facts}>
            <div>
              <dt>예상 홈 관중</dt>
              <dd>
                {number(gate.attendanceLow)}–{number(gate.attendanceHigh)}명
              </dd>
            </div>
            <div>
              <dt>예상 홈 수입</dt>
              <dd>
                <Money value={gate.incomeLow} code={club.country} year={w.year} />–
                <Money value={gate.incomeHigh} code={club.country} year={w.year} />
              </dd>
            </div>
          </dl>
        );
      }}
    />
  );
}
