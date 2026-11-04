import { message as sourceMessage } from '../../contracts/src/messages';
import type { ManagerCriteria } from '../../contracts/src/types';

export const MANAGER_PRIORITY_INFO: Record<ManagerCriteria['priority'], string> = {
  ovr: sourceMessage('team.sort.ovr'),
  potential: sourceMessage('team.sort.potential'),
  wage: sourceMessage('copy.DecisionRuleFacts.f96961c954'),
  youth: sourceMessage('copy.hiring_info.1d85b9f4e3'),
};
