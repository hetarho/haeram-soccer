import { resolveMediation } from './mediation';
import { proposePlayingCoach, answerPlayingCoach } from './playing-coach';
import { encourageCoaching } from './coaching-entry';
import type { World, Command } from '../../contracts/src/types';
import { readInbox } from './inbox';
import { commercialCommand } from './ops-commercial';
import { squadCommand } from './ops-squad';
import { staffCommand } from './ops-staff';
import { advanceToNextEvent } from './next-event';
import { applySettings } from './settings';

// Read models and limits the app and other modules import from here.
export { campaignOffers, sponsorAnnual, sponsorOffers, sponsorSlots } from './ops-commercial';
export { transferOffers } from './ops-squad';
export { MANAGER_GONE, managerRenewal } from './ops-staff';
export { BANKRUPTCY_ROUNDS, CASH_WARNING_ROUNDS } from './settlement';

export { operatingCost, credit, debit } from './transactions';
/** Refusal for a bankrupt club: the career is over, only its records remain. */
export const BANKRUPT_MESSAGE = '구단이 파산했어요. 기록을 내보내거나 새 클럽을 창단하세요.';
/** The owner's commands, each handled by the domain that owns it. */
export function operate(w: World, cmd: Exclude<Command, { type: 'advance' | 'season' }>) {
  if (w.bankrupt && cmd.type !== 'read-inbox') throw new Error(BANKRUPT_MESSAGE);
  switch (cmd.type) {
    case 'next-event':
      advanceToNextEvent(w);
      break;
    case 'settings':
      applySettings(w, cmd.settings);
      break;
    case 'propose-playing-coach':
      proposePlayingCoach(w, cmd.player, cmd.years, cmd.term);
      break;
    case 'answer-playing-coach':
      answerPlayingCoach(w, cmd.player, cmd.accept);
      break;
    case 'resolve-mediation':
      resolveMediation(w, cmd.id, cmd.support);
      break;
    case 'encourage-coaching':
      encourageCoaching(w, cmd.player);
      break;
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
    case 'intervention':
    case 'coach-training':
    case 'direction':
      staffCommand(w, cmd);
      break;
    default:
      squadCommand(w, cmd);
  }
  w.revision++;
}
