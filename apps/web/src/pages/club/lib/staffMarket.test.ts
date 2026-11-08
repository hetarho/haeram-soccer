import { describe, expect, it } from 'vitest';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { staffCandidates } from '../../../../../../packages/engine/src/staff';
import { STAFF_ROLES } from '../../../../../../packages/engine/src/staff-info';
import { staffOrigin } from './staffMarket';

describe('where a staff candidate comes from and what he costs up front (→STAFF-49, CLUB-50)', () => {
  it('a free agent costs his signing fee alone', () => {
    expect(staffOrigin({ source: 'free', fee: '250' })).toEqual({
      kind: 'free',
      fee: '250',
      total: '250',
    });
  });

  it("another club's holder costs the fee and his club's compensation together", () => {
    expect(
      staffOrigin({ source: 'club', club: 'ENG-0-0-4', fee: '250', compensation: '1000' }),
    ).toEqual({ kind: 'club', club: 'ENG-0-0-4', fee: '250', compensation: '1000', total: '1250' });
  });

  it("reads every post's market as the world holds it: free agents and other clubs' holders", () => {
    const w = careerWorld({ country: 'ENG', seed: 'staff-market-ui' });
    for (const role of STAFF_ROLES) {
      const candidates = staffCandidates(w, role);
      const origins = candidates.map(staffOrigin);
      expect(origins.some((origin) => origin.kind === 'free')).toBe(true);
      expect(origins.some((origin) => origin.kind === 'club')).toBe(true);
      origins.forEach((origin, index) => {
        const candidate = candidates[index];
        if (origin.kind === 'club') {
          expect(origin).toMatchObject({
            club: candidate.club,
            compensation: candidate.compensation,
          });
          expect(BigInt(origin.total)).toBe(
            BigInt(candidate.fee) + BigInt(candidate.compensation!),
          );
        } else {
          expect(candidate.source).toBe('free');
          expect(origin.total).toBe(candidate.fee);
        }
      });
    }
  });
});
