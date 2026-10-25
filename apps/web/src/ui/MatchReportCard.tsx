import type { ReactNode, Ref } from 'react';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { ClubCrest } from './ClubCrest';
import { competitionLabel } from './format';
import s from './EventCenter.module.css';

/** Upcoming and unfinished match reports share their card and action layout. */
export function MatchReportCard({
  w,
  fixture,
  continuing = false,
  children,
  ref,
}: {
  w: World;
  fixture: Fixture;
  continuing?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
}) {
  const home = fixture.home === w.playerClub;
  const opponent = w.clubs.find((club) => club.id === (home ? fixture.away : fixture.home));
  return (
    <aside
      ref={ref}
      data-surface="panel"
      className={`${s.card} ${s.matchReport}`}
      aria-label="이벤트"
      data-testid={continuing ? 'resume-match-card' : 'event-card'}
    >
      <header>
        <span className={s.kind}>{continuing ? 'MATCH · 관전 중' : 'MATCH · 내일 경기'}</span>
      </header>
      <h3>
        {opponent && <ClubCrest w={w} id={opponent.id} size={22} />}
        vs {opponent?.name}
      </h3>
      <p>
        {home ? '홈' : '원정'} · {competitionLabel(w, fixture)} ·{' '}
        {continuing ? '보던 경기에서 이어서 관전해요.' : '선발과 전술은 스태프가 준비해요.'}
      </p>
      {children}
    </aside>
  );
}
