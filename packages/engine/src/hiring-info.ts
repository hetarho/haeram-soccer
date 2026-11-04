import type { ManagerCriteria } from '../../contracts/src/types';

export const MANAGER_PRIORITY_INFO: Record<ManagerCriteria['priority'], string> = {
  ovr: 'OVR 높은 순',
  potential: '잠재력 높은 순',
  wage: '연봉 낮은 순',
  youth: '육성 높은 순',
};
