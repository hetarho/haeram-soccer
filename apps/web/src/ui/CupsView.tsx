import { useState } from 'react';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { clubOf } from '../../../../packages/engine/src/world';
import { Panel, Table } from './App';
import { ClubCrest } from './ClubCrest';
import { number, seasonName } from './format';
import s from './App.module.css';
import c from './CupsView.module.css';

/** "결승", "4강", "16강" … from the clubs still in the draw, as football media name rounds. */
export function cupRoundName(stage: number, stages: number) {
  const left = 2 ** (stages - stage);
  return left <= 2 ? '결승' : left <= 64 ? `${left}강` : `${stage + 1}라운드`;
}

/** Our run in one season's domestic cup, from the recorded ties. */
export function cupRun(w: World, year: number) {
  const own = clubOf(w);
  const ties = w.ownMatches
    .filter((m) => m.kind === 'cup' && m.year === year)
    .sort((a, b) => a.round - b.round);
  if (!ties.length) return undefined;
  const clubs = w.clubs.filter(
    (club) => club.country === own.country && !club.representative,
  ).length;
  const stages = Math.ceil(Math.log2(Math.max(2, clubs)));
  const stageOf = (m: MatchRecord) => Number(m.id.split(':')[3]) || 0;
  const last = ties.at(-1)!;
  const champion = w.history
    .find((h) => h.year === year)
    ?.champions.some((entry) => entry.country === own.country && entry.cup === w.playerClub);
  return {
    ties,
    champion: !!champion,
    reached: cupRoundName(stageOf(last), stages),
    stageOf: (m: MatchRecord) => cupRoundName(stageOf(m), stages),
  };
}

function ownScore(w: World, m: MatchRecord) {
  const home = m.home === w.playerClub;
  const shootout = m.highlights.find((h) => h.player === '승부차기');
  const won =
    m.score.home === m.score.away
      ? !!shootout && (shootout.side === 0) === home
      : m.score.home > m.score.away === home;
  return {
    text: `${home ? m.score.home : m.score.away}–${home ? m.score.away : m.score.home}${
      shootout ? ' (승부차기)' : ''
    }`,
    won,
    opponent: w.clubs.find((club) => club.id === (home ? m.away : m.home)),
  };
}

function DomesticCup({ w }: { w: World }) {
  const own = clubOf(w);
  const cupName = `${country(own.country).name} 컵`;
  const lastYear = w.year - 1;
  const run = cupRun(w, lastYear);
  const titles = w.history.filter((h) =>
    h.champions.some((entry) => entry.country === own.country && entry.cup === w.playerClub),
  ).length;
  const winners = [...w.history]
    .reverse()
    .slice(0, 6)
    .map((h) => ({
      year: h.year,
      club: h.champions.find((entry) => entry.country === own.country)?.cup,
    }));
  return (
    <Panel title={cupName} note={`우승 ${titles}회`}>
      <div className={c.body}>
        <p className={s.muted}>
          국내 컵은 리그 일정이 끝난 뒤 단판 토너먼트로 치러요. 무승부는 승부차기로 가려요.
        </p>
        {run ? (
          <section className={c.run} aria-label={`${seasonName(lastYear)} ${cupName} 성적`}>
            <h4>
              {seasonName(lastYear)} ·{' '}
              <b className={run.champion ? c.champion : undefined}>
                {run.champion ? '우승' : `${run.reached} 탈락`}
              </b>
            </h4>
            <ol>
              {run.ties.map((m) => {
                const result = ownScore(w, m);
                return (
                  <li key={m.id} className={result.won ? c.won : c.lost}>
                    <span>{run.stageOf(m)}</span>
                    <b>
                      {result.opponent && <ClubCrest w={w} id={result.opponent.id} size={18} />}
                      {result.opponent?.name ?? '상대'}
                    </b>
                    <em>{result.text}</em>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <p className={s.muted}>
            {w.history.length
              ? '지난 시즌 컵 경기 기록이 없어요.'
              : '첫 시즌 리그가 끝나면 첫 컵 대회가 열려요.'}
          </p>
        )}
        {winners.some((entry) => entry.club) && (
          <section aria-label="최근 우승팀">
            <h4>최근 우승팀</h4>
            <ul className={c.winners}>
              {winners.map(
                (entry) =>
                  entry.club && (
                    <li key={entry.year}>
                      <span>{seasonName(entry.year)}</span>
                      <b className={entry.club === w.playerClub ? c.champion : undefined}>
                        <ClubCrest w={w} id={entry.club} size={16} />
                        {w.clubs.find((club) => club.id === entry.club)?.name}
                      </b>
                    </li>
                  ),
              )}
            </ul>
          </section>
        )}
      </div>
    </Panel>
  );
}

/** Cups: the domestic cup and the continental club competitions in one place (→WEB-10, EURO-8). */
export function CupsView({ w, coefficient }: { w: World; coefficient: number }) {
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
          <div className={s.eyebrow}>CUP COMPETITIONS</div>
          <h2>컵 대회</h2>
          <p>국내 컵과 대륙 클럽대항전. 대회는 실제 역사의 시기에 시작돼요.</p>
        </div>
        <span className={s.pill}>최근 5시즌 구단 계수 · {number(coefficient)}점</span>
      </div>
      <DomesticCup w={w} />
      <h3 className={c.section}>대륙 클럽대항전</h3>
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
