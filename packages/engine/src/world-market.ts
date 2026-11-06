import { message as sourceMessage } from '../../contracts/src/messages';
/** Whole-world recruitment reads: every club's players and the world's free agents (→WEB-43). */
import type {
  Club,
  FreeAgent,
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
import { synergyEffects } from './synergy';
import { askedFeeFactor } from './owner-traits';
import { FREE_AGENT_CONFIG, freeAgentsOf } from './free-agents';
import { isForeignCandidate } from './scout-search';
import { bidOutlook } from './transfers';
import { recruitmentPreview, recruitmentContext, recruitmentFit } from './recruitment';
import { scoutVerdict } from './scout-verdict';

const recommendedIds = (w: World) =>
  new Set(w.shortlist?.year === w.year ? w.shortlist.entries.map((entry) => entry.playerId) : []);
export const graduateIds = (w: World) =>
  new Set(w.players.filter((p) => p.graduate).map((p) => p.id));
/**
 * The share of his value a club asks us: the 단장's negotiation, 머니볼's fees (→CLUB-21) and
 * 협상의 달인 (→STAFF-20, →OWNER-5).
 */
export const askingMultiplier = (w: World) =>
  staffEffects(w).feeMultiplier * synergyEffects(w).feeMultiplier * askedFeeFactor(w);

/** A club player nobody can sign: retired or gone, on loan there, or announced to retire. */
export function unavailableAtClub(w: World, player: Player) {
  return (
    player.status !== 'active' ||
    !!player.loanUntil ||
    !!player.retiring ||
    !!w.people?.[player.id]?.loan ||
    !!w.people?.[player.id]?.retirement
  );
}
/**
 * What another club's player would cost us (→CLUB-25): his club asks his value at its own
 * division, quoted in our currency, and he would join on our division's market wage. Our
 * academy qualification survives a spell at another club (→CLUB-44).
 */
export function clubTerms(
  w: World,
  club: Club,
  player: Player,
  feeMultiplier = askingMultiplier(w),
  graduates = graduateIds(w),
) {
  const buyer = clubOf(w);
  const value = marketValueAt(buyer.country, w.year, club.tier, player);
  return {
    player: {
      ...player,
      ...(graduates.has(player.id) ? { graduate: true as const } : {}),
      wage: marketWageAt(buyer.country, w.year, buyer.tier, player),
    },
    fee: scaleBy(value, feeMultiplier, 1000n),
    loanFee: scaleBy(value, MARKET_CONFIG.loan, 1000n),
  };
}
/**
 * What a free agent would sign for (→CLUB-49): no fee, our division's market wage and the term
 * a free signing takes; he leaves the pool's bookkeeping behind.
 */
export function freeAgentTerms(w: World, agent: FreeAgent, graduates = graduateIds(w)) {
  const buyer = clubOf(w);
  const { freeSince: _since, ...player } = agent;
  void _since;
  return {
    player: {
      ...player,
      ...(graduates.has(agent.id) ? { graduate: true as const } : {}),
      wage: marketWageAt(buyer.country, w.year, buyer.tier, agent),
      until: w.year + FREE_AGENT_CONFIG.term,
    } satisfies Player,
    fee: '0',
    loanFee: '0',
  };
}

/** A player at a club, if he really is there now: in its squad and, when recorded, active there. */
export function clubPlayer(w: World, club: Club, id: string): Player | undefined {
  const player = squad(w, club).find((p) => p.id === id);
  const person = player && w.people?.[id];
  if (person && (person.club !== club.id || person.playing !== 'active')) return undefined;
  return player;
}

function clubOffer(
  w: World,
  club: Club,
  player: Player,
  recommended: Set<string>,
  feeMultiplier = askingMultiplier(w),
  owned = new Set(activePlayers(w).map((p) => p.id)),
  graduates = graduateIds(w),
): WorldMarketOffer {
  const own = club.id === w.playerClub;
  const terms = clubTerms(w, club, player, feeMultiplier, graduates);
  return {
    target: { world: w.id, kind: 'club', clubId: club.id, playerId: player.id },
    source: {
      club: club.id,
      name: club.name,
      country: club.country,
      tier: club.tier,
      group: club.group,
    },
    player: own ? player : terms.player,
    fee: terms.fee,
    loanFee: terms.loanFee,
    freeAgent: false,
    own,
    foreign: club.country !== clubOf(w).country,
    available: !own && !unavailableAtClub(w, player) && !owned.has(player.id),
    recommended: !own && recommended.has(player.id),
  };
}
/** A free agent of the pool as a market row: `offer` targets are free agents (→CLUB-49). */
function freeAgentOffer(
  w: World,
  agent: FreeAgent,
  recommended: Set<string>,
  owned = new Set(activePlayers(w).map((p) => p.id)),
  graduates = graduateIds(w),
): WorldMarketOffer {
  return {
    ...freeAgentTerms(w, agent, graduates),
    target: { world: w.id, kind: 'offer', playerId: agent.id },
    freeAgent: true,
    own: false,
    foreign: isForeignCandidate(w, agent.id),
    available: agent.status === 'active' && !owned.has(agent.id),
    recommended: recommended.has(agent.id),
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
    const agent = freeAgentsOf(w).find((p) => p.id === target.playerId);
    return agent && freeAgentOffer(w, agent, recommended);
  }
  const club = w.clubs.find((c) => c.id === target.clubId);
  if (!club) return undefined;
  const player = clubPlayer(w, club, target.playerId);
  return player && clubOffer(w, club, player, recommended);
}

/** Pure bounded query. Only rows on this page leave the worker; no previews are built here. */
export function worldMarketPage(w: World, input: WorldMarketQuery): WorldMarketPage {
  const q = worldMarketQuerySchema.parse(input);
  if (q.world !== w.id) throw new Error(sourceMessage('copy.world_market.4466033c4c'));
  const recommended = recommendedIds(w);
  const feeMultiplier = askingMultiplier(w);
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
    if (q.ovrMin !== undefined && overall(p) < q.ovrMin) return;
    if (q.ovrMax !== undefined && overall(p) > q.ovrMax) return;
    if (q.ageMax !== undefined && w.year - p.born > q.ageMax) return;
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
  // The whole pool, whatever the chief scout's reach (→CLUB-51): the owner's search is not his.
  if (!q.team && !q.league)
    for (const agent of freeAgentsOf(w)) {
      const offer = freeAgentOffer(w, agent, recommended, owned, graduates);
      if (offer.available) include(offer);
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
  if (!offer) throw new Error(sourceMessage('copy.world_market.4a04d0a645'));
  const buy = recruitmentPreview(w, offer);
  return {
    world: w.id,
    revision: w.revision,
    offer: structuredClone(offer),
    buy,
    loan: recruitmentPreview(w, offer, true),
    verdict: scoutVerdict(w, offer, buy),
    bid: bidOutlook(w, target, fee ?? (loan ? offer.loanFee : offer.fee), loan),
  };
}
