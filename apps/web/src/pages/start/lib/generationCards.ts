/**
 * The feat cards of the generation history view (→WEB-115): one card at a time, each on screen for
 * `GENERATION_CARD.ms` and closing by itself; a card not shown before the next season's digest
 * arrives is dropped, so cards never fall behind the season reached; the club list follows once
 * no card is open or waiting. Pure: the caller passes the time and runs the timer, and generation
 * never waits for any of it.
 */
import type {
  GenerationDigest,
  GenerationFeat,
} from '../../../../../../packages/contracts/src/types';
import type { MessageParameters } from '../../../presentation/contracts';

/** How long a feat card stays on screen. */
export const GENERATION_CARD = { ms: 3000 } as const;

/** A season's greatest feat with the seasons that frame it (the war names both). */
export interface GenerationCard {
  feat: GenerationFeat;
  /** The season reached. */
  season: number;
  /** The season just closed. */
  closed: number;
}
export interface CardSchedule {
  /** The card on screen and when it opened. */
  shown?: GenerationCard & { at: number };
  /** The latest season's card, waiting for the shown one to close. */
  pending?: GenerationCard;
  /** The latest season received; an older or repeated digest changes nothing. */
  season?: number;
}
export const NO_CARDS: CardSchedule = {};

/**
 * A season's digest arrives at `now`: its card opens when none is on screen, else it waits in
 * place of any card an earlier season left unshown.
 */
export function receiveDigest(
  schedule: CardSchedule,
  digest: GenerationDigest,
  now: number,
): CardSchedule {
  if (schedule.season !== undefined && digest.season <= schedule.season) return schedule;
  const card: GenerationCard | undefined = digest.feat && {
    feat: digest.feat,
    season: digest.season,
    closed: digest.closed,
  };
  if (!schedule.shown)
    return { season: digest.season, ...(card ? { shown: { ...card, at: now } } : {}) };
  return { season: digest.season, shown: schedule.shown, ...(card ? { pending: card } : {}) };
}

/** When the card on screen closes, if one is. */
export const cardCloses = (schedule: CardSchedule) =>
  schedule.shown && schedule.shown.at + GENERATION_CARD.ms;

/** The schedule at `now`: a card whose time is up closes and the waiting one opens. */
export function closeDue(schedule: CardSchedule, now: number): CardSchedule {
  const closes = cardCloses(schedule);
  if (closes === undefined || now < closes) return schedule;
  const { season, pending } = schedule;
  return { season, ...(pending ? { shown: { ...pending, at: now } } : {}) };
}

/** The club list follows the generation once the list is ready and no card is open or waiting. */
export const clubListFollows = (schedule: CardSchedule, listed: boolean) =>
  listed && !schedule.shown && !schedule.pending;

/** A locale message and its parameters. */
export type CardMessage = readonly [id: string, parameters?: MessageParameters];
/**
 * A card's headline and line as locale messages; club, player and competition names are data and
 * pass through untranslated. `season` writes a season's name (1938/39).
 */
export function featMessages(
  { feat, season: reached, closed }: GenerationCard,
  season: (year: number) => string,
): { title: CardMessage; line: CardMessage } {
  const club = feat.club?.name ?? '',
    competition = feat.competition ?? '',
    count = feat.count ?? 0;
  switch (feat.kind) {
    case 'war':
      return {
        title: ['start.feat.war.title'],
        line: ['start.feat.war.line', { last: season(closed), restart: season(reached) }],
      };
    case 'treble':
      return {
        title: ['start.feat.treble.title', { club }],
        line: ['start.feat.treble.line', { competition }],
      };
    case 'europe-three':
    case 'europe-two':
      return {
        title: ['start.feat.europeRun.title', { club, competition, count }],
        line: ['start.feat.europeRun.line', { count }],
      };
    case 'ballon-three':
      return {
        title: ['start.feat.ballonRun.title', { player: feat.player ?? '', count }],
        line: ['start.feat.ballonRun.line', { club }],
      };
    case 'europe-first':
      return {
        title: ['start.feat.europeFirst.title', { club, competition }],
        line: ['start.feat.europeFirst.line'],
      };
    case 'league-run':
      return {
        title: ['start.feat.leagueRun.title', { club, count }],
        line: ['start.feat.leagueRun.line', { count }],
      };
  }
}
