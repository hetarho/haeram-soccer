import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { NumberStepper } from '../../../shared/ui/SeasonStepper';
import { useMemo, useState } from 'react';
import type { Fixture, World } from '../../../../../../packages/contracts/src/types';
import { leaguePoints } from '../../../../../../packages/engine/src/league-fixtures';
import { nextOwnFixture } from '../../../../../../packages/engine/src/calendar';
import { kindLabel, number } from '../../../presentation/format';
import {
  LeaguePoints,
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
  RESULT_POINTS,
  sameMembers,
  type Zone,
} from '../../../entities/league';
import { ClubLink } from '../../../entities/club';
import { clubOvr, cohesionLine, ovrTier } from '../../../entities/player';
import s from '../../../shared/ui/styles/LeagueInsights.module.css';
import { sortStandings } from '../lib/standingsSort';
import { FixtureResultRow } from './FixtureResultRow';
import { StandingsHeader, useStandingsSort } from './StandingsHeader';

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
  const order = useStandingsSort();
  const [scrolled, setScrolled] = useState(false);
  const continental = w.europe.find((t) => t.standings === w.tables);
  const sorted = orderIds(ids, w.tables),
    rules = continental ? undefined : leagueRules(w, ids),
    places = rules && finalZones(rules.first.country, rules.first.tier, sorted.length);
  const domestic = read ?? leagueFixtures(w, ids);
  const timeline = continental ? [] : leagueTimeline(w, ids, domestic);
  const fixtures = continental
    ? continental.fixtures
    : domestic.length
      ? domestic
      : w.europe.find((t) => sameMembers(t.clubs, ids))?.fixtures || [];
  const visibleLimit = limit ?? sorted.length;
  const controls = limit === undefined ? order : undefined;
  const rows = sorted.flatMap((id, i) => {
    if (i >= visibleLimit && id !== w.playerClub) return [];
    const club = w.clubs.find((candidate) => candidate.id === id);
    const table = w.tables[id];
    if (!club || !table) return [];
    return [
      {
        ...table,
        id,
        club,
        table,
        rank: i + 1,
        zone: table.played ? places?.zones[i] : undefined,
        points: leaguePoints(table),
        difference: table.gf - table.ga,
        ovr: clubOvr(w, club),
        movement: rankChange(timeline, id),
      },
    ];
  });
  const visible = controls ? sortStandings(rows, controls.sort) : rows;
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
              <StandingsHeader column="rank" controls={controls}>
                {richMessage('copy.BallonDorView.8f363885a3')}
              </StandingsHeader>
              <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
              <StandingsHeader
                column="ovr"
                controls={controls}
                title={displayMessage('copy.LeagueInsights.5211425fd2')}
              >
                {richMessage('team.column.ovr')}
              </StandingsHeader>
              <StandingsHeader column="points" controls={controls}>
                {richMessage('copy.ClubTrends.e8fd75919a')}
              </StandingsHeader>
              <StandingsHeader column="played" controls={controls}>
                {richMessage('copy.LabPage.e56314e9a1')}
              </StandingsHeader>
              <StandingsHeader column="won" controls={controls}>
                {richMessage('result.win')}
              </StandingsHeader>
              <StandingsHeader column="drawn" controls={controls}>
                {richMessage('result.draw')}
              </StandingsHeader>
              <StandingsHeader column="lost" controls={controls}>
                {richMessage('result.loss')}
              </StandingsHeader>
              <StandingsHeader column="gf" controls={controls}>
                {richMessage('copy.LeagueInsights.f0e336df20')}
              </StandingsHeader>
              <StandingsHeader column="ga" controls={controls}>
                {richMessage('copy.LeagueInsights.2b47482006')}
              </StandingsHeader>
              <StandingsHeader column="difference" controls={controls}>
                {richMessage('copy.CupsView.24734975b3')}
              </StandingsHeader>
              <StandingsHeader column="movement" controls={controls} className={s.optional}>
                {richMessage('copy.LeagueInsights.0cdf58f452')}
              </StandingsHeader>
              <th scope="col" className={s.optional}>
                {richMessage('copy.LeagueInsights.41add1efc8')}
              </th>
            </tr>
          </thead>
          <tbody>
            {localizeValue(
              visible.map(({ id, club, table: t, rank, zone, ovr, movement }) => {
                return (
                  <tr
                    key={id}
                    data-own={id === w.playerClub || undefined}
                    className={`${id === w.playerClub ? s.own : ''} ${zone ? s[zone] : ''}`}
                  >
                    <td>
                      {localizeValue(t.played ? number(rank) : '—')}
                      {localizeValue(
                        rank > visibleLimit && (
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
                        data-tier={ovrTier(ovr)}
                        title={localizeValue(id === w.playerClub ? undefined : cohesionLine(club))}
                      >
                        {localizeValue(number(ovr))}
                      </span>
                    </td>
                    <td className={s.points}>
                      <LeaguePoints row={t} />
                    </td>
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
                      <Movement change={movement} />
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
                  ? sourceMessage('copy.LeagueInsights.788a732efc', { p0: number(leaguePoints(t)) })
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
                        p1: number(Math.abs(leaguePoints(t) - leaguePoints(rivalTable))),
                        p2:
                          Math.abs(leaguePoints(t) - leaguePoints(rivalTable)) <= 3
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
                  <h5>
                    {richMessage('copy.LeagueInsights.20720713c4', { p0: number(leaguePoints(t)) })}
                  </h5>
                  <span>
                    {richMessage('copy.LeagueInsights.a208ff1d5f', {
                      p0: (
                        <b>
                          {richMessage('copy.LeagueInsights.788a732efc', {
                            p0: number(leaguePoints(t) + RESULT_POINTS.win),
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
                            p0: number(leaguePoints(t) + RESULT_POINTS.draw),
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
                            p0: number(leaguePoints(t) + RESULT_POINTS.loss),
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
  const completed = new Set(fixtures.filter((f) => f.score).map((f) => f.round)),
    defaultRound = rounds.findLast((r) => completed.has(r)) ?? rounds[0];
  const [selected, setSelected] = useState<number>();
  const round = selected !== undefined && rounds.includes(selected) ? selected : defaultRound;
  const results = fixtures.filter((f) => f.round === round),
    finished = results.filter((f) => f.score).length;
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
        <NumberStepper
          values={rounds}
          value={round}
          label={sourceMessage('copy.ClubHub.0fcb288d12')}
          selectLabel={sourceMessage('copy.LeagueInsights.6c85b2b544')}
          onChange={setSelected}
        >
          {rounds.map((r, i) => (
            <option key={r} value={r}>
              {richMessage('copy.LeagueInsights.98123bdbb6', {
                p0: i + 1,
                p1: completed.has(r)
                  ? sourceMessage('copy.LeagueInsights.6f6f2978e2')
                  : sourceMessage('copy.LeagueInsights.ccc2c9abc8'),
              })}
            </option>
          ))}
        </NumberStepper>
      </div>
      <ul className={s.results}>
        {results.map((fixture) => (
          <FixtureResultRow key={fixture.id} w={w} fixture={fixture} />
        ))}
      </ul>
    </section>
  );
}
