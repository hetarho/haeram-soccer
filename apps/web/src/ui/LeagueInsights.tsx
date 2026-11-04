import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { Select } from './Select';
import { useMemo, useState, type ReactNode } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { kindLabel, seasonName } from './format';
import {
  archivedTimeline,
  divisionName,
  finalZones,
  formFor,
  leagueFixtures,
  leagueOverviewModel,
  leagueRounds,
  leagueRules,
  leagueTimeline,
  orderIds,
  ownLeagueIds,
  rankChange,
  rankHistoryYears,
  RESULT_POINTS,
  sameMembers,
  type Zone,
} from './league';
import { ClubLink } from '../entities/club';
import { clubOvr, cohesionLine, ovrTier } from './OvrBadge';
import s from './LeagueInsights.module.css';

function Movement({ change }: { change?: number }) {
  useTextLocale();
  return (
    <span
      className={change && change > 0 ? s.rising : change && change < 0 ? s.falling : s.neutral}
      aria-label={localizeValue(
        change === undefined
          ? sourceMessage('copy.LeagueInsights.54eb1d3dde')
          : change > 0
            ? sourceMessage('copy.LeagueInsights.44c8230d2c', { p0: change })
            : change < 0
              ? sourceMessage('copy.LeagueInsights.121d1054b6', { p0: -change })
              : sourceMessage('copy.LeagueInsights.ee01113543'),
      )}
    >
      {localizeValue(
        change === undefined ? '—' : change > 0 ? `↑ ${change}` : change < 0 ? `↓ ${-change}` : '·',
      )}
    </span>
  );
}

function Form({ results }: { results: ('승' | '무' | '패')[] }) {
  useTextLocale();
  return (
    <span
      className={s.form}
      aria-label={localizeValue(
        results.length
          ? sourceMessage('copy.LeagueInsights.2a482529dd', {
              p0: results.length,
              p1: results.join(', '),
            })
          : sourceMessage('copy.LeagueInsights.0de0762d88'),
      )}
    >
      {localizeValue(
        results.length ? (
          results.map((result, i) => (
            <span
              key={i}
              className={
                result === sourceMessage('result.win')
                  ? s.win
                  : result === sourceMessage('result.loss')
                    ? s.loss
                    : s.draw
              }
            >
              {localizeValue(result)}
            </span>
          ))
        ) : (
          <span className={s.neutral}>—</span>
        ),
      )}
    </span>
  );
}

/** A league table; `fixtures` brings another league's matches, which the view does not carry. */
export function Standings({
  w,
  ids,
  limit,
  fixtures: read,
}: {
  w: World;
  ids: string[];
  limit?: number;
  fixtures?: Fixture[];
}) {
  useTextLocale();
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const continental = w.europe.find((t) => t.standings === w.tables);
  const sorted = orderIds(ids, w.tables),
    rules = continental ? undefined : leagueRules(w, ids),
    places = rules && finalZones(rules.first.country, rules.first.tier, sorted.length),
    timeline = continental ? [] : leagueTimeline(w, ids);
  const domestic = read ?? leagueFixtures(w, ids);
  const fixtures = continental
    ? continental.fixtures
    : domestic.length
      ? domestic
      : w.europe.find((t) => sameMembers(t.clubs, ids))?.fixtures || [];
  const visibleLimit = limit || (expanded ? sorted.length : 8);
  const shown = sorted.filter((id, i) => i < visibleLimit || id === w.playerClub).length;
  return (
    <div className={s.standingsBlock}>
      <div
        className={s.tableWrap}
        data-ui="standings-scroll"
        data-scrolled={scrolled || undefined}
        onScroll={(event) => setScrolled(Math.abs(event.currentTarget.scrollLeft) > 1)}
      >
        <table
          className={s.standings}
          aria-label={displayMessage('copy.LeagueInsights.7c477b094f')}
        >
          <thead>
            <tr>
              <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
              <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
              <th scope="col" title={displayMessage('copy.LeagueInsights.5211425fd2')}>
                {richMessage('team.column.ovr')}
              </th>
              <th scope="col">{richMessage('copy.ClubTrends.e8fd75919a')}</th>
              <th scope="col">{richMessage('copy.LabPage.e56314e9a1')}</th>
              <th scope="col">{richMessage('result.win')}</th>
              <th scope="col">{richMessage('result.draw')}</th>
              <th scope="col">{richMessage('result.loss')}</th>
              <th scope="col">{richMessage('copy.LeagueInsights.f0e336df20')}</th>
              <th scope="col">{richMessage('copy.LeagueInsights.2b47482006')}</th>
              <th scope="col">{richMessage('copy.CupsView.24734975b3')}</th>
              <th scope="col" className={s.optional}>
                {richMessage('copy.LeagueInsights.0cdf58f452')}
              </th>
              <th scope="col" className={s.optional}>
                {richMessage('copy.LeagueInsights.41add1efc8')}
              </th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              sorted.map((id, i) => {
                if (i >= visibleLimit && id !== w.playerClub) return null;
                const club = w.clubs.find((c) => c.id === id),
                  t = w.tables[id];
                if (!club || !t) return null;
                // No zone before the club has played.
                const zone = t.played > 0 ? places?.zones[i] : undefined;
                return (
                  <tr
                    key={id}
                    data-own={id === w.playerClub || undefined}
                    className={`${id === w.playerClub ? s.own : ''} ${zone ? s[zone] : ''}`}
                  >
                    <td>
                      {localizeValue(t.played ? i + 1 : '—')}
                      {localizeValue(
                        i >= visibleLimit && (
                          <small aria-label={displayMessage('copy.LeagueInsights.87b28eeea6')}>
                            {' '}
                            …
                          </small>
                        ),
                      )}
                    </td>
                    <th scope="row" className={s.club}>
                      <ClubLink w={w} id={id}>
                        {localizeValue(
                          id === w.playerClub && (
                            <span data-ui="badge" className={s.myClub}>
                              {richMessage('copy.BallonDorView.8434ac1486')}
                            </span>
                          ),
                        )}
                      </ClubLink>
                    </th>
                    <td>
                      <span
                        className={s.teamOvr}
                        data-tier={ovrTier(clubOvr(w, club))}
                        title={localizeValue(id === w.playerClub ? undefined : cohesionLine(club))}
                      >
                        {localizeValue(clubOvr(w, club))}
                      </span>
                    </td>
                    <td className={s.points}>{localizeValue(t.points)}</td>
                    <td>{localizeValue(t.played)}</td>
                    <td>{localizeValue(t.won)}</td>
                    <td>{localizeValue(t.drawn)}</td>
                    <td>{localizeValue(t.lost)}</td>
                    <td>{localizeValue(t.gf)}</td>
                    <td>{localizeValue(t.ga)}</td>
                    <td>
                      {localizeValue(t.gf - t.ga > 0 ? '+' : '')}
                      {localizeValue(t.gf - t.ga)}
                    </td>
                    <td className={s.optional}>
                      <Movement change={rankChange(timeline, id)} />
                    </td>
                    <td className={s.optional}>
                      <Form results={formFor(fixtures, id)} />
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {localizeValue(
        !limit && (
          <div className={s.coverage}>
            <span>
              {richMessage('copy.LeagueInsights.a4fd30adec', { p0: shown, p1: sorted.length })}
            </span>
            {localizeValue(
              shown < sorted.length && (
                <button onClick={() => setExpanded(true)}>
                  {richMessage('copy.LeagueInsights.fb1f61b240', { p0: sorted.length })}
                </button>
              ),
            )}
          </div>
        ),
      )}
      {localizeValue(places && <ZoneLegend zones={places.zones} />)}
    </div>
  );
}

/**
 * The key to a table's places (→ finalZones): each zone the table marks, then the tiebreaks. A
 * closed season's bottom places went down (강등권); a live table's are still a risk (강등 위험권).
 */
export function ZoneLegend({
  zones,
  closed = false,
  className = s.legend,
}: {
  zones: readonly (Zone | undefined)[];
  closed?: boolean;
  className?: string;
}) {
  useTextLocale();
  return (
    <p className={className}>
      {localizeValue(
        zones.includes('automatic') && (
          <span>
            {richMessage('copy.LeagueInsights.1b09497a48', { p0: <i className={s.autoDot} /> })}
          </span>
        ),
      )}
      {localizeValue(
        zones.includes('playoff') && (
          <span>
            {richMessage('copy.LeagueInsights.c0fc9c7cf5', { p0: <i className={s.playoffDot} /> })}
          </span>
        ),
      )}
      {localizeValue(
        zones.includes('relegation') && (
          <span>
            <i className={s.dropDot} />
            {localizeValue(
              closed
                ? sourceMessage('copy.LeagueInsights.c4e587c3a6')
                : sourceMessage('copy.LeagueInsights.744675b522'),
            )}
          </span>
        ),
      )}
      <span>{richMessage('copy.LeagueInsights.bf8f84928a')}</span>
    </p>
  );
}

export function LeagueOverview({ w, onOpenLeague }: { w: World; onOpenLeague?: () => void }) {
  useTextLocale();
  const {
    ids,
    sorted,
    table: t,
    rules,
    change,
    rank,
    form,
    threshold,
    inside,
    gap,
    cushion,
    streak,
    lastMatch,
    lastRound,
    ownGoals,
    opponentGoals,
    matchPoints,
    before,
    after,
  } = useMemo(() => leagueOverviewModel(w), [w]);
  const own = w.clubs.find((c) => c.id === w.playerClub)!;
  const next = nextOwnFixture(w);
  const rivalId = next && (next.home === w.playerClub ? next.away : next.home),
    rival = w.clubs.find((c) => c.id === rivalId),
    rivalTable = rivalId && w.tables[rivalId];
  const leagueGame = next?.kind === 'league';
  return (
    <section
      data-surface="panel"
      className={s.overview}
      aria-label={displayMessage('copy.LeagueInsights.611540a8e8')}
    >
      <div className={s.overviewTitle}>
        <h3>
          {localizeValue(
            t.played
              ? sourceMessage('copy.LeagueInsights.6500356541')
              : sourceMessage('copy.LeagueInsights.927c6104dc'),
          )}
        </h3>
        {localizeValue(
          onOpenLeague && (
            <button onClick={onOpenLeague}>{richMessage('copy.LeagueInsights.39af9ef2a8')}</button>
          ),
        )}
      </div>
      {localizeValue(
        lastMatch && (
          <p data-surface="inset" className={s.lastResult}>
            <b>
              {richMessage('copy.LeagueInsights.60dbe3b7e5', {
                p0: lastRound,
                p1: ownGoals,
                p2: opponentGoals,
                p3: ' ',
                p4:
                  matchPoints === RESULT_POINTS.win
                    ? sourceMessage('result.win.label')
                    : matchPoints === RESULT_POINTS.draw
                      ? sourceMessage('result.draw.label')
                      : sourceMessage('result.loss.label'),
              })}
            </b>
            <span>{richMessage('copy.LeagueInsights.c663cf84dc', { p0: matchPoints })}</span>
            <span>
              {localizeValue(
                before && after
                  ? sourceMessage('copy.AwaySummary.c28072ce2e', {
                      p0: before.rank,
                      p1: after.rank,
                    })
                  : after
                    ? sourceMessage('copy.LeagueInsights.bf708c8dd0', { p0: after.rank })
                    : sourceMessage('copy.LeagueInsights.5ed45b04de'),
              )}
            </span>
          </p>
        ),
      )}
      <div className={s.stats}>
        <div>
          <span>{richMessage('copy.LeagueInsights.0f095a67a5')}</span>
          <strong>
            {localizeValue(
              t.played
                ? sourceMessage('copy.BallonDorView.5094d45cea', { p0: rank })
                : sourceMessage('copy.LeagueInsights.df47c98b9c'),
            )}{' '}
            <Movement change={change} />
          </strong>
          <small>
            {localizeValue(
              t.played
                ? change === undefined
                  ? sourceMessage('copy.LeagueInsights.e4e0b6b532')
                  : change > 0
                    ? sourceMessage('copy.LeagueInsights.7c54f4d653', { p0: change })
                    : change < 0
                      ? sourceMessage('copy.LeagueInsights.b2e98b398c', { p0: -change })
                      : sourceMessage('copy.LeagueInsights.2e553d08be')
                : sourceMessage('copy.LeagueInsights.fea3bcdca5', { p0: ids.length }),
            )}
          </small>
        </div>
        <div>
          <span>
            {localizeValue(
              rules?.automatic
                ? sourceMessage('copy.LeagueInsights.4454a6a6d8')
                : sourceMessage('copy.LeagueInsights.cbbfbcd626'),
            )}
          </span>
          <strong>
            {localizeValue(
              !t.played
                ? '—'
                : !rules?.automatic && rank === 1
                  ? sourceMessage('copy.LeagueInsights.8f1ce1909c')
                  : sourceMessage('copy.LeagueInsights.788a732efc', { p0: gap }),
            )}
          </strong>
          <small>
            {localizeValue(
              !t.played
                ? rules?.automatic
                  ? sourceMessage('copy.LeagueInsights.7328598971', { p0: threshold })
                  : sourceMessage('copy.LeagueInsights.9bbb7c775d')
                : rules?.automatic
                  ? inside
                    ? sourceMessage('copy.LeagueInsights.52c03555e1', { p0: threshold, p1: gap })
                    : sourceMessage('copy.LeagueInsights.d6bea756f3', { p0: threshold, p1: gap })
                  : rank === 1
                    ? sourceMessage('copy.LeagueInsights.99cac8b2b7')
                    : sourceMessage('copy.LeagueInsights.119bc9bd79', {
                        p0:
                          w.clubs.find((c) => c.id === sorted[0])?.short ||
                          sourceMessage('copy.LeagueInsights.3c20f8211d'),
                      }),
            )}
          </small>
        </div>
        <div>
          <span>
            {localizeValue(
              cushion === undefined
                ? sourceMessage('copy.LeagueInsights.de89f3941a')
                : sourceMessage('copy.LeagueInsights.eb36ded68f'),
            )}
          </span>
          <strong>
            {localizeValue(
              !t.played
                ? '—'
                : cushion === undefined
                  ? sourceMessage('copy.LeagueInsights.788a732efc', { p0: t.points })
                  : sourceMessage('copy.LeagueInsights.b0b32a2aa4', {
                      p0: cushion > 0 ? '+' : '',
                      p1: cushion,
                    }),
            )}
          </strong>
          <small>
            {localizeValue(
              !t.played
                ? sourceMessage('copy.LeagueInsights.224dd2b773')
                : cushion === undefined
                  ? sourceMessage('copy.LeagueInsights.9f2c790122', {
                      p0: t.won,
                      p1: t.drawn,
                      p2: t.lost,
                    })
                  : rank > sorted.length - (rules?.relegation || 0)
                    ? sourceMessage('copy.LeagueInsights.bc6c3d2f9a')
                    : cushion === 0
                      ? sourceMessage('copy.LeagueInsights.712b69014e')
                      : sourceMessage('copy.LeagueInsights.7e446941fe'),
            )}
          </small>
        </div>
        <div>
          <span>{richMessage('copy.LeagueInsights.34a1385270')}</span>
          <strong className={s.formStrong}>
            <Form results={form} />
          </strong>
          <small>
            {localizeValue(
              form.length
                ? streak.length > 1
                  ? sourceMessage('copy.LeagueInsights.0536f34999', {
                      p0: streak.length,
                      p1:
                        streak.result === sourceMessage('result.win')
                          ? sourceMessage('result.win.label')
                          : streak.result === sourceMessage('result.loss')
                            ? sourceMessage('result.loss.label')
                            : sourceMessage('result.draw.label'),
                    })
                  : sourceMessage('copy.LeagueInsights.9d1e3d0aea', {
                      p0: form.length,
                      p1: form.filter((r) => r === sourceMessage('result.win')).length,
                      p2: form.filter((r) => r === sourceMessage('result.draw')).length,
                      p3: form.filter((r) => r === sourceMessage('result.loss')).length,
                    })
                : sourceMessage('copy.LeagueInsights.1e2c0a4eae'),
            )}
          </small>
        </div>
      </div>
      {localizeValue(
        next && rival ? (
          <div data-surface="inset" className={s.rival}>
            <div>
              <span>
                {richMessage('copy.LeagueInsights.1bdb0a14b8', {
                  p0: kindLabel[next.kind],
                  p1:
                    next.home === w.playerClub
                      ? sourceMessage('fixture.home')
                      : sourceMessage('fixture.away'),
                })}
              </span>
              <h4>
                <ClubLink w={w} id={own.id} crest={18} short />{' '}
                <span className={s.versus}>{richMessage('copy.LeagueInsights.f130559f0e')}</span>
                {localizeValue(' ')}
                <ClubLink w={w} id={rival.id} crest={18} />
              </h4>
              <p>
                {localizeValue(
                  leagueGame && rivalTable && t.played
                    ? sourceMessage('copy.LeagueInsights.30a9314f22', {
                        p0: sorted.indexOf(rival.id) + 1,
                        p1: Math.abs(t.points - rivalTable.points),
                        p2:
                          Math.abs(t.points - rivalTable.points) <= 3
                            ? sourceMessage('copy.LeagueInsights.7f6bcf9428')
                            : sourceMessage('copy.LeagueInsights.1c7fe7ca29'),
                      })
                    : sourceMessage('copy.LeagueInsights.f3b3e50c51'),
                )}
              </p>
            </div>
            {localizeValue(
              leagueGame && (
                <div
                  className={s.projection}
                  aria-label={displayMessage('copy.LeagueInsights.67faa67d5c')}
                >
                  <h5>{richMessage('copy.LeagueInsights.20720713c4', { p0: t.points })}</h5>
                  <span>
                    {richMessage('copy.LeagueInsights.a208ff1d5f', {
                      p0: (
                        <b>
                          {richMessage('copy.LeagueInsights.788a732efc', {
                            p0: t.points + RESULT_POINTS.win,
                          })}
                        </b>
                      ),
                      p1: <small>+{localizeValue(RESULT_POINTS.win)}</small>,
                    })}
                  </span>
                  <span>
                    {richMessage('copy.LeagueInsights.8562310e88', {
                      p0: (
                        <b>
                          {richMessage('copy.LeagueInsights.788a732efc', {
                            p0: t.points + RESULT_POINTS.draw,
                          })}
                        </b>
                      ),
                      p1: <small>+{localizeValue(RESULT_POINTS.draw)}</small>,
                    })}
                  </span>
                  <span>
                    {richMessage('copy.LeagueInsights.222a9e05c1', {
                      p0: (
                        <b>
                          {richMessage('copy.LeagueInsights.788a732efc', {
                            p0: t.points + RESULT_POINTS.loss,
                          })}
                        </b>
                      ),
                      p1: <small>+{localizeValue(RESULT_POINTS.loss)}</small>,
                    })}
                  </span>
                  <small>{richMessage('copy.LeagueInsights.a695bf2eb0')}</small>
                </div>
              ),
            )}
          </div>
        ) : (
          <p className={s.seasonEnd}>{richMessage('copy.LeagueInsights.29c853849e')}</p>
        ),
      )}
    </section>
  );
}

/** The rank chart's frame for `rounds` points and `clubs` places: first place on top. */
export function rankAxis(rounds: number, clubs: number) {
  return {
    x: (i: number) => 42 + (i / Math.max(1, rounds - 1)) * 572,
    y: (rank: number) => 22 + ((rank - 1) / Math.max(1, clubs - 1)) * 150,
    ticks: [...new Set([1, Math.ceil(clubs / 2), clubs])],
  };
}
/** Rank grid lines and the first and last round under the series drawn as children. */
export function RankChart({
  label,
  axis,
  first,
  last,
  children,
}: {
  label: string;
  axis: ReturnType<typeof rankAxis>;
  first: number;
  last: number;
  children: ReactNode;
}) {
  useTextLocale();
  return (
    <svg viewBox="0 0 650 205" role="img" aria-label={localizeValue(label)}>
      {localizeValue(
        axis.ticks.map((rank) => (
          <g key={rank}>
            <line
              x1="42"
              x2="614"
              y1={axis.y(rank)}
              y2={axis.y(rank)}
              stroke="#dce2d5"
              strokeDasharray="3 5"
            />
            <text x="30" y={axis.y(rank) + 4} textAnchor="end">
              {richMessage('copy.BallonDorView.5094d45cea', { p0: rank })}
            </text>
          </g>
        )),
      )}
      {localizeValue(children)}
      <text x="42" y="198">
        {richMessage('copy.BusinessWorkbench.fcefde4602', { p0: first })}
      </text>
      <text x="614" y="198" textAnchor="end">
        {richMessage('copy.BusinessWorkbench.fcefde4602', { p0: last })}
      </text>
    </svg>
  );
}

export function RankHistoryGraph({
  w,
  ids: shown,
  year: pinned,
}: {
  w: World;
  /** The league's clubs; our own league by default. */
  ids?: string[];
  /** One closed season, drawn from its kept snapshots without the season list. */
  year?: number;
}) {
  useTextLocale();
  const ids = useMemo(() => shown ?? ownLeagueIds(w), [w, shown]);
  const ownLeague = useMemo(() => sameMembers(ids, ownLeagueIds(w)), [w, ids]);
  const years = useMemo(
    () => (pinned !== undefined ? [pinned] : rankHistoryYears(w, ids)),
    [w, ids, pinned],
  );
  const [selectedYear, setSelectedYear] = useState<number>(),
    [selectedComparison, setChoice] = useState('nearby');
  const year =
    pinned ?? (selectedYear !== undefined && years.includes(selectedYear) ? selectedYear : w.year);
  const archived = useMemo(
    () => (year === w.year ? undefined : archivedTimeline(w, year)),
    [w, year],
  );
  const timeline = useMemo(() => archived ?? leagueTimeline(w, ids), [archived, w, ids]);
  const graphIds = year === w.year ? ids : timeline[0]?.rows.map((row) => row.id) || [];
  const sorted =
    year === w.year ? orderIds(ids, w.tables) : timeline.at(-1)?.rows.map((row) => row.id) || [];
  const primary = graphIds.includes(w.playerClub) ? w.playerClub : sorted[0];
  const choice = ['nearby', 'none', 'all', ...graphIds].includes(selectedComparison)
    ? selectedComparison
    : 'nearby';
  const rank = sorted.indexOf(primary),
    nearby = sorted[rank > 0 ? rank - 1 : 1];
  const compare = choice === 'nearby' ? nearby : graphIds.includes(choice) ? choice : undefined;
  const series =
    choice === 'all'
      ? [primary, ...graphIds.filter((id) => id !== primary)]
      : [primary, compare].filter((id): id is string => !!id);
  const name = (id: string) => w.clubs.find((c) => c.id === id)?.name || id;
  const axis = rankAxis(timeline.length, graphIds.length),
    { x, y } = axis;
  const home = w.clubs.find((c) => c.id === w.playerClub)?.country ?? '';
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.LeagueInsights.9cfb907bbd')}
    >
      <div className={s.panelHead}>
        <div>
          <h3>{richMessage('copy.LeagueInsights.9cfb907bbd')}</h3>
          <span>
            {richMessage('copy.LeagueInsights.205acf650d', {
              p0: seasonName(year),
              p1: archived?.[0]
                ? sourceMessage('copy.LeagueInsights.5ef6d66a2a', {
                    p0: divisionName(home, archived[0].tier, archived[0].group),
                  })
                : '',
              p2: ' ',
            })}
          </span>
        </div>
        <div className={s.graphFilters}>
          {localizeValue(
            years.length > 1 && (
              <label className={s.compare}>
                {richMessage('copy.LeagueInsights.c73072b6a4', {
                  p0: ' ',
                  p1: (
                    <Select
                      aria-label={displayMessage('copy.LeagueInsights.16bd2079c1')}
                      value={year}
                      onValueChange={(value) => setSelectedYear(Number(value))}
                    >
                      {localizeValue(
                        years.map((y) => (
                          <option key={y} value={y}>
                            {localizeValue(seasonName(y))}
                            {localizeValue(
                              y === w.year ? sourceMessage('copy.LeagueInsights.b2801e8117') : '',
                            )}
                          </option>
                        )),
                      )}
                    </Select>
                  ),
                })}
              </label>
            ),
          )}
          <label className={s.compare}>
            {richMessage('copy.LeagueInsights.a0c0acc2b7', {
              p0: ' ',
              p1: (
                <Select
                  aria-label={displayMessage('copy.LeagueInsights.42e1d26be7')}
                  value={choice}
                  onValueChange={(value) => setChoice(value)}
                >
                  <option value="nearby">{richMessage('copy.LeagueInsights.89b2f2c7b9')}</option>
                  <option value="none">{richMessage('copy.LeagueInsights.151f71cffb')}</option>
                  <option value="all">{richMessage('copy.LeagueInsights.40a45a532a')}</option>
                  {localizeValue(
                    sorted
                      .filter((id) => id !== primary)
                      .map((id) => (
                        <option key={id} value={id}>
                          {localizeValue(name(id))}
                        </option>
                      )),
                  )}
                </Select>
              ),
            })}
          </label>
        </div>
      </div>
      {localizeValue(
        !timeline.length ? (
          <p className={s.empty}>
            {localizeValue(
              ownLeague
                ? sourceMessage('copy.LeagueInsights.a628e05416')
                : sourceMessage('copy.LeagueInsights.874669d97f'),
            )}
          </p>
        ) : (
          <>
            <figure className={s.chart}>
              <RankChart
                label={displayMessage('copy.LeagueInsights.1dfecabc18', {
                  p0: name(primary),
                  p1: timeline
                    .map((r, i) =>
                      sourceMessage('copy.LeagueInsights.d92c13468d', {
                        p0: i + 1,
                        p1: r.rows.find((row) => row.id === primary)?.rank,
                      }),
                    )
                    .join(', '),
                })}
                axis={axis}
                first={1}
                last={timeline.length}
              >
                {localizeValue(
                  [...series].reverse().map((id) => (
                    <g key={id} opacity={choice === 'all' && id !== primary ? 0.35 : 1}>
                      <polyline
                        points={timeline
                          .map(
                            (round, i) =>
                              `${x(i)},${y(round.rows.find((row) => row.id === id)?.rank || graphIds.length)}`,
                          )
                          .join(' ')}
                        fill="none"
                        stroke={id === primary ? '#28654b' : '#b57f54'}
                        strokeWidth={id === primary ? 3.5 : 1.5}
                        strokeLinejoin="round"
                      />
                      {localizeValue(
                        (choice !== 'all' || id === primary) &&
                          timeline.map((round, i) => {
                            const row = round.rows.find((row) => row.id === id);
                            return (
                              row && (
                                <circle
                                  key={round.round}
                                  cx={x(i)}
                                  cy={y(row.rank)}
                                  r={timeline.length > 20 ? 2 : 3}
                                  fill={id === primary ? '#28654b' : '#b57f54'}
                                >
                                  <title>
                                    {richMessage('copy.LeagueInsights.103905df80', {
                                      p0: name(id),
                                      p1: i + 1,
                                      p2: row.rank,
                                      p3: row.points,
                                    })}
                                  </title>
                                </circle>
                              )
                            );
                          }),
                      )}
                    </g>
                  )),
                )}
              </RankChart>
              <figcaption>
                <span>
                  <i className={s.primaryDot} />
                  {localizeValue(name(primary))}
                </span>
                {localizeValue(
                  choice === 'all' ? (
                    <span>
                      {richMessage('copy.LeagueInsights.101cfa7d56', { p0: graphIds.length })}
                    </span>
                  ) : (
                    compare && (
                      <span>
                        <i className={s.compareDot} />
                        {localizeValue(name(compare))}
                      </span>
                    )
                  ),
                )}
              </figcaption>
            </figure>
            <details data-ui="disclosure" className={s.details}>
              <summary>{richMessage('copy.LeagueInsights.5b3a45a930')}</summary>
              <div className={s.tableWrap}>
                <table aria-label={displayMessage('copy.LeagueInsights.b46914c413')}>
                  <thead>
                    <tr>
                      <th scope="col">{richMessage('copy.ClubHub.0fcb288d12')}</th>
                      {localizeValue(
                        series.map((id) => (
                          <th key={id} scope="col">
                            {localizeValue(name(id))}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {localizeValue(
                      timeline.map((round, i) => (
                        <tr key={round.round}>
                          <th scope="row">{localizeValue(i + 1)}</th>
                          {localizeValue(
                            series.map((id) => {
                              const row = round.rows.find((row) => row.id === id);
                              return (
                                <td key={id}>
                                  {localizeValue(
                                    row
                                      ? sourceMessage('copy.LeagueInsights.73769a8d11', {
                                          p0: row.rank,
                                          p1: row.points,
                                        })
                                      : '—',
                                  )}
                                </td>
                              );
                            }),
                          )}
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ),
      )}
    </section>
  );
}

export function RoundResults({
  w,
  ids,
  fixtures: read,
}: {
  w: World;
  ids: string[];
  fixtures?: Fixture[];
}) {
  useTextLocale();
  const fixtures = read ?? leagueFixtures(w, ids),
    rounds = leagueRounds(fixtures);
  const completed = fixtures.filter((f) => f.score),
    defaultRound = completed.length ? Math.max(...completed.map((f) => f.round)) : rounds[0];
  const [selected, setSelected] = useState<number>();
  const round = selected !== undefined && rounds.includes(selected) ? selected : defaultRound;
  const results = fixtures.filter((f) => f.round === round),
    finished = results.filter((f) => f.score).length;
  const resultClass = (f: Fixture) =>
    f.home === w.playerClub || f.away === w.playerClub ? s.ownResult : '';
  // Any league's rounds (→WEB-65); ours reads as the rivals' results.
  const ours = sameMembers(ids, ownLeagueIds(w));
  if (!rounds.length) return null;
  return (
    <section
      data-surface="panel"
      className={s.panel}
      aria-label={displayMessage('copy.LeagueInsights.bdef0fcc15')}
    >
      <div className={s.panelHead}>
        <div>
          <h3>
            {localizeValue(
              ours
                ? sourceMessage('copy.LeagueInsights.7ac77e9bcd')
                : sourceMessage('copy.LeagueInsights.e0d0bdbc96'),
            )}
          </h3>
          <span>
            {localizeValue(
              finished
                ? ours
                  ? sourceMessage('copy.LeagueInsights.e0a85df259', { p0: finished })
                  : sourceMessage('copy.LeagueInsights.6187036271', { p0: finished })
                : ours
                  ? sourceMessage('copy.LeagueInsights.5f8eaa7111')
                  : sourceMessage('copy.LeagueInsights.e7197fed28'),
            )}
          </span>
        </div>
        <label className={s.compare}>
          {richMessage('copy.LeagueInsights.2ab3ad2525', {
            p0: ' ',
            p1: (
              <Select
                aria-label={displayMessage('copy.LeagueInsights.6c85b2b544')}
                value={round}
                onValueChange={(value) => setSelected(Number(value))}
              >
                {localizeValue(
                  rounds.map((r) => (
                    <option key={r} value={r}>
                      {richMessage('copy.LeagueInsights.98123bdbb6', {
                        p0: rounds.indexOf(r) + 1,
                        p1: fixtures.some((f) => f.round === r && f.score)
                          ? sourceMessage('copy.LeagueInsights.6f6f2978e2')
                          : sourceMessage('copy.LeagueInsights.ccc2c9abc8'),
                      })}
                    </option>
                  )),
                )}
              </Select>
            ),
          })}
        </label>
      </div>
      <ul className={s.results}>
        {localizeValue(
          results.map((f) => {
            const ours = f.home === w.playerClub || f.away === w.playerClub;
            return (
              <li key={f.id} className={resultClass(f)} data-own={ours || undefined}>
                {localizeValue(
                  ours && (
                    <span data-ui="badge" data-compact className={s.ownBadge}>
                      {richMessage('copy.BallonDorView.8434ac1486')}
                    </span>
                  ),
                )}
                <span
                  className={`${s.side} ${s.homeSide} ${f.home === w.playerClub ? s.ourName : ''}`}
                >
                  <ClubLink w={w} id={f.home} mirror />
                </span>
                <b
                  aria-label={localizeValue(
                    f.score
                      ? sourceMessage('copy.LeagueInsights.dcb919d17b', {
                          p0: f.score.home,
                          p1: f.score.away,
                        })
                      : sourceMessage('copy.LeagueInsights.6ae98340d8'),
                  )}
                >
                  {localizeValue(f.score ? `${f.score.home} – ${f.score.away}` : 'vs')}
                </b>
                <span className={`${s.side} ${f.away === w.playerClub ? s.ourName : ''}`}>
                  <ClubLink w={w} id={f.away} />
                </span>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}
