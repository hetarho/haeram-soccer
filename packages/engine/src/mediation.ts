import type { RecruitmentMediation, SigningRequest, World } from '../../contracts/src/types';
import { careerDate, careerOrdinal } from './person-careers';
import { transferWindow, transferWindowDays } from './transfers';
import { directionOption, financeStance } from './direction';
import { requestCandidates, signingRequests, signingVerdict, requestLabel } from './signings';
import { staffMember } from './staff';
import { isDelegated } from './responsibilities';
import { pushInbox } from './inbox';
import { lineOf } from './player';
import { ratio } from './primitives';
export const requestTargetKey = (request: SigningRequest) =>
  request.kind === 'short' ? `line:${request.line}` : `slot:${request.slot}:${request.position}`;
export function requestMet(w: World, request: SigningRequest, from: { year: number; day: number }) {
  const now = careerOrdinal(careerDate(w));
  return (w.recruitmentArrivals ?? []).some(
    (arrival) =>
      careerOrdinal(arrival.at) >= careerOrdinal(from) &&
      careerOrdinal(arrival.at) <= now &&
      (request.position
        ? (arrival.positions[request.position] ?? 0) >= 2
        : lineOf(arrival.position) === request.line),
  );
}
/** T170 consumes this explicit delegated resolver queue; no fabricated resolution is recorded. */
export function delegatedMediations(w: World) {
  return isDelegated(w, 'recruitment')
    ? (w.mediations ?? []).filter((m) => m.status === 'pending')
    : [];
}
export function detectMediations(w: World): RecruitmentMediation[] {
  const window = transferWindow(w),
    director = staffMember(w, 'director');
  if (!window.open || !window.kind || !director || w.manager.interim) return [];
  const at = careerDate(w),
    opening =
      window.kind === 'summer'
        ? transferWindowDays(w.year).summerOpen
        : transferWindowDays(w.year).winterOpen;
  const created: RecruitmentMediation[] = [];
  for (const request of signingRequests(w)) {
    const key = `${w.manager.id}:${w.year}:${window.kind}:${requestTargetKey(request)}`;
    if (
      w.mediations?.some((m) => m.key === key) ||
      requestMet(w, request, { year: w.year, day: opening })
    )
      continue;
    const candidates = requestCandidates(w, request),
      picked = candidates.find(({ offer }) => offer.player.id === request.pick) ?? candidates[0];
    if (!picked) {
      const ref = `request:${key}`.slice(0, 100);
      if (!w.inbox?.some((item) => item.ref === ref))
        pushInbox(w, {
          kind: 'staff-report',
          title: `${w.manager.name} 감독의 ${requestLabel(request)} 요청`,
          detail:
            '현재 요청에 맞는 영입 가능한 후보가 없거나 이미 협상을 진행했어요. 재정적 대립으로 판단하지 않아요.',
          attention: false,
          ref,
        });
      continue;
    }
    const { offer } = picked,
      fee = offer.freeAgent
        ? '0'
        : ratio(offer.fee, BigInt(Math.round(financeStance(w).signing.bid * 100)), 100n),
      verdict = signingVerdict(w, offer.player, fee);
    if (verdict.ok) continue;
    const mediation: RecruitmentMediation = {
      id: `mediation:${w.year}:${w.mediations?.length ?? 0}`,
      key,
      created: at,
      window: window.kind,
      manager: { id: w.manager.id, name: w.manager.name },
      director: { id: director.id, name: director.name },
      target: { ...request },
      candidate: { id: offer.player.id, name: offer.player.name, fee, wage: offer.player.wage },
      managerReason: `${requestLabel(request)} 보강을 위해 ${offer.player.name} 선수를 요청했어요.`,
      directorReason: verdict.reason,
      support: directionOption(w, 'recruitmentSupport').id as RecruitmentMediation['support'],
      status: 'pending',
    };
    (w.mediations ??= []).push(mediation);
    created.push(mediation);
    pushInbox(w, {
      kind: 'staff-report',
      title: `${w.manager.name} 감독·${director.name} 단장 영입 중재`,
      detail: `${mediation.managerReason} ${verdict.reason}`.slice(0, 400),
      attention: !isDelegated(w, 'recruitment'),
      ref: mediation.id,
    });
  }
  return created;
}
