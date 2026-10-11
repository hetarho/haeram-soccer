import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { eloOf } from '../../../../packages/engine/src/ratings';
import { orderIds } from './league';
import { ClubCrest } from './ClubCrest';
import { Dialog } from './Dialog';
import { clubOvr, OvrBadge } from './OvrBadge';
import { number } from './format';
import s from './LeagueInsights.module.css';

const resultOf = (f: Fixture, id: string) => {
  const own = f.home === id ? f.score!.home : f.score!.away,
    other = f.home === id ? f.score!.away : f.score!.home;
  return { own, other, mark: own > other ? '승' : own < other ? '패' : '무' };
};

/**
 * Any club at a glance (→WEB-58): its overall rating, Elo, standing, supporters, form and our
 * meetings, so a league is a field of rivals, not a list of names.
 */
export function TeamSheet({
  w,
  id,
  ids,
  onClose,
}: {
  w: World;
  id: string;
  /** The league the sheet was opened from, for its rank. */
  ids: string[];
  onClose: () => void;
}) {
  const club = w.clubs.find((c) => c.id === id);
  if (!club) return null;
  const depth = country(club.country).groups.length,
    division = club.id.startsWith('euro:')
      ? '해외 클럽'
      : club.tier >= depth
        ? '아마추어 리그'
        : `${club.tier + 1}부`,
    table = w.tables[id],
    rank = orderIds(ids, w.tables).indexOf(id) + 1,
    league = w.fixtures
      .filter(
        (f) =>
          f.score &&
          (f.kind === 'league' || f.kind === 'lower') &&
          (f.home === id || f.away === id),
      )
      .sort((a, b) => a.round - b.round)
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
            {division}
            {id === w.playerClub ? ' · 우리 팀' : ''}
            {club.project ? ' · 대형 투자 진행 중' : ''}
          </small>
        </div>
        <OvrBadge value={clubOvr(w, club)} role="OVR" large />
      </div>
      <dl className={s.teamFacts}>
        <div>
          <dt>리그 순위</dt>
          <dd>{table?.played && rank ? `${rank}위 · ${table.points}점` : '개막 전'}</dd>
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
      <h3 className={s.teamSub}>최근 리그 {league.length}경기</h3>
      {league.length ? (
        <ul className={s.teamList}>
          {league.map((f) => {
            const r = resultOf(f, id),
              opponent = w.clubs.find((c) => c.id === (f.home === id ? f.away : f.home));
            return (
              <li key={f.id}>
                <b className={r.mark === '승' ? s.win : r.mark === '패' ? s.loss : s.draw}>
                  {r.mark}
                </b>
                <span>
                  {f.round}R · {f.home === id ? '홈' : '원정'} · {opponent?.name ?? '—'}
                </span>
                <em>
                  {r.own}–{r.other}
                </em>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={s.teamNote}>이번 시즌 기록된 리그 경기가 아직 없어요.</p>
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
      {league.length > 0 && (
        <p className={s.teamNote}>마지막 경기 {fixtureDate(w, league.at(-1)!)}</p>
      )}
    </Dialog>
  );
}
