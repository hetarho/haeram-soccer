import { useEffect, useMemo, useRef, useState } from 'react';
import type { PackRegistry } from '../presentation/contracts';
import { resolvePackEntry } from '../presentation/registry';
import { copyPreviewText } from './session';
import { componentSource, GROUPS, matchingStories, previewAddress, STORIES } from './catalog';

const WIDTHS = [
  ['responsive', '채우기'],
  ['390', '모바일 390'],
  ['768', '태블릿 768'],
  ['1280', '데스크톱 1280'],
] as const;
export default function Workbench({ themeRegistry }: { themeRegistry: PackRegistry<'theme'> }) {
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
          <span className="ds-brand-symbol">H</span>
          <span>
            HAERAM <b>디자인 시스템</b>
            <small>DEVELOPMENT WORKBENCH</small>
          </span>
        </a>
        <div className="ds-top-actions">
          <span className="ds-dev">DEV ONLY</span>
          <label>
            테마
            <select
              aria-label="미리보기 테마"
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            >
              {themeRegistry.entries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <a href="/" target="_blank" rel="noreferrer">
            게임 열기 ↗
          </a>
        </div>
      </header>
      <aside className="ds-sidebar">
        <label className="ds-search">
          <span>컴포넌트 검색</span>
          <input
            type="search"
            value={query}
            placeholder="이름, 화면, 파일명…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="ds-category">
          분류
          <select value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">전체 · {STORIES.length}개 미리보기</option>
            {GROUPS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <nav aria-label="컴포넌트 목록">
          {GROUPS.filter((name) => filtered.some((item) => item.group === name)).map((name) => (
            <section key={name}>
              <h2>
                {name}
                <span>{filtered.filter((item) => item.group === name).length}</span>
              </h2>
              {filtered
                .filter((item) => item.group === name)
                .map((item) => (
                  <button
                    key={item.id}
                    aria-current={current.id === item.id ? 'page' : undefined}
                    onClick={() => setSelected(item.id)}
                  >
                    {item.title}
                    <span>↗</span>
                  </button>
                ))}
            </section>
          ))}
          {!filtered.length && <p className="ds-empty">일치하는 컴포넌트가 없습니다.</p>}
        </nav>
        <p className="ds-sidebar-note">
          실제 화면 컴포넌트를 사용합니다.
          <br />
          소스를 수정하면 바로 반영됩니다.
        </p>
      </aside>
      <main className="ds-main">
        <div className="ds-heading">
          <div>
            <p>
              {current.group} <span>/ {String(index + 1).padStart(2, '0')}</span>
            </p>
            <h1>{current.title}</h1>
            <p className="ds-description">{current.description}</p>
          </div>
          <div className="ds-paging">
            <button
              aria-label="이전 미리보기"
              disabled={!index}
              onClick={() => setSelected(STORIES[index - 1].id)}
            >
              ←
            </button>
            <button
              aria-label="다음 미리보기"
              disabled={index === STORIES.length - 1}
              onClick={() => setSelected(STORIES[index + 1].id)}
            >
              →
            </button>
          </div>
        </div>
        <div className="ds-toolbar">
          <div role="group" aria-label="미리보기 화면 너비">
            {WIDTHS.map(([value, label]) => (
              <button key={value} aria-pressed={width === value} onClick={() => setWidth(value)}>
                {label}
              </button>
            ))}
          </div>
          <div>
            <button onClick={() => setReload((value) => value + 1)}>초기화 ↻</button>
            <button
              onClick={() => {
                void copyPreviewText(location.href)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? '복사됨 ✓' : '링크 복사'}
            </button>
            <a href={previewAddress(current, theme)} target="_blank" rel="noreferrer">
              독립 창 ↗
            </a>
          </div>
        </div>
        <div className="ds-canvas">
          <iframe
            key={`${current.id}-${reload}`}
            ref={frame}
            title={`${current.title} 미리보기`}
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
          <summary>사용하는 실제 컴포넌트 · {current.components.length}</summary>
          <div>
            {current.components.map((name) => (
              <button
                key={name}
                onClick={() => {
                  void copyPreviewText(`apps/web/${componentSource(name)}`).catch(() => {});
                }}
                title="소스 경로 복사"
              >
                <code>{componentSource(name)}</code>
                <span>복사</span>
              </button>
            ))}
          </div>
        </details>
        <footer className="ds-footnote">
          샘플 데이터 · 저장된 게임과 별도 · 자동 시간 진행 없음 · pnpm dev에서만 제공
        </footer>
      </main>
    </div>
  );
}
