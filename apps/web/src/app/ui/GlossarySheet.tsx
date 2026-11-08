import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import { Dialog } from '../../shared/ui/Dialog';
import { GLOSSARY, glossaryEntry } from '../../shared/ui/glossaryEntries';
import { useGlossary } from '../../shared/ui/metricGlossary';
import s from '../../shared/ui/styles/Glossary.module.css';

function Entry({ id }: { id: string }) {
  useTextLocale();
  const entry = glossaryEntry(id)!;
  return (
    <article data-surface="panel" className={s.entry} data-testid={`glossary-${id}`}>
      <h3>
        {localizeValue(entry.term)}
        {localizeValue(entry.abbr && <small>{localizeValue(entry.abbr)}</small>)}
      </h3>
      <dl>
        <dt>{richMessage('copy.GlossarySheet.1896eeaf52')}</dt>
        <dd>{localizeValue(entry.standard)}</dd>
        <dt>{richMessage('copy.GlossarySheet.72ff58c7c6')}</dt>
        <dd>{localizeValue(entry.here)}</dd>
        <dt>{richMessage('copy.GlossarySheet.63b8ead1c4')}</dt>
        <dd>{localizeValue(entry.read)}</dd>
      </dl>
      {localizeValue(
        entry.table && (
          <div className={s.table}>
            <table>
              <caption>{localizeValue(entry.table.caption)}</caption>
              <thead>
                <tr>
                  {localizeValue(
                    entry.table.head.map((head) => (
                      <th key={head} scope="col">
                        {localizeValue(head)}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {localizeValue(
                  entry.table.rows.map((row, index) => (
                    <tr key={index}>
                      {localizeValue(
                        row.map((cell, column) => <td key={column}>{localizeValue(cell)}</td>),
                      )}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ),
      )}
    </article>
  );
}

/** The glossary sheet: a single term from a metric label, or every term from the menu (→WEB-53). */
export function GlossarySheet({ open }: { open: string }) {
  useTextLocale();
  const hide = useGlossary((state) => state.hide);
  const show = useGlossary((state) => state.show);
  const single = open !== 'all' && glossaryEntry(open);
  return (
    <Dialog
      label={localizeValue(
        single
          ? sourceMessage('copy.GlossarySheet.b03b190a00', { p0: single.abbr ?? single.term })
          : sourceMessage('shell.glossary'),
      )}
      onClose={hide}
      actions={
        <div className={s.actions}>
          {localizeValue(
            single && (
              <button onClick={() => show('all')}>
                {richMessage('copy.GlossarySheet.38e5fc7535')}
              </button>
            ),
          )}
          <button onClick={hide}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
        </div>
      }
    >
      {localizeValue(
        single ? (
          <Entry id={single.id} />
        ) : (
          <div className={s.all}>
            <p className={s.intro}>{richMessage('copy.GlossarySheet.2360b8a292')}</p>
            {localizeValue(GLOSSARY.map((entry) => <Entry key={entry.id} id={entry.id} />))}
          </div>
        ),
      )}
    </Dialog>
  );
}
