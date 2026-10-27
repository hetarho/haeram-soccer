import type { Command, InboxItem, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { WorkDesk } from './officeDesks';

export interface ApprovalRequest {
  world: string;
  desk: WorkDesk;
  item: StopReason;
}

/** Read the existing authority mapping; observations never become office work. */
export function eventDesk(item: StopReason): WorkDesk | undefined {
  if (item.kind === 'match' || item.kind === 'window-open') return;
  const keys = item.responsibilities ?? (item.responsibility ? [item.responsibility] : []);
  if (keys.some((key) => ['contracts', 'recruitment', 'sales', 'academy'].includes(key)))
    return 'players';
  if (keys.some((key) => key === 'manager' || key === 'staff')) return 'staff';
  if (keys.includes('sponsors') || item.kind === 'sponsor-ending') return 'sponsor';
  if (item.kind === 'finance') return item.title.includes('후원') ? 'sponsor' : 'investment';
  if (
    [
      'contract-talk',
      'unhappy',
      'transfer-request',
      'incoming-bid',
      'bid-response',
      'youth-intake',
    ].includes(item.kind)
  )
    return 'players';
  if (item.kind === 'staff-renewal') return 'staff';
}

/** Only a command answering this request may complete its return journey. */
export function answersRequest(w: World, item: InboxItem, command: Command): boolean {
  switch (command.type) {
    case 'respond-bid':
    case 'resolve-mediation':
    case 'promote-youth':
    case 'release-youth':
      return command.id === item.ref;
    case 'contract-offer':
    case 'contract-decline':
    case 'answer-playing-coach':
      return command.player === item.ref;
    case 'renew-manager':
    case 'hire':
      return item.kind === 'staff-renewal' && item.ref === w.manager.id;
    case 'hire-staff':
    case 'renew-staff':
      return (
        item.kind === 'staff-renewal' &&
        (command.role === item.ref ||
          w.staff?.some((member) => member.id === item.ref && member.role === command.role) ===
            true)
      );
    case 'sign-sponsor':
      return command.slot === item.ref;
    case 'support':
      return item.kind === 'finance';
    default:
      return false;
  }
}
