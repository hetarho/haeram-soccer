import type {
  RecruitmentMediation,
  ReinforcementPromise,
} from '../../packages/contracts/src/types';
import {
  createWorld,
  makePlayer,
  noteSigning,
  prepareSeason,
} from '../../packages/engine/src/index';
import {
  atCareerDate,
  closeEmployment,
  openEmployment,
} from '../../packages/engine/src/person-careers';
import { movePerson } from '../../packages/engine/src/npc-continuity';
import { initializeCoaching } from '../../packages/engine/src/coaching-entry';
import { qualifyManagers } from '../../packages/engine/src/manager-entry';
import { proposePlayingCoach, answerPlayingCoach } from '../../packages/engine/src/playing-coach';
import { transferWindowDays } from '../../packages/engine/src/transfers';
/** Small, explicitly synthetic canonical facts exercise every optional feature field. */
export function featureState() {
  const w = createWorld({
    country: 'ENG',
    name: 'Synthetic Feature State',
    color: '#224466',
    seed: 'feature-state',
    level: 'normal',
  });
  const npc = Object.values(w.people!).find((p) => !p.formerOwn)!;
  w.people = Object.fromEntries(
    Object.entries(w.people!).filter(([, p]) => p.formerOwn || p.id === npc.id),
  );
  const arrival = makePlayer('ENG', w.seed, 'synthetic:external-arrival', w.year, 55, 'GK', 25, 3);
  w.players.push(arrival);
  atCareerDate(w, { year: 1950, day: 1 }, () => noteSigning(w, arrival));
  arrival.until = 1956;
  w.year = 1953;
  w.calendar = { day: 0 };
  prepareSeason(w);
  w.manager.until = 1957;
  // Restore the deliberately small person set after schedule preparation materializes NPC prospects.
  w.people = Object.fromEntries(
    Object.entries(w.people!).filter(([, p]) => p.formerOwn || p.id === npc.id),
  );
  w.cash = w.income = '999999999999';
  w.settings!.responsibilities.contracts = 'direct';
  w.settings!.responsibilities.staff = 'direct';
  w.settings!.responsibilities.recruitment = 'direct';
  w.settings!.mode = 'manual';
  w.settings!.observations = { matchEve: true, windowOpen: false };
  w.direction = { recruitmentSupport: 'manager' };
  const playing = w.players.find((p) => p.position === 'CM')!,
    person = w.people![playing.id];
  playing.born = 1918;
  playing.retiring = w.year;
  playing.qualities = { understanding: 4, teaching: 4, judgement: 4 };
  playing.personality.professionalism = 4;
  Object.assign(person, {
    born: playing.born,
    professionalism: 4,
    qualities: { ...playing.qualities },
    intention: {
      at: { year: w.year, day: 0 },
      draw: 0.55,
      willing: true,
      encouraged: { at: { year: w.year, day: 0 }, changed: true },
    },
    retirement: { announced: { year: w.year, day: 0 }, year: w.year },
  });
  proposePlayingCoach(w, playing.id, 1, 5);
  answerPlayingCoach(w, playing.id, true);
  const abroad = w.players.find((p) => p.id !== playing.id && p.id !== arrival.id)!,
    other = w.clubs.find((c) => c.id !== w.playerClub)!.id;
  movePerson(w, abroad, other);
  abroad.status = 'sold';
  const veteran = w.players.find(
      (p) => p.id !== playing.id && p.id !== abroad.id && p.id !== arrival.id,
    )!,
    coach = w.people![veteran.id];
  veteran.born = 1910;
  coach.born = 1910;
  veteran.qualities = { understanding: 5, teaching: 4, judgement: 5 };
  veteran.personality.professionalism = 4;
  coach.qualities = { ...veteran.qualities };
  coach.professionalism = 4;
  closeEmployment(w, veteran.id, 'player', { year: 1950, day: 0 });
  veteran.status = 'retired';
  coach.playing = 'retired';
  coach.intention = { at: { year: 1950, day: 0 }, draw: 0, willing: true };
  atCareerDate(w, { year: 1950, day: 0 }, () => initializeCoaching(w, coach));
  atCareerDate(w, { year: 1950, day: 0 }, () =>
    openEmployment(w, coach.id, coach.coaching!.role, other),
  );
  closeEmployment(w, coach.id, coach.coaching!.role, { year: 1953, day: 0 });
  coach.coaching!.ability = 62.5;
  coach.coaching!.potential = 81.25;
  coach.mentors = [
    {
      manager: 'synthetic:mentor:1',
      name: 'Recorded Mentor One',
      school: 'developer',
      club: other,
      from: { year: 1950, day: 0 },
      to: { year: 1951, day: 0 },
    },
    {
      manager: 'synthetic:mentor:2',
      name: 'Recorded Mentor Two',
      school: 'counter',
      club: other,
      from: { year: 1951, day: 0 },
      to: { year: 1953, day: 0 },
    },
  ];
  qualifyManagers(w);
  const director = w.staff!.find((p) => p.role === 'director')!,
    lines = ['GK', 'MF', 'DF', 'FW'] as const,
    statuses = ['fulfilled', 'unfulfilled', 'cancelled', 'pending'] as const;
  w.mediations = [];
  w.promises = [];
  for (let i = 0; i < 4; i++) {
    const year = i === 3 ? 1953 : 1950,
      created = { year, day: 0 },
      deadline = { year, day: transferWindowDays(year).winterClose },
      target = { kind: 'short' as const, line: lines[i] },
      manager =
        i === 2
          ? { id: 'synthetic:former-manager', name: 'Recorded Former Manager' }
          : { id: w.manager.id, name: w.manager.name };
    const m: RecruitmentMediation = {
      id: `synthetic:mediation:${i}`,
      key: `${manager.id}:${year}:summer:line:${lines[i]}`,
      created,
      window: 'summer',
      manager,
      director: { id: director.id, name: director.name },
      target,
      candidate: { id: arrival.id, name: arrival.name, fee: '0', wage: arrival.wage },
      managerReason: 'Recorded synthetic reinforcement request.',
      directorReason: 'Recorded synthetic financial opposition.',
      support: 'balanced',
      status: 'resolved',
      resolution: {
        at: created,
        support: 'manager',
        result: 'Recorded fixed-deadline commitment.',
        promise: `synthetic:promise:${i}`,
      },
    };
    const p: ReinforcementPromise = {
      id: `synthetic:promise:${i}`,
      mediation: m.id,
      manager,
      director: m.director,
      target,
      created,
      deadline,
      status: statuses[i],
      ...(i === 3
        ? {}
        : {
            resolved: i === 2 ? { year, day: 10 } : { year, day: deadline.day + 1 },
            reason:
              i === 2 ? 'The requesting manager departed.' : 'Recorded actual deadline result.',
            reaction: 'Recorded synthetic response.',
          }),
      ...(i === 0 ? { arrival: { player: arrival.id, at: { year: 1950, day: 1 } } } : {}),
    };
    w.mediations.push(m);
    w.promises.push(p);
  }
  return w;
}
