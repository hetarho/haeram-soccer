import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PackRegistry } from '../presentation/contracts';
import { resolvePackEntry } from '../presentation/registry';
import { copyPreviewText } from './session';
import { componentSource, GROUPS, matchingStories, previewAddress, STORIES } from './catalog';

const WIDTHS = [
  ['responsive', sourceMessage('copy.Workbench.5d3513ae38')],
  ['390', sourceMessage('copy.Workbench.a9e22cfe35')],
  ['768', sourceMessage('copy.Workbench.b0de8dab07')],
  ['1280', sourceMessage('copy.Workbench.c76b72ec68')],
] as const;
export default function Workbench({ themeRegistry }: { themeRegistry: PackRegistry<'theme'> }) {
  useTextLocale();
  const params = new URLSearchParams(location.search);
  const [theme, setTheme] = useState(() => resolvePackEntry(themeRegistry, params.get('theme')).id);
  const [selected, setSelected] = useState(params.get('story') ?? STORIES[0].id);
  const [group, setGroup] = useState('');
  const [query, setQuery] = useState('');
  const [width, setWidth] = useState(params.get('width') ?? 'responsive');
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const current = STORIES.find((item) => item.id === selected) ?? STORIES[0];
  const filtered = matchingStories(query, group);
  const index = STORIES.indexOf(current);
  const themeRef = useRef(theme);
  // Changing theme preserves the mounted story, including drafts, dialogs and scroll position.
  useEffect(() => {
    themeRef.current = theme;
    frame.current?.contentWindow?.postMessage(
      { type: 'design-system-theme', theme },
      location.origin,
    );
  }, [theme]);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('story', current.id);
    url.searchParams.set('theme', theme);
    url.searchParams.set('width', width);
    history.replaceState(null, '', url);
  }, [current.id, theme, width]);
  const frameUrl = useMemo(() => previewAddress(current, themeRef.current), [current, reload]);
  return (
    <div className="ds-workbench">
      <header className="ds-topbar">
        <a className="ds-brand" href="/design-system">
          <span className="ds-brand-symbol">{richMessage('copy.Workbench.44bd7ae60f')}</span>
          <span>
            {richMessage('copy.Workbench.35a9400a94', {
              p0: <b>{richMessage('copy.Workbench.5f94edae56')}</b>,
              p1: <small>{richMessage('copy.Workbench.5121b3762f')}</small>,
            })}
          </span>
        </a>
        <div className="ds-top-actions">
          <span className="ds-dev">{richMessage('copy.Workbench.1db19df944')}</span>
          <label>
            {richMessage('copy.Workbench.50c3741cf4', {
              p0: (
                <select
                  aria-label={displayMessage('copy.Workbench.8bdb80945e')}
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  {localizeValue(
                    themeRegistry.entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {localizeValue(entry.label)}
                      </option>
                    )),
                  )}
                </select>
              ),
            })}
          </label>
          <a href="/" target="_blank" rel="noreferrer">
            {richMessage('copy.Workbench.47ffd0da00')}
          </a>
        </div>
      </header>
      <aside className="ds-sidebar">
        <label className="ds-search">
          <span>{richMessage('copy.Workbench.a16cab5083')}</span>
          <input
            type="search"
            value={query}
            placeholder={displayMessage('copy.Workbench.02848125fa')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="ds-category">
          {richMessage('copy.Workbench.35e64f9ea2', {
            p0: (
              <select value={group} onChange={(event) => setGroup(event.target.value)}>
                <option value="">
                  {richMessage('copy.Workbench.71d0b398b0', { p0: STORIES.length })}
                </option>
                {localizeValue(
                  GROUPS.map((name) => <option key={name}>{localizeValue(name)}</option>),
                )}
              </select>
            ),
          })}
        </label>
        <nav aria-label={displayMessage('copy.Workbench.ad2f080bc9')}>
          {localizeValue(
            GROUPS.filter((name) => filtered.some((item) => item.group === name)).map((name) => (
              <section key={name}>
                <h2>
                  {localizeValue(name)}
                  <span>
                    {localizeValue(filtered.filter((item) => item.group === name).length)}
                  </span>
                </h2>
                {localizeValue(
                  filtered
                    .filter((item) => item.group === name)
                    .map((item) => (
                      <button
                        key={item.id}
                        aria-current={current.id === item.id ? 'page' : undefined}
                        onClick={() => setSelected(item.id)}
                      >
                        {localizeValue(item.title)}
                        <span>↗</span>
                      </button>
                    )),
                )}
              </section>
            )),
          )}
          {localizeValue(
            !filtered.length && (
              <p className="ds-empty">{richMessage('copy.Workbench.473a59b238')}</p>
            ),
          )}
        </nav>
        <p className="ds-sidebar-note">
          {richMessage('copy.Workbench.95a86bbfef', { p0: <br /> })}
        </p>
      </aside>
      <main className="ds-main">
        <div className="ds-heading">
          <div>
            <p>
              {localizeValue(current.group)}{' '}
              <span>/ {localizeValue(String(index + 1).padStart(2, '0'))}</span>
            </p>
            <h1>{localizeValue(current.title)}</h1>
            <p className="ds-description">{localizeValue(current.description)}</p>
          </div>
          <div className="ds-paging">
            <button
              aria-label={displayMessage('copy.Workbench.bdac14e188')}
              disabled={!index}
              onClick={() => setSelected(STORIES[index - 1].id)}
            >
              ←
            </button>
            <button
              aria-label={displayMessage('copy.Workbench.78c3ced4f9')}
              disabled={index === STORIES.length - 1}
              onClick={() => setSelected(STORIES[index + 1].id)}
            >
              →
            </button>
          </div>
        </div>
        <div className="ds-toolbar">
          <div role="group" aria-label={displayMessage('copy.Workbench.04e5831e94')}>
            {localizeValue(
              WIDTHS.map(([value, label]) => (
                <button key={value} aria-pressed={width === value} onClick={() => setWidth(value)}>
                  {localizeValue(label)}
                </button>
              )),
            )}
          </div>
          <div>
            <button onClick={() => setReload((value) => value + 1)}>
              {richMessage('copy.Workbench.5df17fc444')}
            </button>
            <button
              onClick={() => {
                void copyPreviewText(location.href)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {localizeValue(
                copied
                  ? sourceMessage('copy.Workbench.215a44ed74')
                  : sourceMessage('copy.Workbench.d6ceeabf7e'),
              )}
            </button>
            <a href={previewAddress(current, theme)} target="_blank" rel="noreferrer">
              {richMessage('copy.Workbench.a15543a831')}
            </a>
          </div>
        </div>
        <div className="ds-canvas">
          <iframe
            key={`${current.id}-${reload}`}
            ref={frame}
            title={displayMessage('copy.Workbench.3cccf7e442', { p0: current.title })}
            src={frameUrl}
            style={{ width: width === 'responsive' ? '100%' : `${width}px` }}
            onLoad={() =>
              frame.current?.contentWindow?.postMessage(
                { type: 'design-system-theme', theme },
                location.origin,
              )
            }
          />
        </div>
        <details className="ds-source" open>
          <summary>
            {richMessage('copy.Workbench.99323ca799', { p0: current.components.length })}
          </summary>
          <div>
            {localizeValue(
              current.components.map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    void copyPreviewText(`apps/web/${componentSource(name)}`).catch(() => {});
                  }}
                  title={displayMessage('copy.Workbench.730c331895')}
                >
                  <code>{localizeValue(componentSource(name))}</code>
                  <span>{richMessage('copy.Workbench.37b3d3b11b')}</span>
                </button>
              )),
            )}
          </div>
        </details>
        <footer className="ds-footnote">{richMessage('copy.Workbench.6d08b1f1cb')}</footer>
      </main>
    </div>
  );
}
