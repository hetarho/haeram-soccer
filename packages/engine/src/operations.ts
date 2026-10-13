import type { World, Command } from '../../contracts/src/types';
import { operatingCosts } from './finance';
import { readInbox } from './inbox';
import { commercialCommand } from './ops-commercial';
import { squadCommand } from './ops-squad';
import { staffCommand } from './ops-staff';

// Read models and limits the app and other modules import from here.
export { campaignOffers, sponsorAnnual, sponsorOffers, sponsorSlots } from './ops-commercial';
export { transferOffers } from './ops-squad';
export { MANAGER_GONE, managerRenewal } from './ops-staff';
export { BANKRUPTCY_ROUNDS, CASH_WARNING_ROUNDS } from './settlement';

export function operatingCost(w: World) {
  return operatingCosts(w).annual;
}
export function credit(w: World, amount: string) {
  if (BigInt(amount) < 0) throw new Error('음수 수입');
  w.cash = (BigInt(w.cash) + BigInt(amount)).toString();
  w.income = (BigInt(w.income) + BigInt(amount)).toString();
}
export function debit(w: World, amount: string, mandatory = false) {
  if (BigInt(amount) < 0) throw new Error('음수 지출');
  if (!mandatory && BigInt(w.cash) < BigInt(amount)) throw new Error('보유 자금이 부족합니다.');
  w.cash = (BigInt(w.cash) - BigInt(amount)).toString();
  w.expense = (BigInt(w.expense) + BigInt(amount)).toString();
}
/** Refusal for a bankrupt club: the career is over, only its records remain. */
export const BANKRUPT_MESSAGE = '구단이 파산했어요. 기록을 내보내거나 새 클럽을 창단하세요.';
/** The owner's commands, each handled by the domain that owns it. */
export function operate(w: World, cmd: Exclude<Command, { type: 'advance' | 'season' }>) {
  if (w.bankrupt && cmd.type !== 'read-inbox') throw new Error(BANKRUPT_MESSAGE);
  switch (cmd.type) {
    case 'read-inbox':
      readInbox(w, cmd.id);
      break;
    // Day steps run in the host; as a command they change nothing.
    case 'advance-days':
    case 'next-match':
      break;
    case 'sponsor':
    case 'sign-sponsor':
    case 'campaign':
    case 'ticket':
    case 'facility':
    case 'support':
    case 'policy':
    case 'build':
      commercialCommand(w, cmd);
      break;
    case 'hire':
    case 'renew-manager':
    case 'tactics':
    case 'accept-condition':
    case 'hire-staff':
    case 'release-staff':
    case 'renew-staff':
    case 'delegate':
    case 'hiring':
    case 'talk-rule':
      staffCommand(w, cmd);
      break;
    default:
      squadCommand(w, cmd);
  }
  w.revision++;
}
