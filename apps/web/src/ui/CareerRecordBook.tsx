import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
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
import { PlayerLink } from '../entities/player';
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
  useTextLocale();
  return (
    <p className={a.note}>
      {richMessage('copy.CareerRecordBook.969f6fea5e', {
        p0: seasonName(record.year),
        p1: divisionName(code, record.tier, record.group),
        p2: ' ',
        p3: record.played,
        p4: record.manager,
      })}
    </p>
  );
}
function Leader({ player, index, label }: { player?: Player; index: number; label: string }) {
  useTextLocale();
  const careerApps = useCareerApps();
  return (
    <article data-surface="panel">
      <h4>{localizeValue(label)}</h4>
      {localizeValue(
        player ? (
          <>
            <b>
              {richMessage('copy.CareerRecordBook.f512e88a6e', {
                p0: <PlayerLink id={player.id} name={player.name} />,
                p1: player.career[index],
              })}
            </b>
            <p className={a.note}>
              {richMessage('copy.CareerRecordBook.56e6447df1', {
                p0: player.position,
                p1: playerStatus(player),
                p2: careerApps(player.id),
                p3: ' ',
                p4: number(player.career[10]),
              })}
            </p>
          </>
        ) : (
          <p className={a.note}>{richMessage('copy.CareerRecordBook.cfc5d09201')}</p>
        ),
      )}
    </article>
  );
}
/** The club's season records and its all-time player leaders, on the records room's front. */
export function CareerRecordBook({ w }: { w: World }) {
  useTextLocale();
  const records = careerRecords(w),
    code = ownCountry(w);
  return (
    <Panel title={displayMessage('copy.CareerRecordBook.9155a76e38')} note="RECORD BOOK">
      <section
        className={`${s.panelBody} ${a.book}`}
        aria-label={displayMessage('copy.CareerRecordBook.9155a76e38')}
      >
        <h3>{richMessage('copy.CareerRecordBook.b2ad743d71', { p0: records.seasons })}</h3>
        <p className={a.note}>{richMessage('copy.CareerRecordBook.72922d3ea5')}</p>
        <div className={a.cards}>
          {localizeValue(
            records.finish && (
              <article data-surface="panel">
                <h4>{richMessage('copy.CareerRecordBook.be2fbcc346')}</h4>
                <b>
                  {richMessage('copy.CareerRecordBook.58e3ce05f8', {
                    p0: divisionName(code, records.finish.tier),
                    p1: records.finish.rank,
                  })}
                </b>
                <SeasonContext code={code} record={records.finish} />
              </article>
            ),
          )}
          {localizeValue(
            records.points && (
              <article data-surface="panel">
                <h4>{richMessage('copy.CareerRecordBook.318e0b630b')}</h4>
                <b>
                  {richMessage('copy.CareerRecordBook.d614463305', {
                    p0: (records.points.points / records.points.played).toFixed(2),
                  })}
                </b>
                <p className={a.note}>
                  {richMessage('copy.CareerRecordBook.584827f64a', {
                    p0: records.points.points,
                    p1: records.points.played,
                  })}
                </p>
                <SeasonContext code={code} record={records.points} />
              </article>
            ),
          )}
          {localizeValue(
            records.attack && (
              <article data-surface="panel">
                <h4>{richMessage('copy.CareerRecordBook.29c5e5d94a')}</h4>
                <b>
                  {richMessage('copy.CareerRecordBook.21274a8423', {
                    p0: (records.attack.gf / records.attack.played).toFixed(2),
                  })}
                </b>
                <p className={a.note}>
                  {richMessage('copy.CareerRecordBook.838d1e3f27', {
                    p0: records.attack.gf,
                    p1: records.attack.played,
                  })}
                </p>
                <SeasonContext code={code} record={records.attack} />
              </article>
            ),
          )}
          {localizeValue(
            records.supporters && (
              <article data-surface="panel">
                <h4>{richMessage('copy.CareerRecordBook.72bcd5416c')}</h4>
                <b>
                  {richMessage('copy.CareerRecordBook.e414915261', {
                    p0: number(records.supporters.fans),
                  })}
                </b>
                <SeasonContext code={code} record={records.supporters} />
              </article>
            ),
          )}
        </div>
        {localizeValue(
          !records.seasons && (
            <p className={a.note}>{richMessage('copy.CareerRecordBook.007ed26f8e')}</p>
          ),
        )}
        <h4>{richMessage('copy.CareerRecordBook.9c07e35896')}</h4>
        <div className={a.cards}>
          <Leader
            label={displayMessage('copy.CareerRecordBook.3b3ab48eda')}
            player={records.scorer}
            index={0}
          />
          <Leader
            label={displayMessage('copy.CareerRecordBook.028799e4c2')}
            player={records.creator}
            index={1}
          />
          <Leader
            label={displayMessage('copy.CareerRecordBook.fb6a6f285a')}
            player={records.keeper}
            index={9}
          />
        </div>
        <p className={a.note}>{richMessage('copy.CareerRecordBook.5b144b14de')}</p>
      </section>
    </Panel>
  );
}

/** "1950/51", "1950/51 · 1987/88", or for a long list its first and latest seasons. */
function seasonsText(years: number[]) {
  return years.length > 3
    ? sourceMessage('copy.CareerRecordBook.f2c8557f35', {
        p0: seasonName(years[0]),
        p1: seasonName(years.at(-1)!),
      })
    : years.map(seasonName).join(' · ');
}
type Tone = 'gold' | 'silver' | 'up' | 'down';
/** One piece in the cabinet: full-colour artwork once earned, muted artwork before. */
function Trophy({
  label,
  years,
  kind,
  tone,
  variant,
}: {
  label: string;
  years: number[];
  kind: TrophyKind;
  tone: Tone;
  variant?: string;
}) {
  useTextLocale();
  return (
    <li data-tone={years.length ? tone : 'empty'}>
      <TrophyIcon kind={kind} earned={years.length > 0} variant={variant} />
      <strong>{richMessage('copy.CareerRecordBook.bd9aab2ca2', { p0: years.length })}</strong>
      <span>{localizeValue(label)}</span>
      {localizeValue(years.length > 0 && <small>{localizeValue(seasonsText(years))}</small>)}
    </li>
  );
}
/**
 * The trophy cabinet (→HIST-12, →WEB-54): titles by division, the domestic cup's wins, continental
 * titles, cup finals, moves up and down the pyramid and the best finish, each drawn as its piece,
 * all read from the season archives; seasons that kept no cup run are named, not guessed.
 */
export function TrophyCabinet({ w }: { w: World }) {
  useTextLocale();
  const cabinet = trophyCabinet(w),
    best = cabinet.best,
    code = ownCountry(w);
  return (
    <Panel
      title={displayMessage('copy.CareerRecordBook.6cb28815cb')}
      note={sourceMessage('copy.BallonDorView.3585c2642b', { p0: cabinet.seasons })}
    >
      <div className={s.panelBody}>
        {localizeValue(
          cabinet.seasons ? (
            <>
              <ul
                className={s.trophies}
                aria-label={displayMessage('copy.CareerRecordBook.6cb28815cb')}
              >
                {localizeValue(
                  cabinet.league.length ? (
                    cabinet.league.map((title) => (
                      <Trophy
                        key={title.tier}
                        label={displayMessage('copy.CareerRecordBook.2bfc53c804', {
                          p0: title.label,
                        })}
                        years={title.years}
                        kind="league"
                        variant={`tier-${title.tier + 1}`}
                        tone="gold"
                      />
                    ))
                  ) : (
                    <Trophy
                      label={displayMessage('start.history.champions')}
                      years={[]}
                      kind="league"
                      tone="gold"
                    />
                  ),
                )}
                <Trophy
                  label={displayMessage('copy.CareerRecordBook.d3f4517f59')}
                  years={cabinet.cup.wins}
                  kind="cup"
                  tone="gold"
                />
                {localizeValue(
                  cabinet.continental.map((title) => (
                    <Trophy
                      key={title.name}
                      label={displayMessage('copy.CareerRecordBook.2bfc53c804', { p0: title.name })}
                      years={title.years}
                      kind="continental"
                      variant={title.kind}
                      tone="gold"
                    />
                  )),
                )}
                <Trophy
                  label={displayMessage('copy.CareerRecordBook.b64e5bd696')}
                  years={cabinet.cup.finals}
                  kind="final"
                  tone="silver"
                />
                <Trophy
                  label={displayMessage('copy.AcademyPanel.8e70a8dda1')}
                  years={cabinet.promotions}
                  kind="promotion"
                  tone="up"
                />
                <Trophy
                  label={displayMessage('copy.CareerRecordBook.7e6e321ef0')}
                  years={cabinet.relegations}
                  kind="relegation"
                  tone="down"
                />
                {localizeValue(
                  best && (
                    <li data-tone="best">
                      <TrophyIcon kind="best" />
                      <strong>
                        {displayMessage('copy.CareerRecordBook.2df6533b51', {
                          p0: divisionName(code, best.tier, best.group),
                          p1: best.rank,
                        })}
                      </strong>
                      <span>{richMessage('copy.CareerRecordBook.3dba8e06e7')}</span>
                      <small>({localizeValue(seasonName(best.year))})</small>
                    </li>
                  ),
                )}
              </ul>
              {localizeValue(
                cabinet.cup.unrecorded > 0 && (
                  <p className={s.muted}>
                    {richMessage('copy.CareerRecordBook.82b342c63a', {
                      p0: cabinet.cup.unrecorded,
                    })}
                  </p>
                ),
              )}
            </>
          ) : (
            <p className={s.muted}>{richMessage('copy.CareerRecordBook.063d6f4b77')}</p>
          ),
        )}
      </div>
    </Panel>
  );
}

function LeaderTable({ w, board }: { w: World; board: LeaderBoard }) {
  useTextLocale();
  const all = clubLeaders(w.players, board, LEADER_LIMIT),
    places = boardPlaces(all, board),
    apps = board.key === 'apps';
  const [shown, setShown] = useState(LEADER_PAGE);
  const leaders = all.slice(0, shown),
    next = nextLeaderCount(shown, all.length);
  const careerApps = useCareerApps();
  return (
    <Panel
      title={localizeValue(board.title)}
      note={sourceMessage('copy.CareerRecordBook.173e51eb0c')}
    >
      {localizeValue(
        leaders.length ? (
          <div className={s.tableWrap}>
            <table className={s.leaderTable} aria-label={localizeValue(board.title)}>
              <thead>
                <tr>
                  <th scope="col">{richMessage('copy.BallonDorView.8f363885a3')}</th>
                  <th scope="col">{richMessage('team.column.player')}</th>
                  <th scope="col">{richMessage('copy.BallonDorView.cb34c0f691')}</th>
                  <th scope="col">{richMessage('copy.BallonDorView.b849877c07')}</th>
                  <th scope="col">
                    {localizeValue(
                      apps ? sourceMessage('copy.CareerRecordBook.3dc2e34e3f') : board.short,
                    )}
                  </th>
                  {localizeValue(
                    !apps && <th scope="col">{richMessage('copy.CareerRecordBook.77d4f682b4')}</th>,
                  )}
                </tr>
              </thead>
              <tbody>
                {localizeValue(
                  leaders.map((p, i) => (
                    <tr key={p.id} className={p.status === 'active' ? s.own : undefined}>
                      <td>{localizeValue(places[i])}</td>
                      <td>
                        <span className={s.leaderName}>
                          <PlayerLink id={p.id} name={p.name} />
                          <i className={s.statusChip} data-status={p.status}>
                            {localizeValue(playerStatus(p))}
                          </i>
                        </span>
                      </td>
                      <td>{localizeValue(p.position)}</td>
                      <td>{localizeValue(careerApps(p.id))}</td>
                      <td>
                        {localizeValue(
                          apps
                            ? sourceMessage('copy.LabPage.be847e9e64', { p0: number(p.career[10]) })
                            : number(p.career[board.index]),
                        )}
                      </td>
                      {localizeValue(
                        !apps && (
                          <td>{localizeValue(per90(p.career, board.index)?.toFixed(2) ?? '—')}</td>
                        ),
                      )}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
            {localizeValue(
              next > shown && (
                <button
                  data-ui="link"
                  type="button"
                  className={s.textButton}
                  onClick={() => setShown(next)}
                >
                  {richMessage('copy.CareerRecordBook.c263a34471', { p0: shown + 1, p1: next })}
                </button>
              ),
            )}
          </div>
        ) : (
          <div className={s.empty}>{richMessage('copy.CareerRecordBook.49093e1fb3')}</div>
        ),
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
  useTextLocale();
  const [key, setKey] = useState<LeaderBoard['key']>('apps');
  return (
    <>
      <div className={s.recordControls}>
        <Segments
          label={displayMessage('copy.CareerRecordBook.214de2a818')}
          options={LEADER_BOARDS.map((board) => [board.key, board.short] as const)}
          value={key}
          onChange={setKey}
        />
      </div>
      <LeaderTable key={key} w={w} board={LEADER_BOARDS.find((board) => board.key === key)!} />
      <p className={s.muted}>{richMessage('copy.CareerRecordBook.92c3ad57ea')}</p>
    </>
  );
}
