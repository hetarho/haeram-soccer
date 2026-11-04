import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  RecruitmentMediation,
  ReinforcementPromise,
  MediationSupport,
  World,
  CareerDate,
} from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { directionOption } from '../../../../packages/engine/src/direction';
import { requestLabel } from '../../../../packages/engine/src/player';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import { Dialog } from './Dialog';
import { Money } from './Money';
import s from './MediationReview.module.css';
const date = (at: CareerDate) =>
  new Date(Date.UTC(at.year, 7, 1) + at.day * 86400000).toISOString().slice(0, 10);
const labels: Record<MediationSupport, string> = {
  director: sourceMessage('copy.MediationReview.2841b94571'),
  balanced: sourceMessage('copy.stories.634269a095'),
  manager: sourceMessage('copy.MediationReview.4d8060891b'),
};
const status: Record<ReinforcementPromise['status'], string> = {
  pending: sourceMessage('copy.MediationReview.cbed7b3732'),
  fulfilled: sourceMessage('copy.MediationReview.9cdbf4ed98'),
  unfulfilled: sourceMessage('copy.MediationReview.881818422f'),
  cancelled: sourceMessage('common.cancel'),
};
export function MediationReview({
  record,
  w,
  client,
  onClose,
}: {
  record: RecruitmentMediation;
  w: World;
  client: GameClient;
  onClose: () => void;
}) {
  useTextLocale();
  const [support, setSupport] = useState<MediationSupport>(
    directionOption(w, 'recruitmentSupport').id as MediationSupport,
  );
  const [checked, setChecked] = useState<{
      id: string;
      support: MediationSupport;
      revision: number;
      value: Awaited<ReturnType<GameClient['mediationPreview']>>;
    }>(),
    [error, setError] = useState<string>();
  const disabled = useGameState(gameActionsBlocked),
    readonly = useGameState((state) => state.readonly);
  const preview = checked?.id === record.id ? checked.value : undefined;
  const ready =
    checked?.id === record.id && checked.support === support && checked.revision === w.revision;
  const previewElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = previewElement.current;
    // Keep the occupied space when a new choice has fewer result rows.
    if (element && preview) element.style.minHeight = getComputedStyle(element).height;
  }, [preview]);
  useEffect(() => {
    let current = true;
    setError(undefined);
    void client.mediationPreview(record.id, support).then(
      (value) => {
        if (current) setChecked({ id: record.id, support, revision: w.revision, value });
      },
      (reason) => {
        if (current) setError(String(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [client, record.id, support, w.revision]);
  const cash = (value: string) => (
    <Money value={value} code={w.clubs.find((c) => c.id === w.playerClub)!.country} year={w.year} />
  );
  return (
    <Dialog
      label={displayMessage('copy.MediationReview.24324e5e18')}
      onClose={onClose}
      wide
      actions={
        <div className={s.actions}>
          <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
          <button
            data-ui="primary"
            disabled={disabled || !ready || !!error || record.status !== 'pending'}
            data-preview-pending={
              (!!preview && !ready && !error && !disabled && record.status === 'pending') ||
              undefined
            }
            onClick={async () => {
              if (!ready || disabled || error || record.status !== 'pending') return;
              try {
                const reply = await client.command({
                  type: 'resolve-mediation',
                  id: record.id,
                  support,
                });
                if (reply?.ok) onClose();
                else setError(reply?.error ?? sourceMessage('copy.MediationReview.732a5c7af4'));
              } catch (reason) {
                setError(String(reason));
              }
            }}
          >
            {richMessage('copy.MediationReview.8922243682')}
          </button>
        </div>
      }
    >
      <div className={s.mediation}>
        <dl
          data-surface="sheet"
          className={s.summary}
          aria-label={displayMessage('copy.MediationReview.49c2e323fc')}
        >
          <div>
            <dt>{richMessage('copy.MediationReview.1a0205cc2d')}</dt>
            <dd>{localizeValue(requestLabel(record.target))}</dd>
          </div>
          <div>
            <dt>{richMessage('copy.MediationReview.c16765b702')}</dt>
            <dd>{record.candidate.name}</dd>
          </div>
        </dl>
        <div className={s.layout}>
          <section
            className={s.positions}
            aria-label={displayMessage('copy.MediationReview.87adf4a27f')}
          >
            <h3>{richMessage('copy.MediationReview.ba377b3dd3')}</h3>
            <article data-surface="panel" className={s.position}>
              <h4>
                <span>{richMessage('copy.MediationReview.22d1aca95a')}</span>
                <b>{record.manager.name}</b>
              </h4>
              <p>{localizeValue(record.managerReason)}</p>
            </article>
            <article data-surface="panel" className={s.position}>
              <h4>
                <span>{richMessage('copy.MediationReview.f822d4ed16')}</span>
                <b>{record.director.name}</b>
              </h4>
              <p>{localizeValue(record.directorReason)}</p>
            </article>
          </section>
          <section
            className={s.decision}
            aria-label={displayMessage('copy.MediationReview.94d38619dd')}
          >
            <div className={s.policy}>
              <span>
                <small>{richMessage('copy.MediationReview.4a40298901')}</small>
                <b>{directionOption(w, 'recruitmentSupport').name}</b>
              </span>
            </div>
            <fieldset className={s.supportChoices} disabled={disabled}>
              <legend>{richMessage('copy.MediationReview.e006614d92')}</legend>
              <div className={s.options} data-ui="choice-cards">
                {localizeValue(
                  (Object.keys(labels) as MediationSupport[]).map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="mediation-support"
                        checked={support === value}
                        onChange={() => setSupport(value)}
                      />
                      {localizeValue(labels[value])}
                    </label>
                  )),
                )}
              </div>
            </fieldset>
            <p className={s.hint}>{richMessage('copy.MediationReview.6aad0ac977')}</p>
            <div
              data-surface="sheet"
              className={s.preview}
              ref={previewElement}
              aria-label={displayMessage('copy.MediationReview.75672ff0e8')}
              aria-busy={!ready && !error}
            >
              <h3>{richMessage('copy.MediationReview.43736523a1')}</h3>
              {localizeValue(
                preview && (
                  <>
                    <p className={s.result}>{localizeValue(preview.result)}</p>
                    <dl className={s.facts}>
                      <div>
                        <dt>{richMessage('copy.MediationReview.d881c8d4c4')}</dt>
                        <dd>{localizeValue(cash(preview.immediateSpend))}</dd>
                      </div>
                      {localizeValue(
                        preview.offer && (
                          <>
                            <div>
                              <dt>{richMessage('copy.MediationReview.50eaa6edc8')}</dt>
                              <dd>
                                {localizeValue(
                                  preview.offer.kind === 'bid'
                                    ? sourceMessage('copy.MediationReview.f5671994c3')
                                    : sourceMessage('copy.MediationReview.2c47bc166e'),
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>{richMessage('copy.MediationReview.b6bf25ba15')}</dt>
                              <dd>{localizeValue(cash(preview.offer.fee))}</dd>
                            </div>
                            <div>
                              <dt>{richMessage('copy.MediationReview.b9d465b29e')}</dt>
                              <dd>{localizeValue(cash(preview.offer.wage))}</dd>
                            </div>
                          </>
                        ),
                      )}
                      {localizeValue(
                        preview.promise && (
                          <>
                            <div>
                              <dt>{richMessage('copy.MediationReview.2cf5cedc06')}</dt>
                              <dd>{localizeValue(requestLabel(preview.promise.target))}</dd>
                            </div>
                            <div>
                              <dt>{richMessage('copy.MediationReview.736ad5295e')}</dt>
                              <dd>{localizeValue(date(preview.promise.deadline))}</dd>
                            </div>
                          </>
                        ),
                      )}
                    </dl>
                    {localizeValue(
                      preview.promise && (
                        <p className={s.hint}>{richMessage('copy.MediationReview.a947be0cd6')}</p>
                      ),
                    )}
                  </>
                ),
              )}
            </div>
            <p
              role={error ? 'alert' : 'status'}
              className={preview && !error ? s.previewStatus : s.hint}
              style={{ visibility: ready && !error ? 'hidden' : undefined }}
            >
              {localizeValue(
                error
                  ? sourceMessage('copy.MediationReview.02136bc95c', { p0: error })
                  : sourceMessage('copy.MediationReview.572113f055'),
              )}
            </p>
            {localizeValue(
              disabled && (
                <p className={s.hint}>
                  {localizeValue(
                    readonly
                      ? sourceMessage('copy.MediationReview.4f5844a277')
                      : sourceMessage('copy.MediationReview.dde347e328'),
                  )}
                </p>
              ),
            )}
          </section>
        </div>
      </div>
    </Dialog>
  );
}

export function MediationButton({
  record,
  w,
  client,
}: {
  record: RecruitmentMediation;
  w: World;
  client: GameClient;
}) {
  useTextLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>
        {richMessage('copy.MediationReview.24324e5e18')}
      </button>
      {localizeValue(
        open && (
          <MediationReview record={record} w={w} client={client} onClose={() => setOpen(false)} />
        ),
      )}
    </>
  );
}
function PromiseCard({ promise }: { promise: ReinforcementPromise }) {
  useTextLocale();
  return (
    <article data-surface="panel" className={s.card}>
      <h4>
        {localizeValue(requestLabel(promise.target))} · {localizeValue(status[promise.status])}
      </h4>
      <p>
        {richMessage('copy.MediationReview.c01fa0dea6', {
          p0: promise.manager.name,
          p1: date(promise.created),
          p2: date(promise.deadline),
        })}
      </p>
      {localizeValue(promise.reason && <p>{localizeValue(promise.reason)}</p>)}
      {localizeValue(promise.reaction && <p>{localizeValue(promise.reaction)}</p>)}
    </article>
  );
}
export function RecruitmentCommitments({ w, client }: { w: World; client: GameClient }) {
  useTextLocale();
  const [open, setOpen] = useState(false),
    [history, setHistory] = useState<Awaited<ReturnType<GameClient['recruitmentHistory']>>>(),
    [error, setError] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let current = true;
    setHistory(undefined);
    setError(undefined);
    void client.recruitmentHistory().then(
      (value) => {
        if (current) setHistory(value);
      },
      (reason) => {
        if (current) setError(String(reason));
      },
    );
    return () => {
      current = false;
    };
  }, [open, client]);
  return (
    <section className={s.review} aria-label={displayMessage('copy.MediationReview.72af6aebcb')}>
      <h3>{richMessage('copy.MediationReview.72af6aebcb')}</h3>
      {localizeValue(
        w.mediations
          ?.filter((m) => m.status === 'pending')
          .map((record) => (
            <div key={record.id}>
              <p>
                {richMessage('copy.MediationReview.8f6cf5909a', {
                  p0: record.manager.name,
                  p1: requestLabel(record.target),
                })}
              </p>
              {localizeValue(
                !isDelegated(w, 'recruitment') && (
                  <MediationButton record={record} w={w} client={client} />
                ),
              )}
            </div>
          )),
      )}
      {localizeValue(w.promises?.map((p) => <PromiseCard key={p.id} promise={p} />))}
      <button onClick={() => setOpen(true)}>
        {richMessage('copy.MediationReview.124b263e17')}
      </button>
      {localizeValue(
        open && (
          <Dialog
            label={displayMessage('copy.MediationReview.9a0860e763')}
            onClose={() => setOpen(false)}
          >
            {localizeValue(
              error ? (
                <p role="status">{richMessage('copy.MediationReview.fb61b6a25d', { p0: error })}</p>
              ) : !history ? (
                <p role="status">{richMessage('copy.MediationReview.5d83148b79')}</p>
              ) : (
                <>
                  {localizeValue(
                    history.mediations.map((m) => (
                      <article data-surface="panel" className={s.card} key={m.id}>
                        <h3>
                          {richMessage('copy.MediationReview.95945b67ac', {
                            p0: m.manager.name,
                            p1: m.director.name,
                          })}
                        </h3>
                        <p>{localizeValue(m.managerReason)}</p>
                        <p>{localizeValue(m.directorReason)}</p>
                        <p>
                          {richMessage('copy.MediationReview.b066ae3b32', {
                            p0: labels[m.support],
                            p1: ' ',
                            p2: m.resolution
                              ? sourceMessage('copy.MediationReview.37c0e6b970', {
                                  p0: labels[m.resolution.support],
                                  p1: m.resolution.result,
                                })
                              : sourceMessage('copy.MediationReview.51c30b52b9'),
                          })}
                        </p>
                      </article>
                    )),
                  )}
                  {localizeValue(
                    history.promises.map((p) => <PromiseCard key={p.id} promise={p} />),
                  )}
                </>
              ),
            )}
            <button onClick={() => setOpen(false)}>
              {richMessage('copy.EventCenter.1e8c10206f')}
            </button>
          </Dialog>
        ),
      )}
    </section>
  );
}
