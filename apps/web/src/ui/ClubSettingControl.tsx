import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
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
        throw new Error(client.state.error || sourceMessage('copy.ClubSettingControl.4a3f0ec1a8'));
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
  useTextLocale();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[index];
  return (
    <label className={s.slider}>
      <b>{localizeValue(selected.name)}</b>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        aria-label={localizeValue(label)}
        aria-valuetext={localizeValue(selected.name)}
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
        {localizeValue(
          options.map((option) => (
            <span key={option.value} data-selected={value === option.value || undefined}>
              {localizeValue(option.name)}
            </span>
          )),
        )}
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
  useTextLocale();
  return (
    <div
      className={s.radioGroup}
      role="radiogroup"
      aria-label={localizeValue(label)}
      data-ui="choices"
    >
      {localizeValue(
        options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            data-ui={value === option.value ? 'secondary' : undefined}
            tabIndex={
              value === option.value ||
              (!options.some((item) => item.value === value) && index === 0)
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
            {localizeValue(option.name)}
          </button>
        )),
      )}
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
  applyLabel = sourceMessage('copy.ClubSettingControl.120e27aa88'),
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
  useTextLocale();
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [current]);
  const action = useClubSettingAction(client);
  const currentName =
    options.find((option) => option.value === current)?.name ??
    sourceMessage('copy.ClubSettingControl.e1f51d6620');
  const option = options.find((option) => option.value === selected) ?? options[0];
  return (
    <section className={s.setting} data-control={id} aria-label={localizeValue(label)}>
      <header>
        <h4>{localizeValue(label)}</h4>
        <small>{richMessage('copy.ClubSettingControl.49f6765faa', { p0: currentName })}</small>
      </header>
      {localizeValue(
        sequential ? (
          <InvestmentSlider
            label={localizeValue(label)}
            value={selected}
            options={options}
            disabled={action.blocked}
            onChange={setSelected}
          />
        ) : (
          <SettingRadioGroup
            label={localizeValue(label)}
            value={selected}
            options={options}
            disabled={action.blocked}
            onChange={setSelected}
          />
        ),
      )}
      <p className={s.summary}>{localizeValue(option.summary)}</p>
      {localizeValue(preview?.(selected))}
      <footer>
        {localizeValue(note && <small>{localizeValue(note)}</small>)}
        <button
          type="button"
          data-ui="primary"
          disabled={action.blocked || selected === current}
          onClick={() =>
            void action.apply(
              command(selected),
              sourceMessage('copy.ClubSettingControl.a37d577f75', { p0: label, p1: option.name }),
            )
          }
        >
          {localizeValue(
            action.busy ? sourceMessage('copy.ClubSettingControl.304d48a5d2') : applyLabel,
          )}
        </button>
      </footer>
      {localizeValue(action.error && <p role="alert">{localizeValue(action.error)}</p>)}
      {localizeValue(
        action.message && (
          <p role="status" className={s.message}>
            {localizeValue(action.message)}
          </p>
        ),
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
  useTextLocale();
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
      label={localizeValue(info.label)}
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
      note={sourceMessage('copy.ClubSettingControl.f27e1608d6')}
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
    return sourceMessage('copy.ClubSettingControl.a53c6105cc', {
      p0: rule.sellSteps[0],
      p1: rule.sellSteps[1],
    });
  if (responsibility === 'academy')
    return sourceMessage('copy.ClubSettingControl.6084714551', { p0: rule.promotionYears });
  const common = sourceMessage('copy.ClubSettingControl.c7b9a9a3c9', { p0: rule.runway });
  if (responsibility === 'manager' || responsibility === 'staff') return common;
  const player = sourceMessage('copy.ClubSettingControl.46eb84c6e8', {
    p0: common,
    p1: Math.round(rule.wageShare * 100),
  });
  return responsibility === 'recruitment'
    ? sourceMessage('copy.ClubSettingControl.32693ff5d7', {
        p0: player,
        p1: Math.round(rule.signing.feeShare * 100),
        p2:
          rule.signing.margin === undefined
            ? sourceMessage('copy.ClubSettingControl.dfc8cdd784')
            : sourceMessage('copy.ClubSettingControl.561f6031d5', {
                p0: rule.signing.margin,
                p1: rule.signing.upgrades,
              }),
      })
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
  useTextLocale();
  return (
    <ChoiceSetting<FinanceChoice>
      id={`finance:${responsibility}`}
      label={displayMessage('copy.ClubSettingControl.847e6f4135')}
      sequential
      current={financeChoiceOf(w, responsibility)}
      client={client}
      options={DIRECTION_INFO.finance.options.map((option) => ({
        value: option.id as FinanceChoice,
        name: option.name,
        summary: financeSummary(w, responsibility, option.id as FinanceChoice),
      }))}
      command={(choice) => ({ type: 'decision-finance', responsibility, choice })}
      note={sourceMessage('copy.ClubSettingControl.584bcdc82b')}
    />
  );
}

const WAGE_LABELS: Record<WageResponsibility, string> = {
  manager: sourceMessage('copy.ClubSettingControl.f6ea0031ad'),
  staff: sourceMessage('copy.ClubSettingControl.6bd58fd2ae'),
  contracts: sourceMessage('copy.ClubSettingControl.1ca4d1ca3a'),
  recruitment: sourceMessage('copy.ClubSettingControl.f6b9e11a7c'),
  academy: sourceMessage('copy.ClubSettingControl.786a3bd73f'),
};
const WAGE_NOTES: Record<WageResponsibility, string> = {
  manager: sourceMessage('copy.ClubSettingControl.f2c4b06904'),
  staff: sourceMessage('copy.ClubSettingControl.653dbbed71'),
  contracts: sourceMessage('copy.ClubSettingControl.e05463e298'),
  recruitment: sourceMessage('copy.ClubSettingControl.baa2a7ac34'),
  academy: sourceMessage('copy.ClubSettingControl.315e4b60de'),
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
  useTextLocale();
  const current = annualWageLimit(w, responsibility) ?? 'unlimited';
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [current]);
  const action = useClubSettingAction(client);
  const club = clubOf(w);
  const office = useOfficeRead(w);
  if (!office) return <p role="status">{richMessage('copy.ClubSettingControl.0bfb2eb6fb')}</p>;
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
    ...amounts.map((value) => ({
      value,
      name:
        value === '0'
          ? sourceMessage('team.volunteer')
          : sourceMessage('copy.ClubSettingControl.1db473c2be', { p0: format(value) }),
    })),
    { value: 'unlimited', name: sourceMessage('copy.ClubSettingControl.5d57a45e99') },
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
      aria-label={localizeValue(WAGE_LABELS[responsibility])}
    >
      <header>
        <h4>{localizeValue(WAGE_LABELS[responsibility])}</h4>
        <small>
          {richMessage('copy.ClubSettingControl.49f6765faa', {
            p0:
              current === 'unlimited'
                ? sourceMessage('copy.ClubSettingControl.5d57a45e99')
                : sourceMessage('copy.ClubSettingControl.1db473c2be', { p0: format(current) }),
          })}
        </small>
      </header>
      <InvestmentSlider
        label={localizeValue(WAGE_LABELS[responsibility])}
        options={options}
        value={selected}
        disabled={action.blocked}
        onChange={setSelected}
      />
      <dl className={s.facts}>
        <div>
          <dt>{richMessage('copy.ClubSettingControl.6ca2855a88')}</dt>
          <dd>
            {localizeValue(
              selected === 'unlimited' ? (
                sourceMessage('copy.ClubSettingControl.5d57a45e99')
              ) : (
                <Money value={selected} code={club.country} year={w.year} plain />
              ),
            )}
          </dd>
        </div>
        {localizeValue(
          responsibility !== 'academy' && (
            <div>
              <dt>
                {localizeValue(
                  responsibility === 'manager'
                    ? sourceMessage('copy.ClubSettingControl.405d32305e')
                    : responsibility === 'staff'
                      ? sourceMessage('copy.ClubSettingControl.56517f62ff')
                      : sourceMessage('copy.ClubSettingControl.1e791904c3'),
                )}
              </dt>
              <dd>
                <Money value={currentTotal} code={club.country} year={w.year} plain />
              </dd>
            </div>
          ),
        )}
      </dl>
      <p className={s.summary}>{localizeValue(WAGE_NOTES[responsibility])}</p>
      <footer>
        <small>{richMessage('copy.ClubSettingControl.afd24f50c6')}</small>
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
              sourceMessage('copy.ClubSettingControl.160b7a07f3'),
            )
          }
        >
          {localizeValue(
            action.busy
              ? sourceMessage('copy.ClubSettingControl.304d48a5d2')
              : sourceMessage('copy.ClubSettingControl.d3c4f6c6bb'),
          )}
        </button>
      </footer>
      {localizeValue(action.error && <p role="alert">{localizeValue(action.error)}</p>)}
      {localizeValue(
        action.message && (
          <p role="status" className={s.message}>
            {localizeValue(action.message)}
          </p>
        ),
      )}
    </section>
  );
}

export function RecruitmentGuideline({ w, client }: { w: World; client: GameClient }) {
  useTextLocale();
  const info = POLICY_INFO.recruitment;
  return (
    <ChoiceSetting<PolicyLevel>
      id="policy:recruitment"
      label={localizeValue(info.label)}
      current={policyOf(w).recruitment}
      client={client}
      options={info.levels.map((option) => ({
        value: option.level,
        name: option.name,
        summary: option.summary,
      }))}
      command={(level) => ({ type: 'club-policy', key: 'recruitment', level })}
      note={sourceMessage('copy.ClubSettingControl.7cb248c3df')}
    />
  );
}

const EFFECT_LABELS: Record<keyof BuildEffects, string> = {
  academyIntake: sourceMessage('copy.ClubSettingControl.5f570520eb'),
  academyPotential: sourceMessage('copy.ClubSettingControl.8b55b3cb94'),
  youthGrowth: sourceMessage('office.effect.youthGrowth'),
  marketCandidates: sourceMessage('copy.ClubSettingControl.2051d3609a'),
  marketPotential: sourceMessage('copy.ClubSettingControl.527760f774'),
  marketAbility: sourceMessage('copy.ClubSettingControl.7d315fdd9a'),
  incomingBids: sourceMessage('copy.ClubSettingControl.9584df4fe3'),
  saleFee: sourceMessage('copy.ClubSettingControl.6463471d45'),
  sponsor: sourceMessage('copy.ClubSettingControl.1fff7e705f'),
  campaignIncome: sourceMessage('copy.ClubSettingControl.96c842807c'),
  marketingFans: sourceMessage('copy.ClubSettingControl.5d0a29b501'),
  localBaseRate: sourceMessage('copy.ClubSettingControl.978633c252'),
  gateDemand: sourceMessage('copy.ClubSettingControl.f8156d6a55'),
  winFans: sourceMessage('copy.ClubSettingControl.0c3a2e868a'),
  homeStrength: sourceMessage('copy.ClubSettingControl.ec30e2f1a4'),
  wage: sourceMessage('copy.ClubSettingControl.7d035efe34'),
  moraleBaseline: sourceMessage('copy.ClubSettingControl.6a3eb5782b'),
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
      .join(' · ') || sourceMessage('copy.ClubSettingControl.cbae18adeb')
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
  useTextLocale();
  const cards = BUILD_CARDS[slot] as Record<
    string,
    { label: string; effects: Partial<BuildEffects> }
  >;
  const options = [
    {
      value: 'standard',
      name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
      summary: effectsSummary({}),
    },
    ...BUILD_OPTIONS[slot].map((value) => ({
      value,
      name: cards[value].label,
      summary: effectsSummary(cards[value].effects),
    })),
  ];
  return (
    <ChoiceSetting
      id={`build:${slot}`}
      label={localizeValue(BUILD_SLOT_INFO[slot].label)}
      current={w.build?.[slot] ?? 'standard'}
      client={client}
      applyLabel={
        slot === 'market'
          ? sourceMessage('copy.ClubSettingControl.120e27aa88')
          : sourceMessage('copy.ClubSettingControl.55c1cc7a63')
      }
      options={options}
      command={(choice) => ({ type: 'club-build', slot, choice })}
      note={
        slot === 'market'
          ? sourceMessage('copy.ClubSettingControl.d151de2c37')
          : sourceMessage('copy.ClubSettingControl.4eb84c564a')
      }
      preview={
        slot === 'market'
          ? (value) => (
              <p className={s.summary}>
                {richMessage('copy.ClubSettingControl.8121b862dd', {
                  p0: SALE_BARS[value][0],
                  p1: ' ',
                  p2: SALE_BARS[value][1],
                  p3: value === 'hold' ? sourceMessage('copy.ClubSettingControl.3918694a9e') : '',
                })}
              </p>
            )
          : undefined
      }
    />
  );
}

export function TicketSetting({ w, client }: { w: World; client: GameClient }) {
  useTextLocale();
  const club = clubOf(w);
  const office = useOfficeRead(w);
  if (!office) return null;
  const custom = TICKET_LEVELS.some((option) => option.price === w.ticket)
    ? []
    : [
        {
          value: w.ticket,
          name: sourceMessage('copy.ClubSettingControl.7b764778e0'),
          summary: sourceMessage('copy.ClubSettingControl.6c7b2b20c8'),
        },
      ];
  return (
    <ChoiceSetting<number>
      id="ticket"
      label={displayMessage('copy.ClubSettingControl.9cf728a837')}
      current={w.ticket}
      client={client}
      applyLabel={sourceMessage('copy.ClubSettingControl.87fdf04129')}
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
      note={sourceMessage('copy.ClubSettingControl.984f8be4d1')}
      preview={(price) => {
        const gate = office.ticketGates[String(price)];
        return (
          <dl className={s.facts}>
            <div>
              <dt>{richMessage('copy.ClubSettingControl.02739c722e')}</dt>
              <dd>
                {richMessage('copy.ClubSettingControl.af70cdc2c5', {
                  p0: number(gate.attendanceLow),
                  p1: number(gate.attendanceHigh),
                })}
              </dd>
            </div>
            <div>
              <dt>{richMessage('copy.ClubSettingControl.34a401372c')}</dt>
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
