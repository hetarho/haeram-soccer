import { partTop } from '../../../../packages/engine/src/facilities';
import type { FacilityKind } from './contracts';

const FACILITY_PART = {
  stadium: 'stadium',
  locker: 'stadium',
  training: 'training',
  manager: undefined,
  staff: undefined,
  academy: undefined,
} as const satisfies Record<FacilityKind, string | undefined>;

/** Atmospheric overviews without a mapped facility part use one semantic image stage. */
export function facilityStageTop(kind: FacilityKind) {
  const part = FACILITY_PART[kind];
  return part === undefined ? 0 : partTop(part);
}
