import { captureRender } from '../../../shared/lib/render.testkit';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../../../packages/contracts/src/types';
import { neighbourSeason, SeasonStepper } from '../../../shared/ui/SeasonStepper';
import { divisionValue, LeaguePicker, parseDivision } from './LeaguePicker';

/** Our club in England's fourth tier, in the 1952/53 season after two closed ones. */
const world = {
  year: 1952,
  playerClub: 'ours',
  clubs: [{ id: 'ours', country: 'ENG', tier: 3, group: 0 }],
  history: [{ year: 1950 }, { year: 1951 }],
} as unknown as World;
vi.mock('../../../runtime/store', () => ({
  useGameState: (select: (state: { view: { world: World } }) => unknown) =>
    select({ view: { world } }),
}));
vi.mock('../../../shared/lib/liveState', () => ({ selectLeagueWorld: () => world }));

const YEARS = [1950, 1951, 1952];
type Arrow = { props: { 'aria-label': string; disabled: boolean; onClick: () => void } };
const arrows = (value: number, onChange = vi.fn()) => {
  const [older, , newer] = captureRender(() =>
    SeasonStepper({ years: YEARS, value, current: 1952, onChange }),
  ).props.children as [Arrow, unknown, Arrow];
  return { older, newer, onChange };
};

describe('season stepper (→WEB-40)', () => {
  it('steps to the neighbouring kept season and stops at both ends', () => {
    expect(neighbourSeason(YEARS, 1951, -1)).toBe(1950);
    expect(neighbourSeason(YEARS, 1951, 1)).toBe(1952);
    expect(neighbourSeason(YEARS, 1950, -1)).toBeUndefined();
    expect(neighbourSeason(YEARS, 1952, 1)).toBeUndefined();
    expect(neighbourSeason(YEARS, 1949, 1)).toBeUndefined();
  });

  it('disables each arrow at its end and reports the neighbouring year', () => {
    const first = arrows(1950);
    expect(first.older.props.disabled).toBe(true);
    expect(first.newer.props.disabled).toBe(false);
    first.newer.props.onClick();
    expect(first.onChange).toHaveBeenCalledExactlyOnceWith(1951);
    const last = arrows(1952);
    expect(last.newer.props.disabled).toBe(true);
    last.older.props.onClick();
    expect(last.onChange).toHaveBeenCalledExactlyOnceWith(1951);
    expect(first.older.props['aria-label']).toBe('이전 시즌');
    expect(first.newer.props['aria-label']).toBe('다음 시즌');
  });

  it('labels the season in progress without widening the row', () => {
    const html = renderToStaticMarkup(
      createElement(SeasonStepper, { years: YEARS, value: 1952, current: 1952, onChange: vi.fn() }),
    );
    expect(html).toContain('aria-label="시즌"');
    expect(html).toContain('1952/53');
    expect(html).toContain(' · 진행 중');
    expect(html).toMatch(/class="[^"]*srOnly[^"]*"> · 진행 중/);
  });
});

describe('league picker division options (→WEB-65)', () => {
  it('reads a grouped division option back as its tier and group', () => {
    expect(divisionValue({ tier: 2, group: 1 })).toBe('2.1');
    expect(parseDivision('2.1')).toEqual({ tier: 2, group: 1 });
    expect(parseDivision('0.0')).toEqual({ tier: 0, group: 0 });
  });

  it('shows a regional group in short, with no group select, and offers our league elsewhere', () => {
    const html = renderToStaticMarkup(
      createElement(LeaguePicker, {
        league: { code: 'ITA', tier: 2, group: 1 },
        onLeague: vi.fn(),
        season: 1951,
        onSeason: vi.fn(),
      }),
    );
    // The trigger reads short (→WEB-40); the list names the group in full.
    expect(html).toContain('>3부B<');
    expect(html).toContain('>ITA<');
    expect(html).not.toContain('지역 그룹');
    expect(html).toContain('aria-label="우리 리그 보기"');
    expect(html).toContain('aria-label="이전 시즌"');
  });

  it('clears the choice when our own division is chosen again', () => {
    const onLeague = vi.fn();
    const picker = LeaguePicker as unknown as {
      type: (props: object) => { props: { children: { props: { children: unknown[] } }[] } };
    };
    const tree = captureRender(() =>
      picker.type({ league: { code: 'ENG', tier: 1, group: 0 }, onLeague }),
    );
    const division = tree.props.children[1]!.props.children[1] as {
      props: { onValueChange: (value: string) => void };
    };
    division.props.onValueChange('3.0');
    expect(onLeague).toHaveBeenLastCalledWith(undefined);
    division.props.onValueChange('2.0');
    expect(onLeague).toHaveBeenLastCalledWith({ code: 'ENG', tier: 2, group: 0 });
  });
});
