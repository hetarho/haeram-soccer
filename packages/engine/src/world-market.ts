/** Whole-world recruitment reads. Ordinary worker views keep their legacy scout offers. */
import type {
  Club,
  Player,
  World,
  WorldMarketOffer,
  WorldMarketQuery,
  WorldMarketPage,
  WorldMarketTarget,
} from '../../contracts/src/types';
import { WORLD_MARKET_PAGE_SIZE, worldMarketQuerySchema } from '../../contracts/src/schema';
import { activePlayers, clubOf, overall } from './player-state';
import { squad } from './world';
import { POSITIONS } from '../../contracts/src/player';
import { lineOf } from './player';
import { MARKET_CONFIG, marketValueAt, marketWageAt } from './contracts';
import { compareIds, scaleBy } from './primitives';
import { staffEffects } from './staff';
import { transferOffers, isForeignCandidate } from './ops-squad';
import { bidOutlook } from './transfers';
import { recruitmentPreview, recruitmentContext, recruitmentFit } from './recruitment';

const recommendedIds = (w: World) =>
  new Set(w.shortlist?.year === w.year ? w.shortlist.entries.map((entry) => entry.playerId) : []);
const graduateIds = (w: World) => new Set(w.players.filter((p) => p.graduate).map((p) => p.id));

function clubOffer(
  w: World,
  club: Club,
  player: Player,
  recommended: Set<string>,
  feeMultiplier = staffEffects(w).feeMultiplier,
  owned = new Set(activePlayers(w).map((p) => p.id)),
  graduates = graduateIds(w),
): WorldMarketOffer {
  const own = club.id === w.playerClub;
  // Asking fees and contractual wages are quoted in the buying club's currency, as scout offers
  // are. The seller's actual division sets value; the buyer's sets the new contract wage.
  const buyer = clubOf(w);
  const fee = marketValueAt(buyer.country, w.year, club.tier, player);
  const unavailable =
    player.status !== 'active' ||
    !!player.loanUntil ||
    !!player.retiring ||
    !!w.people?.[player.id]?.loan ||
    !!w.people?.[player.id]?.retirement;
  return {
    target: { world: w.id, kind: 'club', clubId: club.id, playerId: player.id },
    source: {
      club: club.id,
      name: club.name,
      country: club.country,
      tier: club.tier,
      group: club.group,
    },
    player: own
      ? player
      : {
          ...player,
          // Our academy qualification survives a spell at another club (→CLUB-44).
          ...(graduates.has(player.id) ? { graduate: true as const } : {}),
          wage: marketWageAt(buyer.country, w.year, buyer.tier, player),
        },
    fee: scaleBy(fee, feeMultiplier, 1000n),
    loanFee: scaleBy(fee, MARKET_CONFIG.loan, 1000n),
    freeAgent: false,
    own,
    foreign: club.country !== buyer.country,
    available: !own && !unavailable && !owned.has(player.id),
    recommended: !own && recommended.has(player.id),
  };
}

/** Resolve the actual current club and player, never a displayed row number. */
export function worldMarketOffer(
  w: World,
  target: WorldMarketTarget,
): WorldMarketOffer | undefined {
  if (target.world !== w.id) return undefined;
  const recommended = recommendedIds(w);
  if (target.kind === 'offer') {
    const offer = transferOffers(w).find((o) => o.player.id === target.playerId);
    if (!offer) return undefined;
    return {
      ...offer,
      target,
      own: false,
      recommended: recommended.has(target.playerId),
      foreign: isForeignCandidate(target.playerId),
    };
  }
  const club = w.clubs.find((c) => c.id === target.clubId);
  if (!club) return undefined;
  const player = squad(w, club).find((p) => p.id === target.playerId);
  if (!player) return undefined;
  const person = w.people?.[player.id];
  if (person && (person.club !== club.id || person.playing !== 'active')) return undefined;
  return clubOffer(w, club, player, recommended);
}

/** Pure bounded query. Only rows on this page leave the worker; no previews are built here. */
export function worldMarketPage(w: World, input: WorldMarketQuery): WorldMarketPage {
  const q = worldMarketQuerySchema.parse(input);
  if (q.world !== w.id) throw new Error('다른 커리어의 이적시장 요청입니다.');
  const recommended = recommendedIds(w);
  const feeMultiplier = staffEffects(w).feeMultiplier;
  const owned = new Set(activePlayers(w).map((p) => p.id));
  const graduates = graduateIds(w);
  const rows: WorldMarketOffer[] = [];
  const seen = new Set<string>();
  const name = q.name?.trim().toLowerCase();
  // Reuse the exact existing fit filter with one shared XI; full previews stay detail-only.
  const fitContext = q.fit === 'improves' ? recruitmentContext(w) : undefined;
  const include = (offer: WorldMarketOffer) => {
    const p = offer.player;
    if (p.status !== 'active' || seen.has(p.id)) return;
    if (name && !p.name.toLowerCase().includes(name)) return;
    if (q.recommendedOnly && !offer.recommended) return;
    if (q.team && offer.source?.club !== q.team) return;
    if (
      q.league &&
      (!offer.source ||
        offer.source.country !== q.league.country ||
        offer.source.tier !== q.league.tier ||
        offer.source.group !== q.league.group)
    )
      return;
    if (q.position && (p.positions[q.position] ?? 0) < 2) return;
    if (
      q.line &&
      !POSITIONS.some(
        (position) => (p.positions[position] ?? 0) >= 2 && lineOf(position) === q.line,
      )
    )
      return;
    if (fitContext) {
      const fit = recruitmentFit(w, offer, fitContext);
      if (fit.strengthDelta <= 0 && fit.fitDelta <= 0) return;
    }
    seen.add(p.id);
    rows.push(offer);
  };
  for (const club of w.clubs) {
    if (q.team && q.team !== club.id) continue;
    if (
      q.league &&
      (q.league.country !== club.country ||
        q.league.tier !== club.tier ||
        q.league.group !== club.group)
    )
      continue;
    for (const player of squad(w, club))
      include(clubOffer(w, club, player, recommended, feeMultiplier, owned, graduates));
  }
  for (const offer of transferOffers(w)) {
    // An already signed scout identity is represented by its current club row.
    if (seen.has(offer.player.id) || !offer.available) continue;
    include({
      ...offer,
      target: { world: w.id, kind: 'offer', playerId: offer.player.id },
      own: false,
      foreign: isForeignCandidate(offer.player.id),
      recommended: recommended.has(offer.player.id),
    });
  }
  const sort = q.sort ?? 'ovr',
    direction = q.direction === 'asc' ? 1 : -1;
  const moneyCompare = (a: string, b: string) =>
    BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
  rows.sort((a, b) => {
    const delta =
      sort === 'name'
        ? compareIds(a.player.name, b.player.name)
        : sort === 'age'
          ? b.player.born - a.player.born
          : sort === 'ovr'
            ? overall(a.player) - overall(b.player)
            : sort === 'potential'
              ? a.player.potential - b.player.potential
              : sort === 'fee'
                ? moneyCompare(a.fee, b.fee)
                : moneyCompare(a.player.wage, b.player.wage);
    return direction * delta || compareIds(a.player.id, b.player.id);
  });
  const pageSize = q.pageSize ?? WORLD_MARKET_PAGE_SIZE;
  const page = Math.min(q.page ?? 0, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  return {
    world: w.id,
    revision: w.revision,
    total: rows.length,
    page,
    pageSize,
    items: structuredClone(rows.slice(page * pageSize, (page + 1) * pageSize)),
  };
}

/** Expensive previews belong only to an explicitly inspected candidate, never the full market. */
export function worldMarketDetail(w: World, target: WorldMarketTarget, fee?: string, loan = false) {
  const offer = worldMarketOffer(w, target);
  if (!offer) throw new Error('이적 대상의 소속이나 커리어가 바뀌었어요. 목록을 새로 확인하세요.');
  return {
    world: w.id,
    revision: w.revision,
    offer: structuredClone(offer),
    buy: recruitmentPreview(w, offer),
    loan: recruitmentPreview(w, offer, true),
    bid: bidOutlook(w, target, fee ?? (loan ? offer.loanFee : offer.fee), loan),
  };
}
