import type { InboxItem, ResponsibilityKey, World } from '../../contracts/src/types';
import { currentDay, daysUntilNextMatch, nextOwnFixture } from './calendar';
import { activePlayers } from './world';
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
/** Live, dated decision references. Inbox retention and read state are never business authority. */
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
  const combined = Object.values(w.playingCoachProposals || {}).filter(
    (p) => p.status === 'pending',
  );
  for (const proposal of combined) {
    const keys: ResponsibilityKey[] = ['contracts', 'staff'];
    const direct = keys.find((key) => !isDelegated(w, key));
    if (!includeDelegated && !direct) continue;
    const key = direct ?? 'contracts';
    reasons.push({
      id: `decision:playing-coach:${proposal.person}`,
      year,
      day,
      kind: 'staff-renewal',
      ref: proposal.person,
      title: `${w.people?.[proposal.person]?.name ?? '선수'} 플레잉 코치 계약 검토`,
      detail: '선수와 코치 계약을 함께 승인해 주세요.',
      attention: true,
      responsibility: key,
      responsibilities: keys,
    });
  }
  for (const p of activePlayers(w))
    if (p.talk && !combined.some((proposal) => proposal.person === p.id))
      add('contracts', p.id, 'contract-talk', `${p.name} 선수 계약에 답변해 주세요`);
  for (const bid of w.bids || []) {
    if (bid.direction === 'out' && bid.status === 'countered')
      add('recruitment', bid.id, 'bid-response', '선수 영입 역제안에 답변해 주세요');
    if (
      bid.direction === 'in' &&
      bid.status === 'pending' &&
      bid.year === year &&
      bid.due >= day &&
      activePlayers(w).some((p) => p.id === bid.playerId)
    ) {
      const coach = w.staff?.find((member) => member.person === bid.playerId);
      if (!coach) add('sales', bid.id, 'incoming-bid', '선수 매각 제안에 답변해 주세요');
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
            title: `${coach.name} 선수·코치 계약 종료 검토`,
            detail:
              '매각하면 선수와 코치 계약이 함께 끝나요. 기존 코치 계약 종료 비용을 확인하세요.',
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
      '새 감독을 선임해 주세요',
      `${year}`,
      '임시 감독 유지',
    );
  else if (day >= renewalDay(year) && managerRenewal(w))
    add(
      'manager',
      w.manager.id,
      'staff-renewal',
      `${w.manager.name} 감독 재계약`,
      `${w.manager.until}`,
      '재계약하지 않기',
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
          `${STAFF_INFO[role].label} 공석`,
          `${year}`,
          '공석 유지',
        );
      else if (day >= renewalDay(year) && isExpiring(w, member))
        add(
          'staff',
          member.id,
          'staff-renewal',
          `${member.name} 코치 재계약`,
          `${member.until}`,
          '재계약하지 않기',
        );
    }
  for (const review of w.academyReviews || [])
    if (w.academy?.players.some((p) => p.id === review.id))
      add(
        'academy',
        review.id,
        'staff-report',
        review.kind === 'promote' ? '유소년 승격 검토' : '유소년 방출 검토',
        `${review.year}`,
        '아카데미에 남기기',
      );
  if (includeDelegated || !isDelegated(w, 'sponsors'))
    for (const slot of sponsorSlots(w))
      if (slot.open && !slot.contract && slot.offers.length)
        add(
          'sponsors',
          slot.slot,
          'sponsor-ending',
          `${slot.label} 계약 검토`,
          `${year}`,
          '이번 시즌 계약 보류',
        );
  return reasons;
}
export function stoppingReasons(w: World): StopReason[] {
  const reasons = pendingDecisions(w),
    preferences = settingsOf(w).observations;
  if (preferences.matchEve && daysUntilNextMatch(w) === 1) {
    const fixture = nextOwnFixture(w)!;
    reasons.push({
      id: `match-eve:${fixture.id}`,
      year: w.year,
      day: currentDay(w),
      kind: 'match',
      title: '내일 경기',
      detail: '경기 준비·관람·결과 진행을 선택하세요.',
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
