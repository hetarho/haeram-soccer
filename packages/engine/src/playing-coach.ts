import { message as sourceMessage } from '../../contracts/src/messages';
import type { ContractTerm, PlayingCoachProposal, Staff, World } from '../../contracts/src/types';
import { initializeCoaching, personCoachingGrade } from './coaching-entry';
import { atCareerDate, careerDate, openEmployment } from './person-careers';
import {
  coachWage,
  releaseCost,
  releaseStaff,
  staffMember,
  STAFF_ROLES,
  affordable,
  coachFits,
  coachMatches,
} from './staff';
import { coachCriteriaOf } from './hiring';
import { isDelegated } from './responsibilities';
import { addEvent } from './events';
import { debit } from './transactions';
import { ratio } from './primitives';
import { offerContract, staffTalkVerdict, talkFor, talkWindow } from './contracts';
import { moneyLabel } from './finance';

export function playingCoachDurations(w: World, id: string): (1 | 2)[] {
  const p = w.players.find((p) => p.id === id && p.status === 'active');
  const person = w.people?.[id];
  if (
    !p ||
    p.retiring === undefined ||
    !!p.loanUntil ||
    !person?.intention?.willing ||
    (personCoachingGrade(person) ?? 0) < 4 ||
    person.playing !== 'active' ||
    person.club !== w.playerClub ||
    person.employment.some((job) => !job.to && job.role !== 'player')
  )
    return [];
  return ([1, 2] as const).filter((years) => p.retiring! + years + 1 - p.born <= 41);
}
/** Pure quotation after explicit/lifecycle initialization; reads never generate coaching values. */
export function playingCoachQuote(
  w: World,
  id: string,
  years: 1 | 2,
  term: ContractTerm,
): PlayingCoachProposal | undefined {
  if (!playingCoachDurations(w, id).includes(years) || ![1, 2, 3, 4, 5].includes(term))
    return undefined;
  const p = w.players.find((p) => p.id === id)!,
    coaching = w.people![id].coaching;
  if (!coaching) return undefined;
  const current = staffMember(w, coaching.role),
    talk = talkFor(w, p);
  const playerWage = talk && BigInt(talk.floor) > BigInt(p.wage) ? talk.floor : p.wage;
  const playingEnd = p.retiring! + years,
    playerUntil = Math.max(p.until, playingEnd + 1),
    coachUntil = w.year + term;
  const coachPay = coachWage(w, coaching.ability),
    fee = ratio(coachPay, 1n, 4n),
    replacement = releaseCost(w, current);
  const quote = {
    person: id,
    role: coaching.role,
    years,
    term,
    created: careerDate(w),
    playingEnd,
    playerUntil,
    coachUntil,
    playerWage,
    coachWage: coachPay,
    totalWage: (BigInt(playerWage) + BigInt(coachPay)).toString(),
    fee,
    replacement,
    upfront: (BigInt(fee) + BigInt(replacement)).toString(),
    ...(current ? { replacing: current.id } : {}),
    status: 'pending' as const,
  };
  const stamp = JSON.stringify({
    year: w.year,
    player: { born: p.born, wage: p.wage, until: p.until, retiring: p.retiring, talk },
    coaching,
    current,
    quote: { ...quote, created: undefined },
  });
  return { ...quote, stamp };
}
/**
 * Staff filling a post put one combined quote to the club (→STAFF-32): it waits in the 결재함 while
 * either responsibility is direct and is settled at once when both are delegated. No owner command
 * proposes one.
 */
export function submitPlayingCoachProposal(w: World, proposal: PlayingCoachProposal) {
  const id = proposal.person;
  (w.playingCoachProposals ??= {})[id] = proposal;
  addEvent(
    w,
    'playing-coach-proposal',
    sourceMessage('copy.playing_coach.945e4a3bfc', { p0: w.people![id].name }),
    sourceMessage('copy.playing_coach.53c58855ec', {
      p0: moneyLabel(w, proposal.playerWage),
      p1: moneyLabel(w, proposal.coachWage),
      p2: moneyLabel(w, proposal.totalWage),
      p3: moneyLabel(w, proposal.upfront),
    }),
  );
  if (isDelegated(w, 'contracts') && isDelegated(w, 'staff')) handoverPlayingCoaches(w);
  return w.playingCoachProposals![id];
}
/** Validate both halves on a private candidate world, then publish one complete mutation. */
export function answerPlayingCoach(w: World, id: string, accept: boolean) {
  const proposal = w.playingCoachProposals?.[id];
  if (!proposal) throw new Error(sourceMessage('copy.playing_coach.fc93ac3ed2'));
  if (proposal.status !== 'pending') return;
  if (!accept) {
    proposal.status = 'declined';
    proposal.settled = careerDate(w);
    addEvent(
      w,
      'playing-coach-decline',
      sourceMessage('copy.playing_coach.bcfbb8b86d', { p0: w.people![id].name }),
      sourceMessage('copy.playing_coach.589044d483'),
    );
    return;
  }
  const current = playingCoachQuote(w, id, proposal.years, proposal.term);
  if (!current || current.stamp !== proposal.stamp)
    throw new Error(sourceMessage('copy.playing_coach.8165d8718b'));
  if (BigInt(w.cash) < BigInt(proposal.upfront))
    throw new Error(sourceMessage('copy.playing_coach.8791d586e5'));
  const trial = structuredClone(w),
    p = trial.players.find((p) => p.id === id)!,
    person = trial.people![id];
  atCareerDate(trial, careerDate(w), () => {
    const previous = staffMember(trial, proposal.role);
    if (previous) releaseStaff(trial, proposal.role);
    debit(trial, proposal.fee);
    if (talkFor(trial, p)) {
      const term = (proposal.playerUntil -
        trial.year -
        (talkWindow(trial) === 'winter' ? 1 : 0)) as 0 | ContractTerm;
      offerContract(trial, id, proposal.playerWage, term);
    } else {
      p.wage = proposal.playerWage;
      p.until = proposal.playerUntil;
    }
    p.retiring = proposal.playingEnd;
    if (person.retirement) person.retirement.year = proposal.playingEnd;
    const coaching = person.coaching!;
    const member: Staff = {
      id,
      person: id,
      name: person.name,
      born: person.born,
      role: proposal.role,
      ability: coaching.ability,
      potential: coaching.potential,
      wage: proposal.coachWage,
      since: trial.year,
      until: proposal.coachUntil,
      term: proposal.term,
    };
    // Existing playing employment remains; the new coach role overlaps it exactly once.
    openEmployment(trial, id, proposal.role, trial.playerClub);
    trial.staff = [
      ...(trial.staff || []).filter((other) => other.role !== proposal.role),
      member,
    ].sort((a, b) => STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));
    trial.playingCoachProposals![id].status = 'accepted';
    trial.playingCoachProposals![id].settled = careerDate(trial);
    addEvent(
      trial,
      'playing-coach-accept',
      sourceMessage('copy.playing_coach.d26bb19b48', { p0: person.name }),
      sourceMessage('copy.playing_coach.529bd24f8d', {
        p0: moneyLabel(trial, proposal.playerWage),
        p1: moneyLabel(trial, proposal.coachWage),
        p2: proposal.playingEnd + 1,
      }),
      proposal.upfront,
    );
    Object.assign(w, trial);
  });
}
export function automaticPlayingCoachFits(w: World, proposal: PlayingCoachProposal) {
  const p = w.players.find((p) => p.id === proposal.person)!;
  const current = staffMember(w, proposal.role),
    coaching = w.people![p.id].coaching!;
  if (current && BigInt(current.wage) > 0n && current.until > w.year) return false;
  const coach = { ability: coaching.ability, wage: proposal.coachWage };
  const talk = talkFor(w, p) ?? {
    kind: 'renew' as const,
    demand: p.wage,
    floor: p.wage,
    year: w.year,
    day: careerDate(w).day,
  };
  return (
    coachFits(w, proposal.role, coach) &&
    staffTalkVerdict(w, { ...p, talk }).accept &&
    affordable(
      w,
      BigInt(proposal.upfront),
      BigInt(proposal.coachWage) +
        BigInt(proposal.playerWage) -
        BigInt(p.wage) -
        BigInt(current?.wage ?? '0'),
    )
  );
}
export function handoverPlayingCoaches(w: World) {
  if (!isDelegated(w, 'contracts') || !isDelegated(w, 'staff')) return;
  for (const id of Object.keys(w.playingCoachProposals || {})) {
    const proposal = w.playingCoachProposals![id];
    if (proposal.status !== 'pending') continue;
    const current = playingCoachQuote(w, id, proposal.years, proposal.term);
    if (!current || current.stamp !== proposal.stamp || !automaticPlayingCoachFits(w, proposal))
      continue;
    answerPlayingCoach(w, id, true);
  }
}
/** Consider dual-role candidates only when this post would ordinarily be hired/replaced. */
export function considerPlayingCoach(w: World, role: Staff['role']) {
  if (role === 'director' || role === 'scout') return false;
  if (
    Object.values(w.playingCoachProposals || {}).some(
      (p) => p.role === role && p.status === 'pending',
    )
  )
    return true;
  const criteria = coachCriteriaOf(w);
  if (criteria.volunteer) return false;
  const candidates: PlayingCoachProposal[] = [];
  for (const player of w.players) {
    if (w.playingCoachProposals?.[player.id] || !playingCoachDurations(w, player.id).length)
      continue;
    const person = w.people![player.id];
    initializeCoaching(w, person);
    if (person.coaching?.role !== role) continue;
    const proposal = playingCoachQuote(
      w,
      player.id,
      playingCoachDurations(w, player.id)[0],
      criteria.term,
    )!;
    if (automaticPlayingCoachFits(w, proposal)) candidates.push(proposal);
  }
  candidates.sort(
    criteria.priority === 'ability'
      ? (a, b) => w.people![b.person].coaching!.ability - w.people![a.person].coaching!.ability
      : (a, b) =>
          BigInt(a.coachWage) < BigInt(b.coachWage)
            ? -1
            : BigInt(a.coachWage) > BigInt(b.coachWage)
              ? 1
              : 0,
  );
  const selected = candidates[0];
  if (!selected) return false;
  const ordinary = coachMatches(w, role, staffMember(w, role))[0];
  if (
    ordinary &&
    (criteria.priority === 'ability'
      ? ordinary.ability >= w.people![selected.person].coaching!.ability
      : BigInt(ordinary.wage) <= BigInt(selected.coachWage))
  )
    return false;
  submitPlayingCoachProposal(
    w,
    playingCoachQuote(w, selected.person, selected.years, selected.term)!,
  );
  return true;
}

export function playingCoachDepartureCost(w: World, id: string) {
  return releaseCost(
    w,
    w.staff?.find((member) => member.person === id),
  );
}
/** Leaving the club ends the occupied post once; dismissing the post alone never calls this. */
export function endPlayingCoachForDeparture(w: World, id: string, mandatory = false) {
  const member = w.staff?.find((member) => member.person === id);
  if (member) releaseStaff(w, member.role, mandatory);
}
/** Unaccepted proposals cannot freeze a post after a player's actual retirement/departure. */
export function expirePlayingCoachProposals(w: World) {
  for (const proposal of Object.values(w.playingCoachProposals || {})) {
    if (
      proposal.status !== 'pending' ||
      playingCoachDurations(w, proposal.person).includes(proposal.years)
    )
      continue;
    proposal.status = 'declined';
    proposal.settled = careerDate(w);
    addEvent(
      w,
      'playing-coach-expire',
      sourceMessage('copy.playing_coach.26de7e708b'),
      sourceMessage('copy.playing_coach.8a043bd85a'),
    );
  }
}
