import { delegatedSponsors } from './sponsors';
import { describe, expect, it } from 'vitest';
import {
  createWorld,
  defaultSettings,
  dailyStaff,
  seasonAcademy,
  activePlayers,
  operate,
  staffMember,
  STAFF_ROLES,
  RESPONSIBILITY_KEYS,
} from './index';
const world = () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Staff Authority',
    color: '#224466',
    seed: 'staff-authority',
    level: 'normal',
  });
  w.settings = defaultSettings();
  w.cash = w.income = '999999999999';
  w.round = 23;
  return w;
};
describe('staff, manager, academy and sponsor responsibility', () => {
  for (const staff of ['direct', 'delegated'] as const) {
    it(`keeps ${staff} staff independent from the manager`, () => {
      const w = world();
      w.settings!.responsibilities.staff = staff;
      w.settings!.responsibilities.manager = staff === 'direct' ? 'delegated' : 'direct';
      w.manager.interim = true;
      const old = w.manager.id;
      dailyStaff(w);
      expect(STAFF_ROLES.some((role) => BigInt(staffMember(w, role)!.wage) > 0n)).toBe(
        staff === 'delegated',
      );
      expect(w.manager.id !== old).toBe(staff === 'direct');
    });
  }
  it('signs sponsors without delegating other work', () => {
    const w = world();
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'direct';
    delegatedSponsors(w);
    expect(w.sponsors ?? []).toHaveLength(0);
    w.settings!.responsibilities.sponsors = 'delegated';
    delegatedSponsors(w);
    expect(w.sponsors!.length).toBeGreaterThan(0);
    expect(w.settings!.responsibilities.staff).toBe('direct');
  });
  for (const academy of ['direct', 'delegated'] as const) {
    it(`${academy} academy acts on its ready prospect only when delegated`, () => {
      const w = world();
      w.settings!.responsibilities.academy = academy;
      const keeper = activePlayers(w).find((p) => p.position === 'GK')!;
      const prospect = structuredClone(keeper);
      keeper.status = 'sold';
      prospect.id += ':academy';
      prospect.name = 'Synthetic Prospect';
      prospect.born = w.year - 17;
      prospect.potential = 95;
      prospect.wage = '0';
      for (const key of Object.keys(prospect.attrs) as (keyof typeof prospect.attrs)[])
        prospect.attrs[key] = 85;
      w.academy = { players: [prospect] };
      seasonAcademy(w);
      expect(activePlayers(w).some((p) => p.id === prospect.id)).toBe(academy === 'delegated');
    });
  }
  it('does not spread a forced coach resignation to manager trust', () => {
    const w = world();
    operate(w, { type: 'hire-staff', role: 'assistant', candidate: 0 });
    const trust = w.manager.trust;
    for (let attempt = 0; attempt < 20 && staffMember(w, 'assistant'); attempt++)
      operate(w, { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true });
    expect(staffMember(w, 'assistant')).toBeUndefined();
    expect(w.manager.trust).toBe(trust);
  });
});
