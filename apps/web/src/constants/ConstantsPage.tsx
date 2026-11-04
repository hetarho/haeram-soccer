import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect, useMemo, useState } from 'react';
import {
  factorCount,
  filterInfluences,
  type Factor,
  type GameplayCatalog,
  type Outcome,
} from './catalog';
import s from './ConstantsPage.module.css';

export function FactorTree({ factors }: { factors: Factor[] }) {
  useTextLocale();
  return (
    <ol className={s.factors}>
      {localizeValue(
        factors.map((factor, index) => (
          <li key={`${localizeValue(factor.name)}-${index}`}>
            <div className={s.factorHead}>
              <strong>{localizeValue(factor.name)}</strong>
              {localizeValue(
                factor.control && (
                  <span className={s.control} data-control={factor.control}>
                    {localizeValue(factor.control)}
                  </span>
                ),
              )}
            </div>
            <p>{localizeValue(factor.effect)}</p>
            {localizeValue(
              factor.children?.length ? <FactorTree factors={factor.children} /> : null,
            )}
          </li>
        )),
      )}
    </ol>
  );
}

export function OutcomeCard({
  outcome,
  titles,
  onNavigate,
}: {
  outcome: Outcome;
  titles: ReadonlyMap<string, string>;
  onNavigate: (id: string) => void;
}) {
  useTextLocale();
  return (
    <article id={outcome.id} className={s.outcome} data-testid="influence-outcome">
      <div className={s.outcomeHead}>
        <h3>{localizeValue(outcome.title)}</h3>
        <span className={s.decision}>{localizeValue(outcome.decision)}</span>
      </div>
      <p className={s.summary}>{localizeValue(outcome.summary)}</p>
      <FactorTree factors={outcome.factors} />
      {localizeValue(
        outcome.consequences.length > 0 && (
          <div className={s.consequences}>
            <b>{richMessage('copy.ConstantsPage.aab6a09644')}</b>
            <ul>
              {localizeValue(
                outcome.consequences.map((effect) => (
                  <li key={`${effect.outcome}-${effect.effect}`}>
                    {localizeValue(effect.effect)}
                    <span aria-hidden="true"> → </span>
                    <a
                      href={`#${effect.outcome}`}
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigate(effect.outcome);
                      }}
                    >
                      {localizeValue(titles.get(effect.outcome))}
                    </a>
                  </li>
                )),
              )}
            </ul>
          </div>
        ),
      )}
      {localizeValue(
        outcome.absent.length > 0 && (
          <aside className={s.absent}>
            <b>{richMessage('copy.ConstantsPage.b7c71e8de4')}</b>
            <ul>
              {localizeValue(
                outcome.absent.map((text) => <li key={text}>{localizeValue(text)}</li>),
              )}
            </ul>
          </aside>
        ),
      )}
      <details className={s.evidence}>
        <summary>{richMessage('copy.ConstantsPage.070748b504')}</summary>
        <ul>
          {localizeValue(
            outcome.sources.map((source) => (
              <li key={`${source.file}#${source.symbol}`}>
                <code>
                  {localizeValue(source.file)}:{localizeValue(source.line)}
                </code>
                {localizeValue(' ')}
                <code>{localizeValue(source.symbol)}</code>
              </li>
            )),
          )}
        </ul>
      </details>
    </article>
  );
}

export function ConstantsInventory({ catalog }: { catalog: GameplayCatalog }) {
  useTextLocale();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [focus, setFocus] = useState<string>();
  const outcomes = useMemo(() => catalog.groups.flatMap((group) => group.outcomes), [catalog]);
  const titles = useMemo(
    () => new Map(outcomes.map((outcome) => [outcome.id, outcome.title])),
    [outcomes],
  );
  const filtered = useMemo(
    () => filterInfluences(catalog.groups, query, category, catalog.actions),
    [catalog, query, category],
  );
  const results = filtered.reduce((count, group) => count + group.outcomes.length, 0);
  const factors = useMemo(
    () => outcomes.reduce((count, outcome) => count + factorCount(outcome.factors), 0),
    [outcomes],
  );
  const navigate = (id: string) => {
    setQuery('');
    setCategory('');
    setFocus(id);
    history.replaceState(null, '', `#${id}`);
  };
  useEffect(() => {
    if (focus) {
      document.getElementById(focus)?.scrollIntoView({ block: 'start' });
      setFocus(undefined);
    }
  }, [focus, filtered]);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (titles.has(id)) setFocus(id);
  }, [titles]);
  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>{richMessage('copy.ConstantsPage.3f81234726')}</p>
          <h1>{richMessage('copy.ConstantsPage.284b64918e')}</h1>
          <p>{richMessage('copy.ConstantsPage.8c0890d891')}</p>
        </div>
        <nav aria-label={displayMessage('copy.ConstantsPage.36c416ead2')}>
          <a href="/lab">{richMessage('copy.ConstantsPage.cfb10bb564')}</a>
          <a
            href="/gameplay-influences.md"
            download={sourceMessage('copy.ConstantsPage.23328ca94a')}
          >
            {richMessage('copy.ConstantsPage.de768ab687')}
          </a>
        </nav>
      </header>
      <section className={s.stats} aria-label={displayMessage('copy.ConstantsPage.1766160658')}>
        <div>
          <b>{localizeValue(outcomes.length)}</b>
          <span>{richMessage('copy.ConstantsPage.769ff875f0')}</span>
        </div>
        <div>
          <b>{localizeValue(factors)}</b>
          <span>{richMessage('copy.ConstantsPage.d2f1f5ef5b')}</span>
        </div>
        <div>
          <b>{localizeValue(catalog.groups.length)}</b>
          <span>{richMessage('copy.ConstantsPage.20c6b91b38')}</span>
        </div>
        <div>
          <b>{localizeValue(catalog.actions.length)}</b>
          <span>{richMessage('copy.ConstantsPage.2d3772866f')}</span>
        </div>
      </section>
      <aside className={s.intro}>
        <p>
          {richMessage('copy.ConstantsPage.1fa3562e8d', {
            p0: <strong>{richMessage('copy.ConstantsPage.e46ca14592')}</strong>,
          })}
        </p>
        <p>
          {richMessage('copy.ConstantsPage.e0551567c1', {
            p0: <strong>{richMessage('copy.ConstantsPage.41d808934f')}</strong>,
          })}
        </p>
        <p>{richMessage('copy.ConstantsPage.12437af4b3')}</p>
      </aside>
      <details className={s.actionIndex}>
        <summary>{richMessage('copy.ConstantsPage.f75a0643d9')}</summary>
        <ul>
          {localizeValue(
            catalog.actions.map((action) => (
              <li key={action.id}>
                <div className={s.factorHead}>
                  <strong>{localizeValue(action.title)}</strong>
                  <span className={s.control} data-control={action.control}>
                    {localizeValue(action.control)}
                  </span>
                </div>
                <ul>
                  {localizeValue(
                    action.effects.map((effect) => (
                      <li key={`${effect.outcome}-${effect.effect}`}>
                        <span>{localizeValue(effect.effect)} → </span>
                        <a
                          href={`#${effect.outcome}`}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(effect.outcome);
                          }}
                        >
                          {localizeValue(titles.get(effect.outcome))}
                        </a>
                      </li>
                    )),
                  )}
                </ul>
              </li>
            )),
          )}
        </ul>
      </details>
      <section className={s.filters} aria-label={displayMessage('copy.ConstantsPage.cb512392b6')}>
        <label>
          {richMessage('copy.ConstantsPage.3797a21bb9', {
            p0: (
              <input
                type="search"
                placeholder={displayMessage('copy.ConstantsPage.80a49f522b')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            ),
          })}
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setCategory('');
          }}
        >
          {richMessage('copy.ConstantsPage.fa9bf25603')}
        </button>
        <nav className={s.categories} aria-label={displayMessage('copy.ConstantsPage.20c6b91b38')}>
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
            {richMessage('copy.ConstantsPage.6ef56a2e9e', {
              p0: <span>{localizeValue(outcomes.length)}</span>,
            })}
          </button>
          {localizeValue(
            catalog.groups.map((group) => (
              <button
                type="button"
                key={group.id}
                aria-pressed={category === group.id}
                onClick={() => setCategory(group.id)}
              >
                {localizeValue(group.title)} <span>{localizeValue(group.outcomes.length)}</span>
              </button>
            )),
          )}
        </nav>
      </section>
      <p className={s.results} role="status" aria-live="polite">
        {richMessage('copy.ConstantsPage.0f7a4f4e8a', {
          p0: <strong>{richMessage('copy.ConstantsPage.f62174360f', { p0: results })}</strong>,
          p1: query && <> · “{localizeValue(query)}”</>,
          p2: !results && sourceMessage('copy.ConstantsPage.40ca402cb1'),
        })}
      </p>
      <div id="outcomes">
        {localizeValue(
          filtered.map((group) => (
            <section key={group.id} className={s.group} aria-labelledby={`group-${group.id}`}>
              <header>
                <p className={s.eyebrow}>
                  {richMessage('copy.ConstantsPage.d23e534306', {
                    p0: localizeValue(group.id.toUpperCase()),
                  })}
                </p>
                <h2 id={`group-${group.id}`}>{localizeValue(group.title)}</h2>
                <p>{localizeValue(group.description)}</p>
              </header>
              <ol className={s.outcomes}>
                {localizeValue(
                  group.outcomes.map((outcome) => (
                    <li key={outcome.id}>
                      <OutcomeCard outcome={outcome} titles={titles} onNavigate={navigate} />
                    </li>
                  )),
                )}
              </ol>
            </section>
          )),
        )}
      </div>
      <footer className={s.footer}>
        {richMessage('copy.ConstantsPage.915b5018d3', {
          p0: catalog.files.length,
          p1: ' ',
          p2: (
            <details>
              <summary>{richMessage('copy.ConstantsPage.81fc4e8cd1')}</summary>
              <ul>
                {localizeValue(
                  catalog.files.map((file) => (
                    <li key={file}>
                      <code>{localizeValue(file)}</code>
                    </li>
                  )),
                )}
              </ul>
              <small>
                {richMessage('copy.ConstantsPage.ab4270fdb2', {
                  p0: catalog.fingerprint.slice(0, 12),
                })}
              </small>
            </details>
          ),
        })}
      </footer>
    </main>
  );
}

export function ConstantsPage() {
  useTextLocale();
  const [catalog, setCatalog] = useState<GameplayCatalog>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/gameplay-influences.json', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as GameplayCatalog;
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => controller.abort();
  }, [attempt]);
  if (catalog) return <ConstantsInventory catalog={catalog} />;
  return (
    <main className={s.page}>
      <h1>{richMessage('copy.ConstantsPage.284b64918e')}</h1>
      {localizeValue(
        error ? (
          <div role="alert">
            <p>{richMessage('copy.ConstantsPage.2be3d190c0', { p0: error })}</p>
            <button
              type="button"
              onClick={() => {
                setError('');
                setAttempt(attempt + 1);
              }}
            >
              {richMessage('copy.ConstantsPage.9cee01b433')}
            </button>
          </div>
        ) : (
          <p role="status">{richMessage('copy.ConstantsPage.8f12f727ae')}</p>
        ),
      )}
    </main>
  );
}
