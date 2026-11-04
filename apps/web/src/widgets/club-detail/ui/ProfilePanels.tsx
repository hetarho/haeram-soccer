import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { ReactNode } from 'react';
import type { ClubProfile } from '../../../../../../packages/contracts/src/owner';
import { STAFF_INFO } from '../../../../../../packages/engine/src/staff-info';
import type { Read } from '../../../shared/lib';
import { number, seasonName } from '../../../ui/format';
import { PositionBadge } from '../../../ui/PositionBadge';
import { divisionLabel } from '../../../ui/startChoices';
import link from '../../../shared/ui/TextLink.module.css';
import s from './ClubDetail.module.css';

const postLabel = (post: ClubProfile['staff'][number]['post']) =>
  post === 'manager' ? sourceMessage('staff.role.manager') : STAFF_INFO[post].label;

/** A profile tab's body once its read answered, or the read's state until then. */
function Loaded({
  profile,
  children,
}: {
  profile: Read<ClubProfile>;
  children: (profile: ClubProfile) => ReactNode;
}) {
  useTextLocale();
  if (profile.status === 'loading')
    return (
      <p className={s.note} role="status">
        {richMessage('copy.ProfilePanels.e2315fa5a2')}
      </p>
    );
  if (profile.status === 'failed')
    return (
      <p className={s.note} role="alert">
        {richMessage('copy.ProfilePanels.330aec4bf4')}
      </p>
    );
  return <>{localizeValue(children(profile.value))}</>;
}

/** 선수단: the first team best first, each name opening his detail when `onPlayer` is given. */
export function SquadPanel({
  profile,
  onPlayer,
}: {
  profile: Read<ClubProfile>;
  onPlayer?: (id: string) => void;
}) {
  useTextLocale();
  return (
    <Loaded profile={profile}>
      {localizeValue(({ squad }) => {
        const average = squad.length
          ? Math.round(squad.reduce((sum, player) => sum + player.ovr, 0) / squad.length)
          : undefined;
        return (
          <section className={s.panel} aria-label={displayMessage('copy.areas.f33435e513')}>
            <h3 className={s.sub}>
              {richMessage('copy.ProfilePanels.e88da95430', {
                p0: ' ',
                p1: (
                  <small>
                    {richMessage('copy.ProfilePanels.fd0076ac0a', {
                      p0: squad.length,
                      p1:
                        average !== undefined
                          ? sourceMessage('copy.ProfilePanels.3f12cf3f99', { p0: average })
                          : '',
                    })}
                  </small>
                ),
              })}
            </h3>
            <ul className={s.people} data-testid="club-squad">
              {localizeValue(
                squad.map((player) => (
                  <li key={player.id}>
                    <PositionBadge position={player.position} />
                    {localizeValue(
                      onPlayer ? (
                        <button
                          type="button"
                          data-ui="link"
                          className={link.link}
                          aria-label={displayMessage('copy.MatchMaterial.1a923aba55', {
                            p0: player.name,
                          })}
                          onClick={() => onPlayer(player.id)}
                        >
                          <span>{player.name}</span>
                        </button>
                      ) : (
                        <span>{player.name}</span>
                      ),
                    )}
                    <small>{richMessage('copy.ClubOverview.9c2b927c8a', { p0: player.age })}</small>
                    <b>{localizeValue(player.ovr)}</b>
                  </li>
                )),
              )}
            </ul>
          </section>
        );
      })}
    </Loaded>
  );
}

/**
 * 코치진: the manager first, then every post — a club nobody owns names a holder of each
 * (→STAFF-49), ours may show one vacant.
 */
export function StaffPanel({
  profile,
  onPerson,
}: {
  profile: Read<ClubProfile>;
  onPerson?: (person: string, name: string) => void;
}) {
  useTextLocale();
  return (
    <Loaded profile={profile}>
      {localizeValue(({ staff }) => {
        const school = staff.find((post) => post.post === 'manager')?.note;
        return (
          <section
            className={s.panel}
            aria-label={displayMessage('copy.investmentAreas.243be11e44')}
          >
            <h3 className={s.sub}>
              {richMessage('copy.ProfilePanels.8e208bb47e', {
                p0: (
                  <small>
                    {richMessage('copy.CareerRecordBook.e414915261', {
                      p0: staff.filter((post) => post.name).length,
                    })}
                  </small>
                ),
              })}
            </h3>
            <ul className={`${s.people} ${s.staff}`} data-testid="club-staff">
              {localizeValue(
                staff.map((post) => (
                  <li key={post.post} data-vacant={!post.name || undefined}>
                    <span className={s.role}>{localizeValue(postLabel(post.post))}</span>
                    {localizeValue(
                      post.person && onPerson ? (
                        <button
                          type="button"
                          data-ui="link"
                          className={link.link}
                          aria-label={displayMessage('copy.ProfilePanels.7f42c91e85', {
                            p0: post.name,
                          })}
                          onClick={() => onPerson(post.person!, post.name!)}
                        >
                          <span>{post.name}</span>
                        </button>
                      ) : (
                        <span>{localizeValue(post.name ?? sourceMessage('team.vacant'))}</span>
                      ),
                    )}
                    <small>
                      {localizeValue(
                        post.age !== undefined
                          ? sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: post.age })
                          : '',
                      )}
                    </small>
                    <b>{localizeValue(post.rating ?? '—')}</b>
                  </li>
                )),
              )}
            </ul>
            {localizeValue(
              school && (
                <p className={s.note}>
                  {richMessage('copy.ProfilePanels.4c2825ff82', { p0: school })}
                </p>
              ),
            )}
          </section>
        );
      })}
    </Loaded>
  );
}

/** 역사: the stadium, honours over the archived seasons and the last finishes, newest first. */
export function HistoryPanel({ profile }: { profile: Read<ClubProfile> }) {
  useTextLocale();
  return (
    <Loaded profile={profile}>
      {localizeValue(({ stadium, history }) => (
        <section className={s.panel} aria-label={displayMessage('copy.ClubDetail.4f5275b217')}>
          <dl className={s.facts}>
            <div data-surface="detail">
              <dt>{richMessage('start.history.champions')}</dt>
              <dd>{richMessage('copy.CareerRecordBook.bd9aab2ca2', { p0: history.league })}</dd>
            </div>
            <div data-surface="detail">
              <dt>{richMessage('copy.managerHistoryView.5b012994d1')}</dt>
              <dd>{richMessage('copy.CareerRecordBook.bd9aab2ca2', { p0: history.cup })}</dd>
            </div>
            <div data-surface="detail">
              <dt>{richMessage('copy.ProfilePanels.35e02527bb')}</dt>
              <dd>{richMessage('copy.CareerRecordBook.bd9aab2ca2', { p0: history.europe })}</dd>
            </div>
          </dl>
          <p className={s.note}>
            {richMessage('copy.ProfilePanels.1cb23a367a', {
              p0: stadium.name ? `${stadium.name} · ` : '',
              p1: number(stadium.seats),
            })}
          </p>
          <h3 className={s.sub}>{richMessage('copy.ProfilePanels.cbff5c65de')}</h3>
          {localizeValue(
            history.seasons.length ? (
              <ol className={s.seasons}>
                {localizeValue(
                  history.seasons.map((season) => (
                    <li key={season.year}>
                      <span>{localizeValue(seasonName(season.year))}</span>
                      <span>{localizeValue(divisionLabel(season.division))}</span>
                      <b>{richMessage('copy.BallonDorView.5094d45cea', { p0: season.place })}</b>
                    </li>
                  )),
                )}
              </ol>
            ) : (
              <p className={s.note}>{richMessage('copy.ProfilePanels.13490b426f')}</p>
            ),
          )}
        </section>
      ))}
    </Loaded>
  );
}
