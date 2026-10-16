import type { GameSettings, ResponsibilityKey, World } from '../../contracts/src/types';
import { changedResponsibilities, isDelegated } from './responsibilities';
import { pendingDecisions } from './stopping';
import { answerPendingContracts } from './contracts';
import { handoverRecruitment, handoverSales } from './transfers';
import { fillDelegatedPost, managerRenewalReminder, STAFF_ROLES, staffMember } from './staff';
import { appointDelegatedManager } from './ops-staff';
import { seasonAcademy } from './academy';
import { delegatedSponsors } from './sponsors';

/** A pure snapshot for disclosure; applying always queries the live world again. */
export function pendingWorkPreview(w: World, settings: GameSettings) {
  const pending = pendingDecisions(w, true);
  return changedResponsibilities(w, settings).map((key) => {
    const refs = new Set(pending.filter((p) => p.responsibility === key).map((p) => p.ref!));
    if (key === 'recruitment')
      for (const bid of w.bids || [])
        if (bid.direction === 'out' && (bid.status === 'pending' || bid.status === 'countered'))
          refs.add(bid.id);
    return { key, to: settings.responsibilities[key], count: refs.size, refs: [...refs] };
  });
}
export function handoverPendingWork(w: World, changed: readonly ResponsibilityKey[]) {
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
