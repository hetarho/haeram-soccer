import { describe, expect, it } from 'vitest';
import type { StaffRole } from '../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../packages/engine/src/career.testkit';
import { clubStaffMember } from '../../../../packages/engine/src/club-staff';
import { clubManager } from '../../../../packages/engine/src/managerMarket';
import { CLUB_POSTS } from '../../../../packages/engine/src/staff-info';
import { clubProfile } from './clubProfile';

describe("a club detail's 코치진 (→WEB-58, STAFF-49)", () => {
  it('names the holder of every post at a club nobody owns, the manager first', () => {
    const w = careerWorld({ country: 'ENG', seed: 'club-profile-staff' });
    const rival = w.clubs.find((club) => club.id !== w.playerClub)!;
    const staff = clubProfile(w, rival.id)!.staff;
    expect(staff.map((post) => post.post)).toEqual(CLUB_POSTS);
    const manager = clubManager(w, rival);
    expect(staff[0]).toMatchObject({ post: 'manager', name: manager.name });
    expect(staff[0].note).toBeTruthy();
    for (const post of staff.slice(1)) {
      const holder = clubStaffMember(w, rival, post.post as StaffRole);
      expect(post).toEqual({
        post: post.post,
        name: holder.name,
        rating: Math.round(holder.ability),
        age: w.year - holder.born!,
      });
    }
    // Nothing is vacant, and reading again names the same people.
    expect(staff.every((post) => post.name)).toBe(true);
    expect(clubProfile(w, rival.id)!.staff).toEqual(staff);
  });

  it('lists our own posts as held, a vacant one without a holder', () => {
    const w = careerWorld({ country: 'ENG', seed: 'club-profile-own' });
    w.staff = (w.staff ?? []).filter((member) => member.role !== 'scout');
    const staff = clubProfile(w, w.playerClub)!.staff;
    expect(staff.map((post) => post.post)).toEqual(CLUB_POSTS);
    expect(staff[0]).toMatchObject({ post: 'manager', name: w.manager.name });
    expect(staff.find((post) => post.post === 'scout')).toEqual({ post: 'scout' });
  });
});
