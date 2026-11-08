import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { BallonDorPlace, World } from '../../../../../../packages/contracts/src/types';
import {
  BALLON_DOR_CONFIG,
  BALLON_DOR_HONOUR_LABEL,
} from '../../../../../../packages/engine/src/ballon-dor';
import { Panel } from '../../../app/ui/App';
import { ClubLink } from '../../../entities/club';
import { seasonName } from '../../../presentation/format';
import { PlayerLink } from '../../../entities/player';
import { SeasonStepper } from '../../../shared/ui/SeasonStepper';
import { useTaskState } from '../../../shared/routing/taskMemory';
import s from '../../../shared/ui/styles/App.module.css';
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

/** A winner's name, opening his detail wherever he plays now (→WEB-59). */
function Player({ id, name }: { id: string; name: string }) {
  useTextLocale();
  return <PlayerLink id={id} name={name} />;
}

/**
 * 발롱도르 (→WEB-111, PLAYER-27): the podium season by season with the stepper of the league and
 * cups, every winner, and the most wins by player and by club, our club's players marked.
 */
export function BallonDorView({ w }: { w: BallonWorld }) {
  useTextLocale();
  const { seasons, winners, players, clubs } = ballonDorBoards(w.history);
  const years = seasons.map((season) => season.year);
  const [picked, setPicked] = useTaskState<number | undefined>(w.id, 'ballon-dor-year', undefined);
  const year = picked !== undefined && years.includes(picked) ? picked : years.at(-1);
  const season = seasons.find((entry) => entry.year === year);
  if (!season || year === undefined)
    return (
      <Panel
        title={displayMessage('start.history.ballonDor')}
        note={sourceMessage('copy.BallonDorView.f1e8425001')}
      >
        <p className={s.muted} data-testid="ballon-dor-empty">
          {localizeValue(
            w.year <= BALLON_DOR_CONFIG.first
              ? sourceMessage('copy.BallonDorView.0d06561aea', {
                  p0: seasonName(BALLON_DOR_CONFIG.first),
                })
              : sourceMessage('copy.BallonDorView.07d9e15b1e'),
          )}
        </p>
      </Panel>
    );
  const ownClub = (club?: string) => club === w.playerClub;
  return (
    <>
      <div className={s.recordControls}>
        <SeasonStepper
          years={years}
          value={year}
          onChange={setPicked}
          label={displayMessage('copy.BallonDorView.fb78c45496')}
        />
      </div>
      <Panel
        title={displayMessage('copy.BallonDorView.1c9671c423', { p0: seasonName(year) })}
        note={sourceMessage('copy.BallonDorView.981c7be60a')}
      >
        <div className={s.tableWrap}>
          <table
            className={s.leaderTable}
            aria-label={displayMessage('copy.BallonDorView.1faf96680b')}
          >
            <thead>
              <tr>
                <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
                <th scope="col">{richMessage('team.column.player')}</th>
                <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.cb34c0f691')}</th>
                <th scope="col">{richMessage('copy.summary.68a6cf8ed8')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.8d901cc28d')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.b849877c07')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.e5f25ab092')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                season.podium.map((place, i) => (
                  <tr key={place.id} className={ownClub(place.club) ? b.own : undefined}>
                    <td>
                      {localizeValue(
                        i === 0 ? (
                          <b className={b.winner}>{richMessage('copy.BallonDorView.936c3936af')}</b>
                        ) : (
                          sourceMessage('copy.BallonDorView.5094d45cea', { p0: i + 1 })
                        ),
                      )}
                    </td>
                    <td>
                      <Player id={place.id} name={place.name} />
                      {localizeValue(
                        ownClub(place.club) && (
                          <i className={b.ownTag}>{richMessage('copy.BallonDorView.8434ac1486')}</i>
                        ),
                      )}
                      {localizeValue(
                        place.honours.length > 0 && (
                          <small className={b.honours}>
                            {localizeValue(
                              place.honours
                                .map((honour) => BALLON_DOR_HONOUR_LABEL[honour])
                                .join(' · '),
                            )}
                          </small>
                        ),
                      )}
                    </td>
                    <td>
                      <ClubLink w={w} id={place.club} crest={14} />
                    </td>
                    <td>{localizeValue(place.position)}</td>
                    <td>{localizeValue(place.goals)}</td>
                    <td>{localizeValue(place.assists)}</td>
                    <td>{localizeValue(place.appearances)}</td>
                    <td>
                      <b>{localizeValue(place.points)}</b>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
        <p className={s.muted}>
          {richMessage('copy.BallonDorView.fa8334cbd3', {
            p0: BALLON_DOR_CONFIG.goals,
            p1: BALLON_DOR_CONFIG.assists,
            p2: BALLON_DOR_CONFIG.honours.europe,
            p3: BALLON_DOR_CONFIG.honours.league,
            p4: BALLON_DOR_CONFIG.honours.cup,
            p5: BALLON_DOR_CONFIG.classFrom,
            p6: BALLON_DOR_CONFIG.classWeight,
            p7: BALLON_DOR_CONFIG.appearances,
          })}
        </p>
      </Panel>
      <Panel
        title={displayMessage('copy.BallonDorView.44cae244aa')}
        note={sourceMessage('copy.BallonDorView.3585c2642b', { p0: winners.length })}
      >
        <ol className={b.winners} aria-label={displayMessage('copy.BallonDorView.a88223ca47')}>
          {localizeValue(
            winners.map(({ year: won, podium }) => (
              <li key={won} className={ownClub(podium[0]!.club) ? b.own : undefined}>
                <button
                  type="button"
                  data-ui="link"
                  className={s.textButton}
                  aria-label={displayMessage('copy.BallonDorView.889cb39083', {
                    p0: seasonName(won),
                  })}
                  aria-current={won === year || undefined}
                  onClick={() => setPicked(won)}
                >
                  {localizeValue(seasonName(won))}
                </button>
                <Player id={podium[0]!.id} name={podium[0]!.name} />
                <ClubLink w={w} id={podium[0]!.club} crest={14} />
              </li>
            )),
          )}
        </ol>
      </Panel>
      <Panel
        title={displayMessage('copy.BallonDorView.9d62f61600')}
        note={sourceMessage('copy.BallonDorView.7a8d7cf9ca')}
      >
        <div className={b.boards}>
          <table
            className={s.leaderTable}
            aria-label={displayMessage('copy.BallonDorView.0009207309')}
          >
            <thead>
              <tr>
                <th scope="col">{richMessage('team.column.player')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.936c3936af')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.8124e8864e')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                topWithOurs(players, (row) => ownClub(row.club)).map((row) => (
                  <tr key={row.key} className={ownClub(row.club) ? b.own : undefined}>
                    <td>
                      <Player id={row.key} name={row.label} />
                    </td>
                    <td>
                      <b>{localizeValue(row.wins)}</b>
                    </td>
                    <td>{localizeValue(seasonName(row.last))}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <table
            className={s.leaderTable}
            aria-label={displayMessage('copy.BallonDorView.4d915be58c')}
          >
            <thead>
              <tr>
                <th scope="col">{richMessage('copy.matchModelPacking.6d641f69b7')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.936c3936af')}</th>
                <th scope="col">{richMessage('copy.BallonDorView.8124e8864e')}</th>
              </tr>
            </thead>
            <tbody>
              {localizeValue(
                topWithOurs(clubs, (row) => ownClub(row.key)).map((row) => (
                  <tr key={row.key} className={ownClub(row.key) ? b.own : undefined}>
                    <td>
                      <ClubLink w={w} id={row.key} crest={14} />
                    </td>
                    <td>
                      <b>{localizeValue(row.wins)}</b>
                    </td>
                    <td>{localizeValue(seasonName(row.last))}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
