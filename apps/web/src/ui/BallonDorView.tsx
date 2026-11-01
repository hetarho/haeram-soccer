import type { BallonDorPlace, World } from '../../../../packages/contracts/src/types';
import {
  BALLON_DOR_CONFIG,
  BALLON_DOR_HONOUR_LABEL,
} from '../../../../packages/engine/src/ballon-dor';
import { Panel } from './App';
import { ClubLink } from './ClubLink';
import { seasonName } from './format';
import { PlayerLink } from './PlayerSheet';
import { SeasonStepper } from './SeasonStepper';
import { useTaskState } from './taskMemory';
import s from './App.module.css';
import b from './BallonDorView.module.css';

/** Players and clubs listed on each most-wins board before our club's own row. */
const BOARD = 10;
type BallonWorld = Pick<
  World,
  'id' | 'seed' | 'year' | 'playerClub' | 'clubs' | 'history' | 'players'
>;

/** One player's or club's wins, latest first among equals. */
export interface WinCount {
  key: string;
  label: string;
  club?: string;
  wins: number;
  last: number;
}
/** Seasons with a podium, oldest first; their winners newest first; most wins by player and club. */
export function ballonDorBoards(history: World['history']) {
  const seasons = history
    .filter((h) => h.ballonDor?.length)
    .sort((a, b) => a.year - b.year)
    .map((h) => ({ year: h.year, podium: h.ballonDor! }));
  const count = (
    key: (place: BallonDorPlace) => string,
    label: (place: BallonDorPlace) => string,
  ) => {
    const counts = new Map<string, WinCount>();
    for (const { year, podium } of seasons) {
      const winner = podium[0]!;
      const entry = counts.get(key(winner)) ?? {
        key: key(winner),
        label: label(winner),
        club: winner.club,
        wins: 0,
        last: year,
      };
      entry.wins++;
      entry.last = year;
      entry.club = winner.club;
      counts.set(entry.key, entry);
    }
    return [...counts.values()].sort(
      (a, b) => b.wins - a.wins || b.last - a.last || (a.key < b.key ? -1 : 1),
    );
  };
  return {
    seasons,
    winners: [...seasons].reverse(),
    players: count(
      (place) => place.id,
      (place) => place.name,
    ),
    clubs: count(
      (place) => place.club,
      (place) => place.club,
    ),
  };
}

/** The first `BOARD` rows, with our club's row kept in view when it falls below them. */
function topWithOurs(rows: WinCount[], ours: (row: WinCount) => boolean) {
  const top = rows.slice(0, BOARD),
    own = rows.find(ours);
  return own && !top.includes(own) ? [...top, own] : top;
}

/** A name that opens his sheet when his identity is ours to show (→WEB-59). */
function Player({ w, id, name }: { w: BallonWorld; id: string; name: string }) {
  return w.players.some((p) => p.id === id) ? <PlayerLink id={id} name={name} /> : <>{name}</>;
}

/**
 * 발롱도르 (→WEB-111, PLAYER-27): the podium season by season with the stepper of the league and
 * cups, every winner, and the most wins by player and by club, our club's players marked.
 */
export function BallonDorView({ w }: { w: BallonWorld }) {
  const { seasons, winners, players, clubs } = ballonDorBoards(w.history);
  const years = seasons.map((season) => season.year);
  const [picked, setPicked] = useTaskState<number | undefined>(w.id, 'ballon-dor-year', undefined);
  const year = picked !== undefined && years.includes(picked) ? picked : years.at(-1);
  const season = seasons.find((entry) => entry.year === year);
  if (!season || year === undefined)
    return (
      <Panel title="발롱도르" note="세계 최고의 선수">
        <p className={s.muted} data-testid="ballon-dor-empty">
          {w.year <= BALLON_DOR_CONFIG.first
            ? `발롱도르는 ${seasonName(BALLON_DOR_CONFIG.first)} 시즌부터 시상해요.`
            : '아직 수상자가 기록된 시즌이 없어요. 시즌을 처음부터 끝까지 치르면 그 시즌의 발롱도르가 남아요.'}
        </p>
      </Panel>
    );
  const ownClub = (club?: string) => club === w.playerClub;
  return (
    <>
      <div className={s.recordControls}>
        <SeasonStepper years={years} value={year} onChange={setPicked} label="발롱도르 시즌" />
      </div>
      <Panel
        title={`${seasonName(year)} 발롱도르`}
        note="골·도움·팀 성과·기량으로 매긴 시즌 포인트"
      >
        <div className={s.tableWrap}>
          <table className={s.leaderTable} aria-label="발롱도르 순위">
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">선수</th>
                <th scope="col">클럽</th>
                <th scope="col">포지션</th>
                <th scope="col">골</th>
                <th scope="col">도움</th>
                <th scope="col">출전</th>
                <th scope="col">포인트</th>
              </tr>
            </thead>
            <tbody>
              {season.podium.map((place, i) => (
                <tr key={place.id} className={ownClub(place.club) ? b.own : undefined}>
                  <td>{i === 0 ? <b className={b.winner}>수상</b> : `${i + 1}위`}</td>
                  <td>
                    <Player w={w} id={place.id} name={place.name} />
                    {ownClub(place.club) && <i className={b.ownTag}>우리 팀</i>}
                    {place.honours.length > 0 && (
                      <small className={b.honours}>
                        {place.honours.map((honour) => BALLON_DOR_HONOUR_LABEL[honour]).join(' · ')}
                      </small>
                    )}
                  </td>
                  <td>
                    <ClubLink w={w} id={place.club} crest={14} />
                  </td>
                  <td>{place.position}</td>
                  <td>{place.goals}</td>
                  <td>{place.assists}</td>
                  <td>{place.appearances}</td>
                  <td>
                    <b>{place.points}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={s.muted}>
          포인트: 골 ×{BALLON_DOR_CONFIG.goals} · 도움 ×{BALLON_DOR_CONFIG.assists} · 유럽 정상 +
          {BALLON_DOR_CONFIG.honours.europe} · 리그 우승 +{BALLON_DOR_CONFIG.honours.league} · 컵
          우승 +{BALLON_DOR_CONFIG.honours.cup} · 기량(OVR {BALLON_DOR_CONFIG.classFrom} 초과분 ×
          {BALLON_DOR_CONFIG.classWeight}). 1부 리그 {BALLON_DOR_CONFIG.appearances}경기 이상 출전한
          선수만 후보예요.
        </p>
      </Panel>
      <Panel title="역대 수상자" note={`${winners.length}시즌`}>
        <ol className={b.winners} aria-label="역대 발롱도르 수상자">
          {winners.map(({ year: won, podium }) => (
            <li key={won} className={ownClub(podium[0]!.club) ? b.own : undefined}>
              <button
                type="button"
                data-ui="link"
                className={s.textButton}
                aria-label={`${seasonName(won)} 발롱도르 보기`}
                aria-current={won === year || undefined}
                onClick={() => setPicked(won)}
              >
                {seasonName(won)}
              </button>
              <Player w={w} id={podium[0]!.id} name={podium[0]!.name} />
              <ClubLink w={w} id={podium[0]!.club} crest={14} />
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="최다 수상" note="선수 · 클럽">
        <div className={b.boards}>
          <table className={s.leaderTable} aria-label="선수별 발롱도르 수상">
            <thead>
              <tr>
                <th scope="col">선수</th>
                <th scope="col">수상</th>
                <th scope="col">최근</th>
              </tr>
            </thead>
            <tbody>
              {topWithOurs(players, (row) => ownClub(row.club)).map((row) => (
                <tr key={row.key} className={ownClub(row.club) ? b.own : undefined}>
                  <td>
                    <Player w={w} id={row.key} name={row.label} />
                  </td>
                  <td>
                    <b>{row.wins}</b>
                  </td>
                  <td>{seasonName(row.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className={s.leaderTable} aria-label="클럽별 발롱도르 수상">
            <thead>
              <tr>
                <th scope="col">클럽</th>
                <th scope="col">수상</th>
                <th scope="col">최근</th>
              </tr>
            </thead>
            <tbody>
              {topWithOurs(clubs, (row) => ownClub(row.key)).map((row) => (
                <tr key={row.key} className={ownClub(row.key) ? b.own : undefined}>
                  <td>
                    <ClubLink w={w} id={row.key} crest={14} />
                  </td>
                  <td>
                    <b>{row.wins}</b>
                  </td>
                  <td>{seasonName(row.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
