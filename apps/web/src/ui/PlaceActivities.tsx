import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { ClientState, GameClient } from '../runtime/client';
import { AcademyPanel } from './AcademyPanel';
import { Dialog } from './Dialog';
import { Money } from './Money';
import { activityUnavailable, placeActivities, placeActivityClient } from './placeActivityChoices';
import { useAcademyReview } from './state';
import s from './PlaceActivities.module.css';

export interface PlaceActivitiesProps {
  state: ClientState;
  client: GameClient;
}

/**
 * 유소년's working place (→WEB-102): its current state, the prospects with their promotion and
 * release decisions at actual costs and risks, and its real records. The other places only read
 * and have no panel of owner choices.
 */
export function PlaceActivities(props: PlaceActivitiesProps) {
  useTextLocale();
  const world = props.state.view?.world;
  return world ? <Activities key={world.id} {...props} /> : null;
}

function Activities({ state, client }: PlaceActivitiesProps) {
  useTextLocale();
  const w = state.view!.world;
  const model = placeActivities(w);
  const club = clubOf(w);
  /** The prospect under review. */
  const [inspection, setInspection] = useState<string>();
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const inspectionSerial = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const scoped = useMemo(() => {
    const serial = inspectionSerial.current;
    return placeActivityClient(
      client,
      w,
      () => mounted.current && inspectionSerial.current === serial,
      setError,
    );
  }, [client, w, inspection]);
  const close = () => {
    inspectionSerial.current++;
    setInspection(undefined);
    setError('');
  };
  const inspect = (next: string) => {
    inspectionSerial.current++;
    setError('');
    setInspection(next);
  };
  // A prospect named in 팀's academy list opens his review here, as its own row would (→WEB-112).
  const asked = useAcademyReview((store) => store.request);
  useEffect(() => {
    if (!asked) return;
    useAcademyReview.getState().take();
    if (model.academy.players.some(({ player }) => player.id === asked)) inspect(asked);
  }, [asked]);
  const reason = activityUnavailable(state, w);
  const reviewed = inspection
    ? model.academy.players.find(({ player }) => player.id === inspection)
    : undefined;
  const reviewedGroup = model.academy.groups.find((group) => group.key === reviewed?.group);
  return (
    <section
      className={s.panel}
      aria-label={displayMessage('copy.PlaceActivities.7f1a4ad464')}
      data-testid="place-activities-academy"
    >
      <ul className={s.facts} aria-label={displayMessage('copy.PlaceActivities.a00fce68f4')}>
        {localizeValue(model.facts.map((fact) => <li key={fact}>{localizeValue(fact)}</li>))}
      </ul>
      {localizeValue(reason && <p className={s.note}>{localizeValue(reason)}</p>)}
      <AcademyPanel w={w} client={scoped} onReview={inspect} />
      {localizeValue(
        error && (
          <p role="alert" className={s.note}>
            {localizeValue(error)}
          </p>
        ),
      )}
      <div
        className={s.records}
        aria-label={displayMessage('copy.PlaceActivities.55d95a0110')}
        aria-live="polite"
      >
        <b>{richMessage('copy.PlaceActivities.dec5d6b60c')}</b>
        {localizeValue(
          model.records.length ? (
            model.records.map((event, i) => (
              <p key={`${event.year}:${event.round}:${event.kind}:${i}`}>
                <b>
                  {richMessage('copy.PlaceActivities.9a94b0918b', {
                    p0: event.year,
                    p1: event.title,
                  })}
                </b>
                <small>{localizeValue(event.detail)}</small>
                {localizeValue(
                  event.amount !== undefined && (
                    <Money value={event.amount} code={club.country} year={event.year} />
                  ),
                )}
              </p>
            ))
          ) : (
            <p>{richMessage('copy.PlaceActivities.e83dbaaf1c')}</p>
          ),
        )}
      </div>
      {localizeValue(
        inspection && (
          <Dialog label={displayMessage('copy.PlaceActivities.3be03a1cfe')} onClose={close}>
            {localizeValue(
              reviewed ? (
                <>
                  <p>
                    {richMessage('copy.PlaceActivities.abc340ed9a', {
                      p0: reviewed.player.name,
                      p1: localizeValue(reviewed.overall),
                      p2: localizeValue(reviewed.potential),
                      p3: localizeValue(' '),
                      p4: localizeValue(reviewed.label),
                    })}
                  </p>
                  <p>{richMessage('copy.PlaceActivities.f71085db6c')}</p>
                  <p>
                    {richMessage('copy.PlaceActivities.90a1e63e67', {
                      p0: ' ',
                      p1: (
                        <Money value={reviewed.promotionWage} code={club.country} year={w.year} />
                      ),
                    })}
                  </p>
                  <p>
                    {richMessage('copy.PlaceActivities.d606de2a3f', {
                      p0: reviewedGroup?.label,
                      p1: reviewedGroup?.factor,
                      p2: ' ',
                      p3: w.year + 3,
                    })}
                  </p>
                  {localizeValue(
                    reviewed.promotionUnavailable && (
                      <p role="status">
                        {richMessage('copy.PlaceActivities.8069c5688f', {
                          p0: reviewed.promotionUnavailable,
                        })}
                      </p>
                    ),
                  )}
                  <p>{richMessage('copy.PlaceActivities.90eb9a2a49')}</p>
                  {localizeValue(reason && <p role="status">{localizeValue(reason)}</p>)}
                  <AcademyPanel w={w} client={scoped} selected={reviewed.player.id} />
                </>
              ) : (
                <p>{richMessage('copy.PlaceActivities.ca9d020216')}</p>
              ),
            )}
            {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
            <div className={s.actions}>
              <button type="button" onClick={close}>
                {richMessage('common.cancel')}
              </button>
            </div>
          </Dialog>
        ),
      )}
    </section>
  );
}
