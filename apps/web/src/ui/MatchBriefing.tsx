import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { startingSquad } from '../../../../packages/engine/src/world';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { FORMATIONS } from '../../../../packages/engine/src/player';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { fixtureDate } from '../../../../packages/engine/src/calendar';
import { competitionLabel, kindLabel, seasonName } from './format';
import { matchBriefing, resultFor } from './scouting';
import { clubOvr } from './OvrBadge';
import { Card } from './Card';
import { ClubCrest } from './ClubCrest';
import { FormationPitch } from './FormationPitch';
import { ResultBadge } from './ResultBadge';
import type { ProjectedWorld } from '../runtime/protocol';
import s from './MatchBriefing.module.css';

/** Results from one side's view, oldest first: 승 2–1 chips with the opponent in the title. */
function Results({ w, club, fixtures }: { w: World; club: string; fixtures: Fixture[] }) {
  if (!fixtures.length) return <p className={s.note}>확인할 수 있는 경기 결과가 없어요.</p>;
  return (
    <ol className={s.results}>
      {fixtures.map((f) => {
        const result = resultFor(f, club)!,
          other = w.clubs.find((c) => c.id === (f.home === club ? f.away : f.home));
        return (
          <li
            key={f.id}
            data-result={result.result}
            title={`${seasonName(f.year)} · ${kindLabel[f.kind]} · vs ${other?.name ?? '상대'}`}
          >
            <ResultBadge result={result.result} score={[result.own, result.other]} />
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The manager's report to the owner before the next match (→WEB-11): how he means to play, both
 * sides side by side (us left, them right) and our last meetings. The owner proposes from here.
 */
export function MatchBriefing({
  w,
}: {
  w: World & Pick<ProjectedWorld, 'nextOpponentLineup'>;
}) {
  const brief = matchBriefing(w);
  if (!brief) return <p className={s.note}>다음 상대는 새 시즌 일정이 나오면 확인할 수 있어요.</p>;
  const { next, opponent, manager } = brief;
  const own = clubOf(w),
    ourOvr = clubOvr(w, own),
    theirOvr = clubOvr(w, opponent);
  const xi = startingSquad(w, own, next);
  const theirXi =
    w.nextOpponentLineup?.fixture === next.id && w.nextOpponentLineup.club === opponent.id
      ? w.nextOpponentLineup.players
      : [];
  const gap = ourOvr - theirOvr;
  const sides = [
    {
      key: 'own',
      label: '우리 팀',
      club: own,
      ovr: ourOvr,
      tactic: w.tactic,
      coach: w.manager.name,
      school: w.manager.style ? STYLE_INFO[w.manager.style].label : '균형 · 창단 감독',
      recent: brief.ownRecent,
      slot: (index: number) => xi[index]?.name.split(' ').at(-1) ?? '—',
      slotTitle: (index: number) => xi[index]?.name ?? '—',
    },
    {
      key: 'opponent',
      label: '상대 팀',
      club: opponent,
      ovr: theirOvr,
      tactic: brief.tactic,
      coach: manager.name,
      school: manager.style ? STYLE_INFO[manager.style].label : '균형',
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
        aria-label="감독 보고"
        meta={`감독 보고 · ${w.manager.name} → 구단주 · ${fixtureDate(w, next)}`}
      >
        <p>
          {opponent.name}전({brief.home ? '홈' : '원정'} · {competitionLabel(w, next)})은{' '}
          {FORMATIONS[w.tactic].name} {tacticLabel[w.tactic]}로 나가겠습니다.{' '}
          {w.lineup
            ? '선발은 구단주님이 정해 주신 11명을 그대로 씁니다.'
            : '선발은 능력과 피로를 보고 제가 고르겠습니다.'}{' '}
          상대는 {tacticLabel[brief.tactic]} 성향이고,{' '}
          {gap >= 3
            ? `전력은 우리가 ${gap} 앞섭니다.`
            : gap <= -3
              ? `전력은 상대가 ${-gap} 앞서 조심해야 합니다.`
              : '전력은 비슷합니다.'}
        </p>
      </Card>
      <div className={s.sides}>
        {sides.map((side) => (
          <section key={side.key} className={s.side} aria-label={side.label} data-side={side.key}>
            <h3>
              <ClubCrest w={w} id={side.club.id} size={20} />
              <span>{side.club.name}</span>
            </h3>
            <dl className={s.facts}>
              <div>
                <dt>전력</dt>
                <dd>{side.ovr}</dd>
              </div>
              <div>
                <dt>포메이션</dt>
                <dd>
                  {FORMATIONS[side.tactic].name} · {tacticLabel[side.tactic]}
                </dd>
              </div>
              <div>
                <dt>학파</dt>
                <dd>
                  {side.school} · {side.coach}
                </dd>
              </div>
            </dl>
            <FormationPitch
              compact
              tactic={side.tactic}
              label={`${side.label} ${FORMATIONS[side.tactic].name} 스쿼드`}
              slot={side.slot}
              slotLabel={side.slot}
              slotTitle={side.slotTitle}
            />
            <h4>최근 {side.recent.length}경기</h4>
            <Results w={w} club={side.club.id} fixtures={side.recent} />
          </section>
        ))}
      </div>
      <Card
        as="section"
        surface="dark"
        className={s.meetings}
        aria-label="최근 맞대결"
        title={`최근 맞대결 · ${brief.meetings.length}경기`}
      >
        {brief.meetings.length ? (
          <ol>
            {brief.meetings.map((f) => {
              const result = resultFor(f, w.playerClub)!;
              return (
                <li key={f.id} data-result={result.result}>
                  <ResultBadge result={result.result} /> {result.own}–{result.other}
                  <small>
                    {seasonName(f.year)} · {kindLabel[f.kind]} ·{' '}
                    {f.home === w.playerClub ? '홈' : '원정'}
                  </small>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={s.note}>아직 맞대결 기록이 없어요.</p>
        )}
      </Card>
    </div>
  );
}
