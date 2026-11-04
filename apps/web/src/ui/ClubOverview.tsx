import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import type { CSSProperties, ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { activePlayers, clubOf, overall } from '../../../../packages/engine/src/player-state';
import { stadiumCapacity } from '../../../../packages/engine/src/facilities';
import { FAN_MOOD } from '../../../../packages/engine/src/owner-config';
import { MANAGER_GONE, STAFF_ROLES, staffMember } from '../../../../packages/engine/src/staff-info';
import { Card } from './Card';
import { ClubCrest } from './ClubCrest';
import { Money } from './Money';
import { clubDivision, orderIds, ownLeagueIds } from './league';
import { number, seasonName } from './format';
import { fanMovers, mood, moodChange } from './ownerFigures';
import { squadRegistration } from './squadRegistration';
import {
  cashState,
  seasonBooks,
  squadAvailability,
  stateWarning,
  teamStates,
  type StateKey,
} from './teamState';
import { useOfficeRead } from './useOfficeRead';
import s from './ClubOverview.module.css';

function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  useTextLocale();
  return (
    <dl className={s.facts}>
      {localizeValue(
        rows.map(([label, value]) => (
          <div key={label}>
            <dt>{localizeValue(label)}</dt>
            <dd>{localizeValue(value)}</dd>
          </div>
        )),
      )}
    </dl>
  );
}

/**
 * 팬 민심 (→OWNER-12/13) with its 퇴진 floor marked and what moved it last; a club without an owner
 * has none.
 */
function FanMood({ w }: { w: World }) {
  useTextLocale();
  const owner = w.owner;
  if (!owner) return null;
  const movers = fanMovers(w);
  const low = owner.fanMood < FAN_MOOD.floor;
  return (
    <Card
      surface="sheet"
      title={displayMessage('copy.ClubOverview.27bdec9180')}
      meta="FANS"
      className={s.wide}
    >
      <div className={s.fans}>
        <div className={s.fanGauge}>
          <strong
            className={s.value}
            data-tone={low ? 'bad' : undefined}
            data-testid="owner-fan-mood"
          >
            {localizeValue(mood(owner.fanMood))}
            <small>/ {localizeValue(FAN_MOOD.max)}</small>
          </strong>
          <div
            className={s.meter}
            role="meter"
            aria-label={displayMessage('copy.ClubOverview.27bdec9180')}
            aria-valuemin={FAN_MOOD.min}
            aria-valuemax={FAN_MOOD.max}
            aria-valuenow={owner.fanMood}
            style={
              { '--mood': `${owner.fanMood}%`, '--floor': `${FAN_MOOD.floor}%` } as CSSProperties
            }
          >
            <span className={low ? s.meterLow : undefined} />
          </div>
          <p className={s.note}>
            {richMessage('copy.ClubOverview.55273aa3b9', {
              p0: FAN_MOOD.floor,
              p1: FAN_MOOD.rounds,
              p2: owner.fanCrisis?.rounds
                ? sourceMessage('copy.ClubOverview.166e5dbac3', { p0: owner.fanCrisis.rounds })
                : '',
            })}
          </p>
        </div>
        {localizeValue(
          movers.length > 0 && (
            <ul className={s.movers} aria-label={displayMessage('copy.ClubOverview.d741c65601')}>
              {localizeValue(
                movers.map((mover) => (
                  <li key={mover.label}>
                    <span>{localizeValue(mover.label)}</span>
                    <b data-trend={mover.direction}>
                      {localizeValue(
                        mover.change !== undefined
                          ? moodChange(mover.change)
                          : mover.direction === 'up'
                            ? sourceMessage('copy.ClubOverview.1dab47556c')
                            : sourceMessage('copy.ClubOverview.7b0c422662'),
                      )}
                    </b>
                  </li>
                )),
              )}
            </ul>
          ),
        )}
      </div>
    </Card>
  );
}

/** Live club facts, using the same ratings, availability and costs as the working pages. */
export function ClubOverview({ w }: { w: World }) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return <p role="status">{richMessage('copy.ClubOverview.13bcfbd5ea')}</p>;
  const club = clubOf(w);
  const squad = activePlayers(w);
  const youth = (w.academy?.players ?? []).filter((player) => player.status === 'active');
  const availability = squadAvailability(w);
  const registered = squadRegistration(w);
  const states = teamStates(w);
  const state = (key: StateKey) => states.find((item) => item.key === key)!;
  const strength = state('strength');
  const fatigue = state('fatigue');
  const morale = state('morale');
  const manager = state('manager');
  // Squad size warns under 20 and is critical under 16, or with too few available (→WEB-44).
  const roster = state('squad'),
    rosterWarning = stateWarning(roster);
  const finance = cashState(w);
  const costs = office.costs;
  const books = seasonBooks(w);
  const net = BigInt(books.result);
  const league = orderIds(ownLeagueIds(w), w.tables);
  const table = w.tables[club.id];
  const average = (value: (player: (typeof squad)[number]) => number) =>
    squad.length
      ? (squad.reduce((sum, player) => sum + value(player), 0) / squad.length).toFixed(1)
      : '—';
  const staffed = STAFF_ROLES.filter((post) => staffMember(w, post)).length;
  const money = (value: string | bigint) => (
    <Money value={value} code={club.country} year={w.year} />
  );
  const condition = (item: ReturnType<typeof teamStates>[number]) => (
    <span data-tone={item.tone}>
      {localizeValue(item.value)} <small>· {localizeValue(item.status)}</small>
    </span>
  );
  return (
    <section className={s.overview} aria-label={displayMessage('copy.ClubOverview.409e4ac1d2')}>
      <header className={s.heading}>
        <div className={s.identity}>
          <ClubCrest w={w} id={club.id} size={40} />
          <div>
            <h2>{club.name}</h2>
            <p>
              {richMessage('copy.ClubOverview.c0e43be407', {
                p0: seasonName(w.year),
                p1: clubDivision(w, club),
              })}
            </p>
          </div>
        </div>
        <span className={s.league}>
          {localizeValue(
            table?.played
              ? sourceMessage('copy.ClubOverview.954ae9121b', {
                  p0: league.indexOf(club.id) + 1,
                  p1: table.points,
                  p2: table.played,
                })
              : sourceMessage('copy.ClubOverview.1c22f8706b'),
          )}
        </span>
      </header>

      <div className={s.metrics}>
        <Card title={displayMessage('copy.ClubOverview.77fa50299c')} className={s.metric}>
          <strong className={s.value}>{localizeValue(strength.value)}</strong>
          <p className={s.note}>
            {localizeValue(
              strength.status.replace(
                sourceMessage('copy.ClubOverview.bf26551680'),
                sourceMessage('copy.ClubOverview.665d0e6421'),
              ),
            )}
          </p>
        </Card>
        <Card title={displayMessage('copy.ClubOverview.62a65bb7b4')} className={s.metric}>
          <strong className={s.value}>
            {localizeValue(squad.length)}
            <small>{richMessage('copy.ClubOverview.9f96b8e22c')}</small>
          </strong>
          <p className={s.note}>
            {richMessage('copy.ClubOverview.0031281eeb', { p0: youth.length })}
          </p>
        </Card>
        <Card title={displayMessage('copy.ClubOverview.be76cc2bb7')} className={s.metric}>
          <strong className={s.value}>
            {localizeValue(availability.available)}
            <small>{richMessage('copy.ClubOverview.842e978b50', { p0: availability.total })}</small>
          </strong>
          <p className={s.note} data-tone={roster.tone}>
            {richMessage('copy.ClubOverview.94cc5ea39c', {
              p0: availability.injured,
              p1: availability.suspended,
            })}
            {localizeValue(
              rosterWarning && (
                <b data-testid="situation-warning-squad">
                  {localizeValue(' · ')}
                  {localizeValue(rosterWarning)}
                </b>
              ),
            )}
          </p>
        </Card>
        <Card title={displayMessage('copy.ClubOverview.be5a47dfcb')} className={s.metric}>
          <strong
            className={`${s.value} ${s.money}`}
            data-negative={BigInt(w.cash) < 0n || undefined}
          >
            {localizeValue(money(w.cash))}
          </strong>
          <p className={s.note} data-tone={finance.tone}>
            {richMessage('copy.ClubOverview.534e4b8692', { p0: finance.value, p1: finance.status })}
          </p>
        </Card>
      </div>

      <div className={s.cards}>
        <FanMood w={w} />
        <Card surface="sheet" title={displayMessage('copy.ClubOverview.038ea330b5')} meta="SQUAD">
          <Facts
            rows={[
              [
                sourceMessage('copy.ClubOverview.f961409197'),
                sourceMessage('copy.ClubOverview.083c9ec7f9', {
                  p0: squad.length,
                  p1: youth.length,
                }),
              ],
              [sourceMessage('copy.ClubOverview.76d2e765e2'), average(overall)],
              [
                sourceMessage('copy.ClubOverview.d21e475252'),
                squad.length
                  ? sourceMessage('copy.ClubOverview.9c2b927c8a', {
                      p0: average((player) => w.year - player.born),
                    })
                  : '—',
              ],
              [
                sourceMessage('copy.ClubOverview.f2f01aea06'),
                sourceMessage('copy.CareerRecordBook.e414915261', {
                  p0: squad.filter((player) => player.loanUntil !== undefined).length,
                }),
              ],
              [sourceMessage('copy.ClubOverview.f8284ccd1b'), registered.value],
            ]}
          />
          <p className={s.note}>{localizeValue(registered.detail)}</p>
        </Card>
        <Card
          surface="sheet"
          title={displayMessage('copy.ClubOverview.91a5c9ecca')}
          meta="CONDITION"
        >
          <Facts
            rows={[
              [sourceMessage('copy.ClubOverview.f101777ac9'), condition(fatigue)],
              [sourceMessage('copy.ClubOverview.a756cad0e2'), condition(morale)],
              [
                sourceMessage('copy.ClubOverview.93865cb4dd'),
                sourceMessage('copy.ClubOverview.083c9ec7f9', {
                  p0: availability.injured,
                  p1: availability.suspended,
                }),
              ],
              [
                sourceMessage('copy.ClubOverview.cf01416fb1'),
                sourceMessage('copy.CareerRecordBook.e414915261', {
                  p0: squad.filter((player) => player.unhappy).length,
                }),
              ],
              [sourceMessage('copy.ClubOverview.32d0fec1ea'), condition(manager)],
            ]}
          />
          <p className={s.note}>{richMessage('copy.ClubOverview.630d0e9e86')}</p>
        </Card>
        <Card surface="sheet" title={displayMessage('copy.ClubOverview.a10f7aa3ee')} meta="FINANCE">
          <Facts
            rows={[
              [sourceMessage('copy.ClubOverview.0fbef6b489'), money(books.income)],
              [sourceMessage('copy.ClubOverview.396becc12d'), money(books.expense)],
              [
                sourceMessage('copy.ClubCashSummary.967f1e3a31'),
                <span data-negative={net < 0n || undefined}>{localizeValue(money(net))}</span>,
              ],
              [sourceMessage('copy.ClubCashSummary.9ab3a675ca'), money(costs.nextRound)],
              [sourceMessage('copy.ClubCashSummary.382afa688e'), money(costs.annual)],
            ]}
          />
          <p className={s.note}>{richMessage('copy.ClubOverview.065318678a')}</p>
        </Card>
        <Card surface="sheet" title={displayMessage('copy.ClubOverview.6aae8378c6')} meta="CLUB">
          <Facts
            rows={[
              [
                sourceMessage('staff.role.manager'),
                w.manager.name === MANAGER_GONE
                  ? sourceMessage('team.vacant')
                  : `${w.manager.name}${w.manager.interim ? sourceMessage('copy.ClubOverview.18fab5d0f2') : ''}`,
              ],
              [
                sourceMessage('staff.role.director'),
                staffMember(w, 'director')?.name ?? sourceMessage('team.vacant'),
              ],
              [
                sourceMessage('copy.ClubOverview.02491c3d33'),
                sourceMessage('copy.ClubOverview.186ec53ca6', {
                  p0: staffed,
                  p1: STAFF_ROLES.length,
                }),
              ],
              [
                sourceMessage('copy.ClubOverview.4c7225a41e'),
                sourceMessage('copy.ClubOperations.e718a2e7a8', { p0: number(stadiumCapacity(w)) }),
              ],
              [
                sourceMessage('copy.ClubOverview.cb2dfd3966'),
                sourceMessage('copy.CareerRecordBook.e414915261', {
                  p0: number(office.localSupporters),
                }),
              ],
              [sourceMessage('copy.ClubOverview.84cf4befab'), number(club.reputation)],
            ]}
          />
          <p className={s.note}>{richMessage('copy.ClubOverview.dc5da3cd60')}</p>
        </Card>
      </div>
    </section>
  );
}
