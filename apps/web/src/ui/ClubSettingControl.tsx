import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BuildSlot } from '../../../../packages/contracts/src/build';
import { BUILD_OPTIONS } from '../../../../packages/contracts/src/build';
import type { Command, DirectionKey, PolicyLevel, World } from '../../../../packages/contracts/src/types';
import { BUILD_CARDS, BUILD_SLOT_INFO, type BuildEffects } from '../../../../packages/engine/src/build';
import { DIRECTION_INFO, directionOf } from '../../../../packages/engine/src/direction';
import { POLICY_INFO, policyOf } from '../../../../packages/engine/src/policy';
import { SALE_BARS } from '../../../../packages/engine/src/transfers';
import { gateProjection } from '../../../../packages/engine/src/finance';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { TICKET_LEVELS } from './ticketLevels';
import { Money } from './Money';
import { number } from './format';
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
      if (!reply?.ok) throw new Error(client.state.error || '변경하지 못했어요. 다시 선택해 주세요.');
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

export function InvestmentSlider<T extends string | number>({ label, options, value, disabled, onChange }: {
  label: string;
  options: readonly { value: T; name: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[index];
  return (
    <label className={s.slider}>
      <b>{selected.name}</b>
      <input type="range" min={0} max={options.length - 1} step={1} value={index}
        aria-label={label} aria-valuetext={selected.name} disabled={disabled}
        onChange={(event) => onChange(options[Number(event.currentTarget.value)].value)} />
      <span className={s.names} data-many={options.length > 6 || undefined} style={{ gridTemplateColumns: `repeat(${options.length > 6 ? 2 : options.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {options.map((option) => <span key={option.value} data-selected={value === option.value || undefined}>{option.name}</span>)}
      </span>
    </label>
  );
}

type Choice<T> = { value: T; name: string; summary: string };
function ChoiceSetting<T extends string | number>({ id, label, current, options, client, command, note, preview, applyLabel = '지침 적용' }: {
  id: string;
  label: string;
  current: T;
  options: readonly Choice<T>[];
  client: GameClient;
  command: (value: T) => Command;
  note?: string;
  applyLabel?: string;
  preview?: (value: T) => ReactNode;
}) {
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [current]);
  const action = useClubSettingAction(client);
  const currentName = options.find((option) => option.value === current)?.name ?? '사용자 지정';
  const option = options.find((option) => option.value === selected) ?? options[0];
  return (
    <section className={s.setting} data-control={id} aria-label={label}>
      <header><h4>{label}</h4><small>현재 · {currentName}</small></header>
      <InvestmentSlider label={label} value={selected} options={options} disabled={action.blocked} onChange={setSelected} />
      <p className={s.summary}>{option.summary}</p>
      {preview?.(selected)}
      <footer>
        {note && <small>{note}</small>}
        <button type="button" data-ui="primary" disabled={action.blocked || selected === current}
          onClick={() => void action.apply(command(selected), `${label} · ${option.name} 적용했어요.`)}>
          {action.busy ? '적용 중…' : applyLabel}
        </button>
      </footer>
      {action.error && <p role="alert">{action.error}</p>}
      {action.message && <p role="status" className={s.message}>{action.message}</p>}
    </section>
  );
}

export function DirectionSetting({ w, client, directionKey }: { w: World; client: GameClient; directionKey: DirectionKey }) {
  const info = DIRECTION_INFO[directionKey];
  return <ChoiceSetting id={`direction:${directionKey}`} label={info.label} current={directionOf(w, directionKey)} client={client}
    options={info.options.map((option) => ({ value: option.id, name: option.name, summary: option.summary }))}
    command={(choice) => ({ type: 'club-direction', key: directionKey, choice })}
    note="이후 담당자의 판단에 적용됩니다. 이미 맺은 계약은 유지됩니다." />;
}

export function RecruitmentGuideline({ w, client }: { w: World; client: GameClient }) {
  const info = POLICY_INFO.recruitment;
  return <ChoiceSetting<PolicyLevel> id="policy:recruitment" label={info.label} current={policyOf(w).recruitment} client={client}
    options={info.levels.map((option) => ({ value: option.level, name: option.name, summary: option.summary }))}
    command={(level) => ({ type: 'club-policy', key: 'recruitment', level })}
    note="담당자가 찾는 후보의 성향입니다. 이 지침 자체에는 투자비나 이적료 할증·할인이 없습니다." />;
}

const EFFECT_LABELS: Record<keyof BuildEffects, string> = {
  academyIntake: '입단 인원', academyPotential: '입단 잠재력', youthGrowth: '1군 유망주 성장',
  marketCandidates: '영입 후보', marketPotential: '후보 잠재력', marketAbility: '후보 능력',
  incomingBids: '이적 제안 빈도', saleFee: '매각 수입', sponsor: '후원 제안', campaignIncome: '기존 캠페인 수입',
  marketingFans: '마케팅 팬 증가', localBaseRate: '지역 기반 변화 속도', gateDemand: '관중 수요',
  winFans: '승리 시 팬 증가', homeStrength: '홈 전력', wage: '신규 연봉 요구', moraleBaseline: '분위기 기준점',
};
const MULTIPLIERS = new Set<keyof BuildEffects>(['youthGrowth', 'incomingBids', 'saleFee', 'sponsor', 'campaignIncome', 'marketingFans', 'localBaseRate', 'winFans', 'wage']);
function effectsSummary(effects: Partial<BuildEffects>) {
  return (Object.entries(effects) as [keyof BuildEffects, number][]).map(([key, value]) =>
    `${EFFECT_LABELS[key]} ${MULTIPLIERS.has(key) ? `×${value}` : key === 'gateDemand'
      ? `${value >= 0 ? '+' : ''}${Number((value * 100).toFixed(2))}%` : `${value >= 0 ? '+' : ''}${value}`}`,
  ).join(' · ') || '추가 보정 없이 기본 효과를 적용해요.';
}
export function BuildSetting({ w, client, slot }: { w: World; client: GameClient; slot: BuildSlot }) {
  const cards = BUILD_CARDS[slot] as Record<string, { label: string; effects: Partial<BuildEffects> }>;
  const options = [
    { value: 'standard', name: '표준', summary: effectsSummary({}) },
    ...BUILD_OPTIONS[slot].map((value) => ({ value, name: cards[value].label, summary: effectsSummary(cards[value].effects) })),
  ];
  return <ChoiceSetting id={`build:${slot}`} label={BUILD_SLOT_INFO[slot].label} current={w.build?.[slot] ?? 'standard'} client={client}
    applyLabel={slot === 'market' ? '지침 적용' : '운영 방식 적용'}
    options={options} command={(choice) => ({ type: 'club-build', slot, choice })}
    note={slot === 'market' ? '담당자의 수락 기준과 매각 효과에 함께 적용됩니다.' : '현재 운영 방식의 상시 효과입니다. 이미 맺은 계약의 금액은 유지됩니다.'}
    preview={slot === 'market' ? (value) => <p className={s.summary}>자동 매각 기본 수락선 · 일반 선수 가치의 {SALE_BARS[value][0]}% / 유망주 {SALE_BARS[value][1]}%{value === 'hold' ? ' · 주전 매각 금지' : ''}</p> : undefined} />;
}

export function TicketSetting({ w, client }: { w: World; client: GameClient }) {
  const club = clubOf(w);
  const custom = TICKET_LEVELS.some((option) => option.price === w.ticket) ? []
    : [{ value: w.ticket, name: '현재 사용자 지정', summary: '이전 저장의 현재 가격입니다.' }];
  return <ChoiceSetting<number> id="ticket" label="티켓 가격" current={w.ticket} client={client} applyLabel="가격 적용"
    options={[...custom, ...TICKET_LEVELS.map((option) => ({ value: option.price, name: option.name, summary: option.summary }))]}
    command={(price) => ({ type: 'club-ticket', price })} note="이후 홈 경기의 관중 수요와 입장 수입에 적용됩니다."
    preview={(price) => {
      const gate = gateProjection({ ...w, ticket: price });
      return <dl className={s.facts}>
        <div><dt>예상 홈 관중</dt><dd>{number(gate.attendanceLow)}–{number(gate.attendanceHigh)}명</dd></div>
        <div><dt>예상 홈 수입</dt><dd><Money value={gate.incomeLow} code={club.country} year={w.year} />–<Money value={gate.incomeHigh} code={club.country} year={w.year} /></dd></div>
      </dl>;
    }} />;
}
