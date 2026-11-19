// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { FacilityPart } from '../../../../../../packages/contracts/src/types';
import { FACILITY_PARTS, partTop } from '../../../../../../packages/engine/src/facilities';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import registryData from '../../../../public/presentation/locales/index.json';
import korean from '../../../../public/presentation/locales/ko-KR.json';
import english from '../../../../public/presentation/locales/en-GB.json';
import type { LocalePack } from '../../../presentation/contracts';
import { createLoadedLocale } from '../../../presentation/locale';
import { validateRegistry } from '../../../presentation/registry';
import { setTextLocale } from '../../../presentation/text';
import type { GameClient } from '../../../runtime/client';
import { officeRead } from '../../../runtime/officeRead';
import type { Reply } from '../../../runtime/protocol';
import { gameStore, initialClientState } from '../../../runtime/store';
import { FacilityUpgrade } from './InvestmentView';

vi.mock('../../../entities/office', async (original) => ({
  ...(await original<typeof import('../../../entities/office')>()),
  FacilityArt: () => null,
}));

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  gameStore.setState(initialClientState, true);
  setTextLocale();
  vi.unstubAllGlobals();
});

it('renders independent localized continuation states and applies only available changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  gameStore.setState({ ...initialClientState, busy: false, processing: false }, true);
  const w = careerWorld({ seed: 'facility-automation-ui' });
  w.stadium = 1;
  w.academyFacility = 1;
  w.facilityWorks = { stadium: { to: 2, year: w.year, day: 0 } };
  w.facilityAutoUpgrade = { stadium: 'armed', academy: 'awaiting-funds' };
  const command = vi.fn<GameClient['command']>();
  const reply = { ok: true, requestId: 'setting' } satisfies Reply;
  let finish!: (reply: Reply) => void;
  const pending = new Promise<Reply>((resolve) => {
    finish = resolve;
  });
  command.mockReturnValueOnce(pending).mockResolvedValue(reply);
  const client = { command } as unknown as GameClient;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const draw = () => {
    const office = officeRead(w);
    root!.render(
      FACILITY_PARTS.map((part) =>
        createElement(FacilityUpgrade, { key: part, w, part, office, client }),
      ),
    );
  };
  const checkbox = (part: FacilityPart) =>
    container.querySelector<HTMLInputElement>(`#investment-facility-${part} input[type=checkbox]`)!;
  const label = (part: FacilityPart) => checkbox(part).labels![0]!.textContent;
  const status = (part: FacilityPart) => {
    const id = checkbox(part).getAttribute('aria-describedby');
    return id && document.getElementById(id)?.textContent;
  };
  await act(async () => draw());

  expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(3);
  expect(label('stadium')).toContain('재건축 포함');
  expect(checkbox('stadium').checked).toBe(true);
  expect(status('stadium')).toContain('공사 중');
  expect(checkbox('training').checked).toBe(false);
  expect(status('training')).toBeNull();
  expect(checkbox('academy').checked).toBe(true);
  expect(status('academy')).toBe(korean.messages['facility.auto.awaitingFunds']);

  const registry = validateRegistry(registryData, 'locale');
  await act(async () =>
    setTextLocale(createLoadedLocale(registry, english as LocalePack, korean as LocalePack)),
  );
  expect(label('stadium')).toBe(english.messages['facility.auto.stadiumLabel']);
  expect(label('training')).toBe(
    english.messages['facility.auto.label'].replace(
      '{part}',
      english.messages['copy.outcome.e9dbbe23f3'],
    ),
  );
  expect(status('academy')).toBe(english.messages['facility.auto.awaitingFunds']);

  await act(async () => checkbox('training').click());
  expect(command).toHaveBeenCalledExactlyOnceWith(
    { type: 'facility-auto-upgrade', part: 'training', enabled: true },
    { background: true },
  );
  expect(checkbox('training').disabled).toBe(true);
  await act(async () => checkbox('training').click());
  expect(command).toHaveBeenCalledTimes(1);
  await act(async () => {
    w.facilityAutoUpgrade = { ...w.facilityAutoUpgrade, training: 'armed' };
    finish(reply);
    draw();
  });
  expect(checkbox('training').checked).toBe(true);
  expect(status('training')).toBe(english.messages['facility.auto.manualStart']);

  w.academyFacility = partTop('academy');
  await act(async () => draw());
  expect(checkbox('academy').checked).toBe(false);
  expect(checkbox('academy').disabled).toBe(true);
  expect(status('academy')).toBe(english.messages['copy.InvestmentView.c36d1bbda5']);
  await act(async () => checkbox('academy').click());
  expect(command).toHaveBeenCalledTimes(1);
  await act(async () => checkbox('stadium').click());
  expect(command).toHaveBeenLastCalledWith(
    { type: 'facility-auto-upgrade', part: 'stadium', enabled: false },
    { background: true },
  );
});
