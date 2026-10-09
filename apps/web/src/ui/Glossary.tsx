import type { ReactNode } from 'react';
import { Dialog } from './Dialog';
import { GLOSSARY, glossaryEntry, useGlossary } from './metricGlossary';
import s from './Glossary.module.css';

/** A metric name that explains itself: tapping it opens its glossary entry (→WEB-53). */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const show = useGlossary((state) => state.show);
  const entry = glossaryEntry(id);
  if (!entry) return <>{children}</>;
  return (
    <button
      type="button"
      className={s.term}
      aria-label={`${entry.abbr ? `${entry.abbr} ` : ''}${entry.term} 설명 보기`}
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.focus();
        show(id);
      }}
    >
      {children ?? entry.abbr ?? entry.term}
    </button>
  );
}

function Entry({ id }: { id: string }) {
  const entry = glossaryEntry(id)!;
  return (
    <article className={s.entry} data-testid={`glossary-${id}`}>
      <h3>
        {entry.term}
        {entry.abbr && <small>{entry.abbr}</small>}
      </h3>
      <dl>
        <dt>축구계 정의</dt>
        <dd>{entry.standard}</dd>
        <dt>이 게임에서는</dt>
        <dd>{entry.here}</dd>
        <dt>읽는 법</dt>
        <dd>{entry.read}</dd>
      </dl>
    </article>
  );
}

/** One sheet for the whole app: a single term from a metric label, or every term from the menu. */
export function GlossaryHost() {
  const open = useGlossary((state) => state.open);
  const hide = useGlossary((state) => state.hide);
  const show = useGlossary((state) => state.show);
  if (!open) return null;
  const single = open !== 'all' && glossaryEntry(open);
  return (
    <Dialog
      label={single ? `${single.abbr ?? single.term} 지표 설명` : '지표 사전'}
      onClose={hide}
      actions={
        <div className={s.actions}>
          {single && <button onClick={() => show('all')}>모든 지표 보기</button>}
          <button onClick={hide}>닫기</button>
        </div>
      }
    >
      {single ? (
        <Entry id={single.id} />
      ) : (
        <div className={s.all}>
          <p className={s.intro}>
            축구 데이터 매체(Opta·FBref 등)가 쓰는 정의와, 이 게임이 실제로 세는 방식을 함께
            적었어요.
          </p>
          {GLOSSARY.map((entry) => (
            <Entry key={entry.id} id={entry.id} />
          ))}
        </div>
      )}
    </Dialog>
  );
}
