import { displayLocale } from '../../presentation/text';
import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import type {
  Command,
  Event,
  TrainingFocus,
  World,
} from '../../../../../packages/contracts/src/types';
import { activeTrainingFocus } from '../../../../../packages/engine/src/training';
import { seasonDate } from '../../../../../packages/engine/src/calendar';
import { activePlayers, clubOf } from '../../../../../packages/engine/src/player-state';
import { tacticLabel } from '../../../../../packages/engine/src/tactics';
import { compactMoney, number } from '../../presentation/format';
import { orderIds, ownLeagueIds } from '../../entities/league';
import { STADIUM_STEPS } from '../../../../../packages/engine/src/facilities';

export interface OutcomeChange {
  label: string;
  value: string;
  previous?: string;
  /** Direction of the underlying value, not a judgement of the choice. */
  trend?: 'up' | 'down';
}
export interface Outcome {
  title: string;
  changes: OutcomeChange[];
  events: Pick<Event, 'title' | 'detail'>[];
  /** Records that happened but are not listed; the season detail keeps them. */
  hiddenEvents: number;
  note?: string;
}

const titles: Record<Exclude<Command['type'], 'settings'>, string> = {
  'club-policy': sourceMessage('copy.outcome.cb1b6e8e5f'),
  'club-direction': sourceMessage('copy.outcome.6b0ce89478'),
  'club-build': sourceMessage('copy.outcome.38b670514c'),
  'club-ticket': sourceMessage('copy.outcome.988b1813f8'),
  'delegation-request': sourceMessage('delegation.outcome.request'),
  'coaching-investment': sourceMessage('copy.outcome.5253fe14dc'),
  'facility-upgrade': sourceMessage('copy.outcome.3340839018'),
  advance: sourceMessage('copy.outcome.52adfbeec0'),
  'advance-days': sourceMessage('copy.outcome.28561aab52'),
  'next-match': sourceMessage('copy.outcome.21a5a9c5ed'),
  'next-event': sourceMessage('copy.outcome.d697739a85'),
  season: sourceMessage('copy.outcome.a3c91ae0cd'),
  hire: sourceMessage('copy.outcome.004d6c7ad1'),
  'renew-manager': sourceMessage('copy.outcome.bee06b00a7'),
  recruit: sourceMessage('copy.outcome.665a0f6c3f'),
  'transfer-stance': sourceMessage('copy.outcome.63a47639ee'),
  'hire-staff': sourceMessage('copy.outcome.bbe0aba8ad'),
  'release-staff': sourceMessage('copy.outcome.b27bae9202'),
  'renew-staff': sourceMessage('copy.outcome.65fec2df41'),
  'promote-youth': sourceMessage('copy.outcome.6e024ba8e7'),
  'release-youth': sourceMessage('copy.outcome.04f4f2ba71'),
  bid: sourceMessage('copy.outcome.c963be3c69'),
  'respond-bid': sourceMessage('copy.outcome.aee9de56e8'),
  'answer-playing-coach': sourceMessage('copy.outcome.5e1f106e45'),
  'resolve-mediation': sourceMessage('copy.outcome.ce8fc8cec6'),
  'read-inbox': sourceMessage('copy.outcome.b4ee8139c7'),
  'contract-offer': sourceMessage('copy.outcome.19461013d9'),
  'contract-decline': sourceMessage('copy.outcome.0cdaf0fcec'),
  'sign-sponsor': sourceMessage('copy.outcome.f2617640ba'),
  'match-kit': sourceMessage('copy.outcome.1d8cefb913'),
  'design-commission': sourceMessage('copy.outcome.dc566d10e0'),
  'adopt-design': sourceMessage('copy.outcome.791666bb74'),
  'discard-designs': sourceMessage('copy.outcome.ee98d96955'),
  'redraw-designs': sourceMessage('copy.outcome.25cf12b0f7'),
  'owner-stake': sourceMessage('copy.outcome.af08a8e1ca'),
  'owner-inject': sourceMessage('copy.outcome.0a70e6c56f'),
  'owner-dividend': sourceMessage('copy.outcome.fa1d9aba13'),
};
const notes: Partial<Record<Command['type'], string>> = {
  'transfer-stance': sourceMessage('copy.outcome.88214f9f70'),
};
const trainingLabel: Record<TrainingFocus, string> = {
  balanced: sourceMessage('copy.outcome.b536a5c844'),
  recovery: sourceMessage('copy.outcome.2f521e400c'),
  hard: sourceMessage('copy.TrainingView.80b3f4a762'),
};
/** Routine ledger records carry raw minor units and fixture IDs; the cash change summarizes them. */
export const ROUTINE_EVENTS = new Set([
  'operating-cost',
  'operating-expenses',
  'match-cost',
  'gate',
  'league-share',
  'parachute',
  'match-bonus',
  'sponsor:local',
  'sponsor:kit',
  'sponsor:shirt',
  'sponsor:stadium',
  'sponsor:sleeve',
  'europe-prize',
]);
const progression = new Set<Command['type']>(['advance', 'advance-days', 'season']);

function rankOf(w: World) {
  if (!w.tables[w.playerClub]?.played) return undefined;
  return orderIds(ownLeagueIds(w), w.tables).indexOf(w.playerClub) + 1;
}
function same(a: Event, b: Event) {
  return (
    a.year === b.year &&
    a.round === b.round &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.detail === b.detail &&
    a.amount === b.amount
  );
}
/** Views keep a bounded event tail, so locate the previous last record instead of comparing lengths. */
export function newEvents(before: World, after: World): Event[] {
  const last = before.events.at(-1);
  if (!last) return after.events;
  for (let i = after.events.length - 1; i >= 0; i--)
    if (same(after.events[i], last)) return after.events.slice(i + 1);
  return after.events;
}

function compare<T extends number | string>(
  changes: OutcomeChange[],
  label: string,
  before: T | undefined,
  after: T | undefined,
  format: (value: T) => string = String,
) {
  if (before === undefined || after === undefined || before === after) return;
  changes.push({
    label,
    previous: format(before),
    value: format(after),
    trend:
      typeof before === 'number' && typeof after === 'number'
        ? after > before
          ? 'up'
          : 'down'
        : undefined,
  });
}

/**
 * Explain one committed player action from recorded world facts only.
 * `next-match` opens live playback, so its result is never summarized here.
 */
export function describeOutcome(
  command: Command,
  before: World,
  after: World,
  limit = 3,
): Outcome | undefined {
  // Reading news decides nothing, a settings change shows on screen itself, live playback
  // reveals a watched result, the season review reports a closed season and the design screen
  // itself shows a designer's drafts and what became of them.
  if (
    before.id !== after.id ||
    before.year !== after.year ||
    command.type === 'settings' ||
    command.type === 'next-match' ||
    command.type === 'next-event' ||
    command.type === 'advance-days' ||
    command.type === 'read-inbox' ||
    command.type === 'design-commission' ||
    command.type === 'adopt-design' ||
    command.type === 'discard-designs' ||
    command.type === 'redraw-designs'
  )
    return undefined;
  const club = clubOf(after),
    previous = clubOf(before);
  // An outcome card carries recorded values as text, in the app's notation (→WEB-67).
  const cash = (value: string) => compactMoney(value, club.country, after.year);
  const changes: OutcomeChange[] = [];
  if (progression.has(command.type))
    compare(
      changes,
      sourceMessage('copy.outcome.09f76a1b7a'),
      seasonDate(before),
      seasonDate(after),
    );
  const a = before.tables[before.playerClub],
    b = after.tables[after.playerClub];
  if (a && b && b.played > a.played)
    changes.push({
      label: sourceMessage('copy.outcome.da7765aafc', { p0: b.played - a.played }),
      value: sourceMessage('copy.outcome.c7baf49285', {
        p0: b.won - a.won,
        p1: b.drawn - a.drawn,
        p2: b.lost - a.lost,
        p3: a.points,
        p4: b.points,
      }),
    });
  compare(
    changes,
    sourceMessage('copy.AwaySummary.a1f8f34457'),
    rankOf(before),
    rankOf(after),
    (n) => sourceMessage('copy.BallonDorView.5094d45cea', { p0: n }),
  );
  if (before.cash !== after.cash) {
    const diff = BigInt(after.cash) - BigInt(before.cash);
    changes.push({
      label: sourceMessage('shell.cash'),
      previous: cash(before.cash),
      value: `${cash(after.cash)} (${diff > 0n ? '+' : ''}${cash(diff.toString())})`,
      trend: diff > 0n ? 'up' : 'down',
    });
  }
  compare(changes, sourceMessage('copy.ClubTrends.2070613ba9'), previous.fans, club.fans, (n) =>
    sourceMessage('copy.CareerRecordBook.e414915261', { p0: number(n) }),
  );
  compare(
    changes,
    sourceMessage('copy.areas.f33435e513'),
    activePlayers(before).length,
    activePlayers(after).length,
    (n) => sourceMessage('copy.CareerRecordBook.e414915261', { p0: n }),
  );
  compare(
    changes,
    sourceMessage('copy.ClubOperations.64779ec1ad'),
    STADIUM_STEPS[before.stadium].capacity,
    STADIUM_STEPS[after.stadium].capacity,
    (n) =>
      sourceMessage('copy.ClubOperations.e718a2e7a8', { p0: n.toLocaleString(displayLocale()) }),
  );
  compare(
    changes,
    sourceMessage('copy.outcome.e9dbbe23f3'),
    before.trainingGround,
    after.trainingGround,
    (n) => sourceMessage('copy.FacilityParts.bda7274853', { p0: n }),
  );
  compare(
    changes,
    sourceMessage('copy.outcome.09de5cf710'),
    before.academyFacility,
    after.academyFacility,
    (n) => sourceMessage('copy.FacilityParts.bda7274853', { p0: n }),
  );
  compare(
    changes,
    sourceMessage('copy.outcome.1ea6266ec5'),
    tacticLabel[before.tactic],
    tacticLabel[after.tactic],
  );
  compare(
    changes,
    sourceMessage('club.section.training'),
    trainingLabel[activeTrainingFocus(before)],
    trainingLabel[activeTrainingFocus(after)],
  );
  if (before.manager.id === after.manager.id)
    compare(
      changes,
      sourceMessage('copy.outcome.0980f3d589'),
      Math.round(before.manager.trust),
      Math.round(after.manager.trust),
    );
  else
    compare(changes, sourceMessage('staff.role.manager'), before.manager.name, after.manager.name);
  compare(
    changes,
    sourceMessage('copy.outcome.f95df1e27a'),
    Math.round(previous.reputation),
    Math.round(club.reputation),
  );
  compare(changes, sourceMessage('copy.ClubOverview.a756cad0e2'), before.morale, after.morale);
  const records = newEvents(before, after).filter((event) => !ROUTINE_EVENTS.has(event.kind));
  const shown = records.slice(-limit).reverse();
  let note = notes[command.type];
  // The owner chooses how many seasons a renewal adds (→STAFF-14).
  if (command.type === 'renew-manager') {
    const seasons = after.manager.until - before.manager.until;
    note = sourceMessage('copy.outcome.f18dc79ffe', {
      p0:
        seasons === 1
          ? sourceMessage('copy.outcome.4d02901e92')
          : sourceMessage('copy.BallonDorView.3585c2642b', { p0: seasons }),
    });
  }
  // Coaches are hired, renewed and delegated per department in 선수단 › 스태프 (→WEB-43, WEB-71).
  if (command.type === 'hire-staff' || command.type === 'renew-staff')
    note = sourceMessage('copy.outcome.158e133170');
  return {
    title:
      command.type === 'club-policy' && command.key === 'recruitment'
        ? sourceMessage('copy.outcome.2abc47fae7')
        : titles[command.type],
    changes,
    events: shown.map(({ title, detail }) => ({ title, detail })),
    hiddenEvents: records.length - shown.length,
    note,
  };
}
