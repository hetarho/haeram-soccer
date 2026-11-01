import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from './state';
import type { TaskReturn as ReturnContext } from './taskMemory';
import { TaskReturn } from './TaskReturn';
import { returnToTask } from './state';
import { CompetitionHeader } from './CompetitionTabs';
import korean from '../../public/presentation/locales/ko-KR.json';

const context = vi.hoisted(() => ({
  page: 'league' as Page,
  address: '/season?competition=league',
  returning: undefined as ReturnContext | undefined,
  setPage: vi.fn(),
}));
vi.mock('../presentation/react', () => ({
  useLocale: () => ({
    t: (key: string) => korean.messages[key as keyof typeof korean.messages] ?? key,
  }),
}));
vi.mock('./state', () => ({
  useNavigation: (selector: (state: { page: Page }) => unknown) => selector(context),
  returnToTask: vi.fn(),
}));
vi.mock('./taskMemory', async (original) => ({
  ...(await original<typeof import('./taskMemory')>()),
  useTaskMemory: (selector: (state: { returning?: ReturnContext }) => unknown) => selector(context),
  taskAddress: () => context.address,
}));

const render = () => renderToStaticMarkup(createElement(TaskReturn));
beforeEach(() => {
  vi.clearAllMocks();
  context.page = 'league';
  context.address = '/season?competition=league';
  context.returning = {
    page: 'dashboard',
    address: '/journal',
    label: '클럽 홈',
    target: 'league',
  };
});

describe('named competition return', () => {
  it('keeps the named return accessible in a compact inline header without a hint row', () => {
    const markup = renderToStaticMarkup(createElement(TaskReturn, { compact: true }));
    expect(markup).toContain('aria-label="돌아가기 · 클럽 홈"');
    expect(markup).toContain('>← 돌아가기</button>');
    expect(markup).not.toContain('<small>');
    TaskReturn({ compact: true })!.props.children[0].props.onClick();
    expect(returnToTask).toHaveBeenCalledOnce();
  });

  it('provides a compact home return when entering a competition without a detour', () => {
    context.returning = undefined;
    const markup = renderToStaticMarkup(createElement(TaskReturn, { compact: true }));
    expect(markup).toContain('aria-label="돌아가기 · 클럽 홈"');
    TaskReturn({ compact: true })!.props.children[0].props.onClick();
    expect(context.setPage).toHaveBeenCalledExactlyOnceWith('dashboard');
    expect(returnToTask).not.toHaveBeenCalled();
  });

  it('keeps the competition header to its filters and season stepper, with no return', () => {
    const league = renderToStaticMarkup(
      createElement(CompetitionHeader, {
        page: 'league',
        children: createElement('select', { 'aria-label': '국가' }),
      }),
    );
    expect(league).toContain('aria-label="대회 탐색"');
    expect(league).toContain('aria-label="국가"');
    expect(league).not.toContain('돌아가기');
    // League and Cup step their seasons in the header, so neither has this-season/past tabs.
    expect(league).not.toContain('role="tablist"');
    for (const page of ['europe', 'cupHistory'] as const) {
      const cups = renderToStaticMarkup(createElement(CompetitionHeader, { page, children: null }));
      expect(cups).not.toContain('role="tablist"');
      expect(cups).toContain('data-competition="cup"');
      expect(cups).not.toContain('돌아가기');
    }
  });
  it.each([
    ['league', 'europe'],
    ['europe', 'league'],
    ['leagueHistory', 'cupHistory'],
    ['cupHistory', 'leagueHistory'],
  ] as const)(
    'keeps the original home return after %s switches to %s and back',
    (entry, sibling) => {
      context.returning!.target = entry;
      const original = structuredClone(context.returning);
      for (const page of [entry, sibling, entry]) {
        context.page = page;
        expect(render()).toContain('← 돌아가기 · 클럽 홈');
        expect(context.returning).toEqual(original);
      }
    },
  );

  it('does not show another competition group or an unrelated place as the detour', () => {
    for (const page of ['cupHistory', 'training'] as const) {
      context.page = page;
      expect(render()).toBe('');
    }
  });

  it('hides the return at its exact source address even when the source shares a group', () => {
    context.returning = {
      page: 'history',
      address: '/history?section=club&season=1950',
      label: '클럽 시즌 기록',
      target: 'leagueHistory',
    };
    context.page = 'history';
    context.address = context.returning.address;
    expect(render()).toBe('');
  });

  it('retains existing returns for an ordinary non-competition destination', () => {
    context.page = 'training';
    context.address = '/training';
    context.returning!.target = 'training';
    expect(render()).toContain('← 돌아가기 · 클럽 홈');
  });

  it('shows no return without a contextual visit', () => {
    context.returning = undefined;
    expect(render()).toBe('');
  });
});
