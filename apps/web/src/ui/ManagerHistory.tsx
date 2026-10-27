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
        <h3 id={heading}>{MANAGER_HISTORY_COPY.title}</h3>
        <span>{MANAGER_HISTORY_COPY.scope}</span>
      </div>
      <div className={`${s.panelBody} ${m.body}`}>
        {state.kind === 'loading' && (
          <p className={s.muted} role="status">
            {state.message}
          </p>
        )}
        {state.kind === 'error' && (
          <div className={m.notice} role="alert">
            <p>{state.message}</p>
            <button type="button" onClick={props.onRetry}>
              {state.retry}
            </button>
          </div>
        )}
        {state.kind === 'empty' && <p className={s.muted}>{state.message}</p>}
        {state.kind === 'ready' && (
          <>
            <ol className={m.list}>
              {state.rows.map((row) => (
                <li key={row.id} data-manager-row={row.id}>
                  {row.kind === 'tenure' ? (
                    <TenureCard
                      row={row}
                      open={props.inspected === row.id}
                      onInspect={props.onInspect}
                      onOpenSeason={props.onOpenSeason}
                    />
                  ) : (
                    <LegacyEvent row={row} />
                  )}
                </li>
              ))}
            </ol>
            <Footer footer={state.footer} onLoadMore={props.onLoadMore} onRetry={props.onRetry} />
          </>
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
  const details = useId();
  const openSeason = (season: ManagerSourceSeason) => onOpenSeason(season, row.id);
  return (
    <article data-surface="panel" className={m.card} aria-label={`${row.name} · ${row.service}`}>
      <header className={m.head}>
        <div className={m.identity}>
          <h4>{row.name}</h4>
          {row.badges.map((badge) => (
            <span data-ui="label" key={badge} className={m.badge}>
              {badge}
            </span>
          ))}
        </div>
        <p className={m.period}>
          <span>{row.service}</span>
          {row.end && <span>{row.end}</span>}
          {row.tracking && <span className={m.tracking}>{row.tracking}</span>}
        </p>
      </header>
      {row.coverage && (
        <p data-ui="notice" data-tone="warm" className={m.coverage}>
          {row.coverage}
        </p>
      )}
      <dl className={m.summary}>
        <div>
          <dt>우승·승격</dt>
          <dd>{row.honoursLine}</dd>
        </div>
        <div>
          <dt>최고 최종 순위</dt>
          <dd>{row.finishesLine}</dd>
        </div>
        <div>
          <dt>공식전 전적</dt>
          <dd>
            {row.record.line}
            {row.record.rate && <small>{row.record.rate}</small>}
          </dd>
        </div>
        {row.runs.map((run) => (
          <div key={run.label}>
            <dt>{run.label}</dt>
            <dd>
              {run.value}
              {run.range && <small>{run.range}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {row.provisional.map((line) => (
        <p data-ui="notice" data-tone="cool" key={line} className={m.provisional}>
          {line}
        </p>
      ))}
      <button
        type="button"
        className={m.toggle}
        aria-expanded={open}
        aria-controls={details}
        onClick={() => onInspect(open ? undefined : row.id)}
      >
        {open ? MANAGER_HISTORY_COPY.close : MANAGER_HISTORY_COPY.inspect}
        <span className={s.srOnly}> · {row.name}</span>
      </button>
      <div id={details} className={m.details} hidden={!open}>
        {open && (
          <>
            <Accomplishments
              title="우승·승격"
              items={row.honours}
              empty={row.honoursLine}
              note={row.honoursNote}
              onOpen={openSeason}
            />
            <Accomplishments
              title="최고 최종 순위"
              items={row.finishes}
              empty={row.finishesLine}
              onOpen={openSeason}
            />
            {row.unresolved && <p className={m.coverage}>{row.unresolved}</p>}
            <p className={m.note}>
              {row.record.scope}
              {row.record.note && ` · ${row.record.note}`}
            </p>
            {row.sources.length > 0 && (
              <section className={m.group} aria-label={`${row.name} 재임 시즌`}>
                <h5>재임 시즌 기록</h5>
                <div className={m.sources}>
                  {row.sources.map((source) => (
                    <button
                      key={source.key}
                      type="button"
                      aria-label={source.accessibleLabel}
                      onClick={() => openSeason(source.season)}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
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
  return (
    <section className={m.group} aria-label={title}>
      <h5>{title}</h5>
      {items.length ? (
        <ul className={m.items}>
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={m.item}
                aria-label={item.action.accessibleLabel}
                onClick={() => onOpen(item.action.season)}
              >
                <b>{item.label}</b>
                <small>{item.season}</small>
              </button>
              {item.note && <p className={m.note}>{item.note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.muted}>{empty}</p>
      )}
      {note && <p className={m.note}>{note}</p>}
    </section>
  );
}

function LegacyEvent({ row }: { row: ManagerLegacyView }) {
  return (
    <article
      data-surface="panel"
      className={`${m.card} ${m.legacy}`}
      aria-label={`${row.when} · ${row.title}`}
    >
      <small>{row.when}</small>
      <b>{row.title}</b>
      {row.detail && <p>{row.detail}</p>}
      <p className={m.note}>{row.note}</p>
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
  return (
    <div className={m.footer}>
      <span className={s.muted}>{footer.shown}</span>
      {footer.kind === 'more' && (
        <button type="button" onClick={() => onLoadMore(footer.cursor)}>
          {footer.label}
        </button>
      )}
      {footer.kind === 'loading-more' && (
        <p className={s.muted} role="status">
          {footer.label}
        </p>
      )}
      {footer.kind === 'retry-more' && (
        <div className={m.notice} role="alert">
          <p>{footer.message}</p>
          <button type="button" onClick={onRetry}>
            {footer.label}
          </button>
        </div>
      )}
    </div>
  );
}
