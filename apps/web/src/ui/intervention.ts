import type {
  GameSettings,
  ResponsibilityKey,
  World,
} from '../../../../packages/contracts/src/types';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import type { GameClient } from '../runtime/client';

export const RESPONSIBILITY_LABELS: Readonly<Record<ResponsibilityKey, string>> = {
  manager: '감독 인사',
  staff: '스태프 인사',
  contracts: '선수 계약',
  recruitment: '선수 영입',
  sales: '선수 매각',
  academy: '유소년 승격·방출',
  sponsors: '스폰서 계약',
};
export function applyResponsibilitySettings(client: GameClient, settings: GameSettings) {
  return client.command({ type: 'settings', settings }, { background: true });
}
export function decisionOwner(w: Pick<World, 'intervention' | 'settings'>, key: ResponsibilityKey) {
  return { key, name: RESPONSIBILITY_LABELS[key], auto: isDelegated(w, key) };
}
