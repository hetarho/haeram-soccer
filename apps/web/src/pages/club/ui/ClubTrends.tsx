import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useTaskState } from '../../../shared/routing/taskMemory';
import { useMemo, type ReactNode } from 'react';
import type { World } from '../../../../../../packages/contracts/src/types';
import type {
  OwnerSeasonRecord,
  PreOwnerSeason,
} from '../../../../../../packages/contracts/src/owner';
import { honoursBeforeOwner } from '../../../../../../packages/engine/src/club-past';
import { country, currency } from '../../../../../../packages/catalogs/src/index';
import { clubOf, ownSeasons } from '../../../../../../packages/engine/src/player-state';
import { inTodayMoney } from '../../../../../../packages/engine/src/transfer-records';
import { Panel } from '../../../shared/ui/Panel';
import { Chart, type ChartBand } from './Chart';
import { ClubLink } from '../../../entities/club';
import { divisionName } from '../../../entities/player';
import { compactMoney, number, seasonName } from '../../../presentation/format';
import { Money } from '../../../shared/ui/Money';
import {
  businessSign,
  finishText,
  honoursText,
  ownerSeasonRows,
  runsText,
  seasonListRows,
} from '../lib/recordEras';
import {
  eloDetail,
  eloStanding,
  leaguePositionDetail,
  pyramidPosition,
  type RatedClub,
} from '../lib/recordTrends';
import { Segments } from '../../../shared/ui/Segments';
import s from '../../../shared/ui/styles/App.module.css';
import t from './ClubTrends.module.css';

/** A chart plots major units, so a point carries its amount divided down. */
const plotted = (w: World, amount: string) =>
  Number(amount) / currency(clubOf(w).country, w.year).units;

/** A chart axis writes money in the app's notation (→WEB-67), back from the plotted major units. */
const axisMoney = (w: World, plot: number) => {
  const code = clubOf(w).country;
  return compactMoney(
    BigInt(Math.round(plot * currency(code, w.year).units)).toString(),
    code,
    w.year,
  );
};

/**
 * Every records chart's series with the line each season shows in its bubble, computed once per
 * closed season, division or display locale so moving over a chart never recomputes them. The club's
 * growth starts at the takeover: the seasons before it kept no own-club figures (→HIST-21).
 */
function trendSeries(w: World) {
  const club = clubOf(w),
    code = club.country,
    amount = (value: string) => compactMoney(value, code, w.year),
    seasons = ownSeasons(w),
    rated = seasons.filter((h) => h.elo !== undefined),
    valued = seasons.filter((h) => h.squadValue && h.clubValue);
  const series = (list: typeof seasons, values: number[], detail: (index: number) => string) => ({
    values,
    labels: list.map((h) => seasonName(h.year)),
    details: list.map((_, i) => detail(i)),
  });
  const squad = valued.map((h) => inTodayMoney(w, h.squadValue!, h.year)),
    clubValue = valued.map((h) => inTodayMoney(w, h.clubValue!, h.year)),
    cash = seasons.map((h) => inTodayMoney(w, h.cash, h.year));
  const bands: ChartBand[] = [
    {
      label: sourceMessage('copy.ClubTrends.6b66f78089'),
      tone: 'faint',
      lo: rated.map((h) => h.eloRange?.[0]),
      hi: rated.map((h) => h.eloRange?.[1]),
    },
    {
      label: sourceMessage('copy.ClubTrends.d8c6ce5a6e'),
      tone: 'strong',
      lo: rated.map((h) => h.eloRange?.[2]),
      hi: rated.map((h) => h.eloRange?.[3]),
    },
  ];
  return {
    axis: (value: number) => axisMoney(w, value),
    league: series(
      seasons,
      seasons.map((h) => pyramidPosition(code, h)),
      (i) => leaguePositionDetail(code, seasons, i, club.tier),
    ),
    elo: {
      ...series(
        rated,
        rated.map((h) => h.elo!),
        (i) => eloDetail(rated[i]),
      ),
      bands,
      unrated: seasons.length - rated.length,
      unranged: rated.filter((h) => !h.eloRange).length,
    },
    unvalued: seasons.length - valued.length,
    squad: series(
      valued,
      squad.map((value) => plotted(w, value)),
      (i) => `${seasonName(valued[i].year)} · ${amount(squad[i])}`,
    ),
    club: series(
      valued,
      clubValue.map((value) => plotted(w, value)),
      (i) => `${seasonName(valued[i].year)} · ${amount(clubValue[i])}`,
    ),
    fans: series(
      seasons,
      seasons.map((h) => h.fans),
      (i) =>
        sourceMessage('copy.ClubTrends.d4c90a70d9', {
          p0: seasonName(seasons[i].year),
          p1: number(seasons[i].fans),
        }),
    ),
    cash: series(
      seasons,
      cash.map((value) => plotted(w, value)),
      (i) => `${seasonName(seasons[i].year)} · ${amount(cash[i])}`,
    ),
  };
}

/** Our live Club Elo standing; it moves with every result, so only the clubs' ratings key it. */
export function useEloStanding(w: World) {
  return useMemo(() => eloStanding(w), [w.clubs, w.playerClub]);
}

/**
 * Where our Club Elo stands today (→HIST-12): the number alone says nothing, so it comes with the
 * world rank, the world's and our league's highest and lowest clubs and the gap to our league's
 * best, on a scale from the world's lowest to its highest.
 */
export function EloStanding({
  w,
  standing,
}: {
  w: World;
  standing: ReturnType<typeof eloStanding>;
}) {
  useTextLocale();
  const { elo, rank, total, world, league, gap } = standing;
  const span = Math.max(1, world.high.elo - world.low.elo),
    at = (value: number) => Math.min(100, Math.max(0, ((value - world.low.elo) / span) * 100));
  const clubs: [string, RatedClub][] = [
    [sourceMessage('copy.ClubTrends.75c9c24acc'), world.high],
    [sourceMessage('copy.ClubTrends.c963437ebb'), world.low],
    [sourceMessage('copy.ClubTrends.bd93348744'), league.high],
    [sourceMessage('copy.ClubTrends.6e2c4996c8'), league.low],
  ];
  return (
    <section className={s.eloStanding} aria-label={displayMessage('copy.ClubTrends.1c0d302530')}>
      <div className={s.eloFigures}>
        <div>
          <small>{richMessage('copy.ClubTrends.21685aad29')}</small>
          <strong>{localizeValue(elo)}</strong>
        </div>
        <div>
          <small>{richMessage('copy.ClubTrends.cd843762fc')}</small>
          <strong>{richMessage('copy.BallonDorView.5094d45cea', { p0: rank })}</strong>
          <small>{richMessage('copy.ClubTrends.6d32b95c7b', { p0: number(total) })}</small>
        </div>
        <div>
          <small>
            {localizeValue(
              gap
                ? sourceMessage('copy.ClubTrends.397eab83dc')
                : sourceMessage('copy.ClubTrends.af534b6786'),
            )}
          </small>
          <strong>
            {localizeValue(gap ? `−${-gap}` : sourceMessage('copy.ClubTrends.dbbcff36fe'))}
          </strong>
        </div>
      </div>
      <div className={s.eloScale} aria-hidden="true">
        <i
          style={{
            left: `${at(league.low.elo)}%`,
            width: `${Math.max(1, at(league.high.elo) - at(league.low.elo))}%`,
          }}
        />
        <b style={{ left: `${at(elo)}%` }} />
      </div>
      <div className={s.eloScaleEnds} aria-hidden="true">
        <span>{richMessage('copy.ClubTrends.b16d70e99d', { p0: world.low.elo })}</span>
        <span>
          {richMessage('copy.ClubTrends.1cc3e92f5b', {
            p0: `${league.low.elo}–${league.high.elo}`,
          })}
        </span>
        <span>{localizeValue(world.high.elo)}</span>
      </div>
      <dl className={s.eloClubs}>
        {localizeValue(
          clubs.map(([label, rated]) => (
            <div key={label}>
              <dt>{localizeValue(label)}</dt>
              <dd>
                <ClubLink w={w} id={rated.club.id} crest={14} />
                <b>{localizeValue(rated.elo)}</b>
              </dd>
            </div>
          )),
        )}
      </dl>
    </section>
  );
}

const TREND_METRICS = [
  ['league', sourceMessage('copy.ClubTrends.8d547a12d3')],
  ['elo', 'Elo'],
  ['squad', sourceMessage('copy.ClubTrends.837d4e5ad5')],
  ['club', sourceMessage('copy.ClubTrends.9aea64c2b7')],
  ['fans', sourceMessage('copy.ClubTrends.2070613ba9')],
  ['cash', sourceMessage('copy.AwaySummary.e397620205')],
] as const;
type TrendMetric = (typeof TREND_METRICS)[number][0];

/**
 * The records charts (→WEB-54), one at a time: league position in the pyramid, Club Elo against
 * the world's and our league's spread, squad and club value, supporters and season-end cash in
 * today's money.
 */
export function ClubTrends({ w }: { w: World }) {
  const locale = useTextLocale();
  const club = clubOf(w),
    code = club.country;
  const series = useMemo(() => trendSeries(w), [w.history, w.year, club.tier, locale]);
  const standing = useEloStanding(w);
  const [metric, setMetric] = useTaskState<TrendMetric>(w.id, 'growth-metric', () =>
    new URLSearchParams(location.search).get('part') === 'elo' ? 'elo' : 'league',
  );
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label={displayMessage('copy.ClubTrends.370413228d')}
          options={TREND_METRICS}
          value={metric}
          onChange={setMetric}
          wrap
        />
      </div>
      {localizeValue(
        metric === 'league' && (
          <Panel
            title={displayMessage('copy.ClubTrends.8d547a12d3')}
            note={sourceMessage('copy.ClubStaff.ceb2ec9df3', {
              p0: divisionName(code, club.tier, club.group),
            })}
          >
            <div className={s.panelBody}>
              <Chart
                label={displayMessage('copy.ClubTrends.98cc96f48e')}
                inverse
                values={series.league.values}
                labels={series.league.labels}
                format={(value) =>
                  sourceMessage('copy.BallonDorView.5094d45cea', { p0: Math.round(value) })
                }
                detail={(i) => series.league.details[i]}
              />
              <p className={s.muted}>
                {richMessage('copy.ClubTrends.916a3ece1a', { p0: country(code).name })}
              </p>
            </div>
          </Panel>
        ),
      )}
      {localizeValue(
        metric === 'elo' && (
          <Panel
            title={displayMessage('copy.ClubTrends.14e4f1a04e')}
            note={sourceMessage('copy.ClubTrends.84c355f838', {
              p0: standing.elo,
              p1: standing.rank,
            })}
          >
            <div className={s.panelBody}>
              <Chart
                label={displayMessage('copy.ClubTrends.1b416348cd')}
                values={series.elo.values}
                labels={series.elo.labels}
                bands={series.elo.bands}
                format={(value) => String(Math.round(value))}
                detail={(i) => series.elo.details[i]}
              />
              {localizeValue(
                series.elo.unrated > 0 && (
                  <p className={s.muted}>
                    {richMessage('copy.ClubTrends.7ceef984e5', { p0: series.elo.unrated })}
                  </p>
                ),
              )}
              {localizeValue(
                series.elo.unranged > 0 && (
                  <p className={s.muted}>
                    {richMessage('copy.ClubTrends.1bd7bed943', { p0: series.elo.unranged })}
                  </p>
                ),
              )}
              <EloStanding w={w} standing={standing} />
              <p className={s.muted}>{richMessage('copy.ClubTrends.472acb8bec')}</p>
            </div>
          </Panel>
        ),
      )}
      {localizeValue(
        metric === 'squad' && (
          <Panel
            title={displayMessage('copy.ClubTrends.837d4e5ad5')}
            note={sourceMessage('copy.ClubTrends.2670bb8d4c')}
          >
            <div className={s.panelBody}>
              <Chart
                label={displayMessage('copy.ClubTrends.878b88665f')}
                values={series.squad.values}
                labels={series.squad.labels}
                format={series.axis}
                detail={(i) => series.squad.details[i]}
              />
              <p className={s.muted}>
                {richMessage('copy.ClubTrends.aefa2a2106', {
                  p0:
                    series.unvalued > 0 &&
                    sourceMessage('copy.ClubTrends.d8516d8f3b', { p0: series.unvalued }),
                })}
              </p>
            </div>
          </Panel>
        ),
      )}
      {localizeValue(
        metric === 'club' && (
          <Panel
            title={displayMessage('copy.ClubTrends.9aea64c2b7')}
            note={sourceMessage('copy.ClubTrends.2670bb8d4c')}
          >
            <div className={s.panelBody}>
              <Chart
                label={displayMessage('copy.ClubTrends.91dd8e4981')}
                values={series.club.values}
                labels={series.club.labels}
                format={series.axis}
                detail={(i) => series.club.details[i]}
              />
              <p className={s.muted}>
                {richMessage('copy.ClubTrends.df4b3478fb', {
                  p0:
                    series.unvalued > 0 &&
                    sourceMessage('copy.ClubTrends.d8516d8f3b', { p0: series.unvalued }),
                })}
              </p>
            </div>
          </Panel>
        ),
      )}
      {localizeValue(
        metric === 'fans' && (
          <Panel title={displayMessage('copy.ClubTrends.b5648588cc')}>
            <div className={s.panelBody}>
              <Chart
                label={displayMessage('copy.ClubTrends.2070613ba9')}
                values={series.fans.values}
                labels={series.fans.labels}
                detail={(i) => series.fans.details[i]}
              />
            </div>
          </Panel>
        ),
      )}
      {localizeValue(
        metric === 'cash' && (
          <Panel title={displayMessage('copy.ClubTrends.31a8d6cbae')}>
            <div className={s.panelBody}>
              <Chart
                label={displayMessage('copy.ClubTrends.ac4ecd5b04')}
                values={series.cash.values}
                labels={series.cash.labels}
                format={series.axis}
                detail={(i) => series.cash.details[i]}
              />
              <p className={s.muted}>{richMessage('copy.ClubTrends.13f9a892bd')}</p>
            </div>
          </Panel>
        ),
      )}
    </>
  );
}

/** 시즌별 기록's two column groups over the same rows (→WEB-54). */
const SEASON_VIEWS = [
  ['rank', sourceMessage('copy.ClubTrends.b2e64f0c17')],
  ['finance', sourceMessage('copy.ClubTrends.c8a1d93e45')],
] as const;
type SeasonView = (typeof SEASON_VIEWS)[number][0];

/**
 * 시즌별 기록 (→WEB-54): the club's whole history in one newest-first table. The current season
 * leads, then the owner's closed seasons; a rule names the takeover season above the bought club's
 * seasons before the owner, which open no review (→HIST-21). A 순위/재정 switch shows the club's
 * figures or the owner's record of each close (→OWNER-17) over the same rows; a founded career has
 * no owner and no switch. With `onSeason` an owned row opens that season.
 */
export function SeasonTable({
  w,
  onSeason,
  preOwner,
}: {
  w: World;
  onSeason?: (year: number) => void;
  preOwner?: readonly PreOwnerSeason[];
}) {
  useTextLocale();
  const code = clubOf(w).country,
    owner = w.owner,
    seasons = ownSeasons(w),
    before = (owner && preOwner) || [],
    records = new Map(ownerSeasonRows(owner).map((record) => [record.year, record]));
  const [limit, setLimit] = useTaskState(w.id, 'record-season-limit', 49);
  const [chosen, setView] = useTaskState<SeasonView>(w.id, 'record-season-view', 'rank');
  const finance = !!owner && chosen === 'finance';
  const { rows, remaining } = seasonListRows(seasons, before, owner?.takeover.year, limit);
  const money = (value: string, year: number) => <Money value={value} code={code} year={year} />;
  const dashes = (count: number) => Array.from({ length: count }, (_, i) => <td key={i}>—</td>);
  /** The owner's record of a close under 재정; dashes for a season without one. */
  const ownerCells = (record: OwnerSeasonRecord | undefined) =>
    record ? (
      <>
        <td data-label={sourceMessage('shell.fortune')}>
          {localizeValue(money(record.fortune, record.year))}
        </td>
        <td data-label={sourceMessage('copy.OwnerEras.7b3733aab2')}>
          {localizeValue(businessSign(record))}
          {localizeValue(money(record.business, record.year))}
        </td>
        <td data-label={sourceMessage('copy.OwnerEras.ef04fe60f2')}>
          {localizeValue(money(record.living, record.year))}
        </td>
        <td data-label={sourceMessage('copy.OwnerEras.64a6c964ab')}>
          {localizeValue(money(record.injected, record.year))}
        </td>
        <td data-label={sourceMessage('copy.OwnerEras.176494aa44')}>
          {localizeValue(money(record.dividend, record.year))}
        </td>
        <td data-label={sourceMessage('copy.ClubOverview.27bdec9180')}>
          {localizeValue(Math.round(record.fanMood))}
        </td>
      </>
    ) : (
      dashes(6)
    );
  const note = before.length
    ? sourceMessage('copy.ClubTrends.5e0b7a91c4', {
        p0: seasons.length,
        p1: before.length,
        p2: honoursText(honoursBeforeOwner(before)),
      })
    : sourceMessage('copy.BallonDorView.3585c2642b', { p0: seasons.length });
  return (
    <>
      {localizeValue(
        owner && (
          <div className={s.recordControls}>
            <Segments
              label={displayMessage('copy.ClubTrends.e7f05a2b19')}
              options={SEASON_VIEWS}
              value={chosen}
              onChange={setView}
            />
          </div>
        ),
      )}
      <Panel title={displayMessage('copy.ClubTrends.f402b0218e')} note={note}>
        <div className={s.tableWrap}>
          <table
            className={t.seasonHistory}
            role="table"
            aria-label={displayMessage('copy.ClubTrends.f402b0218e')}
          >
            <thead>
              <tr>
                <th scope="col">{richMessage('copy.ClubTrends.a3142392a3')}</th>
                {localizeValue(
                  finance ? (
                    <>
                      <th scope="col">{richMessage('shell.fortune')}</th>
                      <th scope="col">{richMessage('copy.OwnerEras.7b3733aab2')}</th>
                      <th scope="col">{richMessage('copy.OwnerEras.ef04fe60f2')}</th>
                      <th scope="col">{richMessage('copy.OwnerEras.64a6c964ab')}</th>
                      <th scope="col">{richMessage('copy.OwnerEras.176494aa44')}</th>
                      <th scope="col">{richMessage('copy.ClubOverview.27bdec9180')}</th>
                    </>
                  ) : (
                    <>
                      <th scope="col">{richMessage('navigation.league')}</th>
                      <th scope="col">{richMessage('copy.ClubTrends.e8fd75919a')}</th>
                      <th scope="col">{richMessage('copy.ClubTrends.cf5a6ab3e0')}</th>
                      <th scope="col">{richMessage('copy.ClubTrends.fbd742149e')}</th>
                      <th scope="col">
                        {richMessage('copy.ClubTrends.04da029e77', {
                          p0: (
                            <span className={t.valueScope}>
                              {richMessage('copy.ClubTrends.c111372590')}
                            </span>
                          ),
                          p1: (
                            <span className={t.valueBasis}>
                              {richMessage('copy.ClubTrends.7a70ccf2b0')}
                            </span>
                          ),
                        })}
                      </th>
                    </>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              <tr
                className={`${t.currentSeason} ${onSeason ? s.seasonRow : ''}`}
                aria-current="true"
                onClick={onSeason && (() => onSeason(w.year))}
              >
                <td>
                  <button
                    data-ui="link"
                    type="button"
                    className={s.seasonRowLink}
                    aria-label={displayMessage('copy.ClubTrends.16c1b9fa93', {
                      p0: seasonName(w.year),
                    })}
                    aria-description={displayMessage('copy.ClubTrends.8e03ed8a86')}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSeason?.(w.year);
                    }}
                  >
                    <span className={t.cellText}>{localizeValue(seasonName(w.year))}</span>
                  </button>
                </td>
                {localizeValue(
                  finance ? (
                    <>
                      <td data-label={sourceMessage('shell.fortune')}>
                        {localizeValue(money(owner!.fortune, w.year))}
                      </td>
                      {localizeValue(dashes(4))}
                      <td data-label={sourceMessage('copy.ClubOverview.27bdec9180')}>
                        {localizeValue(Math.round(owner!.fanMood))}
                      </td>
                    </>
                  ) : (
                    <>
                      <td data-label={sourceMessage('navigation.league')}>
                        <span
                          className={t.cellText}
                          title={localizeValue(divisionName(code, clubOf(w).tier, clubOf(w).group))}
                        >
                          {localizeValue(divisionName(code, clubOf(w).tier, clubOf(w).group))}
                        </span>
                      </td>
                      <td data-label={sourceMessage('copy.ClubTrends.e8fd75919a')}>
                        {localizeValue(w.tables[w.playerClub]?.points ?? 0)}
                      </td>
                      <td data-label={sourceMessage('copy.ClubTrends.cf5a6ab3e0')}>—</td>
                      <td data-label="Elo">{localizeValue(clubOf(w).elo?.toFixed(0) ?? '—')}</td>
                      <td data-label={sourceMessage('copy.ClubTrends.3df7710039')}>—</td>
                    </>
                  ),
                )}
              </tr>
              {localizeValue(
                rows.map((row) =>
                  row.kind === 'takeover' ? (
                    <tr key="takeover" className={t.takeoverRule}>
                      <th scope="rowgroup" colSpan={finance ? 7 : 6}>
                        <span>
                          {richMessage('copy.ClubTrends.9d41c2e6a8', { p0: seasonName(row.year) })}
                        </span>
                      </th>
                    </tr>
                  ) : row.kind === 'before' ? (
                    <tr key={`before-${row.season.year}`} className={t.beforeOwner}>
                      <td>
                        <span className={t.cellText}>
                          {localizeValue(seasonName(row.season.year))}
                        </span>
                      </td>
                      {localizeValue(
                        finance ? (
                          dashes(6)
                        ) : (
                          <>
                            <td data-label={sourceMessage('navigation.league')}>
                              <span className={t.cellText}>
                                {localizeValue(finishText(code, row.season))}
                              </span>
                            </td>
                            <td data-label={sourceMessage('copy.ClubTrends.e8fd75919a')}>—</td>
                            <td data-label={sourceMessage('copy.ClubTrends.cf5a6ab3e0')}>
                              <span className={t.cellText}>
                                {localizeValue(runsText(row.season.runs))}
                              </span>
                            </td>
                            <td data-label="Elo">—</td>
                            <td data-label={sourceMessage('copy.ClubTrends.3df7710039')}>—</td>
                          </>
                        ),
                      )}
                    </tr>
                  ) : (
                    <OwnedSeasonRow
                      key={row.season.year}
                      w={w}
                      h={row.season}
                      onSeason={onSeason}
                      finance={finance ? ownerCells(records.get(row.season.year)) : undefined}
                    />
                  ),
                ),
              )}
            </tbody>
          </table>
          {localizeValue(
            remaining > 0 && (
              <button type="button" onClick={() => setLimit(limit + 50)}>
                {richMessage('copy.ClubTrends.fbea915f3f', { p0: remaining })}
              </button>
            ),
          )}
          {localizeValue(
            !seasons.length && !before.length && (
              <div className={s.empty}>{richMessage('copy.ClubTrends.82338e0d4b')}</div>
            ),
          )}
        </div>
      </Panel>
    </>
  );
}

/**
 * A closed season of the club's own: its finish, points, cup runs, Elo and squad value, or under
 * 재정 the owner's record of its close (`finance`).
 */
function OwnedSeasonRow({
  w,
  h,
  onSeason,
  finance,
}: {
  w: World;
  h: ReturnType<typeof ownSeasons>[number];
  onSeason?: (year: number) => void;
  finance?: ReactNode;
}) {
  const code = clubOf(w).country;
  return (
    <tr
      className={onSeason ? s.seasonRow : undefined}
      onClick={onSeason && (() => onSeason(h.year))}
    >
      <td>
        {localizeValue(
          onSeason ? (
            <button
              data-ui="link"
              type="button"
              className={s.seasonRowLink}
              aria-label={displayMessage('copy.ClubTrends.16c1b9fa93', {
                p0: seasonName(h.year),
              })}
              onClick={(event) => {
                event.stopPropagation();
                onSeason(h.year);
              }}
            >
              <span className={t.cellText}>{localizeValue(seasonName(h.year))}</span>
            </button>
          ) : (
            seasonName(h.year)
          ),
        )}
      </td>
      {localizeValue(
        finance ?? (
          <>
            <td data-label={sourceMessage('navigation.league')}>
              <span
                className={t.cellText}
                title={displayMessage('copy.CareerRecordBook.2df6533b51', {
                  p0: divisionName(code, h.tier, h.group),
                  p1: h.rank,
                })}
              >
                {richMessage('copy.CareerRecordBook.58e3ce05f8', {
                  p0: divisionName(code, h.tier, h.group),
                  p1: h.rank,
                })}
              </span>
            </td>
            <td data-label={sourceMessage('copy.ClubTrends.e8fd75919a')}>
              <span
                className={t.cellText}
                title={localizeValue(`${h.points} (${h.won}-${h.drawn}-${h.lost})`)}
              >
                {localizeValue(h.points)} ({localizeValue(h.won)}-{localizeValue(h.drawn)}-
                {localizeValue(h.lost)})
              </span>
            </td>
            <td data-label={sourceMessage('copy.ClubTrends.cf5a6ab3e0')}>
              <span className={t.cellText}>{localizeValue(runsText(h.runs))}</span>
            </td>
            <td data-label="Elo">
              <span className={t.cellText}>
                {localizeValue(
                  h.elo !== undefined
                    ? `${Math.round(h.elo)}${h.eloRank ? sourceMessage('copy.ClubTrends.631b514ecd', { p0: h.eloRank }) : ''}`
                    : '—',
                )}
              </span>
            </td>
            <td data-label={sourceMessage('copy.ClubTrends.3df7710039')}>
              {localizeValue(
                h.squadValue ? (
                  <Money value={inTodayMoney(w, h.squadValue, h.year)} code={code} year={w.year} />
                ) : (
                  '—'
                ),
              )}
            </td>
          </>
        ),
      )}
    </tr>
  );
}
