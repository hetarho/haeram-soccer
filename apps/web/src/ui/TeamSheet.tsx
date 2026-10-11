import { useEffect } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { fixtureDate, fixtureDay } from '../../../../packages/engine/src/calendar';
import { eloOf } from '../../../../packages/engine/src/ratings';
import { useGameState } from '../runtime/store';
import { clubDivision, leagueOf, orderIds } from './league';
import { worldSelector } from './liveState';
import { ClubCrest } from './ClubCrest';
import { ClubLink } from './ClubLink';
import { Dialog } from './Dialog';
import { clubOvr, OvrBadge } from './OvrBadge';
import { competitionLabel, number } from './format';
import { useNavigation, useTeamSheet } from './state';
import s from './LeagueInsights.module.css';

const resultOf = (f: Fixture, id: string) => {
  const own = f.home === id ? f.score!.home : f.score!.away,
    other = f.home === id ? f.score!.away : f.score!.home;
  return { own, other, mark: own > other ? '승' : own < other ? '패' : '무' };
};

/**
 * Any club at a glance (→WEB-58): its overall rating, Elo, standing, supporters, form and our
 * meetings, so a league is a field of rivals, not a list of names. The standing is in the club's
 * own league, wherever the sheet was opened. Only our league's games reach the view, so a club
 * from elsewhere lists its cup and continental games instead.
 */
export function TeamSheet({ w, id, onClose }: { w: World; id: string; onClose: () => void }) {
  const club = w.clubs.find((c) => c.id === id);
  if (!club) return null;
  const ids = leagueOf(w, club),
    ours = ids.includes(w.playerClub),
    // Every club starts the season with a zero row; only its own league's row is a standing.
    table = ids.includes(id) ? w.tables[id] : undefined,
    rank = table ? orderIds(ids, w.tables).indexOf(id) + 1 : 0,
    involved = (f: Fixture) => !!f.score && (f.home === id || f.away === id),
    recent = (
      ours
        ? w.fixtures.filter((f) => (f.kind === 'league' || f.kind === 'lower') && involved(f))
        : [
            ...w.europe.flatMap((t) => t.fixtures),
            ...(w.cups || []).flatMap((cup) => cup.fixtures),
          ].filter(involved)
    )
      .sort((a, b) => fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id))
      .slice(-5),
    meetings =
      id === w.playerClub
        ? []
        : w.ownMatches.filter((m) => m.home === id || m.away === id).slice(-5);
  return (
    <Dialog label={club.name} onClose={onClose}>
      <div className={s.teamHead}>
        <ClubCrest w={w} id={id} size={44} />
        <div>
          <h2>{club.name}</h2>
          <small>
            {clubDivision(w, club)}
            {id === w.playerClub ? ' · 우리 팀' : ''}
            {club.project ? ' · 대형 투자 진행 중' : ''}
          </small>
        </div>
        <OvrBadge value={clubOvr(w, club)} role="OVR" large />
      </div>
      <dl className={s.teamFacts}>
        <div>
          <dt>리그 순위</dt>
          <dd>{table ? (table.played ? `${rank}위 · ${table.points}점` : '개막 전') : '—'}</dd>
        </div>
        <div>
          <dt>전적</dt>
          <dd>{table ? `${table.won}승 ${table.drawn}무 ${table.lost}패` : '—'}</dd>
        </div>
        <div>
          <dt>클럽 Elo</dt>
          <dd>{Math.round(eloOf(club))}</dd>
        </div>
        <div>
          <dt>명성</dt>
          <dd>{Math.round(club.reputation)}</dd>
        </div>
        <div>
          <dt>서포터</dt>
          <dd>{number(club.fans)}명</dd>
        </div>
        <div>
          <dt>득실</dt>
          <dd>{table ? `${table.gf}:${table.ga}` : '—'}</dd>
        </div>
      </dl>
      <h3 className={s.teamSub}>
        최근 {ours ? '리그' : '컵·대륙 대회'} {recent.length}경기
      </h3>
      {recent.length ? (
        <ul className={s.teamList}>
          {recent.map((f) => {
            const r = resultOf(f, id);
            return (
              <li key={f.id}>
                <b className={r.mark === '승' ? s.win : r.mark === '패' ? s.loss : s.draw}>
                  {r.mark}
                </b>
                <span>
                  {ours ? `${f.round}R` : competitionLabel(w, f)} · {f.home === id ? '홈' : '원정'}{' '}
                  · <ClubLink w={w} id={f.home === id ? f.away : f.home} crest={14} />
                </span>
                <em>
                  {r.own}–{r.other}
                </em>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={s.teamNote}>
          {ours
            ? '이번 시즌 기록된 리그 경기가 아직 없어요.'
            : '이번 시즌 치른 컵·대륙 대회 경기가 아직 없어요.'}
        </p>
      )}
      {!ours && table && (
        <p className={s.teamNote}>다른 리그 클럽의 경기별 리그 결과는 제공하지 않아요.</p>
      )}
      {id !== w.playerClub && (
        <>
          <h3 className={s.teamSub}>우리와의 최근 맞대결 {meetings.length}경기</h3>
          {meetings.length ? (
            <ul className={s.teamList}>
              {meetings.map((m) => {
                const ours = m.home === w.playerClub,
                  own = ours ? m.score.home : m.score.away,
                  other = ours ? m.score.away : m.score.home,
                  mark = own > other ? '승' : own < other ? '패' : '무';
                return (
                  <li key={m.id}>
                    <b className={mark === '승' ? s.win : mark === '패' ? s.loss : s.draw}>
                      {mark}
                    </b>
                    <span>
                      {m.year} · {ours ? '홈' : '원정'}
                    </span>
                    <em>
                      {own}–{other}
                    </em>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={s.teamNote}>최근 기록된 맞대결이 없어요.</p>
          )}
        </>
      )}
      {recent.length > 0 && (
        <p className={s.teamNote}>마지막 경기 {fixtureDate(w, recent.at(-1)!)}</p>
      )}
    </Dialog>
  );
}

const selectSheetWorld = worldSelector([
  'calendar',
  'clubs',
  'tables',
  'fixtures',
  'europe',
  'cups',
  'ownMatches',
  'lower',
  'playerClub',
  'players',
  'lineup',
  'manager',
]);
function OpenSheets({ ids }: { ids: string[] }) {
  const w = useGameState(selectSheetWorld);
  const close = useTeamSheet((state) => state.close);
  if (!w) return null;
  // Each sheet is its own dialog layer, so Escape and the backdrop close only the top one.
  return ids.map((id, i) => <TeamSheet key={`${i}:${id}`} w={w} id={id} onClose={close} />);
}
/** The one place team sheets open, over any view or sheet (→WEB-58). */
export function TeamSheetHost() {
  const ids = useTeamSheet((state) => state.ids);
  const page = useNavigation((state) => state.page);
  const worldId = useGameState((state) => state.view?.world.id);
  // Sheets belong to the view and the world they were opened from.
  useEffect(() => () => useTeamSheet.getState().reset(), [page, worldId]);
  return ids.length ? <OpenSheets ids={ids} /> : null;
}
