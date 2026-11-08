import type { StaffCandidate } from '../../../../../../packages/contracts/src/types';

/**
 * Where a staff candidate comes from and what signing him pays up front (→STAFF-49, CLUB-50),
 * read from the candidate's own source: a free agent his signing fee, another club's holder the
 * fee and his club's compensation (웃돈) together.
 */
export type StaffOrigin =
  | { kind: 'free'; fee: string; total: string }
  | { kind: 'club'; club: string; fee: string; compensation: string; total: string };

export function staffOrigin(
  candidate: Pick<StaffCandidate, 'source' | 'club' | 'fee' | 'compensation'>,
): StaffOrigin {
  if (candidate.source === 'club' && candidate.club) {
    const compensation = candidate.compensation ?? '0';
    return {
      kind: 'club',
      club: candidate.club,
      fee: candidate.fee,
      compensation,
      total: (BigInt(candidate.fee) + BigInt(compensation)).toString(),
    };
  }
  return { kind: 'free', fee: candidate.fee, total: candidate.fee };
}
