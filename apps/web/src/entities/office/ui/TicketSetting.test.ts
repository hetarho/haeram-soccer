// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import registryData from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { setTextLocale } from '../../../presentation/text';
import type { GameClient } from '../../../runtime/client';
import type { View } from '../../../runtime/protocol';
import { gameStore, initialClientState } from '../../../runtime/store';
import { TicketSetting } from './ClubSettingControl';

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  gameStore.setState(initialClientState, true);
  setTextLocale();
  vi.unstubAllGlobals();
});

const capacity = 40000;
/** A small forecast fixture (money in minor units): only the fields the ticket control reads. */
const gate = (attendanceLow: number, attendanceHigh: number, incomeLow: number) => ({
  capacity,
  attendanceLow,
  attendanceHigh,
  incomeLow: String(incomeLow),
  incomeHigh: String(incomeLow * 2),
});

it('explains the highest preset from its own forecast, read with its attendance and receipts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const w = careerWorld({ seed: 'top-ticket-forecast' });
  w.ticket = 0.12;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const client = { command: vi.fn() } as unknown as GameClient;
  const draw = (top: ReturnType<typeof gate>) =>
    act(async () => {
      gameStore.setState(
        {
          ...initialClientState,
          busy: false,
          processing: false,
          view: {
            world: { id: w.id },
            office: {
              ticketGates: {
                '0.02': gate(1, 2, 3),
                '0.035': gate(1, 2, 3),
                '0.05': gate(1, 2, 3),
                '0.08': gate(1, 2, 3),
                '0.12': top,
              },
            },
          } as unknown as View,
        },
        true,
      );
      root!.render(createElement(TicketSetting, { w, client }));
    });
  const summary = () => container.querySelector('p')!.textContent;
  const facts = () => container.querySelector('dl')!.textContent!;

  await draw(gate(capacity, capacity, 300000));
  expect(summary()).toBe(korean.messages['copy.tickets.578dac4fbc']);
  expect(facts()).toContain('40,000–40,000');
  const firstReceipts = facts().split('40,000–40,000')[1];

  await draw(gate(32000, capacity, 500000));
  expect(summary()).toBe(korean.messages['copy.tickets.bc4e97fdc3']);
  expect(facts()).toContain('32,000–40,000');
  // The receipts shown are the same forecast's: another forecast income, another figure.
  expect(facts().split('32,000–40,000')[1]).not.toBe(firstReceipts);

  await draw(gate(12173, 15216, 333));
  expect(summary()).toBe(korean.messages['copy.tickets.a7f8479e35']);
  expect(facts()).toContain('12,173–15,216');

  const registry = validateRegistry(registryData, 'locale');
  await act(async () =>
    setTextLocale(createLoadedLocale(registry, english as LocalePack, korean as LocalePack)),
  );
  expect(summary()).toBe(english.messages['copy.tickets.a7f8479e35']);
});
