import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { useLocale } from '../presentation/react';
import type { ClientState, GameClient } from '../runtime/client';
import { seasonName } from './format';
import { Money } from './Money';
import { OvrBadge } from './OvrBadge';
import { replaceQuery, TabList, TabPanel, useAddressTab } from './PageTabs';
import { PersonCareer } from './PersonCareer';
import { PositionBadge } from './PositionBadge';
import { StaffRoleBadge } from './StaffRoleBadge';
import { Select } from './Select';
import { openAcademyProspect, openPersonnel, openTeam, usePlayerSheet } from './state';
import {
  ACADEMY_SORTS,
  academyRows,
  COACH_SORTS,
  coachRows,
  firstTeamRows,
  listCoaches,
  listPlayers,
  PLAYER_SORTS,
  type AcademySort,
  type CoachSort,
  type PlayerSort,
  type TeamCoachRow,
  type TeamPlayerRow,
} from './teamRows';
import { owningTeamView, TEAM_PATH, TEAM_VIEWS, type TeamView } from './teamNavigation';
import { taskAddress, useTaskMemory, useTaskState } from './taskMemory';
import market from './RecruitmentDesk.module.css';
import s from './TeamDirectory.module.css';

/** The detailed working page each list's management link opens (→WEB-43/112). */
const MANAGE = {
  players: () => openPersonnel({ page: 'firstTeam', view: 'players' }),
  academy: () => openPersonnel({ page: 'academy' }),
  coaches: () => openPersonnel({ page: 'staff', view: 'coaches' }),
} satisfies Record<TeamView, () => void>;

/**
 * 팀 (→WEB-112): our first team, academy and coaches as compact rows at the transfer market's
 * density, each tab keeping its own search, sort and scroll for this career. Names open the
 * player inspector, a prospect's academy review or a coach's career; the named management links
 * open the illustrated detailed workflows. Reading the lists issues no command.
 */
export function TeamDirectory({ state, client }: { state: ClientState; client: GameClient }) {
  const { t } = useLocale();
  const w = state.view!.world;
  const [view, setView] = useAddressTab<TeamView>('view', TEAM_VIEWS, 'players', {
    world: w.id,
    key: 'team-view',
    path: TEAM_PATH,
    keepFirst: true,
  });
  const choose = (next: TeamView) => {
    if (next === view) return;
    // The tab left keeps its scroll under its own address; the chosen one's comes back with its
    // address, which the shell restores on this navigation (→WEB-74).
    const scroller = document.querySelector<HTMLElement>('[data-testid="view-scroller"]');
    const memory = useTaskMemory.getState();
    useTaskMemory.setState({
      scrolls: { ...memory.scrolls, [taskAddress()]: scroller?.scrollTop ?? 0 },
    });
    replaceQuery((params) => params.set('view', next));
    setView(next);
    window.dispatchEvent(new Event('tasknavigate'));
  };
  return (
    <section className={s.directory} data-ui="team-directory" aria-label={t('navigation.team')}>
      <div className={s.tabs}>
        <TabList<TeamView>
          tabs={TEAM_VIEWS.map(([id, label]) => [id, t(label)] as const)}
          value={view}
          onChange={choose}
          label={t('team.directory')}
          idPrefix="team"
        />
      </div>
      <TabPanel idPrefix="team" value={view}>
        {view === 'coaches' ? (
          <CoachList w={w} client={client} />
        ) : (
          <PlayerList key={view} w={w} view={view} />
        )}
      </TabPanel>
    </section>
  );
}

/** The toolbar every list shares: name search, sort and the named management link. */
function Toolbar<T extends string>({
  view,
  query,
  onQuery,
  sort,
  sorts,
  onSort,
  shown,
  total,
}: {
  view: TeamView;
  query: string;
  onQuery: (query: string) => void;
  sort: T;
  sorts: readonly T[];
  onSort: (sort: T) => void;
  shown: number;
  total: number;
}) {
  const { t } = useLocale();
  return (
    <div className={s.toolbar}>
      <label className={s.search}>
        <span className={s.srOnly}>{t('team.search')}</span>
        <input
          type="search"
          aria-label={t('team.search')}
          placeholder={t('team.search.placeholder')}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      <Select
        aria-label={t('team.sort')}
        className={s.sort}
        value={sort}
        onValueChange={(value) => onSort(value as T)}
      >
        {sorts.map((id) => (
          <option key={id} value={id}>
            {t(`team.sort.${id}`)}
          </option>
        ))}
      </Select>
      <span className={s.count} data-testid="team-count">
        {t('team.count', { shown, total })}
      </span>
      <button type="button" data-ui="link" className={s.manage} onClick={MANAGE[view]}>
        {t(`team.manage.${view}`)}
      </button>
    </div>
  );
}

function Empty({ onClear }: { onClear?: () => void }) {
  const { t } = useLocale();
  return (
    <p className={s.empty} role="status">
      {t(onClear ? 'team.empty.filtered' : 'team.empty')}
      {onClear && (
        <button type="button" data-ui="tertiary" onClick={onClear}>
          {t('team.clear')}
        </button>
      )}
    </p>
  );
}

/** 1군 or 유소년: actual players as one aligned row each. */
function PlayerList({ w, view }: { w: World; view: 'players' | 'academy' }) {
  const { t } = useLocale();
  const academy = view === 'academy';
  const [query, setQuery] = useTaskState(w.id, `team-${view}-query`, '');
  const [sort, setSort] = useTaskState<PlayerSort | AcademySort>(
    w.id,
    `team-${view}-sort`,
    academy ? 'potential' : 'position',
  );
  const rows = academy ? academyRows(w) : firstTeamRows(w);
  const listed = listPlayers(rows, query, sort);
  const club = clubOf(w);
  return (
    <>
      <Toolbar
        view={view}
        query={query}
        onQuery={setQuery}
        sort={sort}
        sorts={academy ? ACADEMY_SORTS : PLAYER_SORTS}
        onSort={setSort}
        shown={listed.length}
        total={rows.length}
      />
      <table
        className={`${market.candidateTable} ${s.table}`}
        aria-label={t(`team.view.${view}`)}
        data-testid={`team-${view}`}
      >
        <colgroup>
          <col />
          <col className={market.ratingColumn} />
          <col className={market.potentialColumn} />
          <col className={s.figureColumn} />
          {!academy && <col className={`${market.wageColumn} ${s.wide}`} />}
          {!academy && <col className={`${s.contractColumn} ${s.wide}`} />}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t('team.column.player')}</th>
            <th scope="col">{t('team.column.ovr')}</th>
            <th scope="col">{t('team.column.potential')}</th>
            <th scope="col">{t(academy ? 'team.column.growth' : 'team.column.fatigue')}</th>
            {!academy && (
              <th scope="col" className={s.wide}>
                {t('team.column.wage')}
              </th>
            )}
            {!academy && (
              <th scope="col" className={s.wide}>
                {t('team.column.contract')}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {listed.map((row) => (
            <tr key={row.id} data-testid={`team-row-${row.id}`}>
              <td>
                <PlayerName row={row} academy={academy} />
              </td>
              <td>
                <OvrBadge value={row.ovr} />
              </td>
              <td className={s.number}>{row.potential}</td>
              <td className={s.number}>
                {academy
                  ? row.developed === undefined
                    ? '—'
                    : `+${(row.developed / 100).toFixed(2)}`
                  : row.fatigue}
              </td>
              {!academy && (
                <td className={`${s.number} ${s.wide}`}>
                  <Money value={row.wage} code={club.country} year={w.year} plain />
                </td>
              )}
              {!academy && (
                <td className={`${s.number} ${s.wide}`}>
                  {t('team.contract.until', { season: seasonName(row.until - 1) })}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {listed.length === 0 && <Empty onClear={query ? () => setQuery('') : undefined} />}
    </>
  );
}

function PlayerName({ row, academy }: { row: TeamPlayerRow; academy: boolean }) {
  const { t } = useLocale();
  const facts = [
    t('team.age', { age: row.age }),
    row.loan && t('team.loan'),
    row.injuryDays !== undefined && t('team.injured', { days: row.injuryDays }),
    row.unhappy && t('team.unhappy'),
  ].filter(Boolean);
  return (
    <button
      type="button"
      data-ui="link"
      className={market.playerName}
      aria-label={t(academy ? 'team.prospect.open' : 'team.player.open', { name: row.name })}
      onClick={(event) => {
        if (academy) {
          openAcademyProspect(row.id);
          return;
        }
        event.currentTarget.focus();
        usePlayerSheet.getState().open(row.id);
      }}
    >
      <span className={market.playerIdentity}>
        <PositionBadge position={row.position} />
        <span className={market.playerText}>
          <b>{row.name}</b>
          <small>{facts.join(' · ')}</small>
        </span>
      </span>
    </button>
  );
}

/** 코치: the manager and every supported staff post, a vacancy named as one. */
function CoachList({ w, client }: { w: World; client: GameClient }) {
  const { t } = useLocale();
  const [query, setQuery] = useTaskState(w.id, 'team-coaches-query', '');
  const [sort, setSort] = useTaskState<CoachSort>(w.id, 'team-coaches-sort', 'post');
  const [career, setCareer] = useState<string>();
  const label = (post: TeamCoachRow['post']) => t(`staff.role.${post}`);
  const rows = coachRows(w);
  const listed = listCoaches(rows, query, sort, label);
  const club = clubOf(w);
  return (
    <>
      <Toolbar
        view="coaches"
        query={query}
        onQuery={setQuery}
        sort={sort}
        sorts={COACH_SORTS}
        onSort={setSort}
        shown={listed.length}
        total={rows.length}
      />
      <table
        className={`${market.candidateTable} ${s.table}`}
        aria-label={t('team.view.coaches')}
        data-testid="team-coaches"
      >
        <colgroup>
          <col />
          <col className={market.ratingColumn} />
          <col className={`${s.figureColumn} ${s.wide}`} />
          <col className={`${market.wageColumn} ${s.wide}`} />
          <col className={s.contractColumn} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t('team.column.coach')}</th>
            <th scope="col">{t('team.column.ability')}</th>
            <th scope="col" className={s.wide}>
              {t('team.column.age')}
            </th>
            <th scope="col" className={s.wide}>
              {t('team.column.wage')}
            </th>
            <th scope="col">{t('team.column.contract')}</th>
          </tr>
        </thead>
        <tbody>
          {listed.map(({ post, coach }) => (
            <tr key={post} data-testid={`team-post-${post}`} data-vacant={!coach || undefined}>
              <td>
                {coach?.person ? (
                  <button
                    type="button"
                    data-ui="link"
                    className={market.playerName}
                    aria-label={t('team.coach.open', { name: coach.name })}
                    onClick={() => setCareer(coach.person)}
                  >
                    <span className={market.playerText}>
                      <b>{coach.name}</b>
                      <StaffRoleBadge post={post} />
                    </span>
                  </button>
                ) : (
                  <span className={`${market.playerName} ${s.plainName}`}>
                    <span className={market.playerText}>
                      <b className={coach ? undefined : s.vacant}>
                        {coach ? coach.name : t('team.vacant')}
                      </b>
                      <StaffRoleBadge post={post} />
                    </span>
                  </span>
                )}
              </td>
              <td>{coach ? <OvrBadge value={coach.ability} /> : '—'}</td>
              <td className={`${s.number} ${s.wide}`}>{coach?.age ?? '—'}</td>
              <td className={`${s.number} ${s.wide}`}>
                {!coach ? (
                  '—'
                ) : BigInt(coach.wage) > 0n ? (
                  <Money value={coach.wage} code={club.country} year={w.year} plain />
                ) : (
                  t('team.volunteer')
                )}
              </td>
              <td className={s.number}>
                {!coach
                  ? '—'
                  : coach.interim
                    ? t('team.interim')
                    : t('team.contract.until', { season: seasonName(coach.until - 1) })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {listed.length === 0 && <Empty onClear={() => setQuery('')} />}
      {career && <PersonCareer id={career} client={client} onClose={() => setCareer(undefined)} />}
    </>
  );
}

/**
 * The way back from a detailed management page to the Team tab that owns it (→WEB-112): one quiet
 * text link, resuming that list's search, sort and scroll.
 */
export function TeamReturn({ page }: { page: 'firstTeam' | 'staff' | 'academy' }) {
  const { t } = useLocale();
  const view = owningTeamView(page);
  const label = TEAM_VIEWS.find(([id]) => id === view)![1];
  return (
    <div className={s.back} data-ui="team-return">
      <button type="button" data-ui="link" onClick={() => openTeam(view)}>
        {t('team.back', { view: t(label) })}
      </button>
    </div>
  );
}
