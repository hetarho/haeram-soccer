import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useId } from 'react';
import type {
  ManagerHistoryPage,
  ManagerSourceSeason,
} from '../../../../packages/contracts/src/manager-history-view';
import {
  MANAGER_HISTORY_COPY,
  managerHistoryListState,
  type ManagerAccomplishmentView,
  type ManagerHistoryFooter,
  type ManagerLegacyView,
  type ManagerTenureView,
} from './managerHistoryView';
import s from './App.module.css';
import m from './ManagerHistory.module.css';

export interface ManagerHistoryProps {
  /** Every row loaded so far, with the cursor of the next page; absent before the first reply. */
  page?: ManagerHistoryPage;
  /** A request is in flight: the first page when `page` is absent, otherwise the next page. */
  loading?: boolean;
  /** The last request failed; an empty string uses the default wording. */
  error?: string;
  /** The row ID of the tenure opened for inspection. */
  inspected?: string;
  onInspect: (row: string | undefined) => void;
  /** Opens our club's season record; `row` is the tenure to restore on return (→WEB-74). */
  onOpenSeason: (season: ManagerSourceSeason, row: string) => void;
  onLoadMore: (cursor: string) => void;
  onRetry: () => void;
}

/**
 * 감독 이력 (→WEB-92): one compact card per tenure and older readable personnel events, newest
 * first. A props-only view: the owner reads pages from the engine worker and keeps the inspected
 * tenure and list position; this component never reads, changes game facts or navigates itself.
 */
export function ManagerHistory(props: ManagerHistoryProps) {
  useTextLocale();
  const heading = useId();
  const state = managerHistoryListState(props);
  return (
    <section
      data-surface="panel"
      className={`${s.panel} ${m.root}`}
      aria-labelledby={heading}
      aria-busy={props.loading || undefined}
    >
      <div className={s.panelHead}>
        <h3 id={heading}>{localizeValue(MANAGER_HISTORY_COPY.title)}</h3>
        <span>{localizeValue(MANAGER_HISTORY_COPY.scope)}</span>
      </div>
      <div className={`${s.panelBody} ${m.body}`}>
        {localizeValue(
          state.kind === 'loading' && (
            <p className={s.muted} role="status">
              {localizeValue(state.message)}
            </p>
          ),
        )}
        {localizeValue(
          state.kind === 'error' && (
            <div className={m.notice} role="alert">
              <p>{localizeValue(state.message)}</p>
              <button type="button" onClick={props.onRetry}>
                {localizeValue(state.retry)}
              </button>
            </div>
          ),
        )}
        {localizeValue(
          state.kind === 'empty' && <p className={s.muted}>{localizeValue(state.message)}</p>,
        )}
        {localizeValue(
          state.kind === 'ready' && (
            <>
              <ol className={m.list}>
                {localizeValue(
                  state.rows.map((row) => (
                    <li key={row.id} data-manager-row={row.id}>
                      {localizeValue(
                        row.kind === 'tenure' ? (
                          <TenureCard
                            row={row}
                            open={props.inspected === row.id}
                            onInspect={props.onInspect}
                            onOpenSeason={props.onOpenSeason}
                          />
                        ) : (
                          <LegacyEvent row={row} />
                        ),
                      )}
                    </li>
                  )),
                )}
              </ol>
              <Footer footer={state.footer} onLoadMore={props.onLoadMore} onRetry={props.onRetry} />
            </>
          ),
        )}
      </div>
    </section>
  );
}

function TenureCard({
  row,
  open,
  onInspect,
  onOpenSeason,
}: {
  row: ManagerTenureView;
  open: boolean;
  onInspect: ManagerHistoryProps['onInspect'];
  onOpenSeason: ManagerHistoryProps['onOpenSeason'];
}) {
  useTextLocale();
  const details = useId();
  const openSeason = (season: ManagerSourceSeason) => onOpenSeason(season, row.id);
  return (
    <article
      data-surface="panel"
      className={m.card}
      aria-label={localizeValue(`${row.name} · ${row.service}`)}
    >
      <header className={m.head}>
        <div className={m.identity}>
          <h4>{row.name}</h4>
          {localizeValue(
            row.badges.map((badge) => (
              <span data-ui="label" key={badge} className={m.badge}>
                {localizeValue(badge)}
              </span>
            )),
          )}
        </div>
        <p className={m.period}>
          <span>{localizeValue(row.service)}</span>
          {localizeValue(row.end && <span>{localizeValue(row.end)}</span>)}
          {localizeValue(
            row.tracking && <span className={m.tracking}>{localizeValue(row.tracking)}</span>,
          )}
        </p>
      </header>
      {localizeValue(
        row.coverage && (
          <p data-ui="notice" data-tone="warm" className={m.coverage}>
            {localizeValue(row.coverage)}
          </p>
        ),
      )}
      <dl className={m.summary}>
        <div>
          <dt>{richMessage('copy.ManagerHistory.e973501701')}</dt>
          <dd>{localizeValue(row.honoursLine)}</dd>
        </div>
        <div>
          <dt>{richMessage('copy.ManagerHistory.86816f6fb7')}</dt>
          <dd>{localizeValue(row.finishesLine)}</dd>
        </div>
        <div>
          <dt>{richMessage('copy.ManagerHistory.b586f6264d')}</dt>
          <dd>
            {localizeValue(row.record.line)}
            {localizeValue(row.record.rate && <small>{localizeValue(row.record.rate)}</small>)}
          </dd>
        </div>
        {localizeValue(
          row.runs.map((run) => (
            <div key={run.label}>
              <dt>{localizeValue(run.label)}</dt>
              <dd>
                {localizeValue(run.value)}
                {localizeValue(run.range && <small>{localizeValue(run.range)}</small>)}
              </dd>
            </div>
          )),
        )}
      </dl>
      {localizeValue(
        row.provisional.map((line) => (
          <p data-ui="notice" data-tone="cool" key={line} className={m.provisional}>
            {localizeValue(line)}
          </p>
        )),
      )}
      <button
        type="button"
        className={m.toggle}
        aria-expanded={open}
        aria-controls={details}
        onClick={() => onInspect(open ? undefined : row.id)}
      >
        {localizeValue(open ? MANAGER_HISTORY_COPY.close : MANAGER_HISTORY_COPY.inspect)}
        <span className={s.srOnly}> · {row.name}</span>
      </button>
      <div id={details} className={m.details} hidden={!open}>
        {localizeValue(
          open && (
            <>
              <Accomplishments
                title={displayMessage('copy.ManagerHistory.e973501701')}
                items={row.honours}
                empty={row.honoursLine}
                note={row.honoursNote}
                onOpen={openSeason}
              />
              <Accomplishments
                title={displayMessage('copy.ManagerHistory.86816f6fb7')}
                items={row.finishes}
                empty={row.finishesLine}
                onOpen={openSeason}
              />
              {localizeValue(
                row.unresolved && (
                  <p data-surface="inset" className={m.coverage}>
                    {localizeValue(row.unresolved)}
                  </p>
                ),
              )}
              <p className={m.note}>
                {localizeValue(row.record.scope)}
                {localizeValue(row.record.note && ` · ${row.record.note}`)}
              </p>
              {localizeValue(
                row.sources.length > 0 && (
                  <section
                    className={m.group}
                    aria-label={displayMessage('copy.ManagerHistory.f0d5c4b847', { p0: row.name })}
                  >
                    <h5>{richMessage('copy.ManagerHistory.4863334f84')}</h5>
                    <div className={m.sources}>
                      {localizeValue(
                        row.sources.map((source) => (
                          <button
                            key={source.key}
                            type="button"
                            aria-label={localizeValue(source.accessibleLabel)}
                            onClick={() => openSeason(source.season)}
                          >
                            {localizeValue(source.label)}
                          </button>
                        )),
                      )}
                    </div>
                  </section>
                ),
              )}
            </>
          ),
        )}
      </div>
    </article>
  );
}

function Accomplishments({
  title,
  items,
  empty,
  note,
  onOpen,
}: {
  title: string;
  items: ManagerAccomplishmentView[];
  empty: string;
  note?: string;
  onOpen: (season: ManagerSourceSeason) => void;
}) {
  useTextLocale();
  return (
    <section className={m.group} aria-label={localizeValue(title)}>
      <h5>{localizeValue(title)}</h5>
      {localizeValue(
        items.length ? (
          <ul className={m.items}>
            {localizeValue(
              items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={m.item}
                    aria-label={localizeValue(item.action.accessibleLabel)}
                    onClick={() => onOpen(item.action.season)}
                  >
                    <b>{localizeValue(item.label)}</b>
                    <small>{localizeValue(item.season)}</small>
                  </button>
                  {localizeValue(item.note && <p className={m.note}>{localizeValue(item.note)}</p>)}
                </li>
              )),
            )}
          </ul>
        ) : (
          <p className={s.muted}>{localizeValue(empty)}</p>
        ),
      )}
      {localizeValue(note && <p className={m.note}>{localizeValue(note)}</p>)}
    </section>
  );
}

function LegacyEvent({ row }: { row: ManagerLegacyView }) {
  useTextLocale();
  return (
    <article
      data-surface="panel"
      className={`${m.card} ${m.legacy}`}
      aria-label={localizeValue(`${row.when} · ${row.title}`)}
    >
      <small>{localizeValue(row.when)}</small>
      <b>{localizeValue(row.title)}</b>
      {localizeValue(row.detail && <p>{localizeValue(row.detail)}</p>)}
      <p className={m.note}>{localizeValue(row.note)}</p>
    </article>
  );
}

function Footer({
  footer,
  onLoadMore,
  onRetry,
}: {
  footer: ManagerHistoryFooter;
  onLoadMore: ManagerHistoryProps['onLoadMore'];
  onRetry: ManagerHistoryProps['onRetry'];
}) {
  useTextLocale();
  return (
    <div className={m.footer}>
      <span className={s.muted}>{localizeValue(footer.shown)}</span>
      {localizeValue(
        footer.kind === 'more' && (
          <button type="button" onClick={() => onLoadMore(footer.cursor)}>
            {localizeValue(footer.label)}
          </button>
        ),
      )}
      {localizeValue(
        footer.kind === 'loading-more' && (
          <p className={s.muted} role="status">
            {localizeValue(footer.label)}
          </p>
        ),
      )}
      {localizeValue(
        footer.kind === 'retry-more' && (
          <div className={m.notice} role="alert">
            <p>{localizeValue(footer.message)}</p>
            <button type="button" onClick={onRetry}>
              {localizeValue(footer.label)}
            </button>
          </div>
        ),
      )}
    </div>
  );
}
