import type { BuildSlot } from '../../../../../../packages/contracts/src/build';
import type {
  DirectionKey,
  PolicyKey,
  ResponsibilityKey,
} from '../../../../../../packages/contracts/src/types';

/** Every existing operating dial has one editing home. Decision rules can have passive side effects. */
export const DECISION_DIRECTIONS: Record<ResponsibilityKey, readonly DirectionKey[]> = {
  manager: ['manager', 'school'],
  staff: ['coaches'],
  contracts: ['renewal'],
  recruitment: ['recruitmentSupport'],
  sales: [],
  academy: ['youthGoal', 'debut'],
  sponsors: [],
};
export const DECISION_POLICIES: Record<ResponsibilityKey, readonly PolicyKey[]> = {
  manager: [],
  staff: [],
  contracts: [],
  recruitment: ['recruitment'],
  sales: [],
  academy: [],
  sponsors: [],
};
export const DECISION_BUILDS: Record<ResponsibilityKey, readonly BuildSlot[]> = {
  manager: [],
  staff: [],
  contracts: [],
  recruitment: [],
  sales: ['market'],
  academy: [],
  sponsors: [],
};
export const PASSIVE_POLICIES = {
  firstTeam: ['support'],
  youth: ['academy'],
  coaches: [],
  stadium: [],
  scouting: ['globalScouting'],
  community: ['localInvest', 'globalMarketing', 'tour'],
  finance: [],
  identity: [],
} as const satisfies Record<string, readonly PolicyKey[]>;
export const PASSIVE_BUILDS = {
  firstTeam: ['culture'],
  youth: ['youth'],
  coaches: [],
  stadium: [],
  scouting: ['scouting'],
  community: ['fans'],
  finance: ['revenue'],
  identity: [],
} as const satisfies Record<string, readonly BuildSlot[]>;
