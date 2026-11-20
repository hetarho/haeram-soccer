import type { ReactNode } from 'react';
import type { Fixture, World } from '../../../../../../packages/contracts/src/types';
import { ClubLink } from '../../../entities/club';
import { number } from '../../../presentation/format';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { displayMessage, useTextLocale } from '../../../presentation/text';
import s from '../../../shared/ui/styles/LeagueInsights.module.css';

/** Show fixtures in home–score–away order in both league result views. */
export function FixtureResultRow({
  w,
  fixture,
  meta,
  actions,
  next,
}: {
  w: World;
  fixture: Fixture;
  meta?: ReactNode;
  actions?: ReactNode;
  next?: boolean;
}) {
  useTextLocale();
  const { home, away, score } = fixture;
  const own = home === w.playerClub || away === w.playerClub;
  return (
    <li
      className={own ? s.ownResult : undefined}
      data-own={own || undefined}
      data-next={next || undefined}
      data-testid={meta ? 'fixture-card' : undefined}
    >
      {own && (
        <span data-ui="badge" data-compact className={s.ownBadge}>
          {richMessage('copy.BallonDorView.8434ac1486')}
        </span>
      )}
      {meta && <div className={s.fixtureMeta}>{meta}</div>}
      <span className={`${s.side} ${s.homeSide} ${home === w.playerClub ? s.ourName : ''}`}>
        <ClubLink w={w} id={home} mirror />
      </span>
      <b
        aria-label={
          score
            ? displayMessage('copy.LeagueInsights.dcb919d17b', { p0: score.home, p1: score.away })
            : displayMessage('copy.LeagueInsights.6ae98340d8')
        }
      >
        {score
          ? `${number(score.home)} – ${number(score.away)}`
          : richMessage('copy.LeagueInsights.f130559f0e')}
      </b>
      <span className={`${s.side} ${away === w.playerClub ? s.ourName : ''}`}>
        <ClubLink w={w} id={away} />
      </span>
      {actions && <div className={s.fixtureActions}>{actions}</div>}
    </li>
  );
}
