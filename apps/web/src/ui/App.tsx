import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { CountryCode, World } from '../../../../packages/contracts/src/types';
import {
  COUNTRIES,
  country,
  priceIndex,
  NORMALIZATION,
} from '../../../../packages/catalogs/src/index';
import { GameClient, type ClientState } from '../runtime/client';
import { useNavigation, type Page } from './state';
import { money, number, percent, seasonName, kindLabel } from './format';
import { Chart } from './Chart';
import { Pitch } from './Pitch';
import s from './App.module.css';
export function Crest({ color = '#b4c399' }: { color?: string }) {
  return (
    <svg className={s.crest} viewBox="0 0 60 72" aria-hidden="true">
      <path
        d="M4 4H56V40C56 54 40 64 30 69C20 64 4 54 4 40Z"
        fill={color}
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M12 12H48V39C48 49 38 56 30 61C22 56 12 49 12 39Z" fill="none" stroke="#ffffdf88" />
      <circle cx="30" cy="34" r="11" fill="none" stroke="#ffffdf" />
      <path
        d="m30 24 6 5-2 8h-8l-2-8Zm-6 5-5 1m15 7 5 5m-13-5-5 5m9-18v-5"
        fill="none"
        stroke="#ffffdf"
      />
    </svg>
  );
}
export function Panel({
  title,
  note,
  children,
  footer,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={s.panel}>
      <div className={s.panelHead}>
        <h3>{title}</h3>
        {note && <span>{note}</span>}
      </div>
      {children}
      {footer && <div className={s.panelFoot}>{footer}</div>}
    </section>
  );
}
export function Table({ w, ids, limit }: { w: World; ids: string[]; limit?: number }) {
  const sorted = [...ids].sort((a, b) => {
    const x = w.tables[a],
      y = w.tables[b];
    return y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || (a < b ? -1 : 1);
  });
  return (
    <div className={s.tableWrap}>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>클럽</th>
            <th>경기</th>
            <th>승</th>
            <th>무</th>
            <th>패</th>
            <th>득실</th>
            <th>승점</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((id, i) => {
            if (limit && i >= limit && id !== w.playerClub) return null;
            const c = w.clubs.find((c) => c.id === id)!,
              t = w.tables[id];
            return (
              <tr key={id} className={id === w.playerClub ? s.own : undefined}>
                <td>{i + 1}</td>
                <td>
                  {c.name}
                  {id === w.playerClub ? ' ◈' : ''}
                </td>
                <td>{t.played}</td>
                <td>{t.won}</td>
                <td>{t.drawn}</td>
                <td>{t.lost}</td>
                <td>
                  {t.gf - t.ga > 0 ? '+' : ''}
                  {t.gf - t.ga}
                </td>
                <td>{t.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Founding({ client, state }: { client: GameClient; state: ClientState }) {
  const [code, setCode] = useState<CountryCode>('ENG'),
    [name, setName] = useState('Haeram Athletic'),
    [color, setColor] = useState('#bf7956'),
    [seed, setSeed] = useState(() => crypto.randomUUID().slice(0, 18)),
    [difficulty, setDifficulty] = useState(1);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void client.found({ country: code, name, color, seed, difficulty });
  };
  return (
    <div className={s.founding}>
      <div className={s.intro}>
        <div>
          <p className={s.eyebrow}>YOUR CLUB. YOUR CENTURY.</p>
          <h2>
            작은 운동장에서,
            <br />한 세기의 역사로.
          </h2>
          <p>
            1901년, 이름 없는 클럽의 시작.
            <br />
            경기를 지켜보고, 숫자에서 가능성을 찾고,
            <br />
            사람과 동네와 함께 성장하세요.
          </p>
          <span className={s.pill}>캐주얼 클럽 경영 · 로컬 무료 플레이</span>
        </div>
        <div className={s.introArt}>
          <svg viewBox="0 0 400 300" aria-hidden="true">
            <path d="M20 230 200 120 380 230 200 295Z" fill="#346345" />
            <path d="M40 230 200 134 360 230 200 280Z" fill="none" stroke="#d9e0c3" />
            <path
              d="M120 182 280 277 M160 158 320 254 M80 206 240 277"
              stroke="#497553"
              strokeWidth="22"
              opacity=".35"
            />
            <path d="m120 182 160 95" fill="none" stroke="#e4e5c7" />
            <ellipse cx="200" cy="230" rx="32" ry="17" stroke="#e0e5c5" fill="none" />
            <path
              d="m50 224 34 20 36-22-34-20zm230 0 34 20 36-22-34-20z"
              fill="none"
              stroke="#e0e5c5"
            />
            <path
              d="M72 187v-35l36 20v35m-36-55v-18l36 20v18M293 217v-35l36-20v35m-36-15v-18l36-20v18"
              fill="none"
              stroke="#375d43"
              strokeWidth="3"
            />
            <circle cx="163" cy="219" r="5" fill="#f3dfb2" />
            <circle cx="249" cy="236" r="5" fill="#bd7857" />
            <circle cx="218" cy="211" r="5" fill="#bd7857" />
            <circle cx="210" cy="226" r="3" fill="#fff" />
            <path
              d="M45 145V55h4v90m-4-90 45 14-45 14M349 164V45h4v119m-4-119 38 14-38 14"
              stroke="#657957"
              fill="#ba8460"
              strokeWidth="2"
            />
          </svg>
          <span className={s.artLabel}>EST. 1901 — THE FIRST PAGE</span>
        </div>
      </div>
      <form className={s.form} onSubmit={submit}>
        <Panel title="01. 우리 이야기가 시작될 나라" note="8 EUROPEAN ASSOCIATIONS">
          <div className={s.panelBody}>
            <p className={s.muted}>
              1900년대의 분위기, 현대 프로 리그 구조. 클럽과 선수는 새롭게 생성됩니다.
            </p>
            <div className={s.countryGrid}>
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`${s.countryCard} ${code === c.code ? s.selected : ''}`}
                  aria-pressed={code === c.code}
                  onClick={() => setCode(c.code)}
                >
                  <span className={s.countryCode}>{c.code}</span>
                  <b>{c.name}</b>
                  <small>
                    {c.groups.length}개 디비전 · {c.groups.flat().reduce((a, b) => a + b, 0)}개 클럽
                  </small>
                </button>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="02. 이름과 색, 그리고 첫 자금">
          <div className={s.panelBody}>
            <div className={s.formGrid}>
              <label>
                클럽 이름
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                클럽 색상
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <label>
                세계 생성 시드
                <input maxLength={80} value={seed} onChange={(e) => setSeed(e.target.value)} />
              </label>
              <div className={s.muted}>
                같은 시드는 같은 클럽·선수·경기를 만듭니다.
                <br />
                선택한 나라의 최하위 프로 리그에서 출발합니다.
              </div>
            </div>
            <div className={s.difficulty}>
              {[
                [2, '넉넉한 출발', '연간 기본 운영비의 2배'],
                [1, '표준 출발', '연간 기본 운영비의 1배'],
                [0.5, '작은 출발', '연간 기본 운영비의 0.5배'],
              ].map(([v, t, d]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={difficulty === v}
                  className={difficulty === v ? s.selected : undefined}
                  onClick={() => setDifficulty(Number(v))}
                >
                  <b>{t}</b>
                  <small>{d}</small>
                </button>
              ))}
            </div>
            <p className={s.muted} style={{ marginTop: 14 }}>
              난이도는 초기 자본금만 바꿉니다. 선수·상대·행운은 그대로입니다.
            </p>
          </div>
        </Panel>
        <div className={s.formFooter}>
          <div>
            <b>
              {country(code).name} · {country(code).groups.length}부에서 창단
            </b>
            <p>계정 없이 이 브라우저에 저장됩니다. 나중에 파일로 내보낼 수 있습니다.</p>
          </div>
          <button
            className={s.primary}
            disabled={state.busy || state.readonly || !!state.error}
            type="submit"
          >
            {state.busy ? '세계관을 만드는 중…' : '클럽 창단 →'}
          </button>
        </div>
      </form>
    </div>
  );
}
function Dashboard({ state, client }: { state: ClientState; client: GameClient }) {
  const { setPage } = useNavigation();
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    t = w.tables[c.id],
    next = w.fixtures.find((f) => !f.score && f.round > w.round),
    home = w.clubs.find((c) => c.id === next?.home),
    away = w.clubs.find((c) => c.id === next?.away);
  const members = w.lower
    ? w.clubs.filter((cl) => w.fixtures.some((f) => f.home === cl.id || f.away === cl.id))
    : w.clubs.filter(
        (cl) =>
          cl.country === c.country &&
          cl.tier === c.tier &&
          cl.group === c.group &&
          !cl.representative,
      );
  const last = w.ownMatches.slice(-5);
  const winRate = percent(t.won, t.played);
  const watch = async () => {
    const result = await client.command({
      type: 'advance',
      rounds: Math.max(1, (next?.round || w.round + 1) - w.round),
    });
    if (result?.playback) setPage('match');
  };
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>
            THE CLUB JOURNAL · VOL. {String(w.year - 1900).padStart(3, '0')}
          </div>
          <h2>
            오늘의 경기,
            <br />
            내일의 역사.
          </h2>
          <p>
            {c.name} ·{' '}
            {w.lower ? '프로 복귀를 준비하는 계절' : `${c.tier + 1}부에서 쓰는 우리 이야기`}
          </p>
        </div>
        <div className={s.heroActions}>
          <button
            disabled={state.busy || state.readonly}
            onClick={() => void client.command({ type: 'advance', rounds: 1 })}
          >
            다음 라운드
          </button>
          <button
            className={s.primary}
            disabled={state.busy || state.readonly}
            onClick={() => void client.command({ type: 'season', count: 1 })}
          >
            시즌 마무리 ↗
          </button>
        </div>
      </div>
      <div className={s.stats}>
        {[
          [
            '운영 자금',
            money(w.cash, c.country, w.year),
            `연간 운영비 ${money(v.annualCost, c.country, w.year)}`,
          ],
          ['우리의 서포터', number(c.fans), '경기·마케팅 결과에 따라 변화'],
          ['이번 시즌', `${t.points} pts`, `${t.played}경기 · ${t.won}승 ${t.drawn}무 ${t.lost}패`],
          [
            '쌓아온 기록',
            `${number(v.totalMatches)} matches`,
            `${w.history.length}개 시즌 · 승률 ${winRate}`,
          ],
        ].map(([label, value, note]) => (
          <div className={s.stat} key={label}>
            <div className={s.label}>{label}</div>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <div className={s.grid}>
        <div className={s.stack}>
          <Panel
            title="다음 경기"
            note={next ? `ROUND ${next.round} · ${kindLabel[next.kind]}` : 'END OF SEASON'}
          >
            <div className={s.fixture}>
              <small>
                {seasonName(w.year)} · {country(c.country).name} · {c.tier + 1}부
              </small>
              <div className={s.fixtureTeams}>
                <div>
                  <Crest color={home?.color} />
                  {home?.name || '시즌의 마지막 페이지'}
                </div>
                <b>vs</b>
                <div>
                  <Crest color={away?.color} />
                  {away?.name || '다음 시즌을 기다립니다'}
                </div>
              </div>
              <button
                className={s.coral}
                disabled={state.busy || state.readonly}
                onClick={() => void watch()}
              >
                {next ? '다음 경기 관전' : '다음 시즌 시작'} ▷
              </button>
            </div>
            <div className={s.panelFoot}>
              최근 경기{' '}
              {last.length
                ? last.map((m) => {
                    const a = m.home === w.playerClub ? m.score.home : m.score.away,
                      b = m.home === w.playerClub ? m.score.away : m.score.home;
                    return (
                      <span key={m.id} className={s.pill} style={{ marginRight: 6 }}>
                        {a > b ? 'W' : a === b ? 'D' : 'L'} {a}–{b}
                      </span>
                    );
                  })
                : '아직 첫 휘슬이 울리지 않았습니다.'}
            </div>
          </Panel>
          <Panel title="우리의 성장 곡선" note="SUPPORTERS OVER TIME">
            <div className={s.panelBody}>
              <Chart
                label="시즌별 서포터"
                values={w.history.map((h) => h.fans)}
                labels={w.history.map((h) => String(h.year))}
              />
            </div>
          </Panel>
          <Panel
            title="리그의 지금"
            note={`${c.tier + 1}부 · ${members.length} CLUBS`}
            footer={<button onClick={() => setPage('league')}>전체 리그 보기 →</button>}
          >
            <Table w={w} ids={members.map((c) => c.id)} limit={6} />
          </Panel>
        </div>
        <div className={s.stack}>
          <Panel title="클럽의 작은 소식" note="THE NOTICEBOARD">
            <div className={s.panelBody}>
              <ul className={s.timeline}>
                {w.events
                  .slice(-7)
                  .reverse()
                  .map((e, i) => (
                    <li key={i}>
                      <small>
                        {e.year} · ROUND {e.round}
                      </small>
                      <h3>{e.title}</h3>
                      <p>{e.detail}</p>
                    </li>
                  ))}
              </ul>
            </div>
          </Panel>
          <Panel title="숫자로 보는 이번 시즌" note="ON THE PITCH">
            <div className={s.panelBody}>
              <div className={s.attribute}>
                <span>득점 / 실점</span>
                <b>
                  {t.gf} / {t.ga}
                </b>
              </div>
              <div className={s.attribute}>
                <span>클럽 평판</span>
                <b>{number(c.reputation)} / 100</b>
              </div>
              <div className={s.attribute}>
                <span>감독과의 신뢰</span>
                <b>{number(w.manager.trust)} / 100</b>
              </div>
              <div className={s.attribute}>
                <span>연간 손익</span>
                <b>{money((BigInt(w.income) - BigInt(w.expense)).toString(), c.country, w.year)}</b>
              </div>
            </div>
            <div className={s.panelFoot}>지표를 비교하고, 다음 선택을 바꿔보세요.</div>
          </Panel>
        </div>
      </div>
    </>
  );
}
function League({ w }: { w: World }) {
  const own = w.clubs.find((c) => c.id === w.playerClub)!;
  const [code, setCode] = useState(own.country),
    [tier, setTier] = useState(Math.min(own.tier, country(own.country).groups.length - 1)),
    [group, setGroup] = useState(own.group);
  const cp = country(code),
    ids = w.clubs
      .filter(
        (c) => c.country === code && c.tier === tier && c.group === group && !c.representative,
      )
      .map((c) => c.id);
  return (
    <>
      <div className={s.hero}>
        <div>
          <p className={s.eyebrow}>THE DOMESTIC PYRAMID</p>
          <h2>
            한 계단씩,
            <br />더 큰 무대로.
          </h2>
          <p>승점과 골득실, 그리고 승격의 기회.</p>
        </div>
      </div>
      <div className={s.filters}>
        <label>
          국가{' '}
          <select
            aria-label="국가"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setTier(0);
              setGroup(0);
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          디비전{' '}
          <select
            value={tier}
            onChange={(e) => {
              setTier(Number(e.target.value));
              setGroup(0);
            }}
          >
            {cp.groups.map((_, i) => (
              <option key={i} value={i}>
                {i + 1}부
              </option>
            ))}
          </select>
        </label>
        {cp.groups[tier].length > 1 && (
          <label>
            지역 그룹{' '}
            <select value={group} onChange={(e) => setGroup(Number(e.target.value))}>
              {cp.groups[tier].map((_, i) => (
                <option key={i} value={i}>
                  {String.fromCharCode(65 + i)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <Panel
        title={`${cp.name} · ${tier + 1}부`}
        note={seasonName(w.year)}
        footer={`${cp.moves[tier - 1] || 0}개 승격 자리 · 자동 승격과 플레이오프를 실제 경기로 결정합니다. 참고 구조: ${cp.reference}`}
      >
        <Table w={w} ids={ids} />
      </Panel>
      <p className={s.muted} style={{ marginTop: 18 }}>
        {NORMALIZATION}
      </p>
      {w.lower && code === own.country && (
        <Panel title="우리의 복귀 도전">
          <Table w={w} ids={[...new Set(w.fixtures.flatMap((f) => [f.home, f.away]))]} />
        </Panel>
      )}
    </>
  );
}
function Europe({ w }: { w: World }) {
  const [key, setKey] = useState('ucl');
  const t = w.europe.find((t) => t.key === key);
  const cards = [
    ['ucl', 1955, 'European Cup / Champions League', '1955/56 시작 · 1992/93 챔피언스리그'],
    ['uel', 1971, 'UEFA Cup / Europa League', '1971/72 시작 · 2009/10 유로파리그'],
    ['uecl', 2021, 'Conference League', '2021/22 시작 · 2024/25 명칭 변경'],
  ] as const;
  return (
    <>
      <div className={s.hero}>
        <div>
          <div className={s.eyebrow}>BEYOND THE BORDER</div>
          <h2>유럽이 부르는 날.</h2>
          <p>대회는 실제 역사의 시기에 시작됩니다. 우승의 역사는 우리가 만듭니다.</p>
        </div>
        <span className={s.pill}>
          5년간 구단 경기 계수 ·{' '}
          {w.ownMatches.filter((m) => m.kind === 'europe' && m.year >= w.year - 5).length}개 최근
          기록
        </span>
      </div>
      <div className={s.competitionGrid}>
        {cards.map(([id, year, title, note]) => (
          <section
            key={id}
            className={`${s.panel} ${s.competition} ${w.year < year ? s.locked : ''}`}
          >
            <div className={s.symbol}>{w.year < year ? '◷' : '♜'}</div>
            <h3>{w.europe.find((t) => t.key === id)?.name || title}</h3>
            <p>{note}</p>
            <p>
              {w.year < year
                ? `${year - w.year}년 후 창설 예정`
                : `${w.europe.find((t) => t.key === id)?.field}팀 · ${w.europe.find((t) => t.key === id)?.format} 단계`}
            </p>
            <button style={{ marginTop: 20 }} disabled={w.year < year} onClick={() => setKey(id)}>
              {w.year < year ? '아직 창설되지 않은 대회' : '대회 보기 →'}
            </button>
          </section>
        ))}
      </div>
      {t && (
        <>
          <div className={s.filters}>
            {w.europe.map((t) => (
              <button
                key={t.key}
                onClick={() => setKey(t.key)}
                className={t.key === key ? s.selected : undefined}
              >
                {t.name}
              </button>
            ))}
          </div>
          <Panel
            title={t.name}
            note={`${t.field} CLUBS · ${t.stage}`}
            footer={
              t.clubs.includes(w.playerClub)
                ? `우리 클럽 참가 · ${t.ownExit || '지난 시즌 리그/컵 성적에 따른 자격'}`
                : '우리 클럽은 참가하지 않습니다. 리그 성적과 국내 컵 우승으로 도전하세요.'
            }
          >
            <Table w={{ ...w, tables: t.standings }} ids={t.clubs} />
            {t.fixtures.length > 0 && (
              <div className={s.panelBody}>
                {t.fixtures
                  .filter((f) => f.home === w.playerClub || f.away === w.playerClub)
                  .map((f) => (
                    <p key={f.id} className={s.muted}>
                      {w.clubs.find((c) => c.id === f.home)?.name}{' '}
                      {f.score ? `${f.score.home}–${f.score.away}` : '예정'}{' '}
                      {w.clubs.find((c) => c.id === f.away)?.name}
                    </p>
                  ))}
              </div>
            )}
          </Panel>
        </>
      )}
      <p className={s.muted}>
        국가별 참가권, 시드와 추첨은 데모에 맞게 단순화했습니다. 2024/25부터 36팀 리그 페이즈와
        8·8·6경기, 상위 8팀 직행과 9–24위 플레이오프를 적용합니다. 컵위너스컵은 1960–1998 시즌
        운영됩니다.
      </p>
    </>
  );
}
const NAV: [Page, string, string][] = [
  ['dashboard', '◈', '클럽 일지'],
  ['match', '◉', '경기 관전'],
  ['league', '≡', '리그'],
  ['europe', '☆', '유럽 무대'],
];
export function App() {
  const [state, setState] = useState<ClientState>(),
    [client, setClient] = useState<GameClient>(),
    [localError, setLocalError] = useState('');
  const { page, setPage } = useNavigation();
  useEffect(() => {
    try {
      const c = new GameClient(setState);
      setClient(c);
      void c.start();
      return () => c.dispose();
    } catch (error) {
      setLocalError(String(error));
    }
  }, []);
  const v = state?.view,
    w = v?.world,
    own = w?.clubs.find((c) => c.id === w.playerClub);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, w?.id]);
  const download = async () => {
    const raw = await client?.exportFile();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `haeram-${w?.year || 'backup'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setLocalError('파일 크기는 4 MiB 이하이어야 합니다.');
      return;
    }
    setLocalError('');
    await client?.importFile(await file.text());
  };
  return (
    <div className={s.layout}>
      <aside className={s.sidebar}>
        <div className={s.brand}>
          <Crest />
          <h1>
            Haeram
            <br />
            Football Archives
          </h1>
          <span>A CLUB. A CENTURY.</span>
        </div>
        {own && (
          <div className={s.clubBadge}>
            <Crest color={own.color} />
            <div>
              <b>{own.name}</b>
              <small>EST. 1901 · {country(own.country).name}</small>
            </div>
          </div>
        )}
        <nav className={s.nav} aria-label="게임 메뉴">
          {NAV.map(([id, icon, label]) => (
            <button
              key={id}
              disabled={!w}
              aria-current={page === id ? 'page' : undefined}
              className={page === id ? s.active : undefined}
              onClick={() => setPage(id)}
            >
              <span className={s.navIcon} aria-hidden="true">
                {icon}
              </span>
              {label}
            </button>
          ))}
        </nav>
        <div className={s.sideFoot}>
          기록은 이 브라우저에 저장됩니다.
          <br />
          파일로 당신의 역사를 보관하세요.
          <button disabled={!w || state?.busy} onClick={() => void download()}>
            기록 내보내기 ↓
          </button>
          <label className={s.fileButton}>
            기록 가져오기
            <input
              className={s.fileInput}
              type="file"
              accept="application/json,.json"
              disabled={state?.busy || state?.readonly}
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </aside>
      <main className={s.main}>
        <div className={s.topbar}>
          <span>FOOTBALL ARCHIVES / {NAV.find((n) => n[0] === page)?.[2] || 'THE FIRST PAGE'}</span>
          <div className={s.topRight}>
            <span className={s.tag}>WEB DEMO · LOCAL</span>
            <span data-testid="calendar">
              {w ? `시즌 ${w.year} · 라운드 ${w.round}` : '1901 · A NEW BEGINNING'}
            </span>
          </div>
        </div>
        {(state?.error || localError) && (
          <div className={s.error} role="alert">
            {state?.error || localError}{' '}
            <button onClick={() => location.reload()}>저장 다시 불러오기</button>
          </div>
        )}
        {state?.notice && (
          <div className={s.notice} role="status">
            {state.notice}
          </div>
        )}
        {w?.critical && (
          <div className={s.critical} role="status">
            {w.critical}
            <button
              disabled={state?.busy || state?.readonly}
              onClick={() => void client?.acknowledge()}
            >
              알림 확인 후 계속
            </button>
          </div>
        )}
        {state?.busy && (
          <>
            <div
              className={s.progress}
              role="progressbar"
              aria-label="세계 처리 진행"
              aria-valuenow={Math.round(state.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${Math.max(5, state.progress * 100)}%` }} />
            </div>
            {w && <button onClick={() => client?.cancel()}>진행 중단</button>}
          </>
        )}
        {client && state ? (
          !w ? (
            <Founding client={client} state={state} />
          ) : page === 'dashboard' ? (
            <Dashboard client={client} state={state} />
          ) : page === 'match' ? (
            <>
              <div className={s.hero}>
                <div>
                  <div className={s.eyebrow}>WATCH THE NUMBERS MOVE</div>
                  <h2>90분의 작은 드라마.</h2>
                  <p>점유율과 패스, 슈팅에서 우리 팀의 변화를 찾아보세요.</p>
                </div>
                <button
                  disabled={state.busy || state.readonly}
                  className={s.primary}
                  onClick={() => void client.command({ type: 'advance', rounds: 1 })}
                >
                  다음 라운드
                </button>
              </div>
              <Panel
                title="경기 관전"
                note={
                  state.playback ? seasonName(state.playback.record.year) : '첫 경기를 기다립니다'
                }
              >
                <Pitch playback={state.playback} world={w} />
              </Panel>
            </>
          ) : page === 'league' ? (
            <League w={w} />
          ) : page === 'europe' ? (
            <Europe w={w} />
          ) : null
        ) : (
          <div className={s.loading}>기록 보관함을 여는 중…</div>
        )}
        <footer className={s.footer}>
          <span>HAERAM FOOTBALL ARCHIVES © · 가상의 클럽, 당신의 역사.</span>
          <span data-testid="save-status">
            {w
              ? state!.savedRevision === w.revision
                ? `저장 완료 · r${w.revision}`
                : `저장 대기 · r${w.revision}`
              : '로그인 없이 시작하세요'}
            {w &&
              ` · 물가 ${priceIndex(own!.country, w.year).status === 'observed' ? '관측' : priceIndex(own!.country, w.year).status === 'estimated' ? '추정' : '전망'}`}
          </span>
        </footer>
        {w && (
          <div className={s.actions}>
            <button
              disabled={state?.busy || state?.readonly}
              onClick={() => void client?.command({ type: 'season', count: 5 })}
            >
              5시즌 진행
            </button>
            <button disabled={state?.busy} onClick={() => void download()}>
              기록 내보내기
            </button>
            <label className={s.fileButton}>
              기록 가져오기
              <input
                className={s.fileInput}
                type="file"
                accept="application/json,.json"
                disabled={state?.busy || state?.readonly}
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}
      </main>
    </div>
  );
}
