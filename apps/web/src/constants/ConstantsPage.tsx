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
  return (
    <ol className={s.factors}>
      {factors.map((factor, index) => (
        <li key={`${factor.name}-${index}`}>
          <div className={s.factorHead}>
            <strong>{factor.name}</strong>
            {factor.control && (
              <span className={s.control} data-control={factor.control}>
                {factor.control}
              </span>
            )}
          </div>
          <p>{factor.effect}</p>
          {factor.children?.length ? <FactorTree factors={factor.children} /> : null}
        </li>
      ))}
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
  return (
    <article id={outcome.id} className={s.outcome} data-testid="influence-outcome">
      <div className={s.outcomeHead}>
        <h3>{outcome.title}</h3>
        <span className={s.decision}>{outcome.decision}</span>
      </div>
      <p className={s.summary}>{outcome.summary}</p>
      <FactorTree factors={outcome.factors} />
      {outcome.consequences.length > 0 && (
        <div className={s.consequences}>
          <b>이어서 바뀌는 것</b>
          <ul>
            {outcome.consequences.map((effect) => (
              <li key={`${effect.outcome}-${effect.effect}`}>
                {effect.effect}
                <span aria-hidden="true"> → </span>
                <a
                  href={`#${effect.outcome}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(effect.outcome);
                  }}
                >
                  {titles.get(effect.outcome)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {outcome.absent.length > 0 && (
        <aside className={s.absent}>
          <b>현재 연결되지 않는 요소</b>
          <ul>
            {outcome.absent.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </aside>
      )}
      <details className={s.evidence}>
        <summary>구현 근거 확인</summary>
        <ul>
          {outcome.sources.map((source) => (
            <li key={`${source.file}#${source.symbol}`}>
              <code>
                {source.file}:{source.line}
              </code>{' '}
              <code>{source.symbol}</code>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export function ConstantsInventory({ catalog }: { catalog: GameplayCatalog }) {
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
          <p className={s.eyebrow}>HAERAM SOCCER / GAMEPLAY RELATIONSHIPS</p>
          <h1>게임플레이 영향 요소</h1>
          <p>어떤 결과가, 무엇 때문에 달라지는지.</p>
        </div>
        <nav aria-label="도구">
          <a href="/lab">경기 실험실 ↗</a>
          <a href="/gameplay-influences.md" download="게임플레이-영향-요소.md">
            정리된 목록 내려받기 ↓
          </a>
        </nav>
      </header>
      <section className={s.stats} aria-label="정리 범위">
        <div>
          <b>{outcomes.length}</b>
          <span>플레이 결과</span>
        </div>
        <div>
          <b>{factors}</b>
          <span>영향 요소</span>
        </div>
        <div>
          <b>{catalog.groups.length}</b>
          <span>게임 영역</span>
        </div>
        <div>
          <b>{catalog.actions.length}</b>
          <span>행동과 결과 연결</span>
        </div>
      </section>
      <aside className={s.intro}>
        <p>
          <strong>결과 → 영향을 주는 요소 → 작용 방식</strong> 순서로 읽으세요. 예를 들어 재계약은
          제시 연봉·최소 수락액·계약 가능 상태를 보고, 최소 수락액은 다시 선수 능력과 시장
          연봉·에이전트·분위기의 영향을 받습니다.
        </p>
        <p>
          현재 구현을 설명합니다. <strong>확률 추첨과 조건 판정을 구분</strong>하고, 직접 선택할 수
          있는 행동과 자동 변화·현재 변경 불가 기준을 표시했습니다. 상시 투자·시설·구단 효과는
          구단주 사무실에서, 위임 판단에 쓰는 기조·지침은 결재 설정에서 바꿀 수 있습니다.
        </p>
        <p>
          밸런스 수치를 조정하는 화면이 아닙니다. 확인되지 않은 관계를 새 규칙처럼 추가하지
          않았습니다.
        </p>
      </aside>
      <details className={s.actionIndex}>
        <summary>행동부터 보기 — 내가 이걸 하면 무엇이 바뀌나?</summary>
        <ul>
          {catalog.actions.map((action) => (
            <li key={action.id}>
              <div className={s.factorHead}>
                <strong>{action.title}</strong>
                <span className={s.control} data-control={action.control}>
                  {action.control}
                </span>
              </div>
              <ul>
                {action.effects.map((effect) => (
                  <li key={`${effect.outcome}-${effect.effect}`}>
                    <span>{effect.effect} → </span>
                    <a
                      href={`#${effect.outcome}`}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(effect.outcome);
                      }}
                    >
                      {titles.get(effect.outcome)}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
      <section className={s.filters} aria-label="영향 요소 검색과 분류">
        <label>
          결과·요인·행동으로 검색
          <input
            type="search"
            placeholder="재계약, OVR, 분위기, 감독 교체, 자금 투입…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setCategory('');
          }}
        >
          필터 초기화
        </button>
        <nav className={s.categories} aria-label="게임 영역">
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
            전체 <span>{outcomes.length}</span>
          </button>
          {catalog.groups.map((group) => (
            <button
              type="button"
              key={group.id}
              aria-pressed={category === group.id}
              onClick={() => setCategory(group.id)}
            >
              {group.title} <span>{group.outcomes.length}</span>
            </button>
          ))}
        </nav>
      </section>
      <p className={s.results} role="status" aria-live="polite">
        플레이 결과 <strong>{results}개</strong>
        {query && <> · “{query}”</>}
        {!results && ' · 검색 조건을 바꿔보세요.'}
      </p>
      <div id="outcomes">
        {filtered.map((group) => (
          <section key={group.id} className={s.group} aria-labelledby={`group-${group.id}`}>
            <header>
              <p className={s.eyebrow}>GAMEPLAY / {group.id.toUpperCase()}</p>
              <h2 id={`group-${group.id}`}>{group.title}</h2>
              <p>{group.description}</p>
            </header>
            <ol className={s.outcomes}>
              {group.outcomes.map((outcome) => (
                <li key={outcome.id}>
                  <OutcomeCard outcome={outcome} titles={titles} onNavigate={navigate} />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <footer className={s.footer}>
        읽기 전용 · {catalog.files.length}개 구현 파일의 근거 위치를 연결했습니다.{' '}
        <details>
          <summary>구현 근거 파일 보기</summary>
          <ul>
            {catalog.files.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
          <small>소스 지문 {catalog.fingerprint.slice(0, 12)}</small>
        </details>
      </footer>
    </main>
  );
}

export function ConstantsPage() {
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
      <h1>게임플레이 영향 요소</h1>
      {error ? (
        <div role="alert">
          <p>목록을 불러오지 못했습니다. {error}</p>
          <button
            type="button"
            onClick={() => {
              setError('');
              setAttempt(attempt + 1);
            }}
          >
            다시 불러오기
          </button>
        </div>
      ) : (
        <p role="status">플레이 결과와 영향 요소를 불러오는 중…</p>
      )}
    </main>
  );
}
