import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type {
  Line,
  ScoutOffer,
  SigningRequest,
  World,
  WorldMarketOffer,
} from '../../../../../../packages/contracts/src/types';
import { LINES } from '../../../../../../packages/contracts/src/player';
import { lineOf, POSITION_LABEL } from '../../../../../../packages/engine/src/player';
import { isDelegated } from '../../../../../../packages/engine/src/responsibilities';
import { transferWindow } from '../../../../../../packages/engine/src/transfer-window';

export const LINE_NAMES: Readonly<Record<Line, string>> = {
  GK: sourceMessage('position.family.GK'),
  DF: sourceMessage('copy.RecruitmentDesk.48e2d845b6'),
  MF: sourceMessage('copy.RecruitmentDesk.7d50bd87b5'),
  FW: sourceMessage('copy.RecruitmentDesk.736f1ff574'),
};

/** What a request asks for: its line, or the formation slot's position (→CLUB-33). */
export const requestName = (request: Pick<SigningRequest, 'line' | 'position'>) =>
  request.position ? POSITION_LABEL[request.position] : LINE_NAMES[request.line];
/**
 * Where a market candidate is (→CLUB-50), read from his offer's own source: a free agent, who
 * costs no fee, or another club's player at its asking fee; `abroad` when he is found outside our
 * country (→CLUB-51).
 */
export type CandidateOrigin =
  { kind: 'free'; abroad: boolean } | { kind: 'club'; club: string; fee: string; abroad: boolean };

/** A scout's find names his source; a world-market row names his club, a free agent none. */
export function candidateOrigin(
  offer:
    | Pick<ScoutOffer, 'source' | 'fee' | 'foreign'>
    | Pick<WorldMarketOffer, 'source' | 'fee' | 'foreign'>,
): CandidateOrigin {
  const source = offer.source;
  const club = !source
    ? undefined
    : 'kind' in source
      ? source.kind === 'club'
        ? source.club
        : undefined
      : source.club;
  return club
    ? { kind: 'club', club, fee: offer.fee, abroad: offer.foreign }
    : { kind: 'free', abroad: offer.foreign };
}

/** One line of the chief scout's shortlist (→CLUB-33), with the manager's request for it. */
export interface ShortlistRow {
  line: Line;
  request?: SigningRequest;
  /**
   * Still on the market list and free to join, best first; `index` in the market list, `origin`
   * where he is (→CLUB-50).
   */
  entries: { index: number; offer: ScoutOffer; origin: CandidateOrigin; pick: boolean }[];
}

/**
 * The shortlist as 이적시장 shows it (→WEB-43): this season's entries resolved against the market
 * list by player id, those no longer available dropped, grouped by role, each role with the
 * manager's request and his pick while that player is still listed. Empty before the first draw.
 */
export function shortlistRows(w: World, offers: readonly ScoutOffer[]): ShortlistRow[] {
  const s = w.shortlist;
  if (!s || s.year !== w.year) return [];
  const listed = s.entries.flatMap((entry) => {
    const index = offers.findIndex((offer) => offer.player.id === entry.playerId);
    return index >= 0 && offers[index].available ? [{ index, offer: offers[index] }] : [];
  });
  const ids = new Set(listed.map(({ offer }) => offer.player.id));
  return LINES.map((line) => {
    const asked = s.requests.find((request) => request.line === line);
    const request = asked && {
      ...asked,
      pick: asked.pick && ids.has(asked.pick) ? asked.pick : undefined,
    };
    return {
      line,
      ...(request ? { request } : {}),
      entries: listed
        .filter(({ offer }) => lineOf(offer.player.position) === line)
        .map((entry) => ({
          ...entry,
          origin: candidateOrigin(entry.offer),
          pick: entry.offer.player.id === request?.pick,
        })),
    };
  });
}

/** Why the manager asks for a role: short of the minimum (부족) or a starter to beat (보강). */
export const REQUEST_WHY: Readonly<Record<SigningRequest['kind'], string>> = {
  short: sourceMessage('copy.shortlist.da5d28ca3f'),
  upgrade: sourceMessage('copy.shortlist.895deac203'),
};

/**
 * What the window's requests stand to cost (→CLUB-33), while a window that opened with requests
 * is open: none met by its close costs the manager 3 trust; one met costs nothing.
 */
export function requestStakes(w: World): string | undefined {
  const window = w.shortlist?.window;
  if (!window || window.year !== w.year || !window.requests.length || !transferWindow(w).open)
    return undefined;
  const roles = window.requests.map(requestName).join('·');
  return window.met
    ? sourceMessage('copy.shortlist.62f74f0a1b', { p0: roles })
    : sourceMessage('copy.shortlist.95019059e0', { p0: roles });
}

/** What the 단장 decides under the settings in force (→STAFF-20), each 맡김 or 직접. */
export function directorDecisions(w: Pick<World, 'settings'>) {
  return (
    [
      [sourceMessage('copy.shortlist.83b5121b8d'), 'contracts'],
      [sourceMessage('copy.ClubStaff.10451c4909'), 'manager'],
      [sourceMessage('copy.intervention.d12b6b87e1'), 'recruitment'],
      [sourceMessage('copy.intervention.5ea61dab56'), 'sales'],
    ] as const
  ).map(([label, key]) => ({ label, auto: isDelegated(w, key) }));
}
