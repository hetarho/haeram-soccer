import { useId, useState, type CSSProperties } from 'react';
import type { DividendShare } from '../../../../packages/contracts/src/owner';
import type { Command, World } from '../../../../packages/contracts/src/types';
import { FAN_MOOD, FFP, OWNER_BUSINESS } from '../../../../packages/engine/src/owner-config';
import type { GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Card } from './Card';
import { Dialog } from './Dialog';
import { Money } from './Money';
import { DeskStats } from './OfficeDesk';
import { Segments } from './Segments';
import { compactMoney, percent, seasonName } from './format';
import {
  DIVIDEND_DIAL,
  dividendOutlook,
  fanMovers,
  ffpRoom,
  injectionLimit,
  injectionOutlook,
  injectionSteps,
  lastDividend,
  mood,
  moodChange,
  ownerIdentity,
  ownerLock,
  ownerStatuses,
  ownMoney,
  stakeOutlook,
} from './ownerFigures';
import s from './OwnerSheet.module.css';

/** A change's tone by sign (→DESIGN-SYSTEM: a rise in red, a fall in blue). */
const tone = (value: bigint | number) => (value > 0 ? s.up : value < 0 ? s.down : undefined);
const odds = (chance: number) => percent(chance * 100, 100);

export interface OwnerSheetBodyProps {
  w: World;
  /** Why the controls are locked (→WEB-97); drafts and previews stay open while they are. */
  lock?: string;
  /** A command in flight. */
  sending: boolean;
  /** The last command's outcome or refusal. */
  message: string;
  onCommand(command: Command, success: string): Promise<boolean>;
}

/**
 * The 구단주 sheet's content (→WEB-114): the fortune, the business stake with its odds, living
 * costs, 자금 투입 within FFP, the 배당 dial and 팬 민심 with what moved it. Each control is a draft
 * whose effect shows before its one button applies it (→WEB-36).
 */
export function OwnerSheetBody({ w, lock, sending, message, onCommand }: OwnerSheetBodyProps) {
  const owner = w.owner!;
  const id = useId();
  const [stake, setStake] = useState(owner.stake);
  const [dividend, setDividend] = useState<DividendShare>(owner.dividendShare);
  const [injection, setInjection] = useState<string>();
  const disabled = !!lock || sending;
  const identity = ownerIdentity(owner);
  const statuses = ownerStatuses(w);
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const money = (value: string) => <Money value={value} code={own.country} year={w.year} />;

  const business = stakeOutlook(w, stake);
  const limit = injectionLimit(w);
  const ffp = ffpRoom(w);
  const steps = injectionSteps(w);
  const chosen = injection !== undefined && steps.includes(injection) ? injection : undefined;
  const put = chosen === undefined ? undefined : injectionOutlook(w, chosen);
  const take = dividendOutlook(w, dividend);
  const last = lastDividend(owner);
  const movers = fanMovers(w);
  const fortune = BigInt(owner.fortune);
  return (
    <div className={s.sheet} data-testid="owner-sheet">
      <Card
        as="section"
        surface="ticket"
        aria-label="구단주 자금"
        meta={[identity.tier, ...identity.traits].join(' · ')}
      >
        <p className={s.fortune}>
          <small>구단주 자금</small>
          <b className={fortune < 0n ? s.negative : undefined} data-testid="owner-fortune">
            {money(owner.fortune)}
          </b>
        </p>
        {statuses.map((status) => (
          <p key={status.id} className={s.crisis} role="status">
            <b>{status.title}</b> {status.detail}
          </p>
        ))}
        <DeskStats
          label="구단주 정산"
          stats={[
            {
              label: '다음 정산',
              value: business.next.date.replace(/^\d+년 /, ''),
              note: business.next.close ? '시즌 마감' : `${business.next.days}일 뒤`,
            },
            { label: '생활비', value: ownMoney(w, business.living), note: '정산마다' },
            { label: '구단 자금', value: ownMoney(w, w.cash), note: '따로 관리' },
          ]}
        />
      </Card>

      <section className={s.section} aria-labelledby={`${id}-business`}>
        <h3 id={`${id}-business`}>
          사업 투자 <span>지금 {owner.stake}%</span>
        </h3>
        <label className={s.slider}>
          <span>
            자금의 <b>{stake}%</b>를 사업에 걸기
          </span>
          <input
            type="range"
            min={OWNER_BUSINESS.stake.min}
            max={OWNER_BUSINESS.stake.max}
            step={1}
            value={stake}
            aria-valuetext={`${stake}%`}
            onChange={(event) => setStake(Number(event.currentTarget.value))}
          />
        </label>
        {business.staked && stake > 0 ? (
          <dl className={s.outcomes}>
            <div>
              <dt>
                성공 <small>{odds(business.chance)}</small>
              </dt>
              <dd className={tone(BigInt(business.amount))}>+{ownMoney(w, business.amount)}</dd>
              <dd>정산 뒤 {ownMoney(w, business.win)}</dd>
            </div>
            <div>
              <dt>
                실패 <small>{odds(1 - business.chance)}</small>
              </dt>
              <dd className={tone(-BigInt(business.amount))}>−{ownMoney(w, business.amount)}</dd>
              <dd>정산 뒤 {ownMoney(w, business.lose)}</dd>
            </div>
          </dl>
        ) : (
          <p className={s.note}>
            {business.staked
              ? `사업에 걸지 않아요. 정산 뒤 ${ownMoney(w, business.win)}`
              : '구단주 자금이 0 이하라 사업에 걸 돈이 없어요.'}
          </p>
        )}
        <p className={s.note}>
          {business.next.date} 정산부터 적용 · 생활비 {ownMoney(w, business.living)}도 정산 때 함께
          빠져요
        </p>
        <div className={s.actions}>
          <button
            type="button"
            data-ui="primary"
            disabled={disabled || stake === owner.stake}
            onClick={() =>
              void onCommand(
                { type: 'owner-stake', percent: stake },
                `사업 투자 비중을 ${stake}%로 정했어요. ${business.next.date} 정산부터 적용돼요.`,
              )
            }
          >
            {stake}%로 정하기
          </button>
        </div>
      </section>

      <section className={s.section} aria-labelledby={`${id}-inject`}>
        <h3 id={`${id}-inject`}>
          자금 투입 <span>최대 {ownMoney(w, limit.max)}</span>
        </h3>
        {ffp && (
          <p className={s.note} data-testid="owner-ffp">
            FFP 남은 한도 <b>{ownMoney(w, ffp.left)}</b> · {seasonName(ffp.from)}부터 {FFP.window}
            시즌 €{(ffp.euros / 1_000_000).toFixed(0)}M({ownMoney(w, ffp.cap)}) 중{' '}
            {ownMoney(w, ffp.used)} 사용
          </p>
        )}
        {steps.length ? (
          <>
            <Segments
              label="투입 금액"
              options={steps.map((amount) => [amount, ownMoney(w, amount)] as const)}
              value={chosen ?? ''}
              onChange={setInjection}
            />
            {put && chosen ? (
              <dl className={s.facts}>
                <div>
                  <dt>구단 자금</dt>
                  <dd>
                    {ownMoney(w, w.cash)} → <b className={s.up}>{ownMoney(w, put.cash)}</b>
                  </dd>
                </div>
                <div>
                  <dt>구단주 자금</dt>
                  <dd>
                    {ownMoney(w, owner.fortune)} →{' '}
                    <b className={s.down}>{ownMoney(w, put.fortune)}</b>
                  </dd>
                </div>
                <div>
                  <dt>팬 민심</dt>
                  <dd>
                    {put.mood === undefined ? (
                      `오름 · 지난 시즌 매출 1%마다 +${FAN_MOOD.injection.perPercent}, 최대 +${FAN_MOOD.injection.max}`
                    ) : (
                      <b className={tone(put.mood)}>{moodChange(put.mood)}</b>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className={s.note}>
                넣을 금액을 고르면 두 자금과 팬 민심이 어떻게 바뀌는지 보여요.
              </p>
            )}
          </>
        ) : (
          <p className={s.note}>
            {ffp && BigInt(ffp.left) <= 0n
              ? 'FFP 한도를 다 써서 이번 시즌에는 더 넣을 수 없어요.'
              : '구단주 자금이 0 이하라 넣을 돈이 없어요.'}
          </p>
        )}
        <div className={s.actions}>
          <button
            type="button"
            data-ui="primary"
            disabled={disabled || !chosen}
            onClick={async () => {
              if (!chosen) return;
              const done = await onCommand(
                { type: 'owner-inject', amount: chosen },
                `구단에 ${ownMoney(w, chosen)} 투입했어요.`,
              );
              if (done) setInjection(undefined);
            }}
          >
            {chosen ? `${ownMoney(w, chosen)} 넣기` : '금액을 고르세요'}
          </button>
        </div>
      </section>

      <section className={s.section} aria-labelledby={`${id}-dividend`}>
        <h3 id={`${id}-dividend`}>
          배당 <span>지금 {owner.dividendShare}%</span>
        </h3>
        <Segments
          label="배당 비율"
          options={DIVIDEND_DIAL.map((share) => [String(share), `${share}%`] as const)}
          value={String(dividend)}
          onChange={(value) => setDividend(Number(value) as DividendShare)}
        />
        <dl className={s.facts}>
          <div>
            <dt>이번 시즌 수지</dt>
            <dd className={tone(BigInt(take.result))}>{ownMoney(w, take.result)}</dd>
          </div>
          <div>
            <dt>마감 때 배당</dt>
            <dd>
              {BigInt(take.amount) > 0n ? `약 ${ownMoney(w, take.amount)}` : '없음'}
              {take.mood < 0 && (
                <>
                  {' '}
                  · 팬 민심 <b className={tone(take.mood)}>약 {moodChange(take.mood)}</b>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>지난 배당</dt>
            <dd>
              {last
                ? `${seasonName(last.year)} ${compactMoney(last.dividend, own.country, last.year)}`
                : '아직 없음'}
            </dd>
          </div>
        </dl>
        <p className={s.note}>
          시즌 마감 때 그 시즌 이익의 몫만 구단 자금에서 구단주 자금으로 옮겨요. 적자 시즌에는 받지
          않아요.
        </p>
        <div className={s.actions}>
          <button
            type="button"
            data-ui="primary"
            disabled={disabled || dividend === owner.dividendShare}
            onClick={() =>
              void onCommand(
                { type: 'owner-dividend', share: dividend },
                `배당 비율을 ${dividend}%로 정했어요. 시즌 마감 때 적용돼요.`,
              )
            }
          >
            {dividend}%로 정하기
          </button>
        </div>
      </section>

      <section className={s.section} aria-labelledby={`${id}-fans`}>
        <h3 id={`${id}-fans`}>
          팬 민심 <span data-testid="owner-fan-mood">{mood(owner.fanMood)}</span>
        </h3>
        <div
          className={s.meter}
          role="meter"
          aria-label="팬 민심"
          aria-valuemin={FAN_MOOD.min}
          aria-valuemax={FAN_MOOD.max}
          aria-valuenow={owner.fanMood}
          style={
            {
              '--mood': `${owner.fanMood}%`,
              '--floor': `${FAN_MOOD.floor}%`,
            } as CSSProperties
          }
        >
          <span className={owner.fanMood < FAN_MOOD.floor ? s.meterLow : undefined} />
        </div>
        <p className={s.note}>
          {FAN_MOOD.floor} 아래로 {FAN_MOOD.rounds}라운드 이어지면 구단주가 물러나요
          {owner.fanCrisis?.rounds ? ` · 지금 ${owner.fanCrisis.rounds}라운드째` : ''}
        </p>
        {movers.length > 0 && (
          <ul className={s.movers} aria-label="최근 움직임">
            {movers.map((mover) => (
              <li key={mover.label}>
                <span>{mover.label}</span>
                <b
                  className={
                    mover.direction === 'up'
                      ? s.up
                      : mover.direction === 'down'
                        ? s.down
                        : undefined
                  }
                >
                  {mover.change !== undefined
                    ? moodChange(mover.change)
                    : mover.direction === 'up'
                      ? '상승'
                      : '하락'}
                </b>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lock && (
        <p className={s.lock} role="status" data-testid="owner-lock">
          {lock}
        </p>
      )}
      <p className={s.message} aria-live="polite" data-testid="owner-message">
        {message}
      </p>
    </div>
  );
}

/**
 * The 구단주 sheet (→WEB-114): opened from the HUD's fortune while the clock runs, its controls
 * locked as →WEB-97 locks every management change. Each command goes through the client, so its
 * outcome card shows once the sheet closes (→WEB-36).
 */
export function OwnerSheet({ client, onClose }: { client?: GameClient; onClose: () => void }) {
  const w = useGameState((state) => state.view?.world);
  const lock = useGameState((state) => ownerLock(state, !!client));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  if (!w?.owner) return null;
  const send = async (command: Command, success: string) => {
    if (!client || sending || lock) return false;
    setSending(true);
    setMessage('');
    try {
      const reply = await client.command(command, { background: true });
      setMessage(
        reply?.ok ? success : (client.state.error || '정하지 못했어요.').replace(/^Error: /, ''),
      );
      return !!reply?.ok;
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog label="구단주" onClose={onClose} actions={null}>
      <OwnerSheetBody w={w} lock={lock} sending={sending} message={message} onCommand={send} />
    </Dialog>
  );
}
