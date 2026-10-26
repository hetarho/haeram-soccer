import type { Line, SigningRequest, World } from '../../../../packages/contracts/src/types';
import { LINES } from '../../../../packages/contracts/src/player';
import { lineOf, POSITION_LABEL } from '../../../../packages/engine/src/player';
import type { TransferOffer } from '../../../../packages/engine/src/recruitment';
import { isDelegated } from '../../../../packages/engine/src/responsibilities';
import { transferWindow } from '../../../../packages/engine/src/transfer-window';

export const LINE_NAMES: Readonly<Record<Line, string>> = {
  GK: '골키퍼',
  DF: '수비수',
  MF: '미드필더',
  FW: '공격수',
};

/** What a request asks for: its line, or the formation slot's position (→CLUB-33). */
export const requestName = (request: Pick<SigningRequest, 'line' | 'position'>) =>
  request.position ? POSITION_LABEL[request.position] : LINE_NAMES[request.line];
/** One line of the chief scout's shortlist (→CLUB-33), with the manager's request for it. */
export interface ShortlistRow {
  line: Line;
  request?: SigningRequest;
  /** Still on the market list and free to join, best first; `index` in the market list. */
  entries: { index: number; offer: TransferOffer; pick: boolean }[];
}

/**
 * The shortlist as 이적시장 shows it (→WEB-43): this season's entries resolved against the market
 * list by player id, those no longer available dropped, grouped by role, each role with the
 * manager's request and his pick while that player is still listed. Empty before the first draw.
 */
export function shortlistRows(w: World, offers: readonly TransferOffer[]): ShortlistRow[] {
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
        .map((entry) => ({ ...entry, pick: entry.offer.player.id === request?.pick })),
    };
  });
}

/** Why the manager asks for a role: short of the minimum (부족) or a starter to beat (보강). */
export const REQUEST_WHY: Readonly<Record<SigningRequest['kind'], string>> = {
  short: '부족',
  upgrade: '보강',
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
    ? `요청한 ${roles} 자리에 선수가 합류했어요 · 이번 이적시장은 감독 신뢰가 떨어지지 않아요`
    : `이적시장이 닫힐 때까지 ${roles} 자리에 아무도 오지 않으면 감독 신뢰 −3`;
}

/** What the 단장 decides at the current level (→STAFF-20), each 맡김 or 직접. */
export function directorDecisions(w: Pick<World, 'intervention' | 'settings'>) {
  return (
    [
      ['재계약 협상', 'contracts'],
      ['감독 선임', 'manager'],
      ['선수 영입', 'recruitment'],
      ['선수 매각', 'sales'],
    ] as const
  ).map(([label, key]) => ({ label, auto: isDelegated(w, key) }));
}
