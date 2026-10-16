import {
  createWorld,
  operate,
  simulateSeason,
  advanceDays,
  transferOffers,
  transferWindowDays,
  managerCandidates,
  clubManager,
} from '../../packages/engine/src/index';
import { careerDate, openEmployment } from '../../packages/engine/src/person-careers';
import { retirePerson } from '../../packages/engine/src/careers';
import { detectMediations, resolveMediation } from '../../packages/engine/src/mediation';
import { lineOf } from '../../packages/engine/src/player';
import { RESPONSIBILITY_KEYS } from '../../packages/engine/src/responsibilities';
/** Marked synthetic announced candidates/funding; all subsequent contracts, employment time,
 * qualification and fixed promises use real transitions. The complete NPC registry is retained. */
export function retainedWorkload() {
  const w = createWorld({
    country: 'ENG',
    name: 'Synthetic Retained Workload',
    color: '#224466',
    seed: 'retained-workload',
    level: 'easy',
  });
  w.cash = w.income = '999999999999';
  const playing = w.players.find((p) => p.position === 'CM')!,
    former = w.players.find((p) => p.id !== playing.id)!;
  for (const [player, born] of [
    [playing, 1915],
    [former, 1910],
  ] as const) {
    player.born = born;
    player.qualities = { understanding: 5, teaching: 5, judgement: 5 };
    player.personality.professionalism = 5;
    Object.assign(w.people![player.id], {
      born,
      qualities: { ...player.qualities },
      professionalism: 5,
      intention: { at: careerDate(w), draw: 0.85, willing: false },
      retirement: { announced: careerDate(w), year: w.year },
    });
    player.retiring = w.year;
  }
  w.settings!.responsibilities.contracts = w.settings!.responsibilities.staff = 'direct';
  operate(w, { type: 'encourage-coaching', player: playing.id });
  operate(w, { type: 'propose-playing-coach', player: playing.id, years: 2, term: 5 });
  operate(w, { type: 'answer-playing-coach', player: playing.id, accept: true });
  const person = w.people![former.id];
  person.intention!.willing = true;
  w.players.find((p) => p.id === former.id)!.status = 'retired';
  retirePerson(w, person);
  // Select an actual developer mentor so the cross-season case has a multi-year manager term.
  const other = w.clubs.find(
    (c) => c.id !== w.playerClub && clubManager(w, c).style === 'developer',
  )!.id;
  const job = openEmployment(w, person.id, person.coaching!.role, other);
  job.contractUntil = { year: w.year + 6, day: 0 };
  job.wage = '101';
  job.currency = w.currency;
  for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'delegated';
  for (let season = 0; season < 3; season++) simulateSeason(w);
  advanceDays(w, 1, undefined, false);
  const candidate = managerCandidates(w).find((candidate) => candidate.person === former.id);
  if (!candidate) throw Error('Missing qualified retained manager candidate');
  operate(w, { type: 'hire', id: candidate.id, term: 3 });
  w.settings!.responsibilities.recruitment = 'direct';
  advanceDays(w, transferWindowDays(w.year).winterOpen - w.calendar!.day, undefined, false);
  const offer = transferOffers(w).find((o) => o.available && lineOf(o.player.position) === 'MF')!;
  w.shortlist = {
    year: w.year,
    day: w.calendar!.day,
    entries: [{ playerId: offer.player.id, line: 'MF' }],
    requests: [{ kind: 'short', line: 'MF', pick: offer.player.id }],
  };
  const cash = w.cash;
  w.cash = '0';
  const conflict = detectMediations(w).at(-1);
  if (!conflict) throw Error('Retained workload requires a real financial conflict');
  resolveMediation(w, conflict.id, 'manager', 'delegated');
  w.cash = cash;
  if (!w.promises?.some((p) => p.status === 'pending' && p.deadline.year > w.year))
    throw Error('Missing cross-season promise');
  return { w, playing: playing.id, former: former.id };
}
