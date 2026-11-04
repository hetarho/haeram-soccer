import { message as sourceMessage } from '../../contracts/src/messages';
import type { InboxItem, ResponsibilityKey, World } from '../../contracts/src/types';
import { currentDay, daysUntilNextMatch, nextOwnFixture } from './calendar';
import { activePlayers } from './player-state';
import { isDelegated, settingsOf } from './responsibilities';
import { isExpiring, renewalDay, STAFF_INFO, STAFF_ROLES, staffMember } from './staff';
import { managerRenewal } from './ops-staff';
import { sponsorSlots } from './sponsors';

export interface StopReason extends InboxItem {
  responsibility?: ResponsibilityKey;
  responsibilities?: ResponsibilityKey[];
  /** Optional business choices require an explicit decision, never notification read state. */
  alternative?: string;
}
export const decisionId = (key: ResponsibilityKey, ref: string, version = '') =>
  `decision:${key}:${ref}:${version}`;
/**
 * Live, dated owner approvals waiting in the 결재함. They never stop progression (→WEB-42); inbox
 * retention and read state are never business authority.
 */
export function pendingDecisions(w: World, includeDelegated = false): StopReason[] {
  const year = w.year,
    day = currentDay(w),
    reasons: StopReason[] = [];
  const add = (
    key: ResponsibilityKey,
    ref: string,
    kind: InboxItem['kind'],
    title: string,
    version = '',
    alternative?: string,
  ) => {
    if (!includeDelegated && isDelegated(w, key)) return;
    const id = decisionId(key, ref, version);
    if (w.decisionChoices?.includes(id)) return;
    reasons.push({
      id,
      year,
      day,
      kind,
      ref,
      title,
      detail: title,
      attention: true,
      responsibility: key,
      ...(alternative ? { alternative } : {}),
    });
  };
  for (const mediation of w.mediations ?? [])
    if (mediation.status === 'pending')
      add(
        'recruitment',
        mediation.id,
        'staff-report',
        sourceMessage('copy.mediation.73f275aff7', {
          p0: mediation.manager.name,
          p1: mediation.director.name,
        }),
      );
  const combined = Object.values(w.playingCoachProposals || {}).filter(
    (p) => p.status === 'pending',
  );
  for (const proposal of combined) {
    const keys: ResponsibilityKey[] = ['contracts', 'staff'];
    const direct = keys.find((key) => !isDelegated(w, key));
    if (!includeDelegated && !direct) continue;
    const key = direct ?? 'contracts';
    // He is one of our players: the browser's projection, which carries no `people`, names him
    // from the squad as the worker does from his career record.
    const name =
      w.people?.[proposal.person]?.name ?? w.players.find((p) => p.id === proposal.person)?.name;
    reasons.push({
      id: `decision:playing-coach:${proposal.person}`,
      year,
      day,
      kind: 'staff-renewal',
      ref: proposal.person,
      title: sourceMessage('copy.staff.904f237b75', {
        p0: name ?? sourceMessage('team.column.player'),
      }),
      detail: sourceMessage('copy.stopping.4c06545fed'),
      attention: true,
      responsibility: key,
      responsibilities: keys,
    });
  }
  for (const p of activePlayers(w))
    if (p.talk && !combined.some((proposal) => proposal.person === p.id))
      add(
        'contracts',
        p.id,
        'contract-talk',
        sourceMessage('copy.stopping.da83783ea0', { p0: p.name }),
      );
  for (const bid of w.bids || []) {
    if (bid.direction === 'out' && bid.status === 'countered')
      add('recruitment', bid.id, 'bid-response', sourceMessage('copy.stopping.74e09e697b'));
    if (
      bid.direction === 'in' &&
      bid.status === 'pending' &&
      bid.year === year &&
      bid.due >= day &&
      activePlayers(w).some((p) => p.id === bid.playerId)
    ) {
      const coach = w.staff?.find((member) => member.person === bid.playerId);
      if (!coach) add('sales', bid.id, 'incoming-bid', sourceMessage('copy.stopping.05e7dc9963'));
      else {
        const keys: ResponsibilityKey[] = ['sales', 'staff'],
          direct = keys.find((key) => !isDelegated(w, key));
        if (includeDelegated || direct)
          reasons.push({
            id: `decision:playing-coach-sale:${bid.id}`,
            year,
            day,
            kind: 'incoming-bid',
            ref: bid.id,
            title: sourceMessage('copy.stopping.8b601a30d9', { p0: coach.name }),
            detail: sourceMessage('copy.stopping.759a033a1c'),
            attention: true,
            responsibility: direct ?? 'sales',
            responsibilities: keys,
          });
      }
    }
  }
  if (w.manager.interim)
    add(
      'manager',
      w.manager.id,
      'staff-renewal',
      sourceMessage('copy.stopping.8d0c9c2908'),
      `${year}`,
      sourceMessage('copy.stopping.9a8d58c6df'),
    );
  else if (day >= renewalDay(year) && managerRenewal(w))
    add(
      'manager',
      w.manager.id,
      'staff-renewal',
      sourceMessage('copy.stopping.ce7db6a93a', { p0: w.manager.name }),
      `${w.manager.until}`,
      sourceMessage('copy.stopping.b21cb63550'),
    );
  if (w.staff)
    for (const role of STAFF_ROLES) {
      if (combined.some((proposal) => proposal.role === role)) continue;
      if (
        (w.bids || []).some(
          (bid) =>
            bid.direction === 'in' &&
            bid.status === 'pending' &&
            bid.year === year &&
            bid.due >= day &&
            w.staff?.some((member) => member.role === role && member.person === bid.playerId),
        )
      )
        continue;
      const member = staffMember(w, role);
      if (!member)
        add(
          'staff',
          role,
          'staff-renewal',
          sourceMessage('copy.stopping.19bd768311', { p0: STAFF_INFO[role].label }),
          `${year}`,
          sourceMessage('copy.stopping.f90850b2fd'),
        );
      else if (day >= renewalDay(year) && isExpiring(w, member))
        add(
          'staff',
          member.id,
          'staff-renewal',
          sourceMessage('copy.stopping.312c49770e', { p0: member.name }),
          `${member.until}`,
          sourceMessage('copy.stopping.b21cb63550'),
        );
    }
  for (const review of w.academyReviews || [])
    if (w.academy?.players.some((p) => p.id === review.id))
      add(
        'academy',
        review.id,
        'staff-report',
        review.kind === 'promote'
          ? sourceMessage('copy.stopping.8a91808257')
          : sourceMessage('copy.stopping.8bacb3c01e'),
        `${review.year}`,
        sourceMessage('copy.stopping.2c00cfed22'),
      );
  if (includeDelegated || !isDelegated(w, 'sponsors'))
    for (const slot of sponsorSlots(w))
      if (slot.open && !slot.contract && slot.offers.length)
        add(
          'sponsors',
          slot.slot,
          'sponsor-ending',
          sourceMessage('copy.stopping.a86a89ae16', { p0: slot.label }),
          `${year}`,
          sourceMessage('copy.stopping.cddc2ef401'),
        );
  return reasons;
}
/** The enabled observations that stop progression today; owner approvals never do (→WEB-42/45). */
export function stoppingReasons(w: World): StopReason[] {
  const reasons: StopReason[] = [],
    preferences = settingsOf(w).observations;
  if (preferences.matchEve && daysUntilNextMatch(w) === 1) {
    const fixture = nextOwnFixture(w)!;
    reasons.push({
      id: `match-eve:${fixture.id}`,
      year: w.year,
      day: currentDay(w),
      kind: 'match',
      title: sourceMessage('copy.stopping.6ad77c4be0'),
      detail: sourceMessage('copy.stopping.ba85da71e2'),
      attention: true,
      ref: fixture.id,
    });
  }
  if (preferences.windowOpen)
    reasons.push(
      ...(w.inbox || []).filter(
        (item) =>
          item.kind === 'window-open' &&
          item.year === w.year &&
          item.day === currentDay(w) &&
          !item.read,
      ),
    );
  return reasons;
}
