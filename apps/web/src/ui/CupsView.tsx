import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { COMPETITION_PATHS, competitionRoute, selectedYear } from './competitionNavigation';
import { Select } from './Select';
import { cupSeasons, LINEAGES, lineageName } from './cupCompetitions';
import { SeasonStepper } from './SeasonStepper';
import { useCupRequest, useNavigation } from './state';
import { useTaskMemory, useTaskState } from './taskMemory';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  EuropeTournament,
  Fixture,
  KnockoutRound,
  World,
} from '../../../../packages/contracts/src/types';
import { COUNTRIES } from '../../../../packages/catalogs/src/index';
import { clubOf, ownSeasons } from '../../../../packages/engine/src/player-state';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { cupKey, domesticCupName } from '../../../../packages/engine/src/competition-keys';
import { ownReached } from '../../../../packages/engine/src/knockout';
import { phaseGroups } from '../../../../packages/engine/src/europe';
import { emptyTable } from '../../../../packages/engine/src/league-fixtures';
import type { GameClient } from '../runtime/client';
import { Bracket, Club } from './Bracket';
import { number, seasonName } from './format';
import { orderIds } from './league';
import { replaceQuery, useAddressTab } from './PageTabs';
import { CompetitionHeader } from './CompetitionTabs';
import s from './App.module.css';
import c from './CupsView.module.css';

/**
 * History is the heaviest and least visited tab, so its code loads on first opening instead of
 * with the app (ARCH-28 entry budget). A failed load says so instead of breaking the page.
 */
const CupHistory = lazy(() =>
  import('./CupHistory')
    .then((module) => ({ default: module.CupHistory }))
    .catch(() => ({ default: CupHistoryUnavailable })),
);
function CupHistoryUnavailable() {
  useTextLocale();
  return (
    <p className={s.muted} role="alert">
      {richMessage('copy.CupsView.44970e2b8c')}
    </p>
  );
}

const nameOf = (w: World, id?: string) => w.clubs.find((club) => club.id === id)?.name ?? '—';

/** A league-phase or group table with its qualification zones. */
function PhaseTable({
  w,
  t,
  ids,
  zones,
  title,
}: {
  w: World;
  t: EuropeTournament;
  ids: string[];
  zones: { until: number; tone: 'direct' | 'playoff' | 'out'; label: string }[];
  title?: string;
}) {
  useTextLocale();
  const [all, setAll] = useState(ids.length <= 8);
  const sorted = orderIds(ids, t.standings);
  const zoneOf = (rank: number) => zones.find((zone) => rank <= zone.until);
  return (
    <section className={c.phase}>
      {localizeValue(title && <h4>{localizeValue(title)}</h4>)}
      <table
        className={c.table}
        aria-label={localizeValue(
          title || sourceMessage('copy.CupsView.a12851cbff', { p0: t.name }),
        )}
      >
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
            <th scope="col">{richMessage('copy.LabPage.e56314e9a1')}</th>
            <th scope="col">{richMessage('copy.CupsView.24734975b3')}</th>
            <th scope="col">{richMessage('copy.ClubTrends.e8fd75919a')}</th>
          </tr>
        </thead>
        <tbody>
          {localizeValue(
            sorted.map((id, i) => {
              if (!all && i >= 8 && id !== w.playerClub) return null;
              const row = t.standings[id] || emptyTable();
              const zone = zoneOf(i + 1);
              return (
                <tr
                  key={id}
                  className={`${zone ? c[zone.tone] : ''} ${id === w.playerClub ? c.ownRow : ''}`}
                >
                  <td>{localizeValue(i + 1)}</td>
                  <td>
                    <Club w={w} id={id} />
                  </td>
                  <td>{localizeValue(row.played)}</td>
                  <td>
                    {localizeValue(row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga)}
                  </td>
                  <td>
                    <b>{localizeValue(row.points)}</b>
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
      {localizeValue(
        !all && (
          <button className={c.more} onClick={() => setAll(true)}>
            {richMessage('copy.CupsView.d2ed9ef17c', { p0: sorted.length })}
          </button>
        ),
      )}
      <p className={c.legend}>
        {localizeValue(
          zones
            .filter((zone) => zone.tone !== 'out')
            .map((zone) => (
              <span key={zone.label}>
                <i className={c[zone.tone]} /> {localizeValue(zone.label)}
              </span>
            )),
        )}
      </p>
    </section>
  );
}

/** Our standing in one competition, in one line a fan would say. */
function ownStatus(w: World, rounds: KnockoutRound[], fixtures: Fixture[], entered: boolean) {
  if (!entered) return sourceMessage('copy.CupsView.da7446747c');
  const reached = ownReached(w, rounds);
  const next = fixtures
    .filter((f) => !f.score && (f.home === w.playerClub || f.away === w.playerClub))
    .sort((a, b) => a.round - b.round)[0];
  if (reached?.champion) return sourceMessage('copy.CupsView.db1f9c8207');
  if (reached?.eliminated) return sourceMessage('copy.CupsView.9f7893bf1b', { p0: reached.label });
  if (next) {
    const home = next.home === w.playerClub;
    return sourceMessage('copy.CupsView.f8919d83e6', {
      p0: reached ? `${reached.label} · ` : '',
      p1: home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
      p2: nameOf(w, home ? next.away : next.home),
      p3: fixtureDate(w, next).replace(/^\d+년 /, ''),
    });
  }
  return reached
    ? sourceMessage('copy.CupsView.af7f979579', { p0: reached.label })
    : sourceMessage('copy.CupsView.1d707efef1');
}

function DomesticCup({ w, countryCode }: { w: World; countryCode: string }) {
  useTextLocale();
  const cup = w.cups?.find((entry) => entry.country === countryCode);
  const name = cup?.name ?? domesticCupName(countryCode);
  // Our titles from the takeover on; the club's before it stand in 시즌별 기록 (→HIST-21).
  const titles = ownSeasons(w).filter((h) =>
    h.champions.some((entry) => entry.country === countryCode && entry.cup === w.playerClub),
  ).length;
  if (!cup)
    return (
      <section data-surface="panel" className={c.card}>
        <h3>{localizeValue(name)}</h3>
        <p className={s.muted}>{richMessage('copy.CupsView.f8178ff03f')}</p>
      </section>
    );
  const entered = cup.clubs.includes(w.playerClub);
  return (
    <section data-surface="panel" className={c.card} aria-label={localizeValue(name)}>
      <header className={c.cardHead}>
        <div>
          <h3>{localizeValue(name)}</h3>
          <small>
            {richMessage('copy.CupsView.29de4ca33a', {
              p0: seasonName(w.year),
              p1: cup.clubs.length,
              p2: titles,
            })}
          </small>
        </div>
        {localizeValue(
          cup.winner && (
            <span className={c.winnerPill}>
              {richMessage('copy.CupsView.92186534a7', { p0: <Club w={w} id={cup.winner} /> })}
            </span>
          ),
        )}
      </header>
      <p data-ui="notice" className={c.status}>
        {localizeValue(ownStatus(w, cup.rounds, cup.fixtures, entered))}
      </p>
      <Bracket
        w={w}
        rounds={cup.rounds}
        fixtures={cup.fixtures}
        competition={cupKey(cup.country)}
      />
      <p className={c.note}>{richMessage('copy.CupsView.f55bc7c053')}</p>
    </section>
  );
}

function Continental({ w, t }: { w: World; t: EuropeTournament }) {
  useTextLocale();
  const entered = t.clubs.includes(w.playerClub);
  const rounds = t.rounds || [];
  const groups = phaseGroups(t, 'phase');
  const second = phaseGroups(t, 'second');
  const qualifyPerGroup = t.field === 40 ? 3 : t.field === 16 || t.field >= 32 ? 2 : 1;
  const status = !entered
    ? sourceMessage('copy.CupsView.ed7c0a33cf')
    : t.winner === w.playerClub
      ? sourceMessage('copy.CupsView.db1f9c8207')
      : (t.ownExit ?? ownStatus(w, rounds, t.fixtures, true));
  return (
    <section data-surface="panel" className={c.card} aria-label={localizeValue(t.name)}>
      <header className={c.cardHead}>
        <div>
          <h3>{localizeValue(t.name)}</h3>
          <small>
            {richMessage('copy.CupsView.796d2e3d6f', {
              p0: seasonName(w.year),
              p1: t.field,
              p2: ' ',
              p3:
                t.format === 'league'
                  ? sourceMessage('copy.CupsView.d5fbab72fc', { p0: t.games })
                  : t.format === 'knockout'
                    ? sourceMessage('copy.CupsView.ef098a0928')
                    : t.format === 'double-groups'
                      ? sourceMessage('copy.CupsView.15f2422ac9')
                      : sourceMessage('copy.competitionLabels.6fcd805067'),
              p4: ' ',
              p5: t.stage,
            })}
          </small>
        </div>
        {localizeValue(
          t.winner && (
            <span className={c.winnerPill}>
              {richMessage('copy.CupsView.92186534a7', { p0: <Club w={w} id={t.winner} /> })}
            </span>
          ),
        )}
      </header>
      <p data-ui="notice" className={c.status}>
        {localizeValue(status)}
      </p>
      {localizeValue(
        entered && (
          <p className={c.note}>
            {richMessage('copy.CupsView.42a11efd24', {
              p0: t.ownQualification || sourceMessage('copy.CupsView.c558fe06c5'),
            })}
          </p>
        ),
      )}
      {localizeValue(
        w.year >= 2021 ? (
          <p className={c.note}>{richMessage('copy.CupsView.225141dccf')}</p>
        ) : (
          <p className={c.note}>{richMessage('copy.CupsView.bdcc9e00c9')}</p>
        ),
      )}
      <Bracket w={w} rounds={rounds} fixtures={t.fixtures} competition={t.key} />
      {localizeValue(
        second.length > 0 &&
          second.map((ids, g) => (
            <PhaseTable
              key={`second-${g}`}
              w={w}
              t={t}
              ids={ids}
              title={displayMessage('copy.CupsView.4b3753d6eb', {
                p0: String.fromCharCode(65 + g),
              })}
              zones={[
                { until: 2, tone: 'direct', label: sourceMessage('copy.CupsView.b9ebd2b40a') },
              ]}
            />
          )),
      )}
      {localizeValue(
        t.format === 'league' && groups.length > 0 && (
          <PhaseTable
            w={w}
            t={t}
            ids={groups.flat()}
            title={displayMessage('copy.CupsView.8ed5f595c5')}
            zones={[
              { until: 8, tone: 'direct', label: sourceMessage('copy.CupsView.1b5c93d2fe') },
              { until: 24, tone: 'playoff', label: sourceMessage('copy.CupsView.a10563ea80') },
              { until: 36, tone: 'out', label: sourceMessage('copy.CupsView.4084035433') },
            ]}
          />
        ),
      )}
      {localizeValue(
        t.format !== 'league' && groups.length > 0 && (
          <div className={c.groups}>
            {localizeValue(
              groups.map((ids, g) => (
                <PhaseTable
                  key={g}
                  w={w}
                  t={t}
                  ids={ids}
                  title={displayMessage('copy.CupsView.64eac0cbe9', {
                    p0: String.fromCharCode(65 + g),
                  })}
                  zones={[
                    {
                      until: qualifyPerGroup,
                      tone: 'direct',
                      label: sourceMessage('copy.CupsView.d956efd5d2'),
                    },
                  ]}
                />
              )),
            )}
          </div>
        ),
      )}
    </section>
  );
}

/** Cups: the domestic cup and the continental club competitions, live and in history (→WEB-40). */
export function CupsView({
  w,
  coefficient,
  client,
}: {
  w: World;
  coefficient: number;
  client: GameClient;
}) {
  useTextLocale();
  const page = useNavigation((state) => state.page);
  const activePage = page === 'europe' || page === 'cupHistory';
  const context = page === 'cupHistory' ? 'cupHistory' : 'europe';
  const period = context === 'cupHistory' ? 'history' : 'current';
  const countries = COUNTRIES.map((entry) => [entry.code, entry.name] as const);
  const [countryCode, setCountry] = useAddressTab('country', countries, clubOf(w).country, {
    world: w.id,
    key: `${context}-country`,
    path: COMPETITION_PATHS[context],
  });
  const tabs = [
    ['cup', domesticCupName(countryCode)],
    ...LINEAGES.map((lineage) => [lineage.key, lineageName(w, lineage)] as const),
  ] as const;
  // The page stays mounted while hidden; the address carries the competition and period in full.
  const [tab, setTab] = useAddressTab('cup', tabs, 'cup', {
    world: w.id,
    key: `${context}-tab`,
    path: COMPETITION_PATHS[context],
    keepFirst: true,
  });
  const [year, setYear] = useTaskState<number | undefined>(w.id, `${context}-year-${tab}`, () =>
    competitionRoute(location.pathname, location.search)?.page === context
      ? selectedYear(new URLSearchParams(location.search))
      : undefined,
  );
  const entered = useRef('');
  const entering = activePage && entered.current !== context;
  useLayoutEffect(() => {
    if (entering) {
      entered.current = context;
      setYear(selectedYear(new URLSearchParams(location.search)));
    }
    if (!activePage) entered.current = '';
  });
  const request = useCupRequest((store) => store.request);
  useEffect(() => {
    if (!activePage || !request) return;
    // Set the requested competition's retained year directly before switching the key.
    useTaskMemory.getState().activate(w.id);
    const state = useTaskMemory.getState();
    useTaskMemory.setState({
      values: {
        ...state.values,
        [`${context}-year-${request.competition}`]:
          request.year === w.year ? undefined : request.year,
      },
    });
    useCupRequest.getState().take();
    setTab(request.competition);
    if (request.competition === 'cup') setCountry(clubOf(w).country);
  }, [request, w.id, w.year, setTab, setCountry, context, activePage]);
  useEffect(() => {
    if (!activePage || entering) return;
    replaceQuery((params) => {
      if (period === 'history' && year !== undefined) params.set('season', String(year));
      else params.delete('season');
    });
  }, [period, year, activePage, entering]);
  useEffect(() => {
    // Back and forward also bring the season that competition showed.
    const restore = () => {
      if (competitionRoute(location.pathname, location.search)?.page !== context) return;
      const params = new URLSearchParams(location.search),
        saved = params.get('cup'),
        picked = Number(params.get('season'));
      if (!saved) return;
      useTaskMemory.getState().activate(w.id);
      const state = useTaskMemory.getState();
      useTaskMemory.setState({
        values: {
          ...state.values,
          [`${context}-year-${saved}`]: Number.isInteger(picked) && picked > 0 ? picked : undefined,
        },
      });
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('tasknavigate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('tasknavigate', restore);
    };
  }, [w.id, context]);
  const active = tabs.some(([id]) => id === tab) ? tab : 'cup';
  const tournament = w.europe.find((t) => t.key === active);
  const lineage = LINEAGES.find((entry) => entry.key === active);
  // The stepper runs over the seasons this competition has a record for, then this season.
  const closed = cupSeasons(w.history, countryCode, active),
    years = [...closed, w.year];
  // A season chosen for another competition stays only when this one has a record for it.
  const pastYear = year !== undefined && closed.includes(year) ? year : closed.at(-1);
  const shownYear = period === 'current' ? w.year : (pastYear ?? w.year);
  // An address or another competition's season this one has no record for settles on its latest,
  // once the entry has read the address's season.
  useEffect(() => {
    if (period !== 'history' || !activePage || entering) return;
    if (pastYear !== undefined && pastYear !== year) setYear(pastYear);
  }, [period, activePage, entering, pastYear, year, setYear]);
  // One select names every domestic cup by its country and every continental lineage.
  const choice = active === 'cup' ? cupKey(countryCode) : active;
  const choose = (value: string) => {
    if (!value.startsWith('cup:')) return setTab(value);
    setTab('cup');
    setCountry(value.slice(4));
  };
  // A closed season opens in the history page, this season in the live one, the competition kept.
  const pickYear = (next: number) => {
    if (period === 'history' && next !== w.year) return setYear(next);
    if (period === 'current' && next === w.year) return;
    const target = next === w.year ? 'europe' : 'cupHistory';
    const params = new URLSearchParams(COMPETITION_PATHS[target].split('?')[1]);
    params.set('cup', active);
    if (active === 'cup' && countryCode !== clubOf(w).country) params.set('country', countryCode);
    if (target === 'cupHistory') params.set('season', String(next));
    useTaskMemory.setState((memory) => ({
      addresses: {
        ...memory.addresses,
        [target]: `${COMPETITION_PATHS[target].split('?')[0]}?${params}`,
      },
    }));
    useNavigation.getState().setPage(target);
  };
  return (
    <>
      <div className={c.navigation} data-ui="toolbar">
        <CompetitionHeader page={context}>
          <div className={s.competitionFilters}>
            <Select
              aria-label={displayMessage('copy.ClubTrends.cf5a6ab3e0')}
              value={choice}
              onValueChange={choose}
            >
              <optgroup label={displayMessage('copy.competitionLabels.0efd8e1c18')}>
                {localizeValue(
                  countries.map(([code]) => (
                    <option key={code} value={cupKey(code)}>
                      {localizeValue(domesticCupName(code))}
                    </option>
                  )),
                )}
              </optgroup>
              <optgroup label={displayMessage('copy.competitionLabels.c31822375c')}>
                {localizeValue(
                  LINEAGES.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {localizeValue(lineageName(w, entry))}
                    </option>
                  )),
                )}
              </optgroup>
            </Select>
          </div>
          <SeasonStepper years={years} value={shownYear} current={w.year} onChange={pickYear} />
        </CompetitionHeader>
      </div>
      <div
        id="cup-competition-panel"
        role="region"
        aria-label={localizeValue(
          period === 'current'
            ? sourceMessage('copy.CupsView.3c94277f5a')
            : sourceMessage('copy.CupsView.ab8db33b32'),
        )}
      >
        {localizeValue(
          period === 'current' && (
            <p className={s.muted}>
              {richMessage('copy.CupsView.94cbe96327', { p0: number(coefficient) })}
            </p>
          ),
        )}
        {localizeValue(
          period === 'current' && active === 'cup' && (
            <DomesticCup w={w} countryCode={countryCode} />
          ),
        )}
        {localizeValue(
          period === 'current' && tournament && (
            <Continental key={tournament.key} w={w} t={tournament} />
          ),
        )}
        {localizeValue(
          period === 'current' && active !== 'cup' && !tournament && (
            <p className={s.panelBody}>
              {localizeValue(
                lineage && w.year < lineage.founded
                  ? sourceMessage('copy.CupHistory.04d903605d', { p0: seasonName(lineage.founded) })
                  : sourceMessage('copy.CupsView.e7ffbf1093'),
              )}
            </p>
          ),
        )}
        {localizeValue(
          period === 'history' && (
            <Suspense
              fallback={
                <p className={s.muted} role="status">
                  {richMessage('copy.CupsView.b6ce681473')}
                </p>
              }
            >
              <CupHistory
                key={`${active}-${countryCode}`}
                countryCode={countryCode}
                w={w}
                client={client}
                competition={active}
                picked={pastYear}
                onYear={setYear}
              />
            </Suspense>
          ),
        )}
      </div>
      <p className={s.muted}>{richMessage('copy.CupsView.42c1c25a33')}</p>
    </>
  );
}
