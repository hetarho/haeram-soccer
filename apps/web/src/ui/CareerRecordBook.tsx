import { useState } from 'react';
import type { Player, SeasonArchive, World } from '../../../../packages/contracts/src/types';
import { Panel } from './App';
import {
  boardPlaces,
  careerRecords,
  clubLeaders,
  divisionName,
  LEADER_BOARDS,
  LEADER_LIMIT,
  LEADER_PAGE,
  nextLeaderCount,
  trophyCabinet,
  type LeaderBoard,
} from './careerRecords';
import { number, seasonName } from './format';
import { ofScope, per90, playerStatus } from './playerAnalysis';
import { useGameState } from '../runtime/store';
import { PlayerLink } from './PlayerSheet';
import { Segments } from './Segments';
import { TrophyIcon, type TrophyKind } from './TrophyIcon';
import a from './Analysis.module.css';
import s from './App.module.css';

/** Club career appearances from every own match (the view's tallies, →HIST-13). */
function useCareerApps() {
  const tallies = useGameState((state) => state.view?.tallies.players);
  return (id: string) => ofScope(tallies?.[id]?.apps, 'career');
}
const ownCountry = (w: World) => w.clubs.find((c) => c.id === w.playerClub)!.country;

function SeasonContext({ code, record }: { code: string; record: SeasonArchive }) {
  return (
    <p className={a.note}>
      {seasonName(record.year)} · {divisionName(code, record.tier, record.group)} · 리그{' '}
      {record.played}경기 · 감독 {record.manager}
    </p>
  );
}
function Leader({ player, index, label }: { player?: Player; index: number; label: string }) {
  const careerApps = useCareerApps();
  return (
    <article data-surface="panel">
      <h4>{label}</h4>
      {player ? (
        <>
          <b>
            <PlayerLink id={player.id} name={player.name} /> · {player.career[index]}회
          </b>
          <p className={a.note}>
            {player.position} · {playerStatus(player)} · {careerApps(player.id)}경기 ·{' '}
            {number(player.career[10])}분 출전
          </p>
        </>
      ) : (
        <p className={a.note}>첫 기록을 기다립니다.</p>
      )}
    </article>
  );
}
/** The club's season records and its all-time player leaders, on the records room's front. */
export function CareerRecordBook({ w }: { w: World }) {
  const records = careerRecords(w),
    code = ownCountry(w);
  return (
    <Panel title="우리 클럽 기록집" note="RECORD BOOK">
      <section className={`${s.panelBody} ${a.book}`} aria-label="우리 클럽 기록집">
        <h3>완료한 {records.seasons}개 시즌의 발자취</h3>
        <p className={a.note}>
          시즌 기록은 리그 결산을 비교해요. 디비전·그룹·경기 수가 다른 기록은 그 맥락을 함께
          읽어주세요.
        </p>
        <div className={a.cards}>
          {records.finish && (
            <article data-surface="panel">
              <h4>가장 높은 무대의 성적</h4>
              <b>
                {divisionName(code, records.finish.tier)} {records.finish.rank}위
              </b>
              <SeasonContext code={code} record={records.finish} />
            </article>
          )}
          {records.points && (
            <article data-surface="panel">
              <h4>최고 승점 페이스</h4>
              <b>{(records.points.points / records.points.played).toFixed(2)}점 / 경기</b>
              <p className={a.note}>
                {records.points.points}점 / {records.points.played}경기
              </p>
              <SeasonContext code={code} record={records.points} />
            </article>
          )}
          {records.attack && (
            <article data-surface="panel">
              <h4>최고 득점 페이스</h4>
              <b>{(records.attack.gf / records.attack.played).toFixed(2)}골 / 경기</b>
              <p className={a.note}>
                {records.attack.gf}골 / {records.attack.played}경기
              </p>
              <SeasonContext code={code} record={records.attack} />
            </article>
          )}
          {records.supporters && (
            <article data-surface="panel">
              <h4>시즌 결산 서포터 최다</h4>
              <b>{number(records.supporters.fans)}명</b>
              <SeasonContext code={code} record={records.supporters} />
            </article>
          )}
        </div>
        {!records.seasons && <p className={a.note}>완료한 시즌이 쌓이면 시즌 기록이 시작돼요.</p>}
        <h4>클럽 통산 선수 기록 · 모든 대회</h4>
        <div className={a.cards}>
          <Leader label="최다 득점" player={records.scorer} index={0} />
          <Leader label="최다 도움" player={records.creator} index={1} />
          <Leader label="골키퍼 최다 선방" player={records.keeper} index={9} />
        </div>
        <p className={a.note}>
          우리 클럽에서 기록한 기여만 집계해요. 동률은 가장 이른 시즌 또는 선수 ID 순으로
          표시합니다.
        </p>
      </section>
    </Panel>
  );
}

/** "1950/51", "1950/51 · 1987/88", or for a long list its first and latest seasons. */
function seasonsText(years: number[]) {
  return years.length > 3
    ? `첫 ${seasonName(years[0])} · 최근 ${seasonName(years.at(-1)!)}`
    : years.map(seasonName).join(' · ');
}
type Tone = 'gold' | 'silver' | 'up' | 'down';
/** One piece in the cabinet: drawn in its metal once won, an empty outline before. */
function Trophy({
  label,
  years,
  kind,
  tone,
}: {
  label: string;
  years: number[];
  kind: TrophyKind;
  tone: Tone;
}) {
  return (
    <li data-tone={years.length ? tone : 'empty'}>
      <TrophyIcon kind={kind} earned={years.length > 0} />
      <strong>{years.length}회</strong>
      <span>{label}</span>
      {years.length > 0 && <small>{seasonsText(years)}</small>}
    </li>
  );
}
/**
 * The trophy cabinet (→HIST-12, →WEB-54): titles by division, the domestic cup's wins, continental
 * titles, cup finals, moves up and down the pyramid and the best finish, each drawn as its piece,
 * all read from the season archives; seasons that kept no cup run are named, not guessed.
 */
export function TrophyCabinet({ w }: { w: World }) {
  const cabinet = trophyCabinet(w),
    best = cabinet.best,
    code = ownCountry(w);
  return (
    <Panel title="트로피 진열장" note={`${cabinet.seasons}시즌`}>
      <div className={s.panelBody}>
        {cabinet.seasons ? (
          <>
            <ul className={s.trophies} aria-label="트로피 진열장">
              {cabinet.league.length ? (
                cabinet.league.map((title) => (
                  <Trophy
                    key={title.tier}
                    label={`${title.label} 우승`}
                    years={title.years}
                    kind="league"
                    tone="gold"
                  />
                ))
              ) : (
                <Trophy label="리그 우승" years={[]} kind="league" tone="gold" />
              )}
              <Trophy label="국내 컵 우승" years={cabinet.cup.wins} kind="cup" tone="gold" />
              {cabinet.continental.map((title) => (
                <Trophy
                  key={title.name}
                  label={`${title.name} 우승`}
                  years={title.years}
                  kind="continental"
                  tone="gold"
                />
              ))}
              <Trophy label="국내 컵 결승" years={cabinet.cup.finals} kind="final" tone="silver" />
              <Trophy label="승격" years={cabinet.promotions} kind="promotion" tone="up" />
              <Trophy label="강등" years={cabinet.relegations} kind="relegation" tone="down" />
              {best && (
                <li data-tone="best">
                  <TrophyIcon kind="best" />
                  <strong>{`${divisionName(code, best.tier, best.group)} ${best.rank}위`}</strong>
                  <span>최고 성적</span>
                  <small>({seasonName(best.year)})</small>
                </li>
              )}
            </ul>
            {cabinet.cup.unrecorded > 0 && (
              <p className={s.muted}>
                국내 컵 성적이 기록되지 않은 시즌 {cabinet.cup.unrecorded}개는 컵 횟수에 넣지
                않았어요.
              </p>
            )}
          </>
        ) : (
          <p className={s.muted}>첫 시즌이 끝나면 트로피 진열장이 채워져요.</p>
        )}
      </div>
    </Panel>
  );
}

function LeaderTable({ w, board }: { w: World; board: LeaderBoard }) {
  const all = clubLeaders(w.players, board, LEADER_LIMIT),
    places = boardPlaces(all, board),
    apps = board.key === 'apps';
  const [shown, setShown] = useState(LEADER_PAGE);
  const leaders = all.slice(0, shown),
    next = nextLeaderCount(shown, all.length);
  const careerApps = useCareerApps();
  return (
    <Panel title={board.title} note="우리 클럽 통산 · 모든 대회">
      {leaders.length ? (
        <div className={s.tableWrap}>
          <table className={s.leaderTable} aria-label={board.title}>
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">선수</th>
                <th scope="col">포지션</th>
                <th scope="col">출전</th>
                <th scope="col">{apps ? '출전 시간' : board.short}</th>
                {!apps && <th scope="col">90분당</th>}
              </tr>
            </thead>
            <tbody>
              {leaders.map((p, i) => (
                <tr key={p.id} className={p.status === 'active' ? s.own : undefined}>
                  <td>{places[i]}</td>
                  <td>
                    <span className={s.leaderName}>
                      <PlayerLink id={p.id} name={p.name} />
                      <i className={s.statusChip} data-status={p.status}>
                        {playerStatus(p)}
                      </i>
                    </span>
                  </td>
                  <td>{p.position}</td>
                  <td>{careerApps(p.id)}</td>
                  <td>{apps ? `${number(p.career[10])}분` : number(p.career[board.index])}</td>
                  {!apps && <td>{per90(p.career, board.index)?.toFixed(2) ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {next > shown && (
            <button
              data-ui="link"
              type="button"
              className={s.textButton}
              onClick={() => setShown(next)}
            >
              더 보기 · {shown + 1}–{next}위
            </button>
          )}
        </div>
      ) : (
        <div className={s.empty}>아직 기록이 없어요.</div>
      )}
    </Panel>
  );
}
/**
 * The club's all-time boards, one at a time (→WEB-54): appearances, goals, assists and keepers'
 * saves over every player's club career, sold and retired players included; the current squad
 * stands out.
 */
export function ClubLeaders({ w }: { w: World }) {
  const [key, setKey] = useState<LeaderBoard['key']>('apps');
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label="통산 기록 종류"
          options={LEADER_BOARDS.map((board) => [board.key, board.short] as const)}
          value={key}
          onChange={setKey}
        />
      </div>
      <LeaderTable key={key} w={w} board={LEADER_BOARDS.find((board) => board.key === key)!} />
      <p className={s.muted}>
        모든 대회에서 우리 클럽 소속으로 남긴 기록이에요. 교체 없이 선발 11명이 90분을 모두 뛰어
        출전 시간을 90분으로 나눈 값이 출전 경기 수예요. 같은 기록은 순위를 함께 나누고 선수 ID
        순으로 적어요. 지금 선수단은 굵게 표시해요.
      </p>
    </>
  );
}
