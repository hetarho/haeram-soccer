import { describe, expect, it } from 'vitest';
import { RESPONSIBILITY_KEYS } from '../../../../packages/engine/src/responsibilities';
import { DIRECTION_AREAS } from './areas';
import { DESK_AREAS, DESK_RESPONSIBILITIES, OFFICE_DESKS, resolveOffice } from './officeDesks';
import { useTaskMemory } from './taskMemory';
import { openOwnerOffice, openDirection, useDepartmentPolicy } from './state';
describe('work desk coverage', () => {
  it('keeps every saved responsibility independent in exactly one relevant desk', () => {
    expect(OFFICE_DESKS).toHaveLength(5);
    expect(Object.values(DESK_RESPONSIBILITIES).flat().sort()).toEqual(
      [...RESPONSIBILITY_KEYS].sort(),
    );
    expect(DESK_RESPONSIBILITIES.investment).toEqual([]);
    expect(DESK_RESPONSIBILITIES.players).toContain('academy');
  });
  it('keeps every criteria area and every recurring spend reachable', () => {
    expect([...new Set(Object.values(DESK_AREAS).flat())].sort()).toEqual(
      DIRECTION_AREAS.map((a) => a.key).sort(),
    );
    expect(DESK_AREAS.investment).toEqual(
      expect.arrayContaining(['squad', 'youth', 'local', 'global', 'finance']),
    );
  });
  it.each(['strategy', 'build', 'finance', 'facility', 'marketing'])(
    'maps legacy %s to investment',
    (old) => {
      expect(resolveOffice(old)).toBe('investment');
      expect(resolveOffice('office')).toBe('office');
    },
  );
  it('opens the overview over retained work and forgets it on world replacement', () => {
    useTaskMemory.getState().activate('office-a');
    const draft = { policy: { support: 4 } };
    useTaskMemory.setState({ values: { 'board-draft': draft } });
    openDirection('scouting');
    openOwnerOffice();
    expect(useTaskMemory.getState().values).toEqual({
      'board-draft': draft,
      'office-overview': true,
    });
    expect(useDepartmentPolicy.getState().request).toEqual({ area: 'scouting' });
    useTaskMemory.getState().activate('office-b');
    expect(useTaskMemory.getState().values).toEqual({});
    useDepartmentPolicy.getState().close();
  });
});
