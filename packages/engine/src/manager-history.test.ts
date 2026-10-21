import { describe, expect, it, vi } from 'vitest';
import type {
  ManagerAttributedMatch,
  ManagerHistoryIdentity,
} from '../../contracts/src/manager-history';
import {
  attributeManagerMatch,
  attributeManagerOutcome,
  createManagerHistoryFacts,
  recordManagerTenureChange,
} from './manager-history';

const manager: ManagerHistoryIdentity = {
  id: 'a',
  person: 'person-a',
  name: 'Synthetic A',
  interim: false,
  since: 2030,
};
const at = (day: number) => ({ year: 2030, day });
const create = () =>
  createManagerHistoryFacts({
    club: 'ours',
    at: { ...at(0), revision: 0 },
    coverage: 'founding',
    manager,
  });
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}
const match = (): ManagerAttributedMatch => ({
  id: 'match-a',
  year: 2030,
  kind: 'cup',
  home: 'ours',
  away: 'other',
  score: { home: 1, away: 0 },
});

describe('explicit manager-history fact operations', () => {
  it('initialises founding and activation with different appointment precision', () => {
    expect(create().tenures[0]).toMatchObject({
      appointed: at(0),
      trackedFrom: at(0),
      person: 'person-a',
    });
    const activated = createManagerHistoryFacts({
      club: 'ours',
      at: { ...at(60), revision: 8 },
      coverage: 'activation',
      manager: { ...manager, since: 2028 },
    });
    expect(activated.tenures[0].appointed).toBeUndefined();
    expect(activated.tenures[0].knownSince).toBe(2028);
    expect(activated.trackedFrom).toEqual({ ...at(60), revision: 8 });
  });

  it('does not split renewals/tactics, but creates separate reappointments and ordered same-day interims', () => {
    const initial = frozen(create());
    expect(recordManagerTenureChange(initial, { kind: 'renewal', manager: 'a', at: at(10) })).toBe(
      initial,
    );
    expect(recordManagerTenureChange(initial, { kind: 'tactics', manager: 'a', at: at(10) })).toBe(
      initial,
    );
    const interim = recordManagerTenureChange(initial, {
      kind: 'appointment',
      key: 'interim',
      at: at(50),
      manager: { id: 'b', name: 'Synthetic B', interim: true },
    });
    const reappointed = recordManagerTenureChange(frozen(interim), {
      kind: 'appointment',
      key: 'return-a',
      at: at(50),
      manager,
    });
    expect(
      reappointed.tenures.map((tenure) => [tenure.id, tenure.manager, tenure.interim]),
    ).toEqual([
      ['ours:tenure:1', 'a', false],
      ['ours:tenure:2', 'b', true],
      ['ours:tenure:3', 'a', false],
    ]);
    expect(reappointed.tenures[0].ended).toEqual(at(50));
    expect(reappointed.tenures[1].appointed).toEqual(reappointed.tenures[1].ended);
    expect(reappointed.tenures[2].appointed).toEqual(at(50));
    expect(
      recordManagerTenureChange(reappointed, {
        kind: 'appointment',
        key: 'return-a',
        at: at(50),
        manager,
      }),
    ).toBe(reappointed);
    expect(initial.serial).toBe(1);
  });

  it('records an explicit departure and permits a later appointment after a gap', () => {
    const departed = recordManagerTenureChange(create(), {
      kind: 'departure',
      key: 'retire-a',
      at: at(10),
      departure: 'retired',
    });
    expect(departed.tenures[0]).toMatchObject({ ended: at(10), departure: 'retired' });
    expect(attributeManagerMatch(departed, match(), { at: at(12) }).managerTenure).toBeUndefined();
    expect(
      recordManagerTenureChange(departed, {
        kind: 'departure',
        key: 'retire-a',
        at: at(10),
        departure: 'retired',
      }),
    ).toBe(departed);
    const returned = recordManagerTenureChange(departed, {
      kind: 'appointment',
      key: 'return',
      at: at(20),
      manager,
    });
    expect(returned.tenures[1].id).toBe('ours:tenure:2');
    expect(() =>
      recordManagerTenureChange(returned, { kind: 'renewal', manager: 'other', at: at(20) }),
    ).toThrow('current manager');
  });

  it('freezes own-match credit once and ignores foreign matches without changing snapshots', () => {
    const original = frozen(match());
    const initial = frozen(create());
    const attributed = attributeManagerMatch(initial, original, { at: at(20) });
    expect(attributed.managerTenure).toBe('ours:tenure:1');
    expect(original.managerTenure).toBeUndefined();
    const changed = recordManagerTenureChange(initial, {
      kind: 'appointment',
      key: 'new',
      at: at(30),
      manager: { id: 'b', name: 'B', interim: true },
    });
    expect(attributeManagerMatch(changed, frozen(attributed), { at: at(20) })).toBe(attributed);
    const foreign = { ...original, home: 'other-1', away: 'other-2' };
    expect(attributeManagerMatch(initial, foreign, { at: at(20) })).toBe(foreign);
  });

  it('attributes a settled cup once to the manager at the final and retains that credit after replacement', () => {
    const source = frozen({ kind: 'cup-title' as const, year: 2030, competition: 'cup:ENG' });
    const title = attributeManagerOutcome(frozen(create()), source, { at: at(200) });
    const replaced = recordManagerTenureChange(title, {
      kind: 'appointment',
      key: 'replace',
      at: at(210),
      manager: { id: 'b', name: 'B', interim: false },
    });
    expect(attributeManagerOutcome(frozen(replaced), source, { at: at(220) })).toBe(replaced);
    expect(replaced.outcomes).toEqual([{ source, tenure: 'ours:tenure:1', at: at(200) }]);
  });

  it('refuses retroactive operation dates and non-promotions', () => {
    const initial = create();
    const changed = recordManagerTenureChange(initial, {
      kind: 'appointment',
      key: 'change',
      at: at(100),
      manager: { id: 'b', name: 'B', interim: false },
    });
    expect(() => attributeManagerMatch(changed, match(), { at: at(99) })).toThrow('predates');
    expect(() =>
      attributeManagerOutcome(
        changed,
        { kind: 'league-finish', year: 2030, country: 'ENG', tier: 1, group: 0 },
        { at: at(99) },
      ),
    ).toThrow('predates');
    expect(() =>
      attributeManagerOutcome(
        initial,
        {
          kind: 'promotion',
          year: 2030,
          club: 'ours',
          from: { country: 'ENG', tier: 1, group: 0 },
          to: { country: 'ENG', tier: 1, group: 1 },
        },
        { at: at(300) },
      ),
    ).toThrow('upward');
  });

  it('does not consume RNG or mutate deeply frozen explicit inputs', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Unexpected RNG');
    });
    try {
      const input = frozen({
        club: 'ours',
        at: { ...at(0), revision: 0 },
        coverage: 'founding' as const,
        manager: { ...manager },
      });
      const before = JSON.stringify(input);
      const initial = frozen(createManagerHistoryFacts(input));
      const initialBefore = JSON.stringify(initial);
      const attributed = attributeManagerMatch(initial, frozen(match()), { at: at(20) });
      const settled = attributeManagerOutcome(
        initial,
        { kind: 'cup-title', year: 2030, competition: 'cup:ENG' },
        frozen({ at: at(200) }),
      );
      recordManagerTenureChange(
        frozen(settled),
        frozen({
          kind: 'appointment',
          key: 'new',
          at: at(201),
          manager: { id: 'b', name: 'B', interim: true },
        }),
      );
      expect(attributed.managerTenure).toBe('ours:tenure:1');
      expect(JSON.stringify(input)).toBe(before);
      expect(JSON.stringify(initial)).toBe(initialBefore);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
