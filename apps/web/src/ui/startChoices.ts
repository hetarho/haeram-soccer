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
} from '../../../../packages/contracts/src/owner';
import type { CrestDesign } from '../../../../packages/contracts/src/identity';
import type { Position } from '../../../../packages/contracts/src/player';
import type { CountryCode } from '../../../../packages/contracts/src/types';
import { EUROPEAN_CUP_START } from '../../../../packages/engine/src/calendar';
import { seasonName } from './format';
import {
  FFP,
  OWNER_BUSINESS,
  OWNER_TIERS,
  OWNER_TRAITS,
} from '../../../../packages/engine/src/owner-config';

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
  oil: '1부 상위권 구단',
  chaebol: '1부 중위권 구단',
  industrial: '1부 하위권 · 2부 상위권',
  midsize: '2·3부 구단',
  local: '하부 프로 리그 구단',
  selfmade: '최하위 프로 리그 구단',
};
/** A tier's fortune as its card states it: the reach's median price times the tier's multiple. */
export function tierFortuneLine(tier: WealthTier) {
  return `시세 중앙값 ×${OWNER_TIERS[tier].multiple}`;
}
/**
 * The selected tier's consequence under the cards: its starting fortune, and what stays after
 * buying a club at the median price of its reach (→OWNER-3).
 */
export function tierNote(tier: WealthTier) {
  const { label, multiple } = OWNER_TIERS[tier];
  const left = Math.round((multiple - 1) * 100);
  return `${label} · 시작 자금은 닿는 구단 시세 중앙값의 ${multiple}배. ${
    multiple >= OWNER_TIERS.oil.multiple
      ? '지출에 사실상 한도가 없어요.'
      : `중간 시세 구단을 사면 그 값의 ${left}%가 남아요.`
  }`;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;
/** A factor as the change it makes: 0.9 → "−10%", 1.15 → "+15%". */
const change = (factor: number) =>
  `${factor < 1 ? '−' : '+'}${Math.round(Math.abs(1 - factor) * 100)}%`;
/** Each trait's effect in one line, its numbers read from OWNER_TRAITS (→OWNER-5). */
export const TRAIT_EFFECTS: Record<OwnerTrait, string> = {
  businessman: `사업 성공 확률 ${percent(OWNER_BUSINESS.chance)} → ${percent(OWNER_TRAITS.businessman.success)}`,
  talisman: `우리 팀 경기력 OVR +${OWNER_TRAITS.talisman.strength}`,
  negotiator:
    OWNER_TRAITS.negotiator.wages === OWNER_TRAITS.negotiator.fees
      ? `연봉 요구·이적료 ${change(OWNER_TRAITS.negotiator.wages)}`
      : `연봉 요구 ${change(OWNER_TRAITS.negotiator.wages)} · 이적료 ${change(OWNER_TRAITS.negotiator.fees)}`,
  fansFriend: `팬 민심 하락 폭 ${change(OWNER_TRAITS.fansFriend.drop)}`,
  networker: `감독·코치 후보 +${OWNER_TRAITS.networker.candidates}명, 능력 +${OWNER_TRAITS.networker.ability}`,
  talentSpotter: `유스 잠재력 +${OWNER_TRAITS.talentSpotter.potential} · 스카우팅 오차 ${change(OWNER_TRAITS.talentSpotter.scoutRange)}`,
  marketer: `스폰서 제안 ${change(OWNER_TRAITS.marketer.sponsor)}`,
  politician: `운영비 ${change(OWNER_TRAITS.politician.operating)}`,
};
/** Picks or drops a trait, never past OWNER_TRAIT_LIMIT, keeping the traits' own order. */
export function toggleTrait(traits: readonly OwnerTrait[], trait: OwnerTrait): OwnerTrait[] {
  if (traits.includes(trait)) return traits.filter((item) => item !== trait);
  if (traits.length >= OWNER_TRAIT_LIMIT) return [...traits];
  return OWNER_TRAIT_IDS.filter((item) => item === trait || traits.includes(item));
}
/** The trait count read as difficulty, the hardest first (→OWNER-2): none is 하드, all is 이지. */
export const TRAIT_DIFFICULTY = ['하드', '어려움', '조금 어려움', '조금 쉬움', '쉬움', '이지'];
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
  1930: `프로 리그의 첫 시즌부터. ${WARTIME.last + 1}년 전쟁으로 멈춰요.`,
  1940: `전쟁이 끝난 ${WARTIME.restart}년, 리그 재개 시즌에 인수해요.`,
  1950: `유러피언컵 출범 ${EUROPEAN_CUP_START - 1950}시즌 전. 발롱도르도 곧 시작돼요.`,
  1960: '컵위너스컵 출범. 유럽 무대가 넓어져요.',
  1970: '1971년 UEFA컵 출범. 유럽 대회가 셋으로.',
  1980: '중계권료가 커지는 시대. 유러피언컵 조별리그를 앞두고.',
  1990: '챔피언스리그 출범(1992), 보스만과 유로화를 앞두고.',
  2000: `본선 32개 팀 챔피언스리그. ${FFP.start}년 재정적 페어플레이.`,
};
/** The decade card's season line: "1950/51 시즌 인수", the 1940s at the restart. */
export function decadeSeason(decade: TakeoverDecade) {
  return `${seasonName(takeoverYear(decade))} 시즌 인수`;
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
export const divisionLabel = (division: number) => `${division + 1}부`;

/**
 * What a club's sheet opens before buying (→WEB-15): its squad, manager, stadium and history.
 * The host reads it from the generated world (T664); the list's own numbers stay on the listing.
 */
export interface ClubSheetFacts {
  crest?: CrestDesign;
  squad: { id: string; name: string; position: Position; age: number; ovr: number }[];
  manager?: { name: string; age: number; rating: number; note?: string };
  stadium: { name?: string; seats: number };
  history: {
    /** Honours won before the takeover. */
    league: number;
    cup: number;
    europe: number;
    /** The last seasons' finishes, newest first. */
    seasons: { year: number; division: number; place: number }[];
  };
}
