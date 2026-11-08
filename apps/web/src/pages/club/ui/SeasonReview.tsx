import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useMemo, useState, type PointerEvent } from 'react';
import { ClubCrest } from '../../../entities/club/ui/ClubCrest';
import type { World } from '../../../../../../packages/contracts/src/types';
import { clubOf, ownSeasons } from '../../../../../../packages/engine/src/player-state';
import { number, seasonName, signed } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import { divisionName } from '../../../entities/league/lib/league';
import type { SeasonFiles } from '../../../entities/league/lib/seasonArchive';
import { seasonStats, share, type Leader, type SeasonStats } from '../lib/seasonStats';
import s from '../../../shared/ui/styles/SeasonReview.module.css';
import { Term } from '../../../shared/ui/Term';
import { PlayerLink } from '../../../entities/player';

const one = (value: number) => value.toFixed(1);
const two = (value?: number) => (value === undefined ? '—' : value.toFixed(2));

/** Cumulative points against expected points by league matchday (two series, one axis). */
function PointsChart({ stats }: { stats: SeasonStats }) {
  useTextLocale();
  const [focus, setFocus] = useState<number>();
  const rows = stats.progression;
  if (rows.length < 2) return null;
  const W = 320,
    H = 96,
    L = 24,
    R = 8,
    T = 6,
    B = 14;
  const max = Math.max(3, ...rows.map((r) => Math.max(r.points, r.xpts ?? 0)));
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const xptsRows = rows.filter((r) => r.xpts !== undefined);
  const active = focus === undefined ? rows.length - 1 : focus;
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - box.left) / box.width) * W;
    setFocus(
      Math.max(
        0,
        Math.min(rows.length - 1, Math.round(((ratio - L) / (W - L - R)) * (rows.length - 1))),
      ),
    );
  };
  return (
    <figure data-surface="sheet" className={s.chart}>
      <figcaption>
        <span>
          {richMessage('copy.SeasonReview.5909975c35', {
            p0: <i className={s.keyPoints} aria-hidden="true" />,
            p1: <b>{localizeValue(rows[active].points)}</b>,
          })}
        </span>
        {localizeValue(
          xptsRows.length === rows.length && (
            <span>
              {richMessage('copy.SeasonReview.dfa83a11da', {
                p0: <i className={s.keyXpts} aria-hidden="true" />,
                p1: <b>{localizeValue(one(rows[active].xpts!))}</b>,
              })}
            </span>
          ),
        )}
        <small>{richMessage('copy.BusinessWorkbench.fcefde4602', { p0: active + 1 })}</small>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={displayMessage('copy.SeasonReview.c8f4a22cbd', {
          p0: stats.points,
          p1:
            stats.xpts !== undefined
              ? sourceMessage('copy.SeasonReview.31989325b8', { p0: one(stats.xpts) })
              : '',
        })}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setFocus(undefined)}
      >
        {localizeValue(
          [0, Math.round(max / 2), Math.round(max)].map((tick) => (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} className={s.grid} />
              <text x={L - 4} y={y(tick) + 3} textAnchor="end" className={s.tick}>
                {localizeValue(tick)}
              </text>
            </g>
          )),
        )}
        {localizeValue(
          xptsRows.length === rows.length && (
            <polyline
              points={rows.map((r, i) => `${x(i)},${y(r.xpts!)}`).join(' ')}
              fill="none"
              stroke="#ffcb47"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ),
        )}
        <polyline
          points={rows.map((r, i) => `${x(i)},${y(r.points)}`).join(' ')}
          fill="none"
          stroke="#2fc274"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line x1={x(active)} x2={x(active)} y1={T} y2={H - B} className={s.crosshair} />
        <circle
          cx={x(active)}
          cy={y(rows[active].points)}
          r="4"
          fill="#2fc274"
          stroke="#07110e"
          strokeWidth="2"
        />
        {localizeValue(
          rows[active].xpts !== undefined && (
            <circle
              cx={x(active)}
              cy={y(rows[active].xpts!)}
              r="4"
              fill="#ffcb47"
              stroke="#07110e"
              strokeWidth="2"
            />
          ),
        )}
      </svg>
    </figure>
  );
}

function Leaders({
  title,
  unit,
  leaders,
  digits,
}: {
  title: string;
  unit: string;
  leaders: Leader[];
  digits?: number;
}) {
  useTextLocale();
  return (
    <div data-surface="sheet" className={s.leader}>
      <span>{localizeValue(title)}</span>
      {localizeValue(
        leaders.length ? (
          <ol>
            {localizeValue(
              leaders.map((leader) => (
                <li key={leader.id}>
                  <b>
                    <PlayerLink id={leader.id} name={leader.name} />
                  </b>
                  <em>
                    {localizeValue(
                      digits === undefined ? number(leader.value) : leader.value.toFixed(digits),
                    )}
                    {localizeValue(unit)}
                  </em>
                </li>
              )),
            )}
          </ol>
        ) : (
          <p>{richMessage('copy.SeasonReview.852bf68e8e')}</p>
        ),
      )}
    </div>
  );
}

/**
 * One closed season at a glance, the first of its tabs in the league page's season list
 * (→WEB-47): where the club finished, the numbers football fans read (xG, expected points,
 * finishing, keeping, pressing), its leaders, the money and the season ahead. `files` is the
 * season's archive once read; `clubs` the size of its final table when one survives.
 */
export function SeasonReview({
  w,
  year,
  files,
  failed,
  clubs,
}: {
  w: World;
  year: number;
  files?: SeasonFiles;
  failed?: boolean;
  clubs?: number;
}) {
  useTextLocale();
  // Only the club's own seasons have a review; the world's before the takeover kept no own figures.
  const seasons = ownSeasons(w),
    index = seasons.findIndex((h) => h.year === year),
    season = index >= 0 ? seasons[index] : undefined;
  const matches = files?.matches;
  const stats = useMemo(() => (matches ? seasonStats(w, matches) : undefined), [w, matches]);
  if (!season)
    return (
      <section className={s.empty} data-testid="season-review">
        <h2>{richMessage('copy.SeasonReview.a03340a233')}</h2>
        <p>{richMessage('copy.SeasonReview.462e75d9f5')}</p>
      </section>
    );
  const club = clubOf(w),
    previous = index > 0 ? seasons[index - 1] : undefined,
    // The division a closed season led to: the next season's, or the current one for the latest.
    nextTier = seasons[index + 1]?.tier ?? club.tier,
    // Amounts were recorded in the closed season's currency.
    format = (value: string) => <Money value={value} code={club.country} year={season.year} />,
    move = nextTier < season.tier ? 'up' : nextTier > season.tier ? 'down' : 'stay',
    from = divisionName(club.country, season.tier),
    to = divisionName(club.country, nextTier),
    net = BigInt(season.income) - BigInt(season.expense),
    // The merit payment, or the rank prize of seasons closed before the league distribution.
    prize = files?.events.find(
      (e) => e.kind === 'league-merit' || e.kind === 'season-prize',
    )?.amount;
  const ribbon =
    move === 'up'
      ? { text: sourceMessage('copy.SeasonReview.3128e63b63', { p0: from, p1: to }), tone: s.up }
      : move === 'down'
        ? {
            text: sourceMessage('copy.SeasonReview.057f70a68c', { p0: from, p1: to }),
            tone: s.down,
          }
        : { text: sourceMessage('copy.SeasonReview.a9f48d7c2d', { p0: from }), tone: s.stay };
  const per = (value: number) => (stats?.played ? one(value / stats.played) : '—');
  const xgReady = !!stats?.xgMatches;
  return (
    <div className={s.review} data-testid="season-review">
      <section data-surface="sheet" className={s.hero}>
        <ClubCrest w={w} id={club.id} size={40} />
        <div className={s.heroText}>
          <small className={s.kicker}>
            {richMessage('copy.SeasonReview.1d20dee8a0', {
              p0: localizeValue(seasonName(season.year)),
            })}
          </small>
          <h2>{club.name}</h2>
          <p className={`${s.ribbon} ${ribbon.tone}`} data-testid="season-move">
            {localizeValue(ribbon.text)}
          </p>
        </div>
        <div
          className={s.rank}
          aria-label={displayMessage('copy.SeasonReview.ab1d793878', { p0: season.rank })}
        >
          <b>{localizeValue(season.rank)}</b>
          <span>
            {richMessage('copy.SeasonReview.237d36f0f4', {
              p0: clubs ? `/${clubs}` : '',
              p1: (
                <small>
                  {localizeValue(
                    previous
                      ? sourceMessage('copy.SeasonReview.bc231bb64c', { p0: previous.rank })
                      : sourceMessage('copy.SeasonReview.73092db344'),
                  )}
                </small>
              ),
            })}
          </span>
        </div>
      </section>

      <ul data-ui="inset-list" className={s.kpis}>
        <li>
          <span>{richMessage('copy.ClubTrends.e8fd75919a')}</span>
          <b>{localizeValue(season.points)}</b>
          <small>
            {richMessage('copy.SeasonReview.9cf0edf807', {
              p0: season.played ? (season.points / season.played).toFixed(2) : '0',
            })}
          </small>
        </li>
        <li>
          <span>{richMessage('copy.SeasonReview.cbac60f1a6')}</span>
          <b>
            {localizeValue(season.won)}-{localizeValue(season.drawn)}-{localizeValue(season.lost)}
          </b>
          <small>
            {richMessage('copy.SeasonReview.11b6e0e7f5', { p0: share(season.won, season.played) })}
          </small>
        </li>
        <li>
          <span>{richMessage('copy.CupsView.24734975b3')}</span>
          <b>
            {localizeValue(season.gf)}:{localizeValue(season.ga)}
          </b>
          <small>
            {richMessage('copy.SeasonReview.839b1bb232', { p0: signed(season.gf - season.ga) })}
          </small>
        </li>
        <li>
          <span>{richMessage('copy.SeasonReview.527ecb28ac')}</span>
          <b>{localizeValue(xgReady ? signed(stats!.xg! - stats!.xga!, 1) : '—')}</b>
          <small>
            {localizeValue(
              xgReady
                ? `xG ${one(stats!.xg!)} · xGA ${one(stats!.xga!)}`
                : sourceMessage('copy.SeasonReview.668f6eb56f'),
            )}
          </small>
        </li>
        <li>
          <span>{richMessage('copy.SeasonReview.32c15a3712')}</span>
          <b>{localizeValue(xgReady ? one(stats!.xpts!) : '—')}</b>
          <small>
            {localizeValue(
              xgReady && stats!.xgMatches === stats!.played
                ? sourceMessage('copy.SeasonReview.bfc948badb', {
                    p0: signed(stats!.points - stats!.xpts!, 1),
                  })
                : sourceMessage('copy.SeasonReview.c3056ea6be'),
            )}
          </small>
        </li>
        <li>
          <span>{richMessage('copy.ClubTrends.2070613ba9')}</span>
          <b>{localizeValue(number(season.fans))}</b>
          <small>
            {localizeValue(
              previous
                ? sourceMessage('copy.CareerRecordBook.e414915261', {
                    p0: signed(season.fans - previous.fans),
                  })
                : sourceMessage('copy.SeasonReview.73092db344'),
            )}
          </small>
        </li>
      </ul>

      {localizeValue(
        !stats ? (
          <p className={s.loading} role="status">
            {localizeValue(
              failed
                ? sourceMessage('copy.PastSeason.5edf6161ac')
                : sourceMessage('copy.PastSeason.5ae912ceaf'),
            )}
          </p>
        ) : (
          <>
            <PointsChart stats={stats} />
            <div data-ui="sheet-list" className={s.groups}>
              <section aria-label={displayMessage('position.family.FW')}>
                <h3>{richMessage('position.family.FW')}</h3>
                <dl>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.d8cf03f821')}</dt>
                    <dd>
                      {localizeValue(stats.gf)} ({localizeValue(per(stats.gf))})
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.b54a9307bd')}</dt>
                    <dd>
                      {localizeValue(xgReady ? `${one(stats.xg!)} (${per(stats.xg!)})` : '—')}
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.dc53b01006')}</dt>
                    <dd className={xgReady ? (stats.gf >= stats.xg! ? s.good : s.bad) : undefined}>
                      {localizeValue(xgReady ? signed(stats.gf - stats.xg!, 1) : '—')}
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.3460d5cb6a')}</dt>
                    <dd>{localizeValue(per(stats.shots))}</dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.bf28e1c289')}</dt>
                    <dd>{localizeValue(share(stats.onTarget, stats.shots))}</dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.c5c103a81a')}</dt>
                    <dd>{localizeValue(share(stats.gf, stats.shots))}</dd>
                  </div>
                  {localizeValue(
                    stats.detailMatches > 0 && (
                      <>
                        <div>
                          <dt>
                            {richMessage('copy.SeasonReview.f52e20f43c', {
                              p0: (
                                <Term id="big-chance">
                                  {richMessage('copy.LeagueFullStats.233a5dfe38')}
                                </Term>
                              ),
                            })}
                          </dt>
                          <dd>
                            {localizeValue(stats.bigChances)} (
                            {localizeValue(share(stats.bigChancesScored, stats.bigChances))})
                          </dd>
                        </div>
                        <div>
                          <dt>
                            {richMessage('copy.SeasonReview.9cf0edf807', {
                              p0: (
                                <Term id="key-pass">
                                  {richMessage('copy.MatchReport.532ac6f371')}
                                </Term>
                              ),
                            })}
                          </dt>
                          <dd>{localizeValue(one(stats.keyPasses / stats.detailMatches))}</dd>
                        </div>
                      </>
                    ),
                  )}
                </dl>
              </section>
              <section aria-label={displayMessage('position.family.DF')}>
                <h3>{richMessage('position.family.DF')}</h3>
                <dl>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.26d36e3f45')}</dt>
                    <dd>
                      {localizeValue(stats.ga)} ({localizeValue(per(stats.ga))})
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.5507e6cdc0')}</dt>
                    <dd>
                      {localizeValue(xgReady ? `${one(stats.xga!)} (${per(stats.xga!)})` : '—')}
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.46c69aaf33')}</dt>
                    <dd className={xgReady ? (stats.xga! >= stats.ga ? s.good : s.bad) : undefined}>
                      {localizeValue(xgReady ? signed(stats.xga! - stats.ga, 1) : '—')}
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.2d238e2626')}</dt>
                    <dd>
                      {localizeValue(stats.cleanSheets)} (
                      {localizeValue(share(stats.cleanSheets, stats.played))})
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.81e3b8ff0c')}</dt>
                    <dd>{localizeValue(share(stats.saves, stats.onTargetAgainst))}</dd>
                  </div>
                  <div>
                    <dt>
                      <Term id="ppda">{richMessage('copy.SeasonReview.069e77d412')}</Term>
                      {localizeValue(stats.ppda === undefined ? '' : '*')}
                    </dt>
                    <dd>{localizeValue(two(stats.pressPpda ?? stats.ppda))}</dd>
                  </div>
                </dl>
              </section>
              <section aria-label={displayMessage('copy.SeasonReview.842b1e7ccb')}>
                <h3>{richMessage('copy.SeasonReview.842b1e7ccb')}</h3>
                <dl>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.513c1cb562')}</dt>
                    <dd>{localizeValue(one(stats.possession))}%</dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.summary.5101559c4e')}</dt>
                    <dd>
                      {localizeValue(
                        stats.passAccuracy === undefined
                          ? '—'
                          : `${one(stats.passAccuracy * 100)}%`,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.783efa0fcf')}</dt>
                    <dd>{localizeValue(Math.round(stats.passesPerGame))}</dd>
                  </div>
                  <div>
                    <dt>{richMessage('copy.SeasonReview.97df3c6f89')}</dt>
                    <dd>{localizeValue(one(stats.defensiveActions))}</dd>
                  </div>
                  {localizeValue(
                    stats.detailMatches > 0 && (
                      <>
                        <div>
                          <dt>
                            {richMessage('copy.SeasonReview.7277c98985', {
                              p0: (
                                <Term id="final-third">
                                  {richMessage('copy.MatchReport.ce19759276')}
                                </Term>
                              ),
                            })}
                          </dt>
                          <dd>
                            {localizeValue(
                              share(stats.finalThirdCompleted, stats.finalThirdPasses),
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            <Term id="field-tilt">
                              {richMessage('copy.SeasonReview.c7c1a585f2')}
                            </Term>
                          </dt>
                          <dd>
                            {localizeValue(
                              stats.fieldTilt === undefined
                                ? '—'
                                : `${one(stats.fieldTilt * 100)}%`,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>
                            {richMessage('copy.SeasonReview.9cf0edf807', {
                              p0: (
                                <Term id="high-turnover">
                                  {richMessage('copy.PlayerAdvancedStats.11212f27d2')}
                                </Term>
                              ),
                            })}
                          </dt>
                          <dd>{localizeValue(one(stats.highTurnovers / stats.detailMatches))}</dd>
                        </div>
                      </>
                    ),
                  )}
                  <div>
                    <dt>{richMessage('fixture.home')}</dt>
                    <dd>
                      {richMessage('copy.SeasonReview.ce517e15f4', {
                        p0: stats.home.won,
                        p1: stats.home.drawn,
                        p2: stats.home.lost,
                        p3: stats.home.points,
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt>{richMessage('fixture.away')}</dt>
                    <dd>
                      {richMessage('copy.SeasonReview.ce517e15f4', {
                        p0: stats.away.won,
                        p1: stats.away.drawn,
                        p2: stats.away.lost,
                        p3: stats.away.points,
                      })}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
            <ul data-ui="inset-list" className={s.records}>
              <li>
                <span>{richMessage('copy.SeasonReview.1cbaecb27b')}</span>
                <b>
                  {richMessage('copy.SeasonAnalysis.f0536ece4c', { p0: stats.longestUnbeaten })}
                </b>
              </li>
              <li>
                <span>{richMessage('copy.RecordsRoom.a23530b619')}</span>
                <b>{richMessage('copy.SeasonAnalysis.f0536ece4c', { p0: stats.longestWinning })}</b>
              </li>
              <li>
                <span>{richMessage('copy.SeasonReview.9859baa4c3')}</span>
                <b>
                  {localizeValue(
                    stats.biggestWin
                      ? `${stats.biggestWin.score} vs ${stats.biggestWin.opponent}`
                      : '—',
                  )}
                </b>
              </li>
              <li>
                <span>{richMessage('copy.SeasonReview.4f6e094e0c')}</span>
                <b>
                  {localizeValue(
                    stats.heaviestDefeat
                      ? `${stats.heaviestDefeat.score} vs ${stats.heaviestDefeat.opponent}`
                      : '—',
                  )}
                </b>
              </li>
            </ul>
            <section
              className={s.leaders}
              aria-label={displayMessage('copy.SeasonReview.387a6ad9d5')}
            >
              <Leaders
                title={displayMessage('copy.summary.eb4e291be3')}
                unit={sourceMessage('copy.summary.68a6cf8ed8')}
                leaders={stats.leaders.goals}
              />
              <Leaders
                title={displayMessage('copy.BallonDorView.8d901cc28d')}
                unit={sourceMessage('copy.ClubHub.a57ab05712')}
                leaders={stats.leaders.assists}
              />
              {localizeValue(
                stats.leaders.xa.length > 0 && (
                  <Leaders
                    title={displayMessage('copy.SeasonReview.3b07cae7d8')}
                    unit=""
                    leaders={stats.leaders.xa}
                    digits={2}
                  />
                ),
              )}
              {localizeValue(
                stats.leaders.keyPasses.length > 0 && (
                  <Leaders
                    title={displayMessage('copy.MatchReport.532ac6f371')}
                    unit={sourceMessage('copy.ClubHub.a57ab05712')}
                    leaders={stats.leaders.keyPasses}
                  />
                ),
              )}
              <Leaders
                title={displayMessage('copy.SeasonReview.e3934e2f1c')}
                unit={sourceMessage('copy.SeasonReview.0ef6c01e0a')}
                leaders={stats.leaders.defending}
              />
              <Leaders
                title={displayMessage('copy.BallonDorView.b849877c07')}
                unit={sourceMessage('copy.PlayerComparison.ca4a187881')}
                leaders={stats.leaders.minutes}
              />
              <Leaders
                title={displayMessage('copy.RecordsRoom.2a022bd612')}
                unit={sourceMessage('copy.SeasonReview.0ef6c01e0a')}
                leaders={stats.leaders.saves}
              />
            </section>
            <p className={s.footnote}>
              {richMessage('copy.SeasonReview.03f03078b3', {
                p0: stats.played,
                p1: ' ',
                p2:
                  stats.xgMatches < stats.played &&
                  sourceMessage('copy.SeasonReview.75b1c0d3fb', { p0: stats.xgMatches }),
                p3:
                  stats.detailMatches > 0 &&
                  stats.detailMatches < stats.played &&
                  sourceMessage('copy.SeasonReview.2cd2e20be4', { p0: stats.detailMatches }),
                p4: stats.detailMatches
                  ? sourceMessage('copy.SeasonReview.86cfb3d957')
                  : sourceMessage('copy.SeasonReview.2cd69aa855'),
              })}
            </p>
          </>
        ),
      )}

      {localizeValue(
        !!season.runs?.length && (
          <section
            data-surface="sheet"
            className={s.next}
            aria-label={displayMessage('copy.SeasonReview.9f8d725a40')}
          >
            <h3>{richMessage('copy.ClubTrends.cf5a6ab3e0')}</h3>
            <ul>
              {localizeValue(
                season.runs.map((run) => (
                  <li key={run.key}>
                    {localizeValue(run.name)} ·{' '}
                    {localizeValue(
                      run.champion ? sourceMessage('copy.CupHistory.31e52393f3') : run.reached,
                    )}
                  </li>
                )),
              )}
              {localizeValue(
                season.elo !== undefined && (
                  <li>
                    {richMessage('copy.SeasonReview.c8f945c1c3', {
                      p0: season.elo,
                      p1: season.eloRank
                        ? sourceMessage('copy.SeasonReview.caaf413c52', { p0: season.eloRank })
                        : '',
                    })}
                  </li>
                ),
              )}
            </ul>
          </section>
        ),
      )}

      <section
        data-ui="inset-list"
        className={s.money}
        aria-label={displayMessage('copy.SeasonReview.3f596b8af1')}
      >
        <div>
          <span>{richMessage('copy.SeasonReview.2b599954c4')}</span>
          <b>{localizeValue(format(season.income))}</b>
        </div>
        <div>
          <span>{richMessage('copy.SeasonReview.1ed4f1ad1c')}</span>
          <b>{localizeValue(format(season.expense))}</b>
        </div>
        <div>
          <span>{richMessage('copy.SeasonReview.3a6bb0387b')}</span>
          <b className={net < 0n ? s.bad : s.good}>
            {localizeValue(net > 0n ? '+' : '')}
            {localizeValue(format(net.toString()))}
          </b>
        </div>
        <div>
          <span>{richMessage('copy.SeasonReview.35bfe8ff7d')}</span>
          <b>{localizeValue(format(season.cash))}</b>
          <small>
            {localizeValue(
              prize ? (
                <>{richMessage('copy.SeasonReview.d96447e86d', { p0: format(prize) })}</>
              ) : (
                sourceMessage('copy.SeasonReview.886d9aea4d')
              ),
            )}
          </small>
        </div>
      </section>
    </div>
  );
}
