import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useState } from 'react';
import type { Fixture, World } from '../../../../../../packages/contracts/src/types';
import { fixtureDate, fixtureDay } from '../../../../../../packages/engine/src/calendar';
import { eloOf } from '../../../../../../packages/engine/src/elo';
import { ClubLink, useClubDetail } from '../../../entities/club';
import { openPlayer } from '../../../entities/player';
import type { GameClient } from '../../../runtime/client';
import type { HeadToHead, Meeting } from '../../../runtime/headToHead';
import { useGameState } from '../../../runtime/store';
import { useRead } from '../../../shared/lib';
import { ClubCrest } from '../../../entities/club/ui/ClubCrest';
import { competitionLabel, kindLabel, number, seasonName } from '../../../presentation/format';
import { clubDivision, leagueOf, orderIds } from '../../../entities/league/lib/league';
import { worldSelector } from '../../../shared/lib/liveState';
import { clubOvr, cohesionLine, OvrBadge } from '../../../entities/player/ui/OvrBadge';
import { PersonCareer } from '../../../features/person-career/ui/PersonCareer';
import { ClubDetail } from './ClubDetail';
import s from './ClubDetail.module.css';

const markOf = (own: number, other: number) =>
  own > other
    ? sourceMessage('result.win')
    : own < other
      ? sourceMessage('result.loss')
      : sourceMessage('result.draw');
const markClass = (mark: string) =>
  mark === sourceMessage('result.win')
    ? s.win
    : mark === sourceMessage('result.loss')
      ? s.loss
      : s.draw;
const resultOf = (f: Fixture, id: string) => {
  const own = f.home === id ? f.score!.home : f.score!.away,
    other = f.home === id ? f.score!.away : f.score!.home;
  return { own, other, mark: markOf(own, other) };
};
/** Where and in what a meeting was played: "1952/53 · 리그 12R · 홈". */
const meetingLine = (m: Meeting) =>
  `${seasonName(m.year)} · ${kindLabel[m.kind] ?? m.kind}${m.kind === 'league' ? ` ${m.round}R` : ''} · ${m.home ? sourceMessage('fixture.home') : sourceMessage('fixture.away')}`;

/**
 * Our all-time record against the club (→WEB-58). The view keeps only our recent matches, so the
 * worker reads every meeting of the career; the answer stays while the detail is open and is read
 * again only when a new meeting is played, the earlier one shown until it arrives.
 */
function AllTimeMeetings({ w, id, client }: { w: World; id: string; client: GameClient }) {
  useTextLocale();
  const latest = w.ownMatches.findLast((m) => m.home === id || m.away === id)?.id ?? '';
  const read = useRead<HeadToHead>(`${id}:${latest}`, () => client.headToHead(id), { keep: true });
  return (
    <section aria-label={displayMessage('copy.CareerClubDetail.8a74d56ab1')} className={s.panel}>
      <h3 className={s.sub}>{richMessage('copy.CareerClubDetail.8a74d56ab1')}</h3>
      {localizeValue(
        read.status === 'loading' ? (
          <p className={s.note} role="status">
            {richMessage('copy.CareerClubDetail.3b13d1a1cc')}
          </p>
        ) : read.status === 'failed' ? (
          <p className={s.note} role="alert">
            {richMessage('copy.CareerClubDetail.69489f4cd0')}
          </p>
        ) : !read.value.played ? (
          <p className={s.note}>{richMessage('copy.CareerClubDetail.09bbef5f38')}</p>
        ) : (
          <Meetings record={read.value} />
        ),
      )}
    </section>
  );
}

function Meetings({ record }: { record: HeadToHead }) {
  useTextLocale();
  return (
    <>
      <p className={s.total}>
        {richMessage('copy.CareerClubDetail.c759e697dc', {
          p0: (
            <b>
              {richMessage('copy.CareerClubDetail.bb90701b0c', {
                p0: record.played,
                p1: record.won,
                p2: record.drawn,
                p3: record.lost,
              })}
            </b>
          ),
          p1: ' ',
          p2: record.gf,
          p3: record.ga,
        })}
      </p>
      <dl className={s.facts}>
        <div data-surface="detail">
          <dt>{richMessage('navigation.league')}</dt>
          <dd>{richMessage('copy.SeasonAnalysis.f0536ece4c', { p0: record.league })}</dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('navigation.short.europe')}</dt>
          <dd>{richMessage('copy.SeasonAnalysis.f0536ece4c', { p0: record.cup })}</dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('copy.CareerClubDetail.428f257894')}</dt>
          <dd>{richMessage('copy.SeasonAnalysis.f0536ece4c', { p0: record.europe })}</dd>
        </div>
        {localizeValue(
          record.playoff > 0 && (
            <div data-surface="detail">
              <dt>{richMessage('copy.competitionLabels.b5a56f17ba')}</dt>
              <dd>{richMessage('copy.SeasonAnalysis.f0536ece4c', { p0: record.playoff })}</dd>
            </div>
          ),
        )}
        {localizeValue(
          (
            [
              [sourceMessage('copy.CareerClubDetail.1a7a70a70a'), record.biggestWin],
              [sourceMessage('copy.CareerClubDetail.4283a4220e'), record.biggestLoss],
            ] as const
          ).map(([label, m]) => (
            <div key={label}>
              <dt>{localizeValue(label)}</dt>
              <dd>
                {localizeValue(
                  m ? (
                    <>
                      {localizeValue(m.own)}–{localizeValue(m.other)}
                      <small className={s.when}>{localizeValue(meetingLine(m))}</small>
                    </>
                  ) : (
                    '—'
                  ),
                )}
              </dd>
            </div>
          )),
        )}
        <div data-surface="detail">
          <dt>{richMessage('copy.CareerClubDetail.f52f743e13')}</dt>
          <dd>{localizeValue(record.first ? seasonName(record.first) : '—')}</dd>
        </div>
      </dl>
      <h4 className={s.sub}>
        {richMessage('copy.CareerClubDetail.5cf10afdc2', { p0: record.recent.length })}
      </h4>
      <ul className={s.results}>
        {localizeValue(
          record.recent.map((m) => {
            const mark = markOf(m.own, m.other);
            return (
              <li key={m.id} data-surface="detail">
                <b className={markClass(mark)}>{localizeValue(mark)}</b>
                <span>
                  {localizeValue(meetingLine(m))}
                  {localizeValue(
                    m.shootout &&
                      sourceMessage('copy.CareerClubDetail.84606f140d', {
                        p0:
                          m.shootout === 'won'
                            ? sourceMessage('result.win')
                            : sourceMessage('result.loss'),
                      }),
                  )}
                </span>
                <em>
                  {localizeValue(m.own)}–{localizeValue(m.other)}
                </em>
              </li>
            );
          }),
        )}
      </ul>
      <p className={s.note}>{richMessage('copy.CareerClubDetail.c31a5ae647')}</p>
    </>
  );
}

/**
 * The club's season at a glance (→WEB-58): rank and points in its own league, record, Club Elo,
 * reputation, supporters, goals and its last five league games — cup and continental games for a
 * club outside our league, whose league games the view does not hold — then our all-time record
 * against it.
 */
function SeasonOverview({ w, id, client }: { w: World; id: string; client: GameClient }) {
  useTextLocale();
  const club = w.clubs.find((c) => c.id === id)!;
  const ids = leagueOf(w, club),
    ours = ids.includes(w.playerClub),
    // Every club starts the season with a zero row; only its own league's row is a standing.
    table = ids.includes(id) ? w.tables[id] : undefined,
    rank = table ? orderIds(ids, w.tables).indexOf(id) + 1 : 0,
    involved = (f: Fixture) => !!f.score && (f.home === id || f.away === id),
    recent = (
      ours
        ? w.fixtures.filter((f) => f.kind === 'league' && involved(f))
        : [
            ...w.europe.flatMap((t) => t.fixtures),
            ...(w.cups || []).flatMap((cup) => cup.fixtures),
          ].filter(involved)
    )
      .sort((a, b) => fixtureDay(a) - fixtureDay(b) || a.id.localeCompare(b.id))
      .slice(-5);
  return (
    <>
      <dl className={s.facts}>
        <div data-surface="detail">
          <dt>{richMessage('copy.AwaySummary.a1f8f34457')}</dt>
          <dd>
            {localizeValue(
              table
                ? table.played
                  ? sourceMessage('copy.LeagueInsights.73769a8d11', { p0: rank, p1: table.points })
                  : sourceMessage('copy.LeagueInsights.df47c98b9c')
                : '—',
            )}
          </dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('copy.SeasonReview.cbac60f1a6')}</dt>
          <dd>
            {localizeValue(
              table
                ? sourceMessage('copy.LeagueInsights.9f2c790122', {
                    p0: table.won,
                    p1: table.drawn,
                    p2: table.lost,
                  })
                : '—',
            )}
          </dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('copy.ClubTrends.14e4f1a04e')}</dt>
          <dd>{localizeValue(Math.round(eloOf(club)))}</dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('copy.CareerClubDetail.dfe2bf1360')}</dt>
          <dd>{localizeValue(Math.round(club.reputation))}</dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('copy.ClubTrends.2070613ba9')}</dt>
          <dd>{richMessage('copy.CareerRecordBook.e414915261', { p0: number(club.fans) })}</dd>
        </div>
        <div data-surface="detail">
          <dt>{richMessage('copy.CupsView.24734975b3')}</dt>
          <dd>{localizeValue(table ? `${table.gf}:${table.ga}` : '—')}</dd>
        </div>
      </dl>
      <h3 className={s.sub}>
        {richMessage('copy.CareerClubDetail.aa54cd75b8', {
          p0: ours
            ? sourceMessage('navigation.league')
            : sourceMessage('copy.CareerClubDetail.12d9352b72'),
          p1: recent.length,
        })}
      </h3>
      {localizeValue(
        recent.length ? (
          <ul className={s.results}>
            {localizeValue(
              recent.map((f) => {
                const r = resultOf(f, id);
                return (
                  <li key={f.id} data-surface="detail">
                    <b className={markClass(r.mark)}>{localizeValue(r.mark)}</b>
                    <span>
                      {localizeValue(ours ? `${f.round}R` : competitionLabel(w, f))} ·{' '}
                      {localizeValue(
                        f.home === id
                          ? sourceMessage('fixture.home')
                          : sourceMessage('fixture.away'),
                      )}
                      {localizeValue(' ')}
                      · <ClubLink w={w} id={f.home === id ? f.away : f.home} crest={14} />
                    </span>
                    <em>
                      {localizeValue(r.own)}–{localizeValue(r.other)}
                    </em>
                  </li>
                );
              }),
            )}
          </ul>
        ) : (
          <p className={s.note}>
            {localizeValue(
              ours
                ? sourceMessage('copy.CareerClubDetail.9ee7c76fab')
                : sourceMessage('copy.CareerClubDetail.3d4f389969'),
            )}
          </p>
        ),
      )}
      {localizeValue(
        recent.length > 0 && (
          <p className={s.note}>
            {richMessage('copy.CareerClubDetail.17a4daf566', {
              p0: fixtureDate(w, recent.at(-1)!),
            })}
          </p>
        ),
      )}
      {localizeValue(
        !ours && table && (
          <p className={s.note}>{richMessage('copy.CareerClubDetail.c0f2ee420c')}</p>
        ),
      )}
      {localizeValue(id !== w.playerClub && <AllTimeMeetings w={w} id={id} client={client} />)}
    </>
  );
}

/** Any club of the career in play, ours included (→WEB-58): the season, then its profile tabs. */
function CareerClubDetail({
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
  useTextLocale();
  // Read again each round, and for our club when its 코치진 changes, the last answer kept till then.
  const people =
    id === w.playerClub ? [w.manager.id, ...(w.staff ?? []).map((member) => member.id)].join() : '';
  const profile = useRead(
    `${w.id}:${id}:${w.year}:${w.round}:${people}`,
    () => client.clubProfile(id),
    {
      keep: true,
    },
  );
  const [career, setCareer] = useState<string>();
  const club = w.clubs.find((c) => c.id === id);
  if (!club) return null;
  const ours = id === w.playerClub;
  return (
    <>
      <ClubDetail
        name={club.name}
        crest={<ClubCrest w={w} id={id} size={44} />}
        lines={
          <>
            <small>
              {localizeValue(clubDivision(w, club))}
              {localizeValue(ours ? sourceMessage('copy.CareerClubDetail.0f7a9c5edf') : '')}
              {localizeValue(club.project ? sourceMessage('copy.CareerClubDetail.8285a435f0') : '')}
            </small>
            {localizeValue(
              !ours && (
                <small data-testid="team-cohesion">{localizeValue(cohesionLine(club))}</small>
              ),
            )}
          </>
        }
        badge={<OvrBadge value={clubOvr(w, club)} role="OVR" large />}
        overview={<SeasonOverview w={w} id={id} client={client} />}
        profile={profile}
        onPlayer={(player) => openPlayer(ours ? { id: player } : { id: player, club: id })}
        onPerson={(person) => setCareer(person)}
        onClose={onClose}
        testId="team-sheet"
      />
      {localizeValue(
        career && <PersonCareer id={career} client={client} onClose={() => setCareer(undefined)} />,
      )}
    </>
  );
}

const selectDetailWorld = worldSelector([
  'id',
  'year',
  'calendar',
  'clubs',
  'tables',
  'fixtures',
  'europe',
  'cups',
  'ownMatches',
  'playerClub',
  'players',
  'manager',
  'staff',
  'round',
]);
/** Every open club detail over the world in play; each is its own dialog layer (→WEB-58). */
export function OpenClubDetails({ ids, client }: { ids: string[]; client: GameClient }) {
  useTextLocale();
  const w = useGameState(selectDetailWorld);
  const close = useClubDetail((state) => state.close);
  if (!w) return null;
  // Escape and the backdrop close only the top layer.
  return ids.map((id, i) => (
    <CareerClubDetail key={`${i}:${id}`} w={w} id={id} client={client} onClose={close} />
  ));
}
