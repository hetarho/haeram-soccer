import { LINEAGES, lineageName } from './cupCompetitions';
import { openClubSeason } from './state';
import { PixelIcon } from './PixelIcon';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  CupFinal,
  MatchRecord,
  SeasonArchive,
  World,
} from '../../../../packages/contracts/src/types';
import { domesticCupName } from '../../../../packages/engine/src/competition-keys';
import { clubOf } from '../../../../packages/engine/src/player-state';
import type { GameClient } from '../runtime/client';
import { Bracket, Club } from './Bracket';
import { archivedKnockout } from './bracketTree';
import { cupHonours, type CupHonours, type Feat } from './cupHonours';
import { cupRoute, runLine, runResult, type RouteArchive, type RouteRow } from './cupRoute';
import { Dialog } from './Dialog';
import { MatchReport } from './MatchReport';
import { reducedMotion } from './motion';
import { Select } from './Select';
import { seasonName } from './format';
import s from './App.module.css';
import c from './CupsView.module.css';
import ch from './CupHistory.module.css';

/** Our runs listed before 모두 보기, latest first. */
const RUNS_SHOWN = 12;
/** Clubs in the honours table before its full list. */
const CLUBS_SHOWN = 10;
/** Doubles or trebles listed before their full list. */
const FEATS_SHOWN = 5;
/** Finals listed before the whole list, latest first. */
const FINALS_SHOWN = 20;

interface SeasonRecords extends RouteArchive {
  season?: SeasonArchive;
}

/**
 * A closed season's archive (brackets, tables, every own match), requested once per season and
 * kept while the history is open; a reply for a season no longer selected is dropped. A failed
 * request is not kept, so choosing the season again asks once more.
 */
function useSeasonRecords(client: GameClient, world: string, year?: number) {
  const cache = useRef(new Map<string, SeasonRecords>());
  const id = `${world}:${year}`;
  const [failed, setFailed] = useState<string>();
  const [, setArrived] = useState(0);
  useEffect(() => {
    if (year === undefined || cache.current.has(id)) return;
    let valid = true;
    setFailed(undefined);
    void client
      .archive(year)
      .then((reply) => {
        if (!reply) throw new Error('missing archive');
        cache.current.set(id, { season: reply.season, matches: reply.matches });
        if (valid) setArrived((count) => count + 1);
      })
      .catch(() => valid && setFailed(id));
    return () => {
      valid = false;
    };
  }, [client, id, year]);
  if (year === undefined) return undefined;
  const records = cache.current.get(id);
  if (records) return { records };
  return failed === id ? { failed: true } : undefined;
}

function finalLine(w: World, winner: string, final?: CupFinal) {
  if (!final) return <Club w={w} id={winner} strong />;
  return (
    <>
      <Club w={w} id={winner} strong />
      <em>
        {final.score[0]}–{final.score[1]}
        {final.decided === 'pens' ? ' (승부차기)' : ''}
      </em>
      <Club w={w} id={final.runnerUp} />
    </>
  );
}

/** Previous and next arrows around the list of seasons the competition was played. */
function CupSeasonPicker({
  years,
  year,
  onChange,
}: {
  years: number[];
  year: number;
  onChange: (year: number) => void;
}) {
  const at = years.indexOf(year);
  return (
    <>
      <button
        data-ui="icon"
        type="button"
        className={ch.seasonStep}
        aria-label="이전 컵 시즌"
        disabled={at <= 0}
        onClick={() => onChange(years[at - 1])}
      >
        <PixelIcon name="chevronLeft" size={20} />
      </button>
      <Select
        aria-label="대진표 시즌"
        className={ch.seasonSelect}
        value={year}
        onValueChange={(next) => onChange(Number(next))}
      >
        {[...years].reverse().map((entry) => (
          <option key={entry} value={entry}>
            {seasonName(entry)}
          </option>
        ))}
      </Select>
      <button
        data-ui="icon"
        type="button"
        className={ch.seasonStep}
        aria-label="다음 컵 시즌"
        disabled={at === years.length - 1}
        onClick={() => onChange(years[at + 1])}
      >
        <PixelIcon name="chevronRight" size={20} />
      </button>
    </>
  );
}

const RESULT_TONE: Record<string, string | undefined> = {
  진출: ch.chipWin,
  우승: ch.chipTitle,
  준우승: ch.chipSilver,
  탈락: ch.chipOut,
};

/** Our group stages and ties of one season, a card each in playing order (→WEB-40). */
function CupJourney({
  w,
  rows,
  onReport,
}: {
  w: World;
  rows: RouteRow[];
  onReport: (match: MatchRecord) => void;
}) {
  return (
    <ol className={ch.route}>
      {rows.map((row) =>
        row.kind === 'phase' ? (
          <li data-surface="sheet" key={row.label} className={ch.routeCard}>
            <header>
              <b>{row.label}</b>
              <span className={`${ch.chip} ${RESULT_TONE[row.result] ?? ''}`}>{row.result}</span>
            </header>
            <p className={ch.routeScore}>{row.record}</p>
            <p className={ch.routeMeta}>{row.standing}</p>
          </li>
        ) : (
          <li
            data-surface="sheet"
            key={row.legs[0].match.id}
            className={`${ch.routeCard} ${row.result === '우승' ? ch.routeTitle : ''}`}
          >
            <header>
              <b>{row.label}</b>
              <span className={`${ch.chip} ${RESULT_TONE[row.result] ?? ''}`}>{row.result}</span>
              {row.decided && <span className={ch.chip}>{row.decided}</span>}
            </header>
            <p className={ch.routeOpponent}>
              <Club w={w} id={row.opponent} />
              {row.tag && <small>{row.tag}</small>}
            </p>
            <p className={ch.routeScore}>{row.summary}</p>
            {row.xg && <p className={ch.routeMeta}>{row.xg}</p>}
            {row.legs
              .filter((leg) => leg.scorers)
              .map((leg) => (
                <p key={leg.match.id} className={ch.routeMeta}>
                  {row.legs.length > 1 ? `${leg.leg}차전 ` : ''}득점 {leg.scorers}
                </p>
              ))}
            <div className={ch.routeActions}>
              {row.legs.map((leg) => (
                <button
                  key={leg.match.id}
                  type="button"
                  aria-label={`${row.label}${leg.leg ? ` ${leg.leg}차전` : ''} 경기 리포트`}
                  onClick={() => onReport(leg.match)}
                >
                  {leg.leg ? `${leg.leg}차전 ` : ''}경기 리포트
                </button>
              ))}
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

/** Doubles or trebles: how many, then the latest seasons with their clubs. */
function Feats({ w, title, feats }: { w: World; title: string; feats: Feat[] }) {
  const [all, setAll] = useState(false);
  if (!feats.length) return null;
  return (
    <li>
      <span>
        {title} · {feats.length}회
      </span>
      <ol>
        {(all ? feats : feats.slice(0, FEATS_SHOWN)).map((feat) => (
          <li key={feat.year}>
            <small>{seasonName(feat.year)}</small>
            <Club w={w} id={feat.club} strong={feat.club === w.playerClub} />
          </li>
        ))}
      </ol>
      {!all && feats.length > FEATS_SHOWN && (
        <button type="button" className={c.more} onClick={() => setAll(true)}>
          {feats.length}회 모두 보기
        </button>
      )}
    </li>
  );
}

/** The competition's honours: clubs and nations by titles, the longest run, doubles and trebles. */
function Honours({
  w,
  honours,
  continental,
}: {
  w: World;
  honours: CupHonours;
  continental: boolean;
}) {
  const [all, setAll] = useState(false);
  const top = honours.clubs.slice(0, CLUBS_SHOWN),
    ours = honours.clubs.find((entry) => entry.club === w.playerClub);
  const shown = all ? honours.clubs : ours && !top.includes(ours) ? [...top, ours] : top;
  return (
    <section className={ch.honours} aria-label="역대 기록">
      <h4>역대 기록</h4>
      <table className={ch.honoursTable} aria-label="클럽별 우승 기록">
        <thead>
          <tr>
            <th scope="col">클럽</th>
            <th scope="col">우승</th>
            <th scope="col">준우승</th>
            <th scope="col">결승</th>
            <th scope="col">최근 우승</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((entry) => (
            <tr key={entry.club} className={entry.club === w.playerClub ? c.ownRow : undefined}>
              <td>
                <Club w={w} id={entry.club} />
                {entry.club === w.playerClub && <i className={ch.ownTag}>우리 팀</i>}
              </td>
              <td>
                <b>{entry.titles}</b>
              </td>
              <td>{entry.runnerUps}</td>
              <td>{entry.finals}</td>
              <td>{entry.lastTitle ? seasonName(entry.lastTitle) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!all && honours.clubs.length > CLUBS_SHOWN && (
        <button type="button" className={c.more} onClick={() => setAll(true)}>
          {honours.clubs.length}개 클럽 모두 보기
        </button>
      )}
      {continental && honours.nations.length > 0 && (
        <table className={ch.honoursTable} aria-label="국가별 우승 기록">
          <thead>
            <tr>
              <th scope="col">국가</th>
              <th scope="col">우승</th>
              <th scope="col">준우승</th>
              <th scope="col">우승 클럽</th>
            </tr>
          </thead>
          <tbody>
            {honours.nations.map((nation) => (
              <tr key={nation.code}>
                <td>{nation.name}</td>
                <td>
                  <b>{nation.titles}</b>
                </td>
                <td>{nation.runnerUps}</td>
                <td>{nation.clubs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ul className={ch.feats}>
        {honours.streaks.map((streak) => (
          <li key={streak.from}>
            <span>최다 연속 우승</span>
            <p>
              <Club w={w} id={streak.club} strong /> {streak.length}년 연속 (
              {seasonName(streak.from)}–{seasonName(streak.to)})
            </p>
          </li>
        ))}
        <Feats w={w} title="더블 · 리그와 컵 2관왕" feats={honours.doubles} />
        <Feats w={w} title="트레블 · 리그·컵·유럽 3관왕" feats={honours.trebles} />
      </ul>
      {honours.unrecorded > 0 && (
        <p className={c.note}>
          결승 점수가 남지 않은 {honours.unrecorded}시즌은 우승만 세고 준우승은 세지 않아요.
        </p>
      )}
    </section>
  );
}

/**
 * Cup history (→WEB-40): every closed season's bracket and our road through it, the
 * competition's honours and its finals season by season.
 */
export function CupHistory({
  w,
  client,
  competition: key,
  picked,
  onYear: setPicked,
  countryCode,
}: {
  w: World;
  client: GameClient;
  competition: string;
  picked?: number;
  onYear: (year: number) => void;
  countryCode: string;
}) {
  const own = clubOf(w);
  const ownCompetition = key !== 'cup' || countryCode === own.country;
  const [report, setReport] = useState<MatchRecord>();
  const [allRuns, setAllRuns] = useState(false),
    [allFinals, setAllFinals] = useState(false);
  const stepper = useRef<HTMLDivElement>(null),
    journey = useRef<HTMLElement>(null);
  const runId = useId();
  // Closed seasons never change: the honours follow the number of seasons and the competition.
  const honours = useMemo(
    () => cupHonours(w.history, w.clubs, countryCode, key),
    [w.id, w.history.length, key, countryCode],
  );
  const runs = useMemo(
    () =>
      [...w.history]
        .reverse()
        .flatMap((h) =>
          (ownCompetition ? h.runs || [] : [])
            .filter((run) => run.key === key)
            .map((run) => ({ year: h.year, run })),
        ),
    [w.id, w.history.length, key, countryCode, ownCompetition],
  );
  // Oldest first; a season chosen for another competition stays when this one was played then.
  const years = honours.finals.map((row) => row.year).reverse();
  const year = picked ?? years.at(-1);
  useEffect(() => {
    if (picked === undefined && year !== undefined) setPicked(year);
  }, [picked, year, setPicked]);
  const final = honours.finals.find((row) => row.year === year);
  const season = w.history.find((h) => h.year === year);
  const archive = useSeasonRecords(client, w.id, ownCompetition ? year : undefined);
  const records = archive?.records;
  const bracket = ownCompetition
    ? records?.season?.brackets?.find((entry) => entry.key === key)
    : undefined;
  const knockout = useMemo(
    () => (bracket && year !== undefined ? archivedKnockout(w, year, bracket) : undefined),
    [bracket, year],
  );
  const route = useMemo(
    () =>
      !ownCompetition
        ? []
        : records && year !== undefined
          ? cupRoute(w, year, key, records)
          : undefined,
    [records, year, key, ownCompetition],
  );
  const chip =
      key === 'cup'
        ? domesticCupName(countryCode)
        : lineageName(
            w,
            LINEAGES.find((entry) => entry.key === key)!,
          ),
    name = key === 'cup' ? chip : (final?.name ?? chip);
  const reveal = (target: HTMLElement | null) =>
    target?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
  const showBracket = (next: number) => {
    setPicked(next);
    stepper.current
      ?.querySelector<HTMLElement>('[data-select-trigger]')
      ?.focus({ preventScroll: true });
    reveal(stepper.current);
  };
  const showJourney = (next: number) => {
    setPicked(next);
    journey.current?.focus({ preventScroll: true });
    reveal(journey.current);
  };
  const lineage = LINEAGES.find((entry) => entry.key === key);
  return (
    <section data-surface="panel" className={c.card} aria-label="컵 대회 역사">
      <div className={ch.historyPanel}>
        {year !== undefined && !final && honours.finals.length > 0 ? (
          <div className={s.panelBody}>
            <p>
              {seasonName(year)} · {chip}의 대회 기록이 없어요.
            </p>
            <button type="button" onClick={() => setPicked(years.at(-1)!)}>
              최근 기록된 시즌 보기
            </button>
          </div>
        ) : year === undefined || !final ? (
          <p className={s.muted}>
            아직 기록된 대회가 없어요.{' '}
            {!lineage
              ? '첫 시즌이 끝나면 대진표와 우승팀이 남아요.'
              : w.year >= lineage.founded
                ? '첫 대회가 끝나면 대진표와 우승팀이 남아요.'
                : `${seasonName(lineage.founded)} 시즌에 창설돼요.`}
          </p>
        ) : (
          <>
            <section className={ch.historySection} aria-label="시즌별 대진">
              <h4>시즌별 대진</h4>
              <div ref={stepper} className={ch.seasonPicker} role="group" aria-label="컵 시즌 선택">
                <CupSeasonPicker years={years} year={year} onChange={setPicked} />
              </div>
              <button type="button" onClick={() => openClubSeason(year)}>
                이 시즌 구단 기록
              </button>
              <p className={ch.seasonFinal}>
                <b>
                  {seasonName(year)}
                  {final.name && ` ${final.name}`}
                </b>{' '}
                · 우승 <Club w={w} id={final.winner} strong />
                {final.final && (
                  <>
                    {' '}
                    · 결승 {final.final.score[0]}–{final.final.score[1]}{' '}
                    <Club w={w} id={final.final.runnerUp} />
                    {final.final.decided === 'pens' && ' (승부차기)'}
                  </>
                )}
              </p>
              {season && (
                <p data-surface="inset" className={c.status}>
                  {ownCompetition ? runLine(season, key) : '우리 클럽은 나서지 않았어요'}
                </p>
              )}
              <section
                ref={journey}
                tabIndex={-1}
                className={ch.journey}
                aria-label="우리 클럽의 컵 여정"
              >
                <h4>우리 클럽의 컵 여정</h4>
                {archive?.failed ? (
                  <p className={c.note}>경기 기록을 읽지 못했어요.</p>
                ) : !route ? (
                  <p className={c.note}>경기 기록을 불러오는 중…</p>
                ) : route.length ? (
                  <CupJourney w={w} rows={route} onReport={setReport} />
                ) : (
                  <p className={c.note}>
                    {!ownCompetition ||
                    (season?.runs && !season.runs.some((run) => run.key === key))
                      ? `우리 클럽은 이 시즌 ${name}에 나서지 않았어요.`
                      : `이 시즌 우리 클럽의 ${name} 경기 기록이 남아 있지 않아요.`}
                  </p>
                )}
              </section>
              {!ownCompetition ? (
                <p className={c.treeNote}>이 대회의 지난 대진표는 보관하지 않았어요.</p>
              ) : archive?.failed ? (
                <p className={c.treeNote} role="alert">
                  대진표를 읽지 못했어요. 시즌을 다시 골라 보세요.
                </p>
              ) : !records ? (
                <p className={c.treeNote} role="status">
                  대진표를 펼치는 중…
                </p>
              ) : knockout ? (
                <>
                  <Bracket
                    key={`${key}:${year}`}
                    w={w}
                    rounds={knockout.rounds}
                    fixtures={knockout.fixtures}
                    competition={knockout.competition}
                    year={year}
                  />
                  <p className={c.note}>
                    32강부터 결승까지 남겨요. 그 전 라운드와 조별 리그는 우리 클럽 경기만 기록돼요.
                  </p>
                </>
              ) : (
                <p className={c.note}>이 시즌은 결승 기록만 남아 있어요.</p>
              )}
            </section>
            {runs.length > 0 && (
              <section className={c.leaders} aria-label="우리 클럽의 도전">
                <h4>우리 클럽의 도전</h4>
                <ol className={ch.runs}>
                  {(allRuns ? runs : runs.slice(0, RUNS_SHOWN)).map((entry) => (
                    <li key={entry.year}>
                      <button
                        type="button"
                        className={ch.runButton}
                        aria-label={`${seasonName(entry.year)} 여정 보기`}
                        aria-describedby={`${runId}-${entry.year}`}
                        aria-current={entry.year === year || undefined}
                        disabled={!years.includes(entry.year)}
                        onClick={() => showJourney(entry.year)}
                      >
                        <span>{seasonName(entry.year)}</span>
                        <b
                          id={`${runId}-${entry.year}`}
                          className={entry.run.champion ? c.champion : undefined}
                        >
                          {runResult(entry.run)}
                        </b>
                      </button>
                    </li>
                  ))}
                </ol>
                {!allRuns && runs.length > RUNS_SHOWN && (
                  <button type="button" className={c.more} onClick={() => setAllRuns(true)}>
                    모두 보기
                  </button>
                )}
              </section>
            )}
            <Honours key={key} w={w} honours={honours} continental={key !== 'cup'} />
            <section className={ch.historySection} aria-label="역대 결승">
              <h4>역대 결승</h4>
              <ul className={c.finals}>
                {(allFinals ? honours.finals : honours.finals.slice(0, FINALS_SHOWN)).map((row) => (
                  <li key={row.year} className={row.winner === w.playerClub ? c.ownTie : undefined}>
                    <button
                      type="button"
                      className={ch.finalSeason}
                      aria-label={`${seasonName(row.year)} 대진 보기`}
                      aria-current={row.year === year || undefined}
                      onClick={() => showBracket(row.year)}
                    >
                      {seasonName(row.year)}
                      {row.name && row.name !== chip && <small>{row.name}</small>}
                    </button>
                    <div>{finalLine(w, row.winner, row.final)}</div>
                    {row.streak > 1 && <i className={ch.streak}>{row.streak}년 연속</i>}
                  </li>
                ))}
              </ul>
              {!allFinals && honours.finals.length > FINALS_SHOWN && (
                <button type="button" className={c.more} onClick={() => setAllFinals(true)}>
                  {honours.finals.length}시즌 모두 보기
                </button>
              )}
            </section>
          </>
        )}
      </div>
      {report && (
        <Dialog label="컵 경기 리포트" onClose={() => setReport(undefined)} wide>
          <MatchReport record={report} w={w} />
        </Dialog>
      )}
    </section>
  );
}
