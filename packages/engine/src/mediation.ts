import { message as sourceMessage } from '../../contracts/src/messages';
import type { RecruitmentMediation, SigningRequest, World } from '../../contracts/src/types';
import { careerDate, careerOrdinal, atCareerDate } from './person-careers';
import { transferWindow, transferWindowDays } from './transfer-window';
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
import { overall } from './player-state';
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
          title: sourceMessage('copy.mediation.2508939fdb', {
            p0: w.manager.name,
            p1: requestLabel(request),
          }),
          detail: sourceMessage('copy.mediation.8ef75211ff'),
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
          ? sourceMessage('copy.mediation.14ea1a66fb', {
              p0: requestLabel(request),
              p1: offer.player.name,
            })
          : sourceMessage('copy.mediation.ea371349d6', {
              p0: requestLabel(request),
              p1: offer.player.name,
            }),
      directorReason: verdict.reason,
      support: directionOption(w, 'recruitmentSupport').id as RecruitmentMediation['support'],
      status: 'pending',
    };
    (w.mediations ??= []).push(mediation);
    created.push(mediation);
    pushInbox(w, {
      kind: 'staff-report',
      title: sourceMessage('copy.mediation.73f275aff7', { p0: w.manager.name, p1: director.name }),
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
  if (!current) throw new Error(sourceMessage('copy.mediation.bc3ed39fb6'));
  if (current.status === 'resolved') return current;
  if (!['director', 'balanced', 'manager'].includes(support))
    throw new Error(sourceMessage('copy.mediation.baa4a1f437'));
  const trial = structuredClone(w),
    mediation = trial.mediations!.find((m) => m.id === id)!;
  return atCareerDate(trial, careerDate(w), () => {
    let result: string = sourceMessage('copy.mediation.4eefc3915b'),
      promise: string | undefined;
    if (trial.manager.id !== mediation.manager.id)
      result = sourceMessage('copy.mediation.ca080636ac');
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
      let failure: string = sourceMessage('copy.mediation.239fe9181c'),
        started = false;
      for (const { offer } of choices) {
        const blocked = pursueRequest(trial, mediation.target, offer.player.id, actor);
        if (blocked) {
          failure = blocked;
          continue;
        }
        result = `${offer.player.name} ${offer.freeAgent ? sourceMessage('copy.mediation.dd65eaeca5') : sourceMessage('copy.mediation.c62513bb19')}`;
        started = true;
        break;
      }
      if (!started) {
        const commitment = promiseForMediation(trial, mediation);
        promise = commitment.id;
        result = sourceMessage('copy.mediation.411b483fc6', { p0: failure });
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
      title: sourceMessage('copy.mediation.6be013d8db', { p0: mediation.manager.name }),
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
