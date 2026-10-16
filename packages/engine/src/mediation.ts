import type { RecruitmentMediation, SigningRequest, World } from '../../contracts/src/types';
import { careerDate, careerOrdinal, atCareerDate } from './person-careers';
import { transferWindow, transferWindowDays } from './transfers';
import { directionOption } from './direction';
import { staffBidShare } from './director-bidding';
import {
  requestCandidates,
  signingRequests,
  signingVerdict,
  requestLabel,
  pursueRequest,
} from './signings';
import { staffMember } from './staff';
import { isDelegated } from './responsibilities';
import { pushInbox } from './inbox';
import { lineOf } from './player';
import { compareIds, ratio } from './primitives';
import { overall } from './world';
import { transferOffers } from './ops-squad';
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
      fee = offer.freeAgent ? '0' : ratio(offer.fee, BigInt(staffBidShare(w)), 100n),
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
      managerReason:
        request.pick === offer.player.id
          ? `${requestLabel(request)} 보강을 위해 ${offer.player.name} 선수를 요청했어요.`
          : `${requestLabel(request)} 보강을 요청했어요. 현재 적합 후보는 ${offer.player.name} 선수예요.`,
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

/** One fixed next-window commitment, never a moved deadline or an invented arrival. */
export function promiseForMediation(w: World, mediation: RecruitmentMediation) {
  const existing = w.promises?.find(
    (p) =>
      p.status === 'pending' &&
      p.manager.id === mediation.manager.id &&
      requestTargetKey(p.target) === requestTargetKey(mediation.target),
  );
  if (existing) return existing;
  const year = mediation.created.year + (mediation.window === 'winter' ? 1 : 0);
  const deadline = {
    year,
    day:
      mediation.window === 'summer'
        ? transferWindowDays(year).winterClose
        : transferWindowDays(year).summerClose,
  };
  const promise: NonNullable<World['promises']>[number] = {
    id: `promise:${w.year}:${w.promises?.length ?? 0}`,
    mediation: mediation.id,
    manager: { ...mediation.manager },
    director: { ...mediation.director },
    target: { ...mediation.target },
    created: careerDate(w),
    deadline,
    status: 'pending',
  };
  (w.promises ??= []).push(promise);
  return promise;
}
export function resolveMediation(
  w: World,
  id: string,
  support: RecruitmentMediation['support'],
  actor: 'owner' | 'delegated' = 'owner',
) {
  const current = w.mediations?.find((m) => m.id === id);
  if (!current) throw new Error('영입 중재를 찾을 수 없어요.');
  if (current.status === 'resolved') return current;
  if (!['director', 'balanced', 'manager'].includes(support))
    throw new Error('중재 지원 방침을 확인하세요.');
  const trial = structuredClone(w),
    mediation = trial.mediations!.find((m) => m.id === id)!;
  return atCareerDate(trial, careerDate(w), () => {
    let result = '재정 판단을 존중해 이번 보강을 미뤘어요.',
      promise: string | undefined;
    if (trial.manager.id !== mediation.manager.id)
      result = '요청한 감독이 떠나 이번 영입 요청을 마감했어요.';
    else if (support !== 'director') {
      const pool = requestCandidates(trial, mediation.target),
        named = pool.find(({ offer }) => offer.player.id === mediation.target.pick);
      const fee = (offer: ReturnType<typeof requestCandidates>[number]['offer']) =>
        BigInt(
          offer.freeAgent
            ? '0'
            : actor === 'owner'
              ? offer.fee
              : ratio(offer.fee, BigInt(staffBidShare(trial)), 100n),
        );
      const namedOffer = transferOffers(trial).find(
        (offer) => offer.player.id === mediation.candidate.id,
      );
      const alternatives = pool
        .filter(
          ({ offer }) =>
            offer.player.id !== mediation.candidate.id &&
            namedOffer &&
            (fee(offer) < fee(namedOffer) ||
              (fee(offer) === fee(namedOffer) &&
                BigInt(offer.player.wage) < BigInt(namedOffer.player.wage))),
        )
        .sort((a, b) =>
          fee(a.offer) < fee(b.offer)
            ? -1
            : fee(a.offer) > fee(b.offer)
              ? 1
              : BigInt(a.offer.player.wage) < BigInt(b.offer.player.wage)
                ? -1
                : BigInt(a.offer.player.wage) > BigInt(b.offer.player.wage)
                  ? 1
                  : overall(b.offer.player) - overall(a.offer.player) ||
                    b.offer.player.potential - a.offer.player.potential ||
                    compareIds(a.offer.player.id, b.offer.player.id),
        );
      const choices = support === 'manager' ? (named ? [named] : []) : alternatives;
      let failure = '진행 가능한 적합 후보가 없어요.',
        started = false;
      for (const { offer } of choices) {
        const blocked = pursueRequest(trial, mediation.target, offer.player.id, actor);
        if (blocked) {
          failure = blocked;
          continue;
        }
        result = `${offer.player.name} ${offer.freeAgent ? '자유계약 영입을 완료했어요.' : '선수에게 실제 영입 제안을 보냈어요. 협상 결과를 기다려요.'}`;
        started = true;
        break;
      }
      if (!started) {
        const commitment = promiseForMediation(trial, mediation);
        promise = commitment.id;
        result = `${failure} 다음 이적시장 마감까지의 보강 약속을 기록했어요.`;
      }
    }
    mediation.status = 'resolved';
    mediation.resolution = {
      at: careerDate(trial),
      support,
      result,
      ...(promise ? { promise } : {}),
    };
    pushInbox(trial, {
      kind: 'staff-report',
      title: `${mediation.manager.name} 감독 영입 중재 결과`,
      detail: result,
      attention: false,
      ref: id,
    });
    Object.assign(w, trial);
    return mediation;
  });
}
export function resolveDelegatedMediations(w: World) {
  const pending = delegatedMediations(w);
  for (const mediation of pending)
    resolveMediation(
      w,
      mediation.id,
      directionOption(w, 'recruitmentSupport').id as RecruitmentMediation['support'],
      'delegated',
    );
  return pending.length;
}

/** A selected-case preview uses a private canonical copy; it cannot create real bids or promises. */
export function mediationPreview(w: World, id: string, support: RecruitmentMediation['support']) {
  const trial = structuredClone(w),
    beforeBids = new Set((w.bids ?? []).map((b) => b.id)),
    beforeArrivals = w.recruitmentArrivals?.length ?? 0;
  const record = resolveMediation(trial, id, support, 'owner');
  const promise = record.resolution?.promise
    ? trial.promises?.find((p) => p.id === record.resolution!.promise)
    : undefined;
  const bid = trial.bids?.find((b) => !beforeBids.has(b.id)),
    arrival = trial.recruitmentArrivals?.[beforeArrivals];
  return {
    id,
    support,
    result: record.resolution!.result,
    promise: promise ? { target: promise.target, deadline: promise.deadline } : undefined,
    offer: bid
      ? {
          player: bid.playerId,
          fee: bid.fee,
          wage: bid.offer?.player.wage ?? '0',
          kind: 'bid' as const,
        }
      : arrival
        ? {
            player: arrival.player,
            fee: '0',
            wage: trial.players.find((p) => p.id === arrival.player)!.wage,
            kind: 'arrival' as const,
          }
        : undefined,
    immediateSpend: (BigInt(w.cash) - BigInt(trial.cash)).toString(),
  };
}
