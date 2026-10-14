import type { Role, SigningRequest, World } from '../../../../packages/contracts/src/types';
import type { TransferOffer } from '../../../../packages/engine/src/recruitment';
import { delegated } from '../../../../packages/engine/src/intervention';
import { transferWindow } from '../../../../packages/engine/src/transfers';

const ROLES: readonly Role[] = ['GK', 'DEF', 'MID', 'FWD'];
export const ROLE_NAMES: Readonly<Record<Role, string>> = {
  GK: '골키퍼',
  DEF: '수비수',
  MID: '미드필더',
  FWD: '공격수',
};

/** One role of the chief scout's shortlist (→CLUB-33), with the manager's request for it. */
export interface ShortlistRow {
  role: Role;
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
  return ROLES.map((role) => {
    const asked = s.requests.find((request) => request.role === role);
    const request = asked && {
      role: asked.role,
      kind: asked.kind,
      ...(asked.pick && ids.has(asked.pick) ? { pick: asked.pick } : {}),
    };
    return {
      role,
      ...(request ? { request } : {}),
      entries: listed
        .filter(({ offer }) => offer.player.role === role)
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
  if (!window || window.year !== w.year || !window.roles.length || !transferWindow(w).open)
    return undefined;
  const roles = window.roles.map((role) => ROLE_NAMES[role]).join('·');
  return window.met
    ? `요청한 ${roles} 자리에 선수가 합류했어요 · 이번 이적시장은 감독 신뢰가 떨어지지 않아요`
    : `이적시장이 닫힐 때까지 ${roles} 자리에 아무도 오지 않으면 감독 신뢰 −3`;
}

/** What the 단장 decides at the current level (→STAFF-20), each 맡김 or 직접. */
export function directorDecisions(w: Pick<World, 'intervention'>) {
  return (
    [
      ['재계약 협상', 'contracts'],
      ['감독 선임', 'manager'],
      ['이적', 'transfers'],
    ] as const
  ).map(([label, key]) => ({ label, auto: delegated(w, key) }));
}
