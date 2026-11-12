import type { BuildSlot } from '../../../../../../packages/contracts/src/build';
import type {
  BudgetResponsibility,
  DirectionKey,
  PolicyKey,
  ResponsibilityKey,
} from '../../../../../../packages/contracts/src/types';

/**
 * Every club setting has one editing home, an investment area's page (→WEB-14): its dials, build
 * cards and direction rows. A row or dial a delegated person sets (`DELEGATE_CONTROLS`) shows
 * there read only while its work is delegated; who decides is chosen on the delegation page only.
 */
export const PASSIVE_POLICIES = {
  firstTeam: ['support'],
  youth: ['academy'],
  coaches: [],
  stadium: [],
  scouting: ['recruitment', 'globalScouting'],
  community: ['localInvest', 'globalMarketing', 'tour'],
  finance: [],
  identity: [],
} as const satisfies Record<string, readonly PolicyKey[]>;
export const PASSIVE_BUILDS = {
  firstTeam: ['culture', 'market'],
  youth: ['youth'],
  coaches: [],
  stadium: [],
  scouting: ['scouting'],
  community: ['fans'],
  finance: ['revenue'],
  identity: [],
} as const satisfies Record<string, readonly BuildSlot[]>;
export const AREA_DIRECTIONS = {
  firstTeam: ['renewal'],
  youth: ['youthGoal', 'debut'],
  coaches: ['manager', 'school', 'coaches'],
  stadium: [],
  scouting: ['recruitmentSupport'],
  community: [],
  finance: [],
  identity: [],
} as const satisfies Record<string, readonly DirectionKey[]>;
/** The delegated works whose people decide on an area's page, each heading it with who decides. */
export const AREA_DELEGATIONS = {
  firstTeam: ['contracts', 'sales'],
  youth: ['academy'],
  coaches: ['manager', 'staff'],
  stadium: [],
  scouting: ['recruitment'],
  community: [],
  finance: [],
  identity: [],
} as const satisfies Record<string, readonly BudgetResponsibility[]>;
export type ControlArea = keyof typeof AREA_DELEGATIONS;
/** The page where a work's details are read and, while the owner decides, set. */
export function delegationArea(key: ResponsibilityKey): ControlArea | undefined {
  return (Object.keys(AREA_DELEGATIONS) as ControlArea[]).find((area) =>
    (AREA_DELEGATIONS[area] as readonly ResponsibilityKey[]).includes(key),
  );
}
