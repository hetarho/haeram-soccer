/**
 * Personal terms (선수 개인 조건, →CLUB-53): once the selling club agrees, or at once for a free
 * agent, the player answers our wage offer with chance σ(1.5 + the sum of his factors). Money, the
 * stage and playing time move him; each factor is one registry entry, so a later one (prestige,
 * club history) is one more line and no caller changes.
 *
 * The model is pure: `termsAnswer` takes the context and a uniform draw, which the caller reads
 * from `random(\`${w.seed}:terms:${bidId}\`)` (→ARCH-5). `termsContext` reads one from a world.
 */
import type { Grade } from '../../contracts/src/player';
import type { Club, Player, World } from '../../contracts/src/types';
import { loyaltyTerm } from './loyalty';
import { freeAgentsOf } from './free-agents';
import { divisionFor } from './market-prices';
import { exp, log } from './portable-math';
import { clubOf, overall } from './player-state';
import { recruitmentSelection, type TransferOffer } from './recruitment';
import type { AnswerFactor, FactorLine } from './sale-answer';
import { arrivalBase, clubById, startingSquad, type ArrivalBase } from './world';
import { clubPlayer, worldMarketOffer } from './world-market';

/** Our offer as a share of his demand: the owner picks one, the 단장 the smallest that suits. */
export const WAGE_STEPS = [1, 1.25, 1.5, 2] as const;
/** The European competitions a club plays this season, the strongest first (→EURO-1/2). */
export const EUROPE_LEVELS = ['ucl', 'cwc', 'uel', 'uecl'] as const;
export type EuropeLevel = (typeof EUROPE_LEVELS)[number];

/** Everything the player's answer reads, in plain values (→CLUB-53). */
export interface TermsContext {
  /** His demand, today's market wage at our club, and our offer, in the same money. */
  demand: string;
  offer: string;
  /** Divisions our club sits below his club, or below the one his ability suits; never negative. */
  divisionsBelow: number;
  ourReputation: number;
  /** His club's reputation; absent for a free agent. */
  hisReputation?: number;
  /** His 야망 (→PLAYER-18) and age, which weigh the stage. */
  ambition: Grade;
  age: number;
  /** Our strongest European competition this season, with its name as the season names it. */
  ourEurope?: { level: EuropeLevel; name: string };
  /** His club plays in Europe this season. */
  hisEurope: boolean;
  /** He would start for us; he starts for his club now. */
  wouldStart: boolean;
  startsNow: boolean;
  freeAgent: boolean;
  /** His loyalty term at the selling club; zero for free agents (→CLUB-54). */
  loyalty: number;
}

/** CLUB-53's log-odds; starting values, tuned by measurement. */
export const TERMS_VALUES = {
  base: 1.5,
  /** 3 × ln(offer ÷ demand) below it, 1.5 × ln(min(offer ÷ demand, 2.5)) above it. */
  wageBelow: 3,
  wageAbove: 1.5,
  wageCap: 2.5,
  division: -1.2,
  /** (ours − his club's) ÷ 20 × his ambition weight. */
  reputationScale: 20,
  europe: { ucl: 0.6, cwc: 0.3, uel: 0.3, uecl: 0.15 } satisfies Record<EuropeLevel, number>,
  leavingEurope: -0.4,
  wouldStart: 0.4,
  losesPlace: -0.9,
  freeAgent: 1,
  /** Ambition weight by 야망 1–5, halved from this age. */
  ambitionWeights: [0.6, 0.8, 1, 1.25, 1.5],
  ambitionHalvedAge: 31,
} as const;

const T = TERMS_VALUES;
/** How much the stage weighs with him: by his 야망, halved from 31. */
export function ambitionWeight(ambition: Grade, age: number) {
  const weight = T.ambitionWeights[ambition - 1]!;
  return age >= T.ambitionHalvedAge ? weight / 2 : weight;
}
/** Our offer over his demand; an empty demand reads as the wage factor's cap. */
export function wageRatio(c: Pick<TermsContext, 'demand' | 'offer'>) {
  const demand = BigInt(c.demand);
  if (demand <= 0n) return T.wageCap;
  return Number((BigInt(c.offer) * 1_000_000n) / demand) / 1_000_000;
}
const round2 = (value: number) => Math.round(value * 100) / 100;
const line = (
  factor: string,
  delta: number,
  message: FactorLine['message'],
  params: Record<string, string | number> = {},
): FactorLine => ({ factor, delta, message, params });

/** CLUB-53's starting registry; the chance only sums it. */
export const TERMS_FACTORS: readonly AnswerFactor<TermsContext>[] = [
  {
    id: 'wage',
    read: (c) => {
      const r = wageRatio(c),
        percent = Math.round(r * 100);
      if (r < 1) return line('wage', T.wageBelow * log(r), 'market.terms.wage.below', { percent });
      if (r > 1)
        return line('wage', T.wageAbove * log(Math.min(r, T.wageCap)), 'market.terms.wage.above', {
          percent,
        });
      return undefined;
    },
  },
  {
    id: 'division',
    read: (c) =>
      c.divisionsBelow > 0
        ? line(
            'division',
            T.division * c.divisionsBelow * ambitionWeight(c.ambition, c.age),
            c.freeAgent ? 'market.terms.division.suited' : 'market.terms.division',
            { divisions: c.divisionsBelow },
          )
        : undefined,
  },
  {
    id: 'reputation',
    read: (c) => {
      if (c.hisReputation === undefined || c.hisReputation === c.ourReputation) return undefined;
      const delta =
        ((c.ourReputation - c.hisReputation) / T.reputationScale) *
        ambitionWeight(c.ambition, c.age);
      return line(
        'reputation',
        delta,
        delta > 0 ? 'market.terms.reputation.higher' : 'market.terms.reputation.lower',
        { ours: c.ourReputation, his: c.hisReputation },
      );
    },
  },
  {
    id: 'europe',
    read: (c) =>
      c.ourEurope
        ? line('europe', T.europe[c.ourEurope.level], 'market.terms.europe', {
            competition: c.ourEurope.name,
          })
        : undefined,
  },
  {
    id: 'leavingEurope',
    read: (c) =>
      c.hisEurope && !c.ourEurope
        ? line('leavingEurope', T.leavingEurope, 'market.terms.leavingEurope')
        : undefined,
  },
  {
    id: 'playingTime',
    read: (c) =>
      c.wouldStart
        ? line('playingTime', T.wouldStart, 'market.terms.wouldStart')
        : c.startsNow
          ? line('playingTime', T.losesPlace, 'market.terms.losesPlace')
          : undefined,
  },
  {
    id: 'freeAgent',
    read: (c) =>
      c.freeAgent ? line('freeAgent', T.freeAgent, 'market.terms.freeAgent') : undefined,
  },
  {
    id: 'loyalty',
    read: (c) =>
      !c.freeAgent && c.loyalty > 0
        ? line('loyalty', -c.loyalty, 'market.terms.loyalty')
        : undefined,
  },
];

/** His chance of agreeing, σ(1.5 + Σ), with the lines of the factors that moved it. */
export function termsChance(
  context: TermsContext,
  factors: readonly AnswerFactor<TermsContext>[] = TERMS_FACTORS,
) {
  const lines = factors.flatMap((f) => {
    const read = f.read(context);
    return read ? [read] : [];
  });
  const logOdds = lines.reduce<number>((sum, l) => sum + l.delta, T.base);
  return { chance: 1 / (1 + exp(-logOdds)), logOdds: round2(logOdds), lines };
}

/** His answer for a uniform `draw` in [0, 1): he agrees when the draw falls below his chance. */
export function termsAnswer(
  context: TermsContext,
  draw: number,
  factors: readonly AnswerFactor<TermsContext>[] = TERMS_FACTORS,
) {
  const read = termsChance(context, factors);
  return { accept: draw < read.chance, ...read };
}

/** The terms a world context is read for: the player, his club (absent for a free agent), the step. */
export interface TermsOffer {
  playerId: string;
  clubId?: string;
  /** Our offer as a share of his demand, one of `WAGE_STEPS`. */
  step: number;
}

/** A club's strongest European competition this season, and whether it plays in one. */
function europeOf(w: World, clubId: string) {
  return EUROPE_LEVELS.flatMap((level) => {
    const t = w.europe.find((one) => one.key === level && one.clubs.includes(clubId));
    return t ? [{ level, name: t.name }] : [];
  })[0];
}

/**
 * The context of our terms from the world as it stands: his demand (today's quote at our club) and
 * our step of it, the division and reputation gaps, both clubs' European entries this season,
 * whether he would start for us and starts now, and whether he is a free agent. Undefined when he
 * is not found.
 */
export function termsContext(w: World, terms: TermsOffer): TermsContext | undefined {
  const club = terms.clubId === undefined ? undefined : clubById(w, terms.clubId);
  if (terms.clubId !== undefined && !club) return undefined;
  const player = club
    ? clubPlayer(w, club, terms.playerId)
    : freeAgentsOf(w).find((p) => p.id === terms.playerId);
  if (!player) return undefined;
  const offer = worldMarketOffer(
    w,
    club
      ? { world: w.id, kind: 'club', clubId: club.id, playerId: player.id }
      : { world: w.id, kind: 'offer', playerId: player.id },
  );
  if (!offer) return undefined;
  return resolvedTermsContext(w, { player, club, offer, step: terms.step });
}

/** Query-local facts shared by all candidates; no cache survives a world mutation. */
export function termsSearchContext(w: World) {
  const entries = new Map<string, ReturnType<typeof europeOf>>(),
    starters = new Map<string, Set<string>>();
  let arrivals: ArrivalBase | undefined;
  return {
    ownStarters: startingSquad(w, clubOf(w)),
    /** Our squad read once for every candidate's XI (`startersWithArrival`). */
    arrivals: () => (arrivals ??= arrivalBase(w)),
    europe: (id: string) => {
      if (!entries.has(id)) entries.set(id, europeOf(w, id));
      return entries.get(id);
    },
    starters: (club: Club) => {
      let ids = starters.get(club.id);
      if (!ids) starters.set(club.id, (ids = new Set(startingSquad(w, club).map((p) => p.id))));
      return ids;
    },
  };
}

/** Use the resolved source player (including his club history), and the buyer's quote separately. */
export function resolvedTermsContext(
  w: World,
  {
    player,
    club,
    offer,
    step,
  }: { player: Player; club?: Club; offer: TransferOffer; step: number },
  context = termsSearchContext(w),
): TermsContext {
  const ours = clubOf(w),
    demand = BigInt(offer.player.wage),
    share = BigInt(Math.round(step * 10000)),
    hisDivision = club ? club.tier : Math.round(divisionFor(ours.country, overall(player))),
    ourEurope = context.europe(ours.id);
  return {
    demand: demand.toString(),
    offer: ((demand * share) / 10000n).toString(),
    divisionsBelow: Math.max(0, ours.tier - hisDivision),
    ourReputation: ours.reputation,
    ...(club ? { hisReputation: club.reputation } : {}),
    ambition: player.personality.ambition,
    age: w.year - player.born,
    ...(ourEurope ? { ourEurope } : {}),
    hisEurope: !!club && !!context.europe(club.id),
    wouldStart: recruitmentSelection(w, offer, context.ownStarters, context.arrivals()).willStart,
    startsNow: !!club && context.starters(club).has(player.id),
    freeAgent: !club,
    loyalty: club ? loyaltyTerm(player, w.year) : 0,
  };
}

/** Terms between clubs nobody owns (→WORLD-16): the buyer, the selling club, the player and his XI. */
export interface NpcTermsOffer {
  buyer: Club;
  seller: Club;
  player: Player;
  /** His market wage at the buying club (→CLUB-25): the demand and the offer alike (100%). */
  wage: string;
  /** He would start for the buyer; he starts for the seller now. */
  wouldStart: boolean;
  startsNow: boolean;
}

/**
 * The player's answer between clubs nobody owns (→CLUB-53): the buyer offers his market wage at
 * its club, and "our" in the factors reads the buying club — its division, reputation and Europe.
 */
export function npcTermsContext(w: World, o: NpcTermsOffer): TermsContext {
  const ourEurope = europeOf(w, o.buyer.id);
  return {
    demand: o.wage,
    offer: o.wage,
    divisionsBelow: Math.max(0, o.buyer.tier - o.seller.tier),
    ourReputation: o.buyer.reputation,
    hisReputation: o.seller.reputation,
    ambition: o.player.personality.ambition,
    age: w.year - o.player.born,
    ...(ourEurope ? { ourEurope } : {}),
    hisEurope: !!europeOf(w, o.seller.id),
    wouldStart: o.wouldStart,
    startsNow: o.startsNow,
    freeAgent: false,
    loyalty: loyaltyTerm(o.player, w.year),
  };
}
