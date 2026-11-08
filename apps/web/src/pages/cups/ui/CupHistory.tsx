import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { LINEAGES, lineageName } from '../lib/cupCompetitions';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  CupFinal,
  MatchRecord,
  SeasonArchive,
  World,
} from '../../../../../../packages/contracts/src/types';
import { domesticCupName } from '../../../../../../packages/engine/src/competition-keys';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import type { GameClient } from '../../../runtime/client';
import { Bracket, Club } from './Bracket';
import { openClubSeason } from '../../../shared/routing/state';
import { archivedKnockout } from '../lib/bracketTree';
import { cupHonours, type CupHonours, type Feat } from '../lib/cupHonours';
import { cupRoute, runLine, runResult, type RouteArchive, type RouteRow } from '../lib/cupRoute';
import { Dialog } from '../../../shared/ui/Dialog';
import { MatchReport } from '../../../features/match-viewer/ui/MatchReport';
import { reducedMotion } from '../../../shared/ui/motion';
import { seasonName } from '../../../presentation/format';
import s from '../../../shared/ui/styles/App.module.css';
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
        {localizeValue(final.score[0])}–{localizeValue(final.score[1])}
        {localizeValue(final.decided === 'pens' ? sourceMessage('copy.CupHistory.52e5d7ab38') : '')}
      </em>
      <Club w={w} id={final.runnerUp} />
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
  useTextLocale();
  return (
    <ol className={ch.route}>
      {localizeValue(
        rows.map((row) =>
          row.kind === 'phase' ? (
            <li data-surface="sheet" key={row.label} className={ch.routeCard}>
              <header>
                <b>{localizeValue(row.label)}</b>
                <span className={`${ch.chip} ${RESULT_TONE[row.result] ?? ''}`}>
                  {localizeValue(row.result)}
                </span>
              </header>
              <p className={ch.routeScore}>{localizeValue(row.record)}</p>
              <p className={ch.routeMeta}>{localizeValue(row.standing)}</p>
            </li>
          ) : (
            <li
              data-surface="sheet"
              key={row.legs[0].match.id}
              className={`${ch.routeCard} ${row.result === sourceMessage('copy.CupHistory.31e52393f3') ? ch.routeTitle : ''}`}
            >
              <header>
                <b>{localizeValue(row.label)}</b>
                <span className={`${ch.chip} ${RESULT_TONE[row.result] ?? ''}`}>
                  {localizeValue(row.result)}
                </span>
                {localizeValue(
                  row.decided && <span className={ch.chip}>{localizeValue(row.decided)}</span>,
                )}
              </header>
              <p className={ch.routeOpponent}>
                <Club w={w} id={row.opponent} />
                {localizeValue(row.tag && <small>{localizeValue(row.tag)}</small>)}
              </p>
              <p className={ch.routeScore}>{localizeValue(row.summary)}</p>
              {localizeValue(row.xg && <p className={ch.routeMeta}>{localizeValue(row.xg)}</p>)}
              {localizeValue(
                row.legs
                  .filter((leg) => leg.scorers)
                  .map((leg) => (
                    <p key={leg.match.id} className={ch.routeMeta}>
                      {richMessage('copy.CupHistory.53caf0198b', {
                        p0:
                          row.legs.length > 1
                            ? sourceMessage('copy.CupHistory.7c43974c45', { p0: leg.leg })
                            : '',
                        p1: leg.scorers,
                      })}
                    </p>
                  )),
              )}
              <div className={ch.routeActions}>
                {localizeValue(
                  row.legs.map((leg) => (
                    <button
                      key={leg.match.id}
                      type="button"
                      aria-label={displayMessage('copy.CupHistory.36c4befe2c', {
                        p0: row.label,
                        p1: leg.leg
                          ? sourceMessage('copy.CupHistory.5555cf407e', { p0: leg.leg })
                          : '',
                      })}
                      onClick={() => onReport(leg.match)}
                    >
                      {richMessage('copy.CupHistory.8e07000c94', {
                        p0: leg.leg
                          ? sourceMessage('copy.CupHistory.7c43974c45', { p0: leg.leg })
                          : '',
                      })}
                    </button>
                  )),
                )}
              </div>
            </li>
          ),
        ),
      )}
    </ol>
  );
}

/** Doubles or trebles: how many, then the latest seasons with their clubs. */
function Feats({ w, title, feats }: { w: World; title: string; feats: Feat[] }) {
  useTextLocale();
  const [all, setAll] = useState(false);
  if (!feats.length) return null;
  return (
    <li>
      <span>
        {richMessage('copy.CareerRecordBook.f512e88a6e', { p0: title, p1: feats.length })}
      </span>
      <ol>
        {localizeValue(
          (all ? feats : feats.slice(0, FEATS_SHOWN)).map((feat) => (
            <li key={feat.year}>
              <small>{localizeValue(seasonName(feat.year))}</small>
              <Club w={w} id={feat.club} strong={feat.club === w.playerClub} />
            </li>
          )),
        )}
      </ol>
      {localizeValue(
        !all && feats.length > FEATS_SHOWN && (
          <button type="button" className={c.more} onClick={() => setAll(true)}>
            {richMessage('copy.CupHistory.cb6d9b3332', { p0: feats.length })}
          </button>
        ),
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
  useTextLocale();
  const [all, setAll] = useState(false);
  const top = honours.clubs.slice(0, CLUBS_SHOWN),
    ours = honours.clubs.find((entry) => entry.club === w.playerClub);
  const shown = all ? honours.clubs : ours && !top.includes(ours) ? [...top, ours] : top;
  return (
    <section className={ch.honours} aria-label={displayMessage('copy.CupHistory.2927780640')}>
      <h4>{richMessage('copy.CupHistory.2927780640')}</h4>
      <table className={ch.honoursTable} aria-label={displayMessage('copy.CupHistory.3de8e03131')}>
        <thead>
          <tr>
            <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
            <th scope="col">{richMessage('copy.CupHistory.31e52393f3')}</th>
            <th scope="col">{richMessage('copy.CupHistory.adbe7b40f8')}</th>
            <th scope="col">{richMessage('copy.CupHistory.d7f030913a')}</th>
            <th scope="col">{richMessage('copy.CupHistory.3b9a89cc60')}</th>
          </tr>
        </thead>
        <tbody>
          {localizeValue(
            shown.map((entry) => (
              <tr key={entry.club} className={entry.club === w.playerClub ? c.ownRow : undefined}>
                <td>
                  <Club w={w} id={entry.club} />
                  {localizeValue(
                    entry.club === w.playerClub && (
                      <i className={ch.ownTag}>{richMessage('copy.BallonDorView.8434ac1486')}</i>
                    ),
                  )}
                </td>
                <td>
                  <b>{localizeValue(entry.titles)}</b>
                </td>
                <td>{localizeValue(entry.runnerUps)}</td>
                <td>{localizeValue(entry.finals)}</td>
                <td>{localizeValue(entry.lastTitle ? seasonName(entry.lastTitle) : '—')}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      {localizeValue(
        !all && honours.clubs.length > CLUBS_SHOWN && (
          <button type="button" className={c.more} onClick={() => setAll(true)}>
            {richMessage('copy.CupHistory.d2cec228a6', { p0: honours.clubs.length })}
          </button>
        ),
      )}
      {localizeValue(
        continental && honours.nations.length > 0 && (
          <table
            className={ch.honoursTable}
            aria-label={displayMessage('copy.CupHistory.63f3941c36')}
          >
            <thead>
              <tr>
                <th scope="col">{richMessage('copy.ClubListing.10a6c77fd1')}</th>
                <th scope="col">{richMessage('copy.CupHistory.31e52393f3')}</th>
                <th scope="col">{richMessage('copy.CupHistory.adbe7b40f8')}</th>
                <th scope="col">{richMessage('copy.CupHistory.d071148a5e')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                honours.nations.map((nation) => (
                  <tr key={nation.code}>
                    <td>{localizeValue(nation.name)}</td>
                    <td>
                      <b>{localizeValue(nation.titles)}</b>
                    </td>
                    <td>{localizeValue(nation.runnerUps)}</td>
                    <td>{localizeValue(nation.clubs)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        ),
      )}
      <ul className={ch.feats}>
        {localizeValue(
          honours.streaks.map((streak) => (
            <li key={streak.from}>
              <span>{richMessage('copy.CupHistory.44e9c558bb')}</span>
              <p>
                {richMessage('copy.CupHistory.be63ced77e', {
                  p0: <Club w={w} id={streak.club} strong />,
                  p1: streak.length,
                  p2: seasonName(streak.from),
                  p3: seasonName(streak.to),
                })}
              </p>
            </li>
          )),
        )}
        <Feats w={w} title={displayMessage('copy.CupHistory.24bc14ce55')} feats={honours.doubles} />
        <Feats w={w} title={displayMessage('copy.CupHistory.372bc751a7')} feats={honours.trebles} />
      </ul>
      {localizeValue(
        honours.unrecorded > 0 && (
          <p className={c.note}>
            {richMessage('copy.CupHistory.6726a9d15a', { p0: honours.unrecorded })}
          </p>
        ),
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
  useTextLocale();
  const own = clubOf(w);
  const ownCompetition = key !== 'cup' || countryCode === own.country;
  const [report, setReport] = useState<MatchRecord>();
  const [allRuns, setAllRuns] = useState(false),
    [allFinals, setAllFinals] = useState(false);
  const stepper = useRef<HTMLElement>(null),
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
  // The season moves in the header's stepper; the page returns to its winner.
  const showBracket = (next: number) => {
    setPicked(next);
    reveal(stepper.current);
  };
  const showJourney = (next: number) => {
    setPicked(next);
    journey.current?.focus({ preventScroll: true });
    reveal(journey.current);
  };
  const lineage = LINEAGES.find((entry) => entry.key === key);
  return (
    <section
      data-surface="panel"
      className={c.card}
      aria-label={displayMessage('copy.CupHistory.b645405cca')}
    >
      <div className={ch.historyPanel}>
        {localizeValue(
          year !== undefined && !final && honours.finals.length > 0 ? (
            <div className={s.panelBody}>
              <p>{richMessage('copy.CupHistory.e9ac70e2f9', { p0: seasonName(year), p1: chip })}</p>
              <button type="button" onClick={() => setPicked(years.at(-1)!)}>
                {richMessage('copy.CupHistory.4191c2d345')}
              </button>
            </div>
          ) : year === undefined || !final ? (
            <p className={s.muted}>
              {richMessage('copy.CupHistory.aa6afc8638', {
                p0: ' ',
                p1: !lineage
                  ? sourceMessage('copy.CupHistory.f114008743')
                  : w.year >= lineage.founded
                    ? sourceMessage('copy.CupHistory.db2642fb8b')
                    : sourceMessage('copy.CupHistory.04d903605d', {
                        p0: seasonName(lineage.founded),
                      }),
              })}
            </p>
          ) : (
            <>
              <section
                ref={stepper}
                className={ch.historySection}
                aria-label={displayMessage('copy.CupHistory.98bac862e4')}
              >
                <div data-surface="sheet" className={ch.winner} data-testid="cup-season-winner">
                  <small>
                    {richMessage('copy.CupHistory.f519e2b191', {
                      p0: seasonName(year),
                      p1: final.name && ` ${final.name}`,
                    })}
                  </small>
                  <p className={ch.winnerClub}>
                    <Club w={w} id={final.winner} strong />
                  </p>
                  {localizeValue(
                    final.final && (
                      <p className={ch.winnerFinal}>
                        {richMessage('copy.CupHistory.c1c5c1838b', {
                          p0: final.final.score[0],
                          p1: final.final.score[1],
                          p2:
                            final.final.decided === 'pens' &&
                            sourceMessage('copy.CupHistory.52e5d7ab38'),
                          p3: ' ',
                          p4: <Club w={w} id={final.final.runnerUp} />,
                        })}
                      </p>
                    ),
                  )}
                </div>
                {localizeValue(
                  season && (
                    <p data-surface="inset" className={c.status}>
                      {localizeValue(
                        ownCompetition
                          ? runLine(season, key)
                          : sourceMessage('copy.CupHistory.c594d0de0f'),
                      )}
                    </p>
                  ),
                )}
                <section
                  ref={journey}
                  tabIndex={-1}
                  className={ch.journey}
                  aria-label={displayMessage('copy.CupHistory.c9494ad455')}
                >
                  <h4>{richMessage('copy.CupHistory.c9494ad455')}</h4>
                  <button
                    type="button"
                    className={ch.clubSeason}
                    onClick={() => openClubSeason(year)}
                  >
                    {richMessage('copy.CupHistory.ec42c28759')}
                  </button>
                  {localizeValue(
                    archive?.failed ? (
                      <p className={c.note}>{richMessage('copy.CupHistory.1886147a5c')}</p>
                    ) : !route ? (
                      <p className={c.note}>{richMessage('copy.CupHistory.ae16a1181d')}</p>
                    ) : route.length ? (
                      <CupJourney w={w} rows={route} onReport={setReport} />
                    ) : (
                      <p className={c.note}>
                        {localizeValue(
                          !ownCompetition ||
                            (season?.runs && !season.runs.some((run) => run.key === key))
                            ? sourceMessage('copy.CupHistory.ccfff29a0c', { p0: name })
                            : sourceMessage('copy.CupHistory.85a1e3f15a', { p0: name }),
                        )}
                      </p>
                    ),
                  )}
                </section>
                {localizeValue(
                  !ownCompetition ? (
                    <p className={c.treeNote}>{richMessage('copy.CupHistory.573cb72a81')}</p>
                  ) : archive?.failed ? (
                    <p className={c.treeNote} role="alert">
                      {richMessage('copy.CupHistory.bc3d4d9ea0')}
                    </p>
                  ) : !records ? (
                    <p className={c.treeNote} role="status">
                      {richMessage('copy.CupHistory.3702589cee')}
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
                      <p className={c.note}>{richMessage('copy.CupHistory.4d91aed602')}</p>
                    </>
                  ) : (
                    <p className={c.note}>{richMessage('copy.CupHistory.428d2fd093')}</p>
                  ),
                )}
              </section>
              {localizeValue(
                runs.length > 0 && (
                  <section
                    className={c.leaders}
                    aria-label={displayMessage('copy.CupHistory.059f61f532')}
                  >
                    <h4>{richMessage('copy.CupHistory.059f61f532')}</h4>
                    <ol className={ch.runs}>
                      {localizeValue(
                        (allRuns ? runs : runs.slice(0, RUNS_SHOWN)).map((entry) => (
                          <li key={entry.year}>
                            <button
                              type="button"
                              className={ch.runButton}
                              aria-label={displayMessage('copy.CupHistory.7d33b2a088', {
                                p0: seasonName(entry.year),
                              })}
                              aria-describedby={`${runId}-${entry.year}`}
                              aria-current={entry.year === year || undefined}
                              disabled={!years.includes(entry.year)}
                              onClick={() => showJourney(entry.year)}
                            >
                              <span>{localizeValue(seasonName(entry.year))}</span>
                              <b
                                id={`${runId}-${entry.year}`}
                                className={entry.run.champion ? c.champion : undefined}
                              >
                                {localizeValue(runResult(entry.run))}
                              </b>
                            </button>
                          </li>
                        )),
                      )}
                    </ol>
                    {localizeValue(
                      !allRuns && runs.length > RUNS_SHOWN && (
                        <button type="button" className={c.more} onClick={() => setAllRuns(true)}>
                          {richMessage('copy.CupHistory.75e8bb70f1')}
                        </button>
                      ),
                    )}
                  </section>
                ),
              )}
              <Honours key={key} w={w} honours={honours} continental={key !== 'cup'} />
              <section
                className={ch.historySection}
                aria-label={displayMessage('copy.CupHistory.a65b587105')}
              >
                <h4>{richMessage('copy.CupHistory.a65b587105')}</h4>
                <ul className={c.finals}>
                  {localizeValue(
                    (allFinals ? honours.finals : honours.finals.slice(0, FINALS_SHOWN)).map(
                      (row) => (
                        <li
                          key={row.year}
                          className={row.winner === w.playerClub ? c.ownTie : undefined}
                        >
                          <button
                            type="button"
                            className={ch.finalSeason}
                            aria-label={displayMessage('copy.CupHistory.03b8428a1c', {
                              p0: seasonName(row.year),
                            })}
                            aria-current={row.year === year || undefined}
                            onClick={() => showBracket(row.year)}
                          >
                            {localizeValue(seasonName(row.year))}
                            {localizeValue(
                              row.name && row.name !== chip && (
                                <small>{localizeValue(row.name)}</small>
                              ),
                            )}
                          </button>
                          <div>{localizeValue(finalLine(w, row.winner, row.final))}</div>
                          {localizeValue(
                            row.streak > 1 && (
                              <i className={ch.streak}>
                                {richMessage('copy.CupHistory.c972156b5a', { p0: row.streak })}
                              </i>
                            ),
                          )}
                        </li>
                      ),
                    ),
                  )}
                </ul>
                {localizeValue(
                  !allFinals && honours.finals.length > FINALS_SHOWN && (
                    <button type="button" className={c.more} onClick={() => setAllFinals(true)}>
                      {richMessage('copy.CupHistory.f665f1d63e', { p0: honours.finals.length })}
                    </button>
                  ),
                )}
              </section>
            </>
          ),
        )}
      </div>
      {localizeValue(
        report && (
          <Dialog
            label={displayMessage('copy.CupHistory.e44c272d88')}
            onClose={() => setReport(undefined)}
            wide
          >
            <MatchReport record={report} w={w} />
          </Dialog>
        ),
      )}
    </section>
  );
}
