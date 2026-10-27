import { useEffect, useState } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { fixtureDate, fixtureDay } from '../../../../packages/engine/src/calendar';
import { eloOf } from '../../../../packages/engine/src/elo';
import type { GameClient } from '../runtime/client';
import type { HeadToHead, Meeting } from '../runtime/headToHead';
import { useGameState } from '../runtime/store';
import { clubDivision, leagueOf, orderIds } from './league';
import { worldSelector } from './liveState';
import { ClubCrest } from './ClubCrest';
import { ClubLink } from './ClubLink';
import { Dialog } from './Dialog';
import { clubOvr, cohesionLine, OvrBadge } from './OvrBadge';
import { competitionLabel, kindLabel, number, seasonName } from './format';
import { useTeamSheet } from './state';
import s from './LeagueInsights.module.css';

const markOf = (own: number, other: number) => (own > other ? '승' : own < other ? '패' : '무');
const resultOf = (f: Fixture, id: string) => {
  const own = f.home === id ? f.score!.home : f.score!.away,
    other = f.home === id ? f.score!.away : f.score!.home;
  return { own, other, mark: markOf(own, other) };
};
/** Where and in what a meeting was played: "1952/53 · 리그 12R · 홈". */
const meetingLine = (m: Meeting) =>
  `${seasonName(m.year)} · ${kindLabel[m.kind] ?? m.kind}${m.kind === 'league' || m.kind === 'lower' ? ` ${m.round}R` : ''} · ${m.home ? '홈' : '원정'}`;

/**
 * Our all-time record against the club (→WEB-58). The view keeps only our recent matches, so the
 * worker reads every meeting of the career; the answer stays for as long as the sheet is open and
 * is read again only when a new meeting is played.
 */
function AllTimeMeetings({ w, id, client }: { w: World; id: string; client: GameClient }) {
  const latest = w.ownMatches.findLast((m) => m.home === id || m.away === id)?.id ?? '',
    key = `${id}:${latest}`;
  const [loaded, setLoaded] = useState<{ key: string; record?: HeadToHead; failed?: boolean }>();
  useEffect(() => {
    let valid = true;
    client.headToHead(id).then(
      (record) => valid && setLoaded({ key, record }),
      () => valid && setLoaded({ key, failed: true }),
    );
    return () => {
      valid = false;
    };
  }, [client, id, key]);
  // A newer meeting refreshes the record in place; the earlier one stays until it arrives.
  const shown = loaded && (loaded.key === key || loaded.record) ? loaded : undefined,
    record = shown?.record;
  return (
    <section aria-label="역대 상대 전적">
      <h3 className={s.teamSub}>역대 상대 전적</h3>
      {!shown ? (
        <p className={s.teamNote} role="status">
          역대 상대 전적을 불러오는 중…
        </p>
      ) : !record ? (
        <p className={s.teamNote} role="alert">
          역대 상대 전적을 읽지 못했어요. 창을 닫고 다시 열어 주세요.
        </p>
      ) : !record.played ? (
        <p className={s.teamNote}>아직 맞대결이 없어요</p>
      ) : (
        <>
          <p className={s.teamTotal}>
            <b>
              {record.played}전 {record.won}승 {record.drawn}무 {record.lost}패
            </b>{' '}
            · 득실 {record.gf}:{record.ga}
          </p>
          <dl className={s.teamFacts}>
            <div>
              <dt>리그</dt>
              <dd>{record.league}경기</dd>
            </div>
            <div>
              <dt>컵</dt>
              <dd>{record.cup}경기</dd>
            </div>
            <div>
              <dt>대륙 대회</dt>
              <dd>{record.europe}경기</dd>
            </div>
            {record.playoff > 0 && (
              <div>
                <dt>승격 플레이오프</dt>
                <dd>{record.playoff}경기</dd>
              </div>
            )}
            {(
              [
                ['최다 점수차 승리', record.biggestWin],
                ['최다 점수차 패배', record.biggestLoss],
              ] as const
            ).map(([label, m]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {m ? (
                    <>
                      {m.own}–{m.other}
                      <small className={s.teamWhen}>{meetingLine(m)}</small>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            ))}
            <div>
              <dt>첫 맞대결</dt>
              <dd>{record.first ? seasonName(record.first) : '—'}</dd>
            </div>
          </dl>
          <h4 className={s.teamSub}>최근 맞대결 {record.recent.length}경기</h4>
          <ul className={s.teamList}>
            {record.recent.map((m) => {
              const mark = markOf(m.own, m.other);
              return (
                <li key={m.id}>
                  <b className={mark === '승' ? s.win : mark === '패' ? s.loss : s.draw}>{mark}</b>
                  <span>
                    {meetingLine(m)}
                    {m.shootout && ` · 승부차기 ${m.shootout === 'won' ? '승' : '패'}`}
                  </span>
                  <em>
                    {m.own}–{m.other}
                  </em>
                </li>
              );
            })}
          </ul>
          <p className={s.teamNote}>
            모든 대회의 90분 스코어 기준이에요. 승부차기로 끝난 동점 경기는 무승부로 집계해요.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Any club at a glance (→WEB-58): its overall rating, Elo, standing, supporters, form and our
 * all-time record against it, so a league is a field of rivals, not a list of names. The standing
 * is in the club's own league, wherever the sheet was opened. Only our league's games reach the
 * view, so a club from elsewhere lists its cup and continental games instead.
 */
export function TeamSheet({
  w,
  id,
  client,
  onClose,
}: {
  w: World;
  id: string;
  client: GameClient;
  onClose: () => void;
}) {
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
      .slice(-5);
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
          {id !== w.playerClub && <small data-testid="team-cohesion">{cohesionLine(club)}</small>}
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
      {recent.length > 0 && (
        <p className={s.teamNote}>마지막 경기 {fixtureDate(w, recent.at(-1)!)}</p>
      )}
      {!ours && table && (
        <p className={s.teamNote}>다른 리그 클럽의 경기별 리그 결과는 제공하지 않아요.</p>
      )}
      {id !== w.playerClub && <AllTimeMeetings w={w} id={id} client={client} />}
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
export function OpenSheets({ ids, client }: { ids: string[]; client: GameClient }) {
  const w = useGameState(selectSheetWorld);
  const close = useTeamSheet((state) => state.close);
  if (!w) return null;
  // Each sheet is its own dialog layer, so Escape and the backdrop close only the top one.
  return ids.map((id, i) => (
    <TeamSheet key={`${i}:${id}`} w={w} id={id} client={client} onClose={close} />
  ));
}
