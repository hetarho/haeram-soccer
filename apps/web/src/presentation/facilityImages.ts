import { partLevel, partTop } from '../../../../packages/engine/src/facility-model';
import type { FacilityKind } from './contracts';

const FACILITY_PART = {
  stadium: 'stadium',
  locker: 'stadium',
  training: 'training',
  manager: undefined,
  staff: undefined,
  academy: 'academy',
} as const satisfies Record<FacilityKind, string | undefined>;

/** Atmospheric overviews without a mapped facility part use one semantic image stage. */
export function facilityStageTop(kind: FacilityKind) {
  const part = FACILITY_PART[kind];
  return part === undefined ? 0 : partTop(part);
}

/** Completed facts select artwork; construction targets are deliberately absent. */
export function facilityStage(kind: FacilityKind, w: Parameters<typeof partLevel>[0]) {
  const part = FACILITY_PART[kind];
  if (part === undefined) return 0;
  const level = partLevel(w, part);
  return Math.min(
    facilityStageTop(kind),
    Math.max(0, Math.trunc(Number.isFinite(level) ? level : 0)),
  );
}
