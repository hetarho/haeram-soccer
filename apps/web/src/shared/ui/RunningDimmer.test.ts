// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gameStore } from '../../runtime/store';
import { RunningDimmer } from './RunningDimmer';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  gameStore.setState({ clockRunning: false, view: undefined } as never);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  gameStore.setState({ clockRunning: false, view: undefined } as never);
  vi.unstubAllGlobals();
});

it('dims and makes its content inert, moves focus out, and announces one localized reason', async () => {
  await act(async () =>
    root.render(createElement(RunningDimmer, { children: createElement('button', {}, 'action') })),
  );
  const button = host.querySelector('button')!;
  button.focus();
  expect(document.activeElement).toBe(button);

  await act(async () => gameStore.setState({ clockRunning: true }));

  const content = host.querySelector('[aria-disabled="true"]')!;
  const reason = host.querySelector('[role="status"][aria-live="polite"]')!;
  expect(content.hasAttribute('inert')).toBe(true);
  expect(content.className).not.toBe('');
  expect(reason.textContent).toContain('자동 진행 중에는');
  expect(document.activeElement).toBe(reason);
});
