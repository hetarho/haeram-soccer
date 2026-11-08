import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BallonDorPlace, World } from '../../../../../../packages/contracts/src/types';
import { ballonDorBoards, BallonDorView } from './BallonDorView';
import { ballonDorLine, ballonDorPremiumLine } from '../../../entities/player/lib/ballonDorText';

vi.mock('../../../shared/ui/Panel', () => ({
  Panel: ({ title, children }: { title: string; children: unknown }) =>
    createElement('section', { 'aria-label': title }, children as never),
}));
vi.mock('./ClubLink', () => ({
  ClubLink: ({ id }: { id: string }) => createElement('span', null, `club:${id}`),
}));
vi.mock('./PlayerSheet', () => ({
  PlayerLink: ({ name }: { name: string }) => createElement('button', null, name),
}));

const place = (id: string, club: string, points: number): BallonDorPlace => ({
  id,
  name: `Player ${id}`,
  club,
  position: 'ST',
  goals: 20,
  assists: 6,
  appearances: 38,
  points,
  honours: points > 150 ? ['europe', 'league'] : [],
});
/** Three awarded seasons: `star` of our club wins 1956 and 1958, a rival's `x` wins 1957. */
const world = {
  id: 'ballon-view',
  seed: 'ballon-view',
  year: 1959,
  playerClub: 'ours',
  clubs: [{ id: 'ours' }, { id: 'rival' }],
  players: [{ id: 'star' }],
  history: [
    { year: 1955 },
    { year: 1956, ballonDor: [place('star', 'ours', 190), place('x', 'rival', 140)] },
    { year: 1957, ballonDor: [place('x', 'rival', 170), place('star', 'ours', 160)] },
    { year: 1958, ballonDor: [place('star', 'ours', 200), place('x', 'rival', 120)] },
  ],
} as unknown as World;
const render = (w: World) => renderToStaticMarkup(createElement(BallonDorView, { w }));

describe('the Ballon d’Or view (→WEB-111)', () => {
  it('opens on the latest podium with our club’s player marked and his honours', () => {
    const html = render(world);
    expect(html).toContain('1958/59 발롱도르');
    const podium = html.slice(html.indexOf('aria-label="발롱도르 순위"'));
    expect(podium.indexOf('Player star')).toBeLessThan(podium.indexOf('Player x'));
    expect(podium).toContain('우리 팀');
    expect(podium).toContain('유럽 정상 · 리그 우승');
    expect(html).toContain('aria-label="이전 발롱도르 시즌"');
  });

  it('lists winners newest first and counts wins by player and by club', () => {
    const boards = ballonDorBoards(world.history);
    expect(boards.seasons.map((s) => s.year)).toEqual([1956, 1957, 1958]);
    expect(boards.winners.map((s) => s.year)).toEqual([1958, 1957, 1956]);
    expect(boards.players.map((row) => [row.key, row.wins, row.last])).toEqual([
      ['star', 2, 1958],
      ['x', 1, 1957],
    ]);
    expect(boards.clubs.map((row) => [row.key, row.wins])).toEqual([
      ['ours', 2],
      ['rival', 1],
    ]);
  });

  it('says when the award begins, and never draws an empty podium', () => {
    const early = render({ ...world, year: 1952, history: [] } as unknown as World);
    expect(early).toContain('발롱도르는 1955/56 시즌부터 시상해요.');
    expect(early).not.toContain('발롱도르 순위');
    const none = render({ ...world, history: [{ year: 1956 }] } as unknown as World);
    expect(none).toContain('아직 수상자가 기록된 시즌이 없어요');
  });
});

describe('Ballon d’Or lines for the player sheet and the contract talk (→WEB-68/111)', () => {
  it('names a player’s wins and places with their seasons', () => {
    expect(ballonDorLine(world.history, 'star')).toBe(
      '발롱도르 수상 2회 (1956/57, 1958/59) · 2위 1회 (1957/58)',
    );
    expect(ballonDorLine(world.history, 'nobody')).toBeUndefined();
  });

  it('states the premium a recent podium place adds to his demand', () => {
    expect(ballonDorPremiumLine(world, 'star')).toBe('발롱도르 수상 (1958/59) · 요구 +140%');
    expect(ballonDorPremiumLine(world, 'x')).toBe('발롱도르 수상 (1957/58) · 요구 +100%');
    expect(ballonDorPremiumLine({ ...world, year: 1963 }, 'star')).toBeUndefined();
  });
});
