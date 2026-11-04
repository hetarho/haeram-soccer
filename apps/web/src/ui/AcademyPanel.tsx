import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { Money } from './Money';
import { callLine, placeAcademy, playerCallLine } from './teamState';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { registrationRoom } from '../../../../packages/engine/src/registration';
import { useTaskState } from './taskMemory';
import { PlayerLink } from '../entities/player';
import type { World } from '../../../../packages/contracts/src/types';
import {
  academySummary,
  ACADEMY_LEAVE_AGE,
  YOUTH_FOCUS_INFO,
} from '../../../../packages/engine/src/academy';
import { LINE_LABEL, lineOf, POSITION_LABEL } from '../../../../packages/engine/src/player';
import { buildOf, cardOf } from '../../../../packages/engine/src/build';
import { currentDay, seasonDayLabel, seasonDayOf } from '../../../../packages/engine/src/calendar';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { DecisionOwner } from './DecisionOwner';
import { DirectionFacts } from './DirectionFacts';
import { rowInForce } from './areas';
import { directionOption } from '../../../../packages/engine/src/direction';
import { OvrBadge } from './OvrBadge';
import { openStaff, openFacility } from './state';
import s from './TrainingView.module.css';

function useActing() {
  return useGameState(gameActionsBlocked);
}

function Meter({ value }: { value: number }) {
  useTextLocale();
  return (
    <span className={s.meter} aria-hidden="true">
      <i style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
    </span>
  );
}

/**
 * 유소년 (→WEB-70): the academy's prospects by age group — U-17, U-19, U-21 — grow here until
 * promoted or released (→CLUB-16), by the owner or, when the level delegates it, by the youth
 * director's rule (→STAFF-13); the director sets the academy's training focus (→CLUB-31). The
 * academy investment and 유입 방식 are the club's direction, set at founding, and only read here
 * (→ECON-25).
 */
export function AcademyPanel({
  w,
  client,
  selected,
  onReview,
}: {
  w: World;
  client: GameClient;
  selected?: string;
  onReview?: (id: string) => void;
}) {
  useTextLocale();
  const acting = useActing();
  const [promoted, setPromoted] = useTaskState<string | undefined>(
    w.id,
    'academy-promoted',
    undefined,
  );
  const arrived = w.players.find((person) => person.id === promoted && person.status === 'active');
  const arrivedCall = arrived && playerCallLine(w, arrived);
  const summary = placeAcademy(w);
  const club = clubOf(w);
  const groups = selected
    ? summary.groups
        .map((group) => ({
          ...group,
          players: group.players.filter(({ player }) => player.id === selected),
        }))
        .filter((group) => group.players.length > 0)
    : summary.groups;
  const today = currentDay(w);
  const director = w.staff?.find((member) => member.role === 'youth');
  const nextIntake =
    summary.intakeDone || today > summary.intakeDay
      ? seasonDayLabel(w.year + 1, seasonDayOf(w.year + 1, 3, 15))
      : `${seasonDayLabel(w.year, summary.intakeDay)} · D-${summary.intakeDay - today}`;
  const investment = rowInForce(w, 'academy').value;
  return (
    <div className={s.stack}>
      {localizeValue(
        !selected && arrived && arrivedCall && (
          <section
            data-surface="panel"
            className={s.card}
            aria-label={displayMessage('copy.AcademyPanel.292371b92c')}
          >
            <h3>{richMessage('copy.AcademyPanel.7d85e3b927')}</h3>
            <PlayerLink id={arrived.id} name={arrived.name} />
            <p className={s.timing} data-testid="arrived-training">
              {richMessage('copy.AcademyPanel.110b08796f', {
                p0: arrivedCall.focus,
                p1: arrivedCall.by,
              })}
            </p>
            <p className={s.timing}>{richMessage('copy.AcademyPanel.3f985ab2ee')}</p>
          </section>
        ),
      )}
      <section
        data-surface="panel"
        className={s.card}
        aria-label={displayMessage('copy.AcademyPanel.0c8e8ca5aa')}
      >
        <header className={s.head}>
          <h3>{richMessage('copy.AcademyPanel.0c8e8ca5aa')}</h3>
          <span>
            {richMessage('copy.AcademyPanel.3cbfe3f406', {
              p0: summary.players.length,
              p1: summary.capacity,
              p2: summary.room.total,
            })}
          </span>
        </header>
        <p className={s.intake} data-testid="academy-intake">
          {richMessage('copy.AcademyPanel.f1f4914162', {
            p0: <b>{localizeValue(nextIntake)}</b>,
            p1: summary.nextIntakeSize,
          })}
        </p>
        {localizeValue(
          summary.players.length ? (
            groups.map((group) => (
              <section
                key={group.key}
                className={s.ageGroup}
                aria-label={localizeValue(`${group.label} ${group.ages}`)}
                data-testid={`age-group-${group.key}`}
              >
                <header>
                  <b>{localizeValue(group.label)}</b>
                  <small>
                    {richMessage('copy.AcademyPanel.beff8da50c', {
                      p0: group.ages,
                      p1: group.players.length,
                      p2: group.factor,
                    })}
                  </small>
                </header>
                {localizeValue(
                  group.players.length > 0 && (
                    <ul className={s.prospects}>
                      {localizeValue(
                        group.players.map(
                          ({ player: p, overall, potential, age, readiness, label }) => (
                            <li key={p.id}>
                              <OvrBadge value={overall} role={p.position} potential={potential} />
                              <div className={s.prospectText}>
                                <b>{p.name}</b>
                                <small>
                                  {richMessage('copy.AcademyPanel.07863c723a', {
                                    p0: age,
                                    p1: POSITION_LABEL[p.position],
                                    p2: LINE_LABEL[lineOf(p.position)],
                                  })}
                                </small>
                                <Meter value={(overall / Math.max(1, potential)) * 100} />
                                <small className={readiness === 'ready' ? s.ready : undefined}>
                                  {localizeValue(label)}
                                </small>
                              </div>
                              <div className={s.prospectActions}>
                                <small>
                                  {richMessage('copy.AcademyPanel.70c993e407', {
                                    p0: ' ',
                                    p1: (
                                      <Money
                                        value={
                                          summary.players.find((one) => one.player.id === p.id)!
                                            .promotionWage
                                        }
                                        code={club.country}
                                        year={w.year}
                                      />
                                    ),
                                    p2: ' · ',
                                    p3: w.year + 3,
                                  })}
                                </small>
                                {localizeValue(
                                  onReview ? (
                                    <button type="button" onClick={() => onReview(p.id)}>
                                      {richMessage('copy.AcademyPanel.8dd36007dd', { p0: p.name })}
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        data-ui="primary"
                                        type="button"
                                        className={readiness === 'ready' ? s.primary : undefined}
                                        aria-label={displayMessage('copy.AcademyPanel.d1f97ef984', {
                                          p0: p.name,
                                        })}
                                        disabled={
                                          acting ||
                                          !!registrationRoom(w, {
                                            ...p,
                                            graduate: true,
                                            joined: w.year,
                                          }) ||
                                          age < summary.promotionAge
                                        }
                                        title={localizeValue(
                                          age < summary.promotionAge
                                            ? sourceMessage('copy.AcademyPanel.0d10b06a9b', {
                                                p0: summary.promotionAge,
                                              })
                                            : undefined,
                                        )}
                                        onClick={() => {
                                          void client
                                            .command({ type: 'promote-youth', id: p.id })
                                            .then((reply) => {
                                              if (reply?.ok) setPromoted(p.id);
                                            });
                                        }}
                                      >
                                        {richMessage('copy.AcademyPanel.9933433ed5')}
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={displayMessage('copy.AcademyPanel.695a221875', {
                                          p0: p.name,
                                        })}
                                        disabled={acting}
                                        onClick={() =>
                                          void client.command({ type: 'release-youth', id: p.id })
                                        }
                                      >
                                        {richMessage('copy.AcademyPanel.4a1cb5e3ba')}
                                      </button>
                                    </>
                                  ),
                                )}
                              </div>
                            </li>
                          ),
                        ),
                      )}
                    </ul>
                  ),
                )}
              </section>
            ))
          ) : (
            <p className={s.note}>{richMessage('copy.AcademyPanel.db717c4b13')}</p>
          ),
        )}
        {localizeValue(
          summary.room.total === 0 && (
            <p className={s.note}>{richMessage('copy.AcademyPanel.c247e088fa')}</p>
          ),
        )}
      </section>
      {localizeValue(
        !selected && (
          <>
            <p className={s.note}>{richMessage('copy.AcademyPanel.46438ba7e4')}</p>
            <YouthTraining w={w} />
            <section
              data-surface="panel"
              className={s.card}
              aria-label={displayMessage('copy.AcademyPanel.7db44b44e6')}
            >
              <header className={s.head}>
                <h3>{richMessage('copy.AcademyPanel.8521c8e360')}</h3>
              </header>
              <div className={s.homeLine} data-testid="academy-direction">
                <span>
                  <b>{richMessage('copy.AcademyPanel.e6f8b5162a')}</b>
                  <small>
                    {richMessage('copy.AcademyPanel.fca2573b00', {
                      p0: investment,
                      p1: cardOf(buildOf(w), 'youth').label,
                    })}
                  </small>
                </span>
              </div>
              <button
                data-ui="link"
                type="button"
                className={s.homeLine}
                onClick={() => openStaff('youth')}
              >
                <span>
                  <b>
                    {richMessage('copy.AcademyPanel.c113831f09', {
                      p0: director?.name ?? sourceMessage('team.vacant'),
                    })}
                  </b>
                  <small>{richMessage('copy.AcademyPanel.3d7cc9563f')}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
              <button
                data-ui="link"
                type="button"
                className={s.homeLine}
                onClick={() => openFacility('academy')}
              >
                <span>
                  <b>{richMessage('copy.AcademyPanel.7ea7f413a3', { p0: w.academyFacility })}</b>
                  <small>{richMessage('copy.AcademyPanel.e28496212d')}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </section>
            <section
              data-surface="panel"
              className={s.card}
              aria-label={displayMessage('copy.AcademyPanel.7d65178ece')}
            >
              <header className={s.head}>
                <h3>{richMessage('staff.role.youth')}</h3>
                <span>
                  {localizeValue(
                    director
                      ? sourceMessage('copy.AcademyPanel.95ca4ba319', {
                          p0: director.name,
                          p1: Math.round(director.ability),
                        })
                      : sourceMessage('team.vacant'),
                  )}
                </span>
              </header>
              <div data-surface="sheet" className={s.delegate}>
                <DecisionOwner
                  w={w}
                  decision="academy"
                  plain
                  auto={sourceMessage('copy.AcademyPanel.f391535bf3')}
                  owner={sourceMessage('copy.AcademyPanel.7aec0b3ee8')}
                />
                <DirectionFacts
                  w={w}
                  rows={['youthGoal', 'debut', 'finance']}
                  responsibility="academy"
                />
                <ul className={s.rule}>
                  <li>
                    <b>{richMessage('copy.AcademyPanel.8e70a8dda1')}</b>
                    <span>
                      {richMessage('copy.AcademyPanel.4c7e6478e9', {
                        p0: summary.promotionAge,
                        p1: directionOption(w, 'debut').summary,
                      })}
                    </span>
                  </li>
                  <li>
                    <b>{richMessage('copy.AcademyPanel.4a1cb5e3ba')}</b>
                    <span>
                      {richMessage('copy.AcademyPanel.98141655a9', {
                        p0: directionOption(w, 'youthGoal').summary,
                        p1: ACADEMY_LEAVE_AGE,
                      })}
                    </span>
                  </li>
                  <li>
                    <b>{richMessage('copy.AcademyPanel.a98f51efdf')}</b>
                    <span>{richMessage('copy.AcademyPanel.61c476a1cf')}</span>
                  </li>
                </ul>
              </div>
            </section>
          </>
        ),
      )}
    </div>
  );
}

/**
 * The academy's training focus the youth director sets by his rule (→CLUB-31), read only: why,
 * the 데뷔 시점 and 육성 목표 he works to, and each focus's effect by age group.
 */
function YouthTraining({ w }: { w: World }) {
  useTextLocale();
  const call = callLine(w, 'youth'),
    focus = academySummary(w).focus;
  return (
    <section
      data-surface="panel"
      className={s.card}
      aria-label={displayMessage('copy.AcademyPanel.a57db77cfd')}
    >
      <header className={s.head}>
        <h3>{richMessage('copy.AcademyPanel.a57db77cfd')}</h3>
        <span data-testid="youth-focus">
          {richMessage('copy.AcademyPanel.80d73fa296', { p0: call.focus, p1: call.by })}
        </span>
      </header>
      <p data-surface="inset" className={s.advice}>
        {localizeValue(call.reason)}
      </p>
      <p className={s.timing}>
        {richMessage('copy.AcademyPanel.43fe6a99c5', {
          p0: directionOption(w, 'debut').name,
          p1: ' ',
          p2: directionOption(w, 'youthGoal').name,
        })}
      </p>
      <details data-ui="disclosure" className={s.reference}>
        <summary>{richMessage('copy.AcademyPanel.4c8d733cdd')}</summary>
        <ul className={s.focuses} aria-label={displayMessage('copy.AcademyPanel.03b3485dad')}>
          {localizeValue(
            (Object.keys(YOUTH_FOCUS_INFO) as (keyof typeof YOUTH_FOCUS_INFO)[]).map((id) => {
              const info = YOUTH_FOCUS_INFO[id];
              return (
                <li key={id} aria-current={focus === id || undefined}>
                  <b>{localizeValue(info.label)}</b>
                  <span>
                    <small>
                      {richMessage('copy.AcademyPanel.85fb60ff15', {
                        p0: localizeValue(info.growth.u17),
                        p1: localizeValue(info.growth.u19),
                      })}
                    </small>
                    <small>
                      {richMessage('copy.AcademyPanel.f3be4c374c', {
                        p0: localizeValue(info.growth.u21),
                      })}
                    </small>
                  </span>
                </li>
              );
            }),
          )}
        </ul>
        <p className={s.note}>{richMessage('copy.AcademyPanel.35db442e93')}</p>
      </details>
    </section>
  );
}
