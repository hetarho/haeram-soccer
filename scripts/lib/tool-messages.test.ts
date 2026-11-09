import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMessageParameters,
  type MessageParameters,
  validateLocalePack,
} from '../../apps/web/src/presentation/contracts';
import { validateRegistry } from '../../apps/web/src/presentation/registry';
import type { SourceMessageId } from '../../packages/contracts/src/messages';
import { sourceMessages } from '../../packages/contracts/src/source-messages';
import { toolMessage } from './tool-messages';

/** These are the pre-resource English CLI bytes, not alternate executable translations. */
const english = [
  ['tool.cash.ownedWorldRequired', {}, 'Owned continuation requires an already-owned World JSON'],
  [
    'tool.cash.worldIdentityMismatch',
    {},
    'World file must match the requested seed/year and ownership mode',
  ],
  ['tool.cash.clubChange', {}, 'Owned continuation cannot change club'],
  ['tool.cash.tierChange', {}, 'Owned continuation cannot change owner tier'],
  [
    'tool.cash.expensesMismatch',
    { year: 2025 },
    'Observed operating expenses disagree with the 2025 ledger',
  ],
  [
    'tool.payroll.eventsProperty',
    {},
    'Payroll observation requires a configurable, writable events data property',
  ],
  [
    'tool.payroll.eventMismatch',
    {},
    'Payroll settlement event does not match the live year, round and currency',
  ],
  ['tool.payroll.roundOutsideSeason', {}, 'Payroll settlement round is outside the league season'],
  [
    'tool.payroll.duplicate',
    { settlement: '2025:GBP:7' },
    'Duplicate payroll settlement 2025:GBP:7',
  ],
  [
    'tool.payroll.componentsMismatch',
    { settlement: '2025:GBP:7' },
    'Payroll components do not match operating-cost at 2025:GBP:7',
  ],
  ['tool.payroll.eventsArray', {}, 'Payroll observation requires an event array'],
  ['tool.payroll.invalidCoverage', {}, 'Invalid payroll observation round coverage'],
  ['tool.payroll.missing', { settlement: '2025:GBP:7' }, 'Missing payroll settlement 2025:GBP:7'],
  [
    'tool.payroll.accountingSummary',
    { exact: 2, legacy: 1 },
    '2 exact settled; 1 legacy sampled/unknown',
  ],
  ['tool.payroll.exactPlayers', {}, 'exact player-only'],
  ['tool.payroll.sampledPlayers', {}, 'sampled player-only'],
  ['tool.payroll.legacyScopeMismatch', {}, 'legacy total payroll / NPC player-only mismatch'],
  [
    'tool.payroll.accountingLine',
    { summary: 'opaque summary' },
    'Payroll accounting: opaque summary.',
  ],
  [
    'tool.payroll.modeledRatio',
    {},
    'modeled player + manager/coaching wage bill / revenue, first 50 seasons',
  ],
  ['tool.payroll.npcComparison', {}, "player-only wages / books' last player wages (accounting)"],
] as const satisfies readonly (readonly [SourceMessageId, MessageParameters, string])[];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('canonical tooling message presentation', () => {
  it('preserves every English CLI string independently of host and browser preferences', () => {
    vi.stubEnv('LANG', 'ko_KR.UTF-8');
    vi.stubGlobal('navigator', { language: 'ar-SA', languages: ['ar-SA', 'ko-KR'] });
    for (const [id, parameters, expected] of english)
      expect(toolMessage(id, parameters), id).toBe(expected);
  });

  it('ships the same named parameters in every registered translation and Korean source', () => {
    const directory = new URL('../../apps/web/public/presentation/locales/', import.meta.url);
    const read = (name: string): unknown =>
      JSON.parse(readFileSync(new URL(name, directory), 'utf8'));
    const registry = validateRegistry(read('index.json'), 'locale');
    const baseline = validateLocalePack(
      read(registry.entries.find((entry) => entry.id === registry.defaultId)!.resource),
    );
    const defaultEntry = registry.entries.find((entry) => entry.id === baseline.id)!;
    const englishPack = validateLocalePack(read('en-GB.json'), baseline);
    for (const entry of registry.entries) {
      const pack = validateLocalePack(read(entry.resource), baseline);
      for (const [id, parameters] of english) {
        expect(getMessageParameters(pack.messages[id]), `${entry.id}/${id}`).toEqual(
          Object.keys(parameters).sort(),
        );
        if (entry.id === defaultEntry.id) {
          expect(pack.messages[id]).toBe(sourceMessages[id]);
          expect(sourceMessages[id]).toMatch(/[가-힣]/);
        }
        if (entry.id !== 'en-GB')
          expect(pack.messages[id], `${entry.id}/${id}`).not.toBe(englishPack.messages[id]);
      }
    }
  });

  it('keeps opaque parameter values intact and rejects missing named parameters', () => {
    expect(toolMessage('tool.payroll.duplicate', { settlement: '{year}:$&:<GBP>' })).toBe(
      'Duplicate payroll settlement {year}:$&:<GBP>',
    );
    expect(() => toolMessage('tool.payroll.duplicate')).toThrow('Missing parameter "settlement"');
  });
});
