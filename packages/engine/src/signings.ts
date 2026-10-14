import type { Player, Role, TransferBid, World } from '../../contracts/src/types';
import { currentDay, SEASON_ROUNDS } from './calendar';
import { compareIds, ratio } from './primitives';
import { activePlayers, addEvent, overall, ownStarters } from './world';
import { directionOption, financeStance } from './direction';
import { moneyLabel, operatingCosts, recentRevenue, wageBill } from './finance';
import { financeProjection } from './projection';
import { signingClauses } from './contracts';
import { pushInbox } from './inbox';
import { delegated } from './intervention';
import { transferOffers } from './ops-squad';
import { POLICY_INFO, policyOf } from './policy';
import { placeBid, transferWindow, transferWindowDays } from './transfers';

/**
 * The 단장's signings with transfers delegated (→CLUB-33, →STAFF-20): what a squad must hold before he
 * looks for upgrades, and how often he looks while a window is open.
 */
export const SIGNING_CONFIG = {
  lookDays: 7,
  roleMinimum: { GK: 2, DEF: 6, MID: 6, FWD: 4 } as Readonly<Record<Role, number>>,
  squadMinimum: 18,
  /** He looks for upgrades only while the squad has at most this many players. */
  upgradeSquad: 24,
};
const ROLES: readonly Role[] = ['GK', 'DEF', 'MID', 'FWD'];
const ROLE_NAME: Readonly<Record<Role, string>> = {
  GK: '골키퍼',
  DEF: '수비수',
  MID: '미드필더',
  FWD: '공격수',
};

type Offer = ReturnType<typeof transferOffers>[number];
/** Why the 단장 wants a player: a short role, or an upgrade over a starter. */
export type SigningNeed =
  | { kind: 'short'; role: Role; count: number; minimum: number; squad: number }
  | { kind: 'upgrade'; role: Role; starter: Player; margin: number };

const isOpen = (bid: TransferBid) => bid.status === 'pending' || bid.status === 'countered';
/** The opening day of the window open on `day`. */
function windowOpening(w: World, day: number) {
  const d = transferWindowDays(w.year);
  return day <= d.summerClose ? d.summerOpen : d.winterOpen;
}
/** The bids of this window, the owner's and the 단장's. */
function windowBids(w: World, day: number) {
  const opening = windowOpening(w, day);
  return (w.bids || []).filter(
    (bid) => bid.direction === 'out' && bid.year === w.year && bid.day >= opening,
  );
}

/** The first short role, or the role furthest below its share of an 18-player squad. */
export function shortRole(w: World): Extract<SigningNeed, { kind: 'short' }> | undefined {
  const squad = activePlayers(w),
    count = (role: Role) => squad.filter((p) => p.role === role).length;
  const short = ROLES.find((role) => count(role) < SIGNING_CONFIG.roleMinimum[role]);
  const role =
    short ??
    (squad.length < SIGNING_CONFIG.squadMinimum
      ? [...ROLES].sort(
          (a, b) =>
            count(a) - SIGNING_CONFIG.roleMinimum[a] - (count(b) - SIGNING_CONFIG.roleMinimum[b]),
        )[0]
      : undefined);
  return role
    ? {
        kind: 'short',
        role,
        count: count(role),
        minimum: SIGNING_CONFIG.roleMinimum[role],
        squad: squad.length,
      }
    : undefined;
}

/**
 * 재정 기조's checks on a signing (→ECON-33): the fee within its share of the cash above the
 * runway, and with his wage the runway, the wage bill ceiling and the season's cash projection.
 */
export function signingVerdict(w: World, player: Player, fee: string) {
  const stance = financeStance(w),
    finance = directionOption(w, 'finance').name,
    perRound = (BigInt(operatingCosts(w).annual) + BigInt(player.wage)) / BigInt(SEASON_ROUNDS),
    runway = perRound * BigInt(stance.runway),
    spare = BigInt(w.cash) - runway,
    cap = spare > 0n ? ratio(spare.toString(), BigInt(stance.signing.feeShare * 100), 100n) : '0';
  const no = (reason: string) => ({
    ok: false as const,
    reason: `${reason}(재정 기조 ${finance})`,
  });
  if (spare < BigInt(fee))
    return no(`이적료를 내면 운영자금이 ${stance.runway}라운드 운영비에 못 미쳐요`);
  if (BigInt(fee) > BigInt(cap))
    return no(
      `이적료 ${moneyLabel(w, fee)}가 여유 자금의 ${Math.round(stance.signing.feeShare * 100)}%(${moneyLabel(w, cap)})를 넘어요`,
    );
  const bill = BigInt(wageBill(w)) + BigInt(player.wage),
    revenue = recentRevenue(w),
    share = Math.round(stance.wageShare * 100);
  if (bill * 100n > BigInt(revenue) * BigInt(share))
    return no(
      `연봉을 더하면 연간 인건비 ${moneyLabel(w, bill.toString())}가 최근 12개월 수입 ${moneyLabel(w, revenue)}의 ${share}%를 넘어요`,
    );
  const cash = w.cash;
  w.players.push(player);
  w.cash = (BigInt(cash) - BigInt(fee)).toString();
  let seasonEnd: string;
  try {
    seasonEnd = financeProjection(w).seasonEnd.low;
  } finally {
    w.players.pop();
    w.cash = cash;
  }
  if (BigInt(seasonEnd) < runway)
    return no(
      `시즌 말 자금 전망(낮게 잡아 ${moneyLabel(w, seasonEnd)})이 ${stance.runway}라운드 운영비에 못 미쳐요`,
    );
  return {
    ok: true as const,
    reason: `이적료는 여유 자금의 ${Math.round(stance.signing.feeShare * 100)}% 안, 인건비는 수입의 ${share}% 안(재정 기조 ${finance})`,
  };
}

/** The need in words, with the row behind it. */
export function needLine(w: World, need: SigningNeed) {
  if (need.kind === 'short')
    return need.count < need.minimum
      ? `${ROLE_NAME[need.role]}가 ${need.count}명뿐이라 ${need.minimum}명을 채워요`
      : `선수단이 ${need.squad}명뿐이라 ${SIGNING_CONFIG.squadMinimum}명을 채워요`;
  return `주전 ${need.starter.name}(OVR ${overall(need.starter)})보다 ${need.margin} 이상 나은 ${ROLE_NAME[need.role]}를 찾아요(재정 기조 ${directionOption(w, 'finance').name})`;
}
const recruitmentLine = (w: World) =>
  `영입 기조 ${POLICY_INFO.recruitment.levels[policyOf(w).recruitment - 1].name}`;

/** The candidates for a need, free agents first, then by ability, potential and id. */
function candidates(w: World, offers: Offer[], need: SigningNeed, tried: Set<string>) {
  return offers
    .map((offer, index) => ({ offer, index }))
    .filter(
      ({ offer }) =>
        offer.available &&
        offer.player.role === need.role &&
        !tried.has(offer.player.id) &&
        (need.kind === 'short' || overall(offer.player) >= overall(need.starter) + need.margin),
    )
    .sort(
      (a, b) =>
        Number(b.offer.freeAgent) - Number(a.offer.freeAgent) ||
        overall(b.offer.player) - overall(a.offer.player) ||
        b.offer.player.potential - a.offer.player.potential ||
        compareIds(a.offer.player.id, b.offer.player.id),
    );
}

/** The upgrade needs: each role's weakest starter, the weakest of them first. */
function upgradeNeeds(w: World, margin: number): SigningNeed[] {
  const starters = ownStarters(w),
    weakest = ROLES.flatMap((role) => {
      const starter = starters
        .filter((p) => p.role === role)
        .sort((a, b) => overall(a) - overall(b) || compareIds(a.id, b.id))[0];
      return starter ? [{ role, starter }] : [];
    }).sort((a, b) => overall(a.starter) - overall(b.starter));
  return weakest.map(({ role, starter }) => ({ kind: 'upgrade', role, starter, margin }));
}

/** A free agent joins at once on the market's terms, with his signing's clauses (→CLUB-29). */
function signFreeAgent(w: World, offer: Offer, need: SigningNeed, why: string) {
  const p = structuredClone(offer.player),
    day = currentDay(w);
  p.clauses = signingClauses(w, p);
  w.players.push(p);
  // The signing is kept as a completed staff bid, so the window's count sees it.
  w.bids = [
    ...(w.bids || []),
    {
      id: `out:${w.year}:${day}:staff:${p.id}`.slice(0, 100),
      direction: 'out',
      playerId: p.id,
      fee: '0',
      offer: { player: offer.player, fee: offer.fee, loanFee: offer.loanFee },
      year: w.year,
      day,
      due: day,
      status: 'completed',
      staff: need.kind,
    },
  ];
  addEvent(
    w,
    'transfer-in',
    `${p.name} 영입`,
    `${p.role} · ${w.year - p.born}세 · 연봉 ${moneyLabel(w, p.wage)} · 계약 ${p.until}년 · 단장 영입`,
    '0',
  );
  pushInbox(w, {
    kind: 'staff-report',
    title: `단장 영입 · 자유계약 ${p.name}`,
    detail:
      `${needLine(w, need)} · ${p.role} · ${w.year - p.born}세 · OVR ${overall(p)} · 연봉 ${moneyLabel(w, p.wage)} · ${recruitmentLine(w)} · ${why}`.slice(
        0,
        400,
      ),
    attention: false,
  });
}

/**
 * The 단장's look (→CLUB-33): with transfers delegated and a window open, on its opening
 * day and every 7th day after it, at most one move — a free agent signed or a bid at the asking
 * fee — for the first need a candidate meets within 재정 기조; none while one of his bids is open.
 */
export function staffSignings(w: World) {
  const day = currentDay(w),
    window = transferWindow(w, day);
  if (!window.open || !delegated(w, 'transfers')) return;
  if ((day - windowOpening(w, day)) % SIGNING_CONFIG.lookDays !== 0) return;
  const bids = windowBids(w, day);
  if (bids.some((bid) => bid.staff && isOpen(bid))) return;
  const squad = activePlayers(w).length;
  if (squad >= 26) return;
  const stance = financeStance(w),
    upgrades = bids.filter(
      (bid) => bid.staff === 'upgrade' && (bid.status === 'completed' || isOpen(bid)),
    ).length,
    tried = new Set(bids.map((bid) => bid.playerId)),
    offers = transferOffers(w);
  const short = shortRole(w),
    needs: SigningNeed[] = short
      ? [short]
      : stance.signing.margin !== undefined &&
          upgrades < stance.signing.upgrades &&
          squad <= SIGNING_CONFIG.upgradeSquad
        ? upgradeNeeds(w, stance.signing.margin)
        : [];
  for (const need of needs)
    for (const { offer, index } of candidates(w, offers, need, tried)) {
      const fee = offer.freeAgent
        ? '0'
        : ratio(offer.fee, BigInt(Math.round(stance.signing.bid * 100)), 100n);
      const verdict = signingVerdict(w, offer.player, fee);
      if (!verdict.ok) continue;
      if (offer.freeAgent) signFreeAgent(w, offer, need, verdict.reason);
      else {
        placeBid(w, index, fee, false, need.kind);
        const bid = w.bids!.findLast((one) => one.playerId === offer.player.id)!;
        pushInbox(w, {
          kind: 'staff-report',
          title: `단장 영입 제안 · ${offer.player.name}`,
          detail:
            `${needLine(w, need)} · ${offer.player.role} · ${w.year - offer.player.born}세 · OVR ${overall(offer.player)} · 제안 ${moneyLabel(w, fee)} (요구액 ${moneyLabel(w, offer.fee)}) · ${recruitmentLine(w)} · ${verdict.reason}`.slice(
              0,
              400,
            ),
          attention: false,
          ref: bid.id,
        });
      }
      return;
    }
}
