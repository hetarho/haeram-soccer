import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useId, useState } from 'react';
import type { DividendShare } from '../../../../../../packages/contracts/src/owner';
import type { Command, World } from '../../../../../../packages/contracts/src/types';
import { FAN_MOOD, FFP, OWNER_BUSINESS } from '../../../../../../packages/engine/src/owner-config';
import type { GameClient } from '../../../runtime/client';
import { useGameState } from '../../../runtime/store';
import { Card } from '../../../shared/ui/Card';
import { Dialog } from '../../../shared/ui/Dialog';
import { Money } from '../../../shared/ui/Money';
import { DeskStats } from './OfficeDesk';
import { ClubCashSummary } from './ClubCashSummary';
import { compactMoney, percent, seasonName } from '../../../presentation/format';
import {
  DIVIDEND_DIAL,
  dividendOutlook,
  ffpRoom,
  injectionLimit,
  injectionOutlook,
  lastDividend,
  moodChange,
  ownerIdentity,
  ownerLock,
  ownerStatuses,
  ownMoney,
  stakeOutlook,
} from '../lib/ownerFigures';
import s from '../../../shared/ui/styles/OwnerSheet.module.css';

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
 * The 구단주 sheet's content (→WEB-114): the fortune, the club's season result and runway always
 * open, the business stake with its odds, living costs, 자금 투입 within FFP and the 배당 dial;
 * 팬 민심 lives in the team overview. Each control is a draft whose effect shows before its one
 * button applies it (→WEB-36).
 */
export function OwnerSheetBody({ w, lock, sending, message, onCommand }: OwnerSheetBodyProps) {
  useTextLocale();
  const owner = w.owner!;
  const id = useId();
  const [stake, setStake] = useState(owner.stake);
  const [dividend, setDividend] = useState<DividendShare>(owner.dividendShare);
  const [injectionPercent, setInjectionPercent] = useState(0);
  const disabled = !!lock || sending;
  const identity = ownerIdentity(owner);
  const statuses = ownerStatuses(w);
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  const money = (value: string) => <Money value={value} code={own.country} year={w.year} />;

  const business = stakeOutlook(w, stake);
  const limit = injectionLimit(w);
  const ffp = ffpRoom(w);
  const injection = ((BigInt(limit.max) * BigInt(injectionPercent)) / 100n).toString();
  const chosen = BigInt(injection) > 0n ? injection : undefined;
  const put = chosen === undefined ? undefined : injectionOutlook(w, chosen);
  const take = dividendOutlook(w, dividend);
  const last = lastDividend(owner);
  const fortune = BigInt(owner.fortune);
  return (
    <div className={s.sheet} data-testid="owner-sheet">
      <Card
        as="section"
        surface="ticket"
        aria-label={displayMessage('copy.ClubCashSummary.00a2861721')}
        meta={[identity.tier, ...identity.traits].join(' · ')}
      >
        <div className={s.balances}>
          <p className={s.fortune}>
            <small>{richMessage('copy.HudCash.5008c66043')}</small>
            <b className={BigInt(w.cash) < 0n ? s.negative : undefined}>
              {localizeValue(money(w.cash))}
            </b>
          </p>
          <p className={`${s.fortune} ${s.businessFunds}`}>
            <small>{richMessage('copy.InvestmentTotals.aa2afbf21f')}</small>
            <b
              className={`${s.businessAmount} ${fortune < 0n ? s.negative : ''}`}
              data-testid="owner-fortune"
            >
              {localizeValue(money(owner.fortune))}
            </b>
          </p>
        </div>
        {localizeValue(
          statuses.map((status) => (
            <p key={status.id} className={s.crisis} role="status">
              <b>{localizeValue(status.title)}</b> {localizeValue(status.detail)}
            </p>
          )),
        )}
        <DeskStats
          label={displayMessage('copy.OwnerSheet.037fb4d60f')}
          stats={[
            {
              label: sourceMessage('copy.OwnerSheet.83e6c77117'),
              value: business.next.date.replace(/^\d+년 /, ''),
              note: business.next.close
                ? sourceMessage('copy.OwnerSheet.ce1c739e52')
                : sourceMessage('copy.OwnerSheet.2549e67ec9', { p0: business.next.days }),
            },
            {
              label: sourceMessage('copy.OwnerEras.ef04fe60f2'),
              value: ownMoney(w, business.living),
              note: sourceMessage('copy.OwnerSheet.5d5bf32e91'),
            },
            { label: sourceMessage('copy.influences.db4838080d'), value: `${owner.stake}%` },
          ]}
        />
      </Card>

      <section className={s.section} aria-labelledby={`${id}-cash`}>
        <h3 id={`${id}-cash`}>{richMessage('copy.OwnerSheet.a21f08a56d')}</h3>
        <div className={s.cashSummary}>
          <ClubCashSummary w={w} />
        </div>
      </section>

      <section className={s.section} aria-labelledby={`${id}-business`}>
        <h3 id={`${id}-business`}>
          {richMessage('copy.OwnerSheet.da2dfee887', {
            p0: <span>{richMessage('copy.OwnerSheet.928f379bb6', { p0: owner.stake })}</span>,
          })}
        </h3>
        <label className={s.slider}>
          <span>
            {richMessage('copy.OwnerSheet.64f7abc79e', { p0: <b>{localizeValue(stake)}%</b> })}
          </span>
          <input
            type="range"
            min={OWNER_BUSINESS.stake.min}
            max={OWNER_BUSINESS.stake.max}
            step={1}
            value={stake}
            aria-valuetext={localizeValue(`${stake}%`)}
            onChange={(event) => setStake(Number(event.currentTarget.value))}
          />
        </label>
        {localizeValue(
          business.staked && stake > 0 ? (
            <dl className={s.outcomes}>
              <div>
                <dt>
                  {richMessage('copy.OwnerSheet.a43a7aa3d8', {
                    p0: <small>{localizeValue(odds(business.chance))}</small>,
                  })}
                </dt>
                <dd className={tone(BigInt(business.amount))}>
                  +{localizeValue(ownMoney(w, business.amount))}
                </dd>
                <dd>
                  {richMessage('copy.OwnerSheet.345a508e49', { p0: ownMoney(w, business.win) })}
                </dd>
              </div>
              <div>
                <dt>
                  {richMessage('copy.OwnerSheet.6a6e6fd8c6', {
                    p0: <small>{localizeValue(odds(1 - business.chance))}</small>,
                  })}
                </dt>
                <dd className={tone(-BigInt(business.amount))}>
                  −{localizeValue(ownMoney(w, business.amount))}
                </dd>
                <dd>
                  {richMessage('copy.OwnerSheet.345a508e49', { p0: ownMoney(w, business.lose) })}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={s.note}>
              {localizeValue(
                business.staked
                  ? sourceMessage('copy.OwnerSheet.bbdfc835e7', { p0: ownMoney(w, business.win) })
                  : sourceMessage('copy.OwnerSheet.91146ba139'),
              )}
            </p>
          ),
        )}
        <p className={s.note}>
          {richMessage('copy.OwnerSheet.42ff9fb1ea', {
            p0: business.next.date,
            p1: ownMoney(w, business.living),
          })}
        </p>
        <div className={s.actions}>
          <button
            type="button"
            data-ui="primary"
            disabled={disabled || stake === owner.stake}
            onClick={() =>
              void onCommand(
                { type: 'owner-stake', percent: stake },
                sourceMessage('copy.OwnerSheet.5ec119faf4', { p0: stake, p1: business.next.date }),
              )
            }
          >
            {richMessage('copy.OwnerSheet.87b2bb7374', { p0: stake })}
          </button>
        </div>
      </section>

      <section className={s.section} aria-labelledby={`${id}-inject`}>
        <h3 id={`${id}-inject`}>
          {richMessage('copy.OwnerSheet.3defbad5e4', {
            p0: (
              <span>
                {richMessage('copy.OwnerSheet.16175e8ef5', { p0: ownMoney(w, limit.max) })}
              </span>
            ),
          })}
        </h3>
        {localizeValue(
          ffp && (
            <p className={s.note} data-testid="owner-ffp">
              {richMessage('copy.OwnerSheet.b6382bb843', {
                p0: <b>{localizeValue(ownMoney(w, ffp.left))}</b>,
                p1: seasonName(ffp.from),
                p2: FFP.window,
                p3: (ffp.euros / 1_000_000).toFixed(0),
                p4: ownMoney(w, ffp.cap),
                p5: ' ',
                p6: ownMoney(w, ffp.used),
              })}
            </p>
          ),
        )}
        {localizeValue(
          BigInt(limit.max) > 0n ? (
            <>
              <label className={s.slider}>
                <span>
                  {richMessage('copy.OwnerSheet.afcd2e5f12', {
                    p0: <b>{localizeValue(ownMoney(w, injection))}</b>,
                    p1: injectionPercent,
                  })}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={injectionPercent}
                  aria-label={displayMessage('copy.OwnerSheet.b7000c2d83')}
                  aria-valuetext={displayMessage('copy.OwnerSheet.556357ca07', {
                    p0: ownMoney(w, injection),
                    p1: injectionPercent,
                  })}
                  disabled={sending}
                  onChange={(event) => setInjectionPercent(Number(event.currentTarget.value))}
                />
                <span className={s.sliderScale} aria-hidden="true">
                  <span>{localizeValue(ownMoney(w, '0'))}</span>
                  <span>{localizeValue(ownMoney(w, limit.max))}</span>
                </span>
              </label>
              {localizeValue(
                put && chosen ? (
                  <dl className={s.facts}>
                    <div>
                      <dt>{richMessage('copy.HudCash.5008c66043')}</dt>
                      <dd>
                        {localizeValue(ownMoney(w, w.cash))} →{' '}
                        <b className={s.up}>{localizeValue(ownMoney(w, put.cash))}</b>
                      </dd>
                    </div>
                    <div>
                      <dt>{richMessage('copy.InvestmentTotals.aa2afbf21f')}</dt>
                      <dd>
                        {localizeValue(ownMoney(w, owner.fortune))} →{localizeValue(' ')}
                        <b className={s.down}>{localizeValue(ownMoney(w, put.fortune))}</b>
                      </dd>
                    </div>
                    <div>
                      <dt>{richMessage('copy.ClubOverview.27bdec9180')}</dt>
                      <dd>
                        {localizeValue(
                          put.mood === undefined ? (
                            sourceMessage('copy.OwnerSheet.5dfb4506d1', {
                              p0: FAN_MOOD.injection.perPercent,
                              p1: FAN_MOOD.injection.max,
                            })
                          ) : (
                            <b className={tone(put.mood)}>{localizeValue(moodChange(put.mood))}</b>
                          ),
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className={s.note}>{richMessage('copy.OwnerSheet.266a5d0ae2')}</p>
                ),
              )}
            </>
          ) : (
            <p className={s.note}>
              {localizeValue(
                ffp && BigInt(ffp.left) <= 0n
                  ? sourceMessage('copy.OwnerSheet.903a277fe8')
                  : sourceMessage('copy.OwnerSheet.fd69e56359'),
              )}
            </p>
          ),
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
                sourceMessage('copy.OwnerSheet.627f05f52c', { p0: ownMoney(w, chosen) }),
              );
              if (done) setInjectionPercent(0);
            }}
          >
            {localizeValue(
              chosen
                ? sourceMessage('copy.OwnerSheet.24d161b034', { p0: ownMoney(w, chosen) })
                : sourceMessage('copy.OwnerSheet.cb210a20d7'),
            )}
          </button>
        </div>
      </section>

      <section className={s.section} aria-labelledby={`${id}-dividend`}>
        <h3 id={`${id}-dividend`}>
          {richMessage('copy.OwnerSheet.5279fa5469', {
            p0: (
              <span>{richMessage('copy.OwnerSheet.928f379bb6', { p0: owner.dividendShare })}</span>
            ),
          })}
        </h3>
        <label className={s.slider}>
          <span>
            {richMessage('copy.OwnerSheet.8d554d87a3', { p0: <b>{localizeValue(dividend)}%</b> })}
          </span>
          <input
            type="range"
            min={0}
            max={DIVIDEND_DIAL.length - 1}
            step={1}
            value={DIVIDEND_DIAL.indexOf(dividend)}
            aria-label={displayMessage('copy.influences.9ecab69458')}
            aria-valuetext={localizeValue(`${dividend}%`)}
            disabled={sending}
            onChange={(event) => setDividend(DIVIDEND_DIAL[Number(event.currentTarget.value)])}
          />
          <span className={s.sliderScale} aria-hidden="true">
            {localizeValue(
              DIVIDEND_DIAL.map((share) => <span key={share}>{localizeValue(share)}%</span>),
            )}
          </span>
        </label>
        <dl className={s.facts}>
          <div>
            <dt>{richMessage('copy.ClubCashSummary.27b011448c')}</dt>
            <dd className={tone(BigInt(take.result))}>{localizeValue(ownMoney(w, take.result))}</dd>
          </div>
          <div>
            <dt>{richMessage('copy.OwnerSheet.d8bdc25d3e')}</dt>
            <dd>
              {localizeValue(
                BigInt(take.amount) > 0n
                  ? sourceMessage('copy.OwnerSheet.a746a8e796', { p0: ownMoney(w, take.amount) })
                  : sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
              )}
              {localizeValue(
                take.mood < 0 && (
                  <>
                    {richMessage('copy.OwnerSheet.c8dabf519b', {
                      p0: ' ',
                      p1: (
                        <b className={tone(take.mood)}>
                          {richMessage('copy.OwnerSheet.a746a8e796', { p0: moodChange(take.mood) })}
                        </b>
                      ),
                    })}
                  </>
                ),
              )}
            </dd>
          </div>
          <div>
            <dt>{richMessage('copy.OwnerSheet.9aef941f30')}</dt>
            <dd>
              {localizeValue(
                last
                  ? `${seasonName(last.year)} ${compactMoney(last.dividend, own.country, last.year)}`
                  : sourceMessage('copy.OwnerSheet.ea254b1804'),
              )}
            </dd>
          </div>
        </dl>
        <p className={s.note}>{richMessage('copy.OwnerSheet.0df0a99760')}</p>
        <div className={s.actions}>
          <button
            type="button"
            data-ui="primary"
            disabled={disabled || dividend === owner.dividendShare}
            onClick={() =>
              void onCommand(
                { type: 'owner-dividend', share: dividend },
                sourceMessage('copy.OwnerSheet.09acc2a6ec', { p0: dividend }),
              )
            }
          >
            {richMessage('copy.OwnerSheet.87b2bb7374', { p0: dividend })}
          </button>
        </div>
      </section>

      {localizeValue(
        lock && (
          <p className={s.lock} role="status" data-testid="owner-lock">
            {localizeValue(lock)}
          </p>
        ),
      )}
      <p className={s.message} aria-live="polite" data-testid="owner-message">
        {localizeValue(message)}
      </p>
    </div>
  );
}

/**
 * The 구단주 sheet (→WEB-114): opened from the HUD's fortune while the clock runs, its controls
 * locked as →WEB-97 locks every management change. Each command goes through the client, so its
 * outcome card shows once the sheet closes (→WEB-36).
 */
export function OwnerFunds({ client }: { client?: GameClient }) {
  useTextLocale();
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
        reply?.ok
          ? success
          : (client.state.error || sourceMessage('copy.OwnerSheet.388400ecc0')).replace(
              /^Error: /,
              '',
            ),
      );
      return !!reply?.ok;
    } finally {
      setSending(false);
    }
  };
  return <OwnerSheetBody w={w} lock={lock} sending={sending} message={message} onCommand={send} />;
}
export function OwnerSheet({ client, onClose }: { client?: GameClient; onClose: () => void }) {
  useTextLocale();
  return (
    <Dialog
      label={displayMessage('copy.OwnerSheet.3b1b6aab0e')}
      onClose={onClose}
      actions={null}
      wide
    >
      <OwnerFunds client={client} />
    </Dialog>
  );
}
