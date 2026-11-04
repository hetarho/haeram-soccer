import { refreshReadModels } from './read-models';
import { resolveMediation } from './mediation';
import { answerPlayingCoach } from './playing-coach';
import type { World, Command } from '../../contracts/src/types';
import { readInbox } from './inbox';
import { signSponsor } from './sponsors';
import { squadCommand } from './ops-squad';
import { staffCommand } from './ops-staff';
import { advanceToNextEvent } from './next-event';
import { applySettings } from './settings';
import { chooseMatchKit } from './identity-operations';
import { adoptDesign, commissionDesign, discardDesigns, redrawDesigns } from './design-studio';
import { ENDED_MESSAGE, ownerCommand } from './owner';
import { investmentCommand } from './ops-investment';

// Read models and limits the app and other modules import from here.
export { sponsorAnnual, sponsorOffers, sponsorSlots } from './ops-commercial';
export { transferOffers } from './ops-squad';
export { MANAGER_GONE, managerRenewal } from './ops-staff';
export { BANKRUPTCY_ROUNDS, CASH_WARNING_ROUNDS } from './settlement';

export { operatingCost, credit, debit } from './transactions';
/** Refusal for a bankrupt club: the career is over, only its records remain. */
export const BANKRUPT_MESSAGE = '구단이 파산했어요. 기록을 내보내거나 새 게임을 시작하세요.';
/** The owner's commands, each handled by the domain that owns it. */
export function operate(w: World, cmd: Exclude<Command, { type: 'advance' | 'season' }>) {
  if (w.bankrupt && cmd.type !== 'read-inbox') throw new Error(BANKRUPT_MESSAGE);
  if (w.ended && cmd.type !== 'read-inbox') throw new Error(ENDED_MESSAGE);
  switch (cmd.type) {
    case 'club-policy':
    case 'coaching-investment':
    case 'facility-upgrade':
      investmentCommand(w, cmd);
      break;
    case 'next-event':
      advanceToNextEvent(w);
      break;
    case 'settings':
      applySettings(w, cmd.settings);
      break;
    case 'answer-playing-coach':
      answerPlayingCoach(w, cmd.player, cmd.accept);
      break;
    case 'resolve-mediation':
      resolveMediation(w, cmd.id, cmd.support);
      break;
    case 'read-inbox':
      readInbox(w, cmd.id);
      break;
    case 'match-kit':
      chooseMatchKit(w, cmd.fixtureId, cmd.role);
      break;
    case 'design-commission':
      commissionDesign(w, cmd.studio, cmd.colours);
      break;
    case 'adopt-design':
      adoptDesign(w, cmd.draft);
      break;
    case 'discard-designs':
      discardDesigns(w);
      break;
    case 'redraw-designs':
      redrawDesigns(w);
      break;
    // Day steps run in the host; as a command they change nothing.
    case 'advance-days':
    case 'next-match':
      break;
    case 'sign-sponsor':
      signSponsor(w, cmd.slot, cmd.offer);
      break;
    case 'owner-stake':
    case 'owner-inject':
    case 'owner-dividend':
      ownerCommand(w, cmd);
      break;
    case 'hire':
    case 'renew-manager':
    case 'hire-staff':
    case 'release-staff':
    case 'renew-staff':
      staffCommand(w, cmd);
      break;
    default:
      squadCommand(w, cmd);
  }
  refreshReadModels(w);
  w.revision++;
}
