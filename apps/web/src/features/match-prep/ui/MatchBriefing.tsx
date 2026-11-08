import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { Fixture, Player, World } from '../../../../../../packages/contracts/src/types';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { tacticLabel } from '../../../../../../packages/engine/src/tactics';
import { FORMATIONS } from '../../../../../../packages/engine/src/player';
import { STYLE_INFO } from '../../../../../../packages/engine/src/styles';
import { fixtureDate } from '../../../../../../packages/engine/src/calendar';
import { competitionLabel, kindLabel, seasonName } from '../../../presentation/format';
import { matchBriefing, resultFor } from '../../../entities/league/lib/scouting';
import { clubOvr } from '../../../entities/player/ui/OvrBadge';
import { Card } from '../../../shared/ui/Card';
import { ClubLink } from '../../../entities/club';
import { FormationPitch } from '../../../entities/player/ui/FormationPitch';
import { ResultBadge } from '../../../shared/ui/ResultBadge';
import type { ProjectedWorld } from '../../../runtime/protocol';
import s from './MatchBriefing.module.css';

/** Results from one side's view, oldest first: 승 2–1 chips with the opponent in the title. */
function Results({ w, club, fixtures }: { w: World; club: string; fixtures: Fixture[] }) {
  useTextLocale();
  if (!fixtures.length)
    return <p className={s.note}>{richMessage('copy.MatchBriefing.b7da730e4c')}</p>;
  return (
    <ol className={s.results}>
      {localizeValue(
        fixtures.map((f) => {
          const result = resultFor(f, club)!,
            other = w.clubs.find((c) => c.id === (f.home === club ? f.away : f.home));
          return (
            <li
              key={f.id}
              data-result={result.result}
              title={localizeValue(
                `${seasonName(f.year)} · ${kindLabel[f.kind]} · vs ${other?.name ?? sourceMessage('copy.MatchBriefing.6a3b6fa71b')}`,
              )}
            >
              <ResultBadge result={result.result} score={[result.own, result.other]} />
            </li>
          );
        }),
      )}
    </ol>
  );
}

/**
 * The manager's report to the owner before the next match (→WEB-11): how he means to play, both
 * sides side by side (us left, them right) and our last meetings.
 */
export function MatchBriefing({
  w,
  xi,
}: {
  w: World & Pick<ProjectedWorld, 'nextOpponentLineup'>;
  /** The manager's XI for the next fixture, chosen by the sheet that hosts the report. */
  xi: readonly Player[];
}) {
  useTextLocale();
  const brief = matchBriefing(w);
  if (!brief) return <p className={s.note}>{richMessage('copy.MatchBriefing.a552eb32f2')}</p>;
  const { next, opponent } = brief;
  const own = clubOf(w),
    ourOvr = clubOvr(w, own),
    theirOvr = clubOvr(w, opponent);
  // The worker resolves the next opponent's XI and manager; neither is known for another fixture.
  const scouted =
    w.nextOpponentLineup?.fixture === next.id && w.nextOpponentLineup.club === opponent.id
      ? w.nextOpponentLineup
      : undefined;
  const theirXi = scouted?.players ?? [];
  const manager = scouted?.manager;
  const gap = ourOvr - theirOvr;
  const sides = [
    {
      key: 'own',
      label: sourceMessage('copy.BallonDorView.8434ac1486'),
      club: own,
      ovr: ourOvr,
      tactic: w.tactic,
      coach: w.manager.name,
      school: w.manager.style
        ? STYLE_INFO[w.manager.style].label
        : sourceMessage('copy.MatchBriefing.3583ac9c15'),
      recent: brief.ownRecent,
      slot: (index: number) => xi[index]?.name.split(' ').at(-1) ?? '—',
      slotTitle: (index: number) => xi[index]?.name ?? '—',
    },
    {
      key: 'opponent',
      label: sourceMessage('copy.MatchBriefing.1a46398092'),
      club: opponent,
      ovr: theirOvr,
      tactic: brief.tactic,
      coach: manager?.name ?? '—',
      school: manager?.style
        ? STYLE_INFO[manager.style].label
        : sourceMessage('copy.stories.634269a095'),
      recent: brief.theirRecent,
      slot: (index: number) => theirXi[index]?.name.split(' ').at(-1) ?? '—',
      slotTitle: (index: number) => theirXi[index]?.name ?? '—',
    },
  ];
  return (
    <div className={s.briefing}>
      <Card
        as="section"
        surface="ticket"
        className={s.memo}
        aria-label={displayMessage('copy.MatchBriefing.de0882dfb2')}
        meta={sourceMessage('copy.MatchBriefing.cef348ce3f', {
          p0: w.manager.name,
          p1: fixtureDate(w, next),
        })}
      >
        <p>
          {richMessage('copy.MatchBriefing.3b08b28578', {
            p0: opponent.name,
            p1: brief.home ? sourceMessage('fixture.home') : sourceMessage('fixture.away'),
            p2: competitionLabel(w, next),
            p3: ' ',
            p4: FORMATIONS[w.tactic].name,
            p5: tacticLabel[w.tactic],
            p6: tacticLabel[brief.tactic],
            p7: ' ',
            p8:
              gap >= 3
                ? sourceMessage('copy.MatchBriefing.19dd631ef2', { p0: gap })
                : gap <= -3
                  ? sourceMessage('copy.MatchBriefing.58e0f49a2d', { p0: -gap })
                  : sourceMessage('copy.MatchBriefing.f70831afc4'),
          })}
        </p>
      </Card>
      <div className={s.sides}>
        {localizeValue(
          sides.map((side) => (
            <section
              key={side.key}
              className={s.side}
              aria-label={localizeValue(side.label)}
              data-side={side.key}
            >
              <h3>
                <ClubLink w={w} id={side.club.id} crest={20} />
              </h3>
              <dl className={s.facts}>
                <div>
                  <dt>{richMessage('copy.ClubListing.6403c770c8')}</dt>
                  <dd>{localizeValue(side.ovr)}</dd>
                </div>
                <div>
                  <dt>{richMessage('copy.MatchBriefing.ff6f5ecded')}</dt>
                  <dd>
                    {FORMATIONS[side.tactic].name} · {localizeValue(tacticLabel[side.tactic])}
                  </dd>
                </div>
                <div>
                  <dt>{richMessage('copy.MatchBriefing.becb12551a')}</dt>
                  <dd>
                    {localizeValue(side.school)} · {localizeValue(side.coach)}
                  </dd>
                </div>
              </dl>
              <FormationPitch
                compact
                tactic={side.tactic}
                label={displayMessage('copy.MatchBriefing.d3f5883baa', {
                  p0: side.label,
                  p1: FORMATIONS[side.tactic].name,
                })}
                slot={side.slot}
                slotLabel={side.slot}
                slotTitle={side.slotTitle}
              />
              <h4>{richMessage('copy.MatchBriefing.615c369aad', { p0: side.recent.length })}</h4>
              <Results w={w} club={side.club.id} fixtures={side.recent} />
            </section>
          )),
        )}
      </div>
      <Card
        as="section"
        surface="dark"
        className={s.meetings}
        aria-label={displayMessage('copy.MatchBriefing.2a75099923')}
        title={displayMessage('copy.MatchBriefing.c885b79195', { p0: brief.meetings.length })}
      >
        {localizeValue(
          brief.meetings.length ? (
            <ol>
              {localizeValue(
                brief.meetings.map((f) => {
                  const result = resultFor(f, w.playerClub)!;
                  return (
                    <li key={f.id} data-result={result.result}>
                      <ResultBadge result={result.result} /> {localizeValue(result.own)}–
                      {localizeValue(result.other)}
                      <small>
                        {localizeValue(seasonName(f.year))} · {localizeValue(kindLabel[f.kind])} ·
                        {localizeValue(' ')}
                        {localizeValue(
                          f.home === w.playerClub
                            ? sourceMessage('fixture.home')
                            : sourceMessage('fixture.away'),
                        )}
                      </small>
                    </li>
                  );
                }),
              )}
            </ol>
          ) : (
            <p className={s.note}>{richMessage('copy.MatchBriefing.71abf91927')}</p>
          ),
        )}
      </Card>
    </div>
  );
}
