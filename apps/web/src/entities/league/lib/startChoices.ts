import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
/**
 * The start flow's pure rules and copy (→WEB-2, WEB-15, OWNER-2/3/5): what each wealth tier
 * reaches, what each trait does, what the trait count means for difficulty, what each decade
 * brings, how far the world's generation has come, and how the takeover list filters, sorts and
 * reads affordability. Every owner number is read from `owner-config.ts` by name.
 */
import {
  OWNER_TRAIT_IDS,
  OWNER_TRAIT_LIMIT,
  TAKEOVER_DECADES,
  type ClubListing,
  type OwnerTrait,
  type TakeoverDecade,
  type WealthTier,
} from '../../../../../../packages/contracts/src/owner';
import type { CountryCode } from '../../../../../../packages/contracts/src/types';
import { EUROPEAN_CUP_START } from '../../../../../../packages/engine/src/calendar';
import { seasonName } from '../../../presentation/format';
import {
  FFP,
  OWNER_BUSINESS,
  OWNER_TIERS,
  OWNER_TRAITS,
} from '../../../../../../packages/engine/src/owner-config';

/** Every world is made in 1930 and lives from its 1930/31 season (→WORLD-13). */
export const WORLD_START: number = TAKEOVER_DECADES[0];
/**
 * League football stops for the war (→WORLD-14): the 1938/39 season is the last before it, and the
 * world restarts on 1 August 1946. The engine's wartime module (T655) owns the jump itself.
 */
export const WARTIME = { last: 1938, restart: 1946 } as const;
/** The season a takeover in `decade` starts in: its first, the 1940s at the 1946 restart. */
export function takeoverYear(decade: TakeoverDecade) {
  return decade > WARTIME.last && decade < WARTIME.restart ? WARTIME.restart : decade;
}
/** Seasons the world plays from 1930/31 up to the one starting in `year`, the war's left out. */
export function seasonsBefore(year: number) {
  let seasons = 0;
  for (let season = WORLD_START; season < year; season++)
    if (season <= WARTIME.last || season >= WARTIME.restart) seasons++;
  return seasons;
}
/** How much of the world's history is played when it reaches `season`, 0–1 (→WORLD-13). */
export function generationShare(season: number, decade: TakeoverDecade) {
  const total = seasonsBefore(takeoverYear(decade));
  if (!total) return 1;
  return Math.min(1, Math.max(0, seasonsBefore(season) / total));
}

/** What each tier's fortune reaches (→OWNER-3), in the table's order. */
export const TIER_REACH: Record<WealthTier, string> = {
  oil: sourceMessage('copy.startChoices.5fdc4e6fe8'),
  chaebol: sourceMessage('copy.startChoices.d3ed912d77'),
  industrial: sourceMessage('copy.startChoices.3a91340eed'),
  midsize: sourceMessage('copy.startChoices.5ce5b6d6b3'),
  local: sourceMessage('copy.startChoices.20f19a6410'),
  selfmade: sourceMessage('copy.startChoices.caf6501c49'),
};
/** A tier's fortune as its card states it: the reach's median price times the tier's multiple. */
export function tierFortuneLine(tier: WealthTier) {
  return sourceMessage('copy.startChoices.08f0b64f54', { p0: OWNER_TIERS[tier].multiple });
}
/**
 * The selected tier's consequence under the cards: its starting fortune, and what stays after
 * buying a club at the median price of its reach (→OWNER-3).
 */
export function tierNote(tier: WealthTier) {
  const { label, multiple } = OWNER_TIERS[tier];
  const left = Math.round((multiple - 1) * 100);
  return sourceMessage('copy.startChoices.b69db77876', {
    p0: label,
    p1: multiple,
    p2:
      multiple >= OWNER_TIERS.oil.multiple
        ? sourceMessage('copy.startChoices.cab59e048e')
        : sourceMessage('copy.startChoices.b61f0f69ab', { p0: left }),
  });
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
/** A factor as the change it makes: 0.9 → "−10%", 1.15 → "+15%". */
const change = (factor: number) =>
  `${factor < 1 ? '−' : '+'}${Math.round(Math.abs(1 - factor) * 100)}%`;
/** Each trait's effect in one line, its numbers read from OWNER_TRAITS (→OWNER-5). */
export const TRAIT_EFFECTS: Record<OwnerTrait, string> = {
  businessman: sourceMessage('copy.startChoices.5650359467', {
    p0: percent(OWNER_BUSINESS.chance),
    p1: percent(OWNER_TRAITS.businessman.success),
  }),
  talisman: sourceMessage('copy.startChoices.a5dec0d8ad', { p0: OWNER_TRAITS.talisman.strength }),
  negotiator:
    OWNER_TRAITS.negotiator.wages === OWNER_TRAITS.negotiator.fees
      ? sourceMessage('copy.startChoices.52fab71c3f', { p0: change(OWNER_TRAITS.negotiator.wages) })
      : sourceMessage('copy.startChoices.91efb75e71', {
          p0: change(OWNER_TRAITS.negotiator.wages),
          p1: change(OWNER_TRAITS.negotiator.fees),
        }),
  fansFriend: sourceMessage('copy.startChoices.c99c27f746', {
    p0: change(OWNER_TRAITS.fansFriend.drop),
  }),
  networker: sourceMessage('copy.startChoices.2bd363935a', {
    p0: OWNER_TRAITS.networker.candidates,
    p1: OWNER_TRAITS.networker.ability,
  }),
  talentSpotter: sourceMessage('copy.startChoices.c4feaca35b', {
    p0: OWNER_TRAITS.talentSpotter.potential,
    p1: change(OWNER_TRAITS.talentSpotter.scoutRange),
  }),
  marketer: sourceMessage('copy.startChoices.6791494f35', {
    p0: change(OWNER_TRAITS.marketer.sponsor),
  }),
  politician: sourceMessage('copy.startChoices.0d5c455e42', {
    p0: change(OWNER_TRAITS.politician.operating),
  }),
};
/** Picks or drops a trait, never past OWNER_TRAIT_LIMIT, keeping the traits' own order. */
export function toggleTrait(traits: readonly OwnerTrait[], trait: OwnerTrait): OwnerTrait[] {
  if (traits.includes(trait)) return traits.filter((item) => item !== trait);
  if (traits.length >= OWNER_TRAIT_LIMIT) return [...traits];
  return OWNER_TRAIT_IDS.filter((item) => item === trait || traits.includes(item));
}
/** The trait count read as difficulty, the hardest first (→OWNER-2): none is 하드, all is 이지. */
export const TRAIT_DIFFICULTY = [
  sourceMessage('copy.startChoices.8123f1c028'),
  sourceMessage('copy.startChoices.fac94f6966'),
  sourceMessage('copy.startChoices.085814c711'),
  sourceMessage('copy.startChoices.b725b59e49'),
  sourceMessage('copy.startChoices.dd0c5cb040'),
  sourceMessage('copy.startChoices.382e7eddd5'),
];
export function traitDifficulty(count: number) {
  const picked = Math.min(OWNER_TRAIT_LIMIT, Math.max(0, Math.round(count)));
  const step = Math.round((picked / OWNER_TRAIT_LIMIT) * (TRAIT_DIFFICULTY.length - 1));
  return { count: picked, step, label: TRAIT_DIFFICULTY[step] };
}

/**
 * One line per decade on the football of its time, naming what the game brings in it (→WEB-2):
 * the European competitions (→EURO-1/2/3), the Ballon d'Or (→PLAYER-27), Bosman (→CLUB-28), the
 * euro (→ECON-5) and financial fair play (→OWNER-10).
 */
export const DECADE_LINES: Record<TakeoverDecade, string> = {
  1930: sourceMessage('copy.startChoices.1699058b41', { p0: WARTIME.last + 1 }),
  1940: sourceMessage('copy.startChoices.7ce0cf95bd', { p0: WARTIME.restart }),
  1950: sourceMessage('copy.startChoices.7866bd201b', { p0: EUROPEAN_CUP_START - 1950 }),
  1960: sourceMessage('copy.startChoices.884418da67'),
  1970: sourceMessage('copy.startChoices.7af5e2f30d'),
  1980: sourceMessage('copy.startChoices.fab017e5cd'),
  1990: sourceMessage('copy.startChoices.a9791844dc'),
  2000: sourceMessage('copy.startChoices.290d855acc', { p0: FFP.start }),
};
/** The decade card's season line: "1950/51 시즌 인수", the 1940s at the restart. */
export function decadeSeason(decade: TakeoverDecade) {
  return sourceMessage('copy.startChoices.04feef9f73', { p0: seasonName(takeoverYear(decade)) });
}

/** Whether the owner's fortune, in pounds, pays the club's price (→ECON-37, OWNER-3). */
export function canAfford(listing: ClubListing, fortune?: string) {
  return fortune === undefined
    ? listing.affordable
    : BigInt(listing.pricePounds) <= BigInt(fortune);
}
/** What the fortune keeps after paying the price, in pounds; below zero it does not pay. */
export function fortuneAfter(listing: ClubListing, fortune: string) {
  return BigInt(fortune) - BigInt(listing.pricePounds);
}

export type ListingSort = 'strength' | 'price';
/** The takeover list's filters (→WEB-15): country, division, affordability and the order. */
export interface ListingFilter {
  country: CountryCode | 'all';
  /** 0 is the top flight. */
  division: number | 'all';
  affordable: boolean;
  sort: ListingSort;
}
/** The countries on the list, in the order they first appear. */
export function listingCountries(listings: readonly ClubListing[]): CountryCode[] {
  return [...new Set(listings.map((listing) => listing.country))];
}
/** The divisions of a country on the list, or of every country, top flight first. */
export function listingDivisions(
  listings: readonly ClubListing[],
  country: CountryCode | 'all',
): number[] {
  return [
    ...new Set(
      listings
        .filter((listing) => country === 'all' || listing.country === country)
        .map((listing) => listing.division),
    ),
  ].sort((a, b) => a - b);
}
const byPrice = (a: ClubListing, b: ClubListing) => {
  const difference = BigInt(a.pricePounds) - BigInt(b.pricePounds);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};
/** The clubs the filters keep: the strongest first, or the cheapest first in pounds. */
export function filterListings(
  listings: readonly ClubListing[],
  filter: ListingFilter,
  fortune?: string,
): ClubListing[] {
  return listings
    .filter(
      (listing) =>
        (filter.country === 'all' || listing.country === filter.country) &&
        (filter.division === 'all' || listing.division === filter.division) &&
        (!filter.affordable || canAfford(listing, fortune)),
    )
    .sort((a, b) =>
      filter.sort === 'price'
        ? byPrice(a, b) || a.name.localeCompare(b.name)
        : b.strength - a.strength || byPrice(b, a) || a.name.localeCompare(b.name),
    );
}
/**
 * Where the list opens: the first country with a club the owner can buy, at the highest division
 * holding one, so the first screen shows clubs within reach (→OWNER-3).
 */
export function defaultFilter(listings: readonly ClubListing[], fortune?: string): ListingFilter {
  const reachable = listings.filter((listing) => canAfford(listing, fortune));
  const country = reachable[0]?.country ?? listings[0]?.country ?? 'all';
  const divisions = listingDivisions(reachable.length ? reachable : listings, country);
  return { country, division: divisions[0] ?? 'all', affordable: false, sort: 'strength' };
}
/** A division as the list names it: "1부". */
export const divisionLabel = (division: number) =>
  sourceMessage('copy.cupRoute.3d1e4a6467', { p0: division + 1 });

/** What a club's sheet opens before buying (→WEB-15): the contracts' shape, read by the worker. */
export type { ClubProfile } from '../../../../../../packages/contracts/src/owner';
