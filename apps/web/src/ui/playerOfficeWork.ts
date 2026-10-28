import type { InboxItem, ResponsibilityKey, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { activePlayers } from '../../../../packages/engine/src/player-state';
import { directionOption } from '../../../../packages/engine/src/direction';
import { currentDay } from '../../../../packages/engine/src/calendar';
import { areaOf } from './areas';
import { areaSummary, currentStepName } from './board';
import type { AreaKey } from './areas';
import { decisionOwner } from './intervention';

export const PLAYER_WORK_TABS = [
  ['overview', '개요'],
  ['contracts', '계약'],
  ['recruitment', '영입'],
  ['sales', '매각'],
  ['academy', '유소년 승격·방출'],
] as const;
export type PlayerWorkTab = (typeof PLAYER_WORK_TABS)[number][0];
export type PlayerWork = Exclude<PlayerWorkTab, 'overview'>;
export const PLAYER_WORK_SCOPES: Record<
  PlayerWork,
  { responsibility: ResponsibilityKey; areas: readonly AreaKey[] }
> = {
  contracts: { responsibility: 'contracts', areas: ['finance'] },
  recruitment: { responsibility: 'recruitment', areas: ['scouting'] },
  sales: { responsibility: 'sales', areas: ['market'] },
  academy: { responsibility: 'academy', areas: ['youth'] },
};
/** Older session selections retain their actual work without changing saved policy identities. */
export function playerWorkTab(value: unknown): PlayerWorkTab {
  if (value === 'players') return 'contracts';
  if (value === 'market') return 'recruitment';
  return PLAYER_WORK_TABS.find(([key]) => key === value)?.[0] ?? 'overview';
}
export function workRequests(pending: readonly StopReason[], key: ResponsibilityKey) {
  return pending.filter((item) => (item.responsibilities ?? [item.responsibility]).includes(key));
}
function openPlayerBids(w: World) {
  const day = currentDay(w);
  return (w.bids ?? []).filter(
    (bid) =>
      bid.year === w.year &&
      bid.due >= day &&
      (bid.status === 'pending' || bid.status === 'countered'),
  );
}
/** Read only the applied values and retained active contracts/bids; never estimate new offers. */
export function playerOfficeOverview(w: World, pending: readonly StopReason[]) {
  const players = activePlayers(w);
  const openBids = openPlayerBids(w);
  return {
    players: players.length,
    wage: players.reduce((total, player) => total + BigInt(player.wage), 0n).toString(),
    expiring: players.filter((player) => player.until <= w.year + 1),
    talks: players.filter((player) => player.talk),
    incoming: openBids.filter((bid) => bid.direction === 'in'),
    outgoing: openBids.filter((bid) => bid.direction === 'out'),
    stances: (Object.keys(PLAYER_WORK_SCOPES) as PlayerWork[]).map((key) => {
      const { responsibility } = PLAYER_WORK_SCOPES[key];
      const owner = decisionOwner(w, responsibility);
      const role = key === 'academy' ? 'youth' : 'director';
      const person = w.staff?.find((member) => member.role === role)?.name;
      return {
        key,
        name: owner.name,
        auto: owner.auto,
        actor: owner.auto
          ? (person ?? (role === 'youth' ? '유스 디렉터 공석' : '단장 공석'))
          : '구단주',
        applied:
          key === 'contracts'
            ? `재계약 기조 ${directionOption(w, 'renewal').name} · 선수단 투자 ${currentStepName(w, 'support')}`
            : areaSummary(
                w,
                areaOf(key === 'recruitment' ? 'scouting' : key === 'sales' ? 'market' : 'youth'),
              ),
        pending: workRequests(pending, responsibility),
      };
    }),
  };
}
/** The existing event card owns bid submission and its protections; this only selects live facts. */
export function saleOfferItems(w: World): InboxItem[] {
  const incoming = openPlayerBids(w).filter((bid) => bid.direction === 'in');
  const active = new Set(activePlayers(w).map((player) => player.id));
  return incoming
    .filter((bid) => bid.status === 'pending' && active.has(bid.playerId))
    .map(
      (bid) =>
        w.inbox?.findLast((item) => item.kind === 'incoming-bid' && item.ref === bid.id) ?? {
          id: `office-sale:${bid.id}`,
          year: bid.year,
          day: bid.day,
          kind: 'incoming-bid',
          ref: bid.id,
          attention: true,
          title: '우리 선수에게 온 매각 제안',
          detail: '수락하면 선수가 이적해요. 실제 제안 금액과 구단, 선수단 여유를 확인하세요.',
        },
    );
}
