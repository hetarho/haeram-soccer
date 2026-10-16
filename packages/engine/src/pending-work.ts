import { handoverPlayingCoaches } from './playing-coach';
import type { ResponsibilityKey, World } from '../../contracts/src/types';
import { isDelegated } from './responsibilities';
import { pendingDecisions } from './stopping';
import { answerPendingContracts } from './contracts';
import { handoverRecruitment, handoverSales } from './transfers';
import { fillDelegatedPost, managerRenewalReminder, STAFF_ROLES, staffMember } from './staff';
import { appointDelegatedManager } from './ops-staff';
import { seasonAcademy } from './academy';
import { delegatedSponsors } from './sponsors';

export { pendingWorkPreview } from './pending-work-preview';
export function handoverPendingWork(w: World, changed: readonly ResponsibilityKey[]) {
  if (changed.includes('contracts') || changed.includes('staff')) handoverPlayingCoaches(w);
  for (const key of changed) {
    const delegated = isDelegated(w, key);
    if (key === 'recruitment') {
      handoverRecruitment(w, delegated);
      continue;
    }
    if (!delegated) continue;
    switch (key) {
      case 'contracts':
        answerPendingContracts(w);
        break;
      case 'sales':
        handoverSales(w);
        break;
      case 'manager':
        if (w.manager.interim) appointDelegatedManager(w);
        else if (pendingDecisions(w, true).some((p) => p.responsibility === 'manager'))
          managerRenewalReminder(w);
        break;
      case 'staff': {
        const pending = new Set(
          pendingDecisions(w, true)
            .filter((p) => p.responsibility === 'staff')
            .map((p) => p.ref),
        );
        for (const role of STAFF_ROLES) {
          const member = staffMember(w, role);
          if (pending.has(member?.id ?? role)) fillDelegatedPost(w, role);
        }
        // Paid renewals keep the ordinary season-close selection and financial checks.
        break;
      }
      case 'academy':
        if (w.academyReviews?.length) seasonAcademy(w);
        break;
      case 'sponsors':
        delegatedSponsors(w);
        break;
    }
  }
}
