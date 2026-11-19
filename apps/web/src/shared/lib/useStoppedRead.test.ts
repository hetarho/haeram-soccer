// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gameStore } from '../../runtime/store';
import { useStoppedRead } from './useStoppedRead';

let root: Root;
let output: unknown;
function Probe({ part }: { part: 'running' | 'office' | 'disciplineNames' | 'transfers' }) {
  output = useStoppedRead(part);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.createElement('div'));
  gameStore.setState({
    view: {
      world: {
        id: 'world',
        revision: 1,
        disciplineNames: { p1: { name: 'Player', club: 'Club' } },
      },
      office: { summary: 'office' },
      transfers: [{ id: 'scout-offer' }],
    } as never,
    clockRunning: false,
  } as never);
});

afterEach(async () => {
  await act(async () => root.unmount());
  gameStore.setState({ view: undefined, clockRunning: false } as never);
  vi.unstubAllGlobals();
});

const render = async (part: 'running' | 'office' | 'disciplineNames' | 'transfers') =>
  act(async () => root.render(createElement(Probe, { part })));

it('exposes the same running state to navigation and withholds stopped reads until the clock stops', async () => {
  await render('running');
  expect(output).toBe(false);
  await render('office');
  expect(output).toEqual({ summary: 'office' });
  await render('transfers');
  expect(output).toEqual([{ id: 'scout-offer' }]);
  await act(async () => gameStore.setState({ clockRunning: true }));
  expect(output).toBeUndefined();
  await render('transfers');
  expect(output).toBeUndefined();
  await render('running');
  expect(output).toBe(true);
  await act(async () => gameStore.setState({ clockRunning: false }));
  expect(output).toBe(false);
  await render('disciplineNames');
  expect(output).toEqual({ p1: { name: 'Player', club: 'Club' } });
  await render('transfers');
  expect(output).toEqual([{ id: 'scout-offer' }]);
});
