import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Fixture, World } from '../../../../packages/contracts/src/types';
import { MatchReportCard } from './MatchReportCard';

describe('match report context', () => {
  const observed = { id: 'observed', kind: 'league', home: 'own', away: 'past-rival' } as Fixture;
  const w = {
    year: 1950,
    playerClub: 'own',
    clubs: [
      { id: 'own', name: 'Our Club', country: 'ENG' },
      { id: 'past-rival', name: 'Observed Opponent', country: 'ENG' },
      { id: 'future-rival', name: 'Upcoming Opponent', country: 'ENG' },
    ],
    fixtures: [{ ...observed, id: 'next', away: 'future-rival' }],
    cups: [],
    europe: [],
  } as unknown as World;

  it('names the observed opponent and ongoing status without revealing the settled score', () => {
    const markup = renderToStaticMarkup(
      createElement(MatchReportCard, { w, fixture: observed, continuing: true, children: null }),
    );
    expect(markup).toContain('Observed Opponent');
    expect(markup).not.toContain('Upcoming Opponent');
    expect(markup).toContain('MATCH · 관전 중');
    expect(markup).toContain('resume-match-card');
    expect(markup).not.toContain('내일 경기');
  });

  it('uses the same report card for the pre-match choice', () => {
    const markup = renderToStaticMarkup(
      createElement(MatchReportCard, { w, fixture: observed, children: null }),
    );
    expect(markup).toContain('MATCH · 내일 경기');
    expect(markup).toContain('data-testid="event-card"');
    expect(markup).not.toContain('관전 중');
  });
});
