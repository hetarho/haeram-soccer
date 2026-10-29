import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from './state';
import type { TaskReturn as ReturnContext } from './taskMemory';
import { TaskReturn } from './TaskReturn';

const context = vi.hoisted(() => ({
  page: 'league' as Page,
  address: '/season?competition=league',
  returning: undefined as ReturnContext | undefined,
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
