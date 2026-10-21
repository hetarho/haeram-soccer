import { partTop } from '../../../../packages/engine/src/facilities';
import type { FacilityKind } from './contracts';

const FACILITY_PART = {
  stadium: 'stadium',
  locker: 'stadium',
  training: 'training',
  manager: undefined,
  staff: undefined,
} as const satisfies Record<FacilityKind, string | undefined>;

/** Offices are a room image, without a separate facility upgrade in the world. */
export function facilityStageTop(kind: FacilityKind) {
  const part = FACILITY_PART[kind];
  return part === undefined ? 0 : partTop(part);
}
