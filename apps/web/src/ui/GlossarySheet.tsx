import { Dialog } from './Dialog';
import { GLOSSARY, glossaryEntry } from './glossaryEntries';
import { useGlossary } from './metricGlossary';
import s from './Glossary.module.css';

function Entry({ id }: { id: string }) {
  const entry = glossaryEntry(id)!;
  return (
    <article data-surface="panel" className={s.entry} data-testid={`glossary-${id}`}>
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
      {entry.table && (
        <div className={s.table}>
          <table>
            <caption>{entry.table.caption}</caption>
            <thead>
              <tr>
                {entry.table.head.map((head) => (
                  <th key={head} scope="col">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.table.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, column) => (
                    <td key={column}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

/** The glossary sheet: a single term from a metric label, or every term from the menu (→WEB-53). */
export function GlossarySheet({ open }: { open: string }) {
  const hide = useGlossary((state) => state.hide);
  const show = useGlossary((state) => state.show);
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
