import { message as sourceMessage } from '../../contracts/src/messages';
import { baseEffects } from './bases';
import type { SponsorContract, SponsorKind, SponsorSlot, World } from '../../contracts/src/types';
import { SPONSOR_SLOTS, sponsorSlotOpens, type Observation } from '../../catalogs/src/index';
import { addEvent } from './events';
import { clubOf, lastOwnSeason } from './player-state';
import { footballQuote } from './quotes';
import { ratio } from './primitives';
import { moneyLabel, SPONSOR_SLOT_LABELS } from './finance';
import { buildEffects } from './build';
import { synergyEffects } from './synergy';
import { pushInbox } from './inbox';
import { currentDay, seasonDayOf } from './calendar';
import { credit } from './transactions';
import { isDelegated } from './responsibilities';
import { STADIUM_STEPS } from './facilities';
import { sponsorFactor } from './owner-traits';

/**
 * Sponsor contracts by slot (→ECON-8), measured against ECON-29 (spec/ssot/ECON.md).
 * `value`: a club's yearly commercial value by division in 1901 price units before the football
 * index, from the top flight down. Every factor below multiplies it; each slot offers its share of
 * the result.
 */
export const SPONSOR_CONFIG = {
  value: {
    ENG: [26400, 1900, 950, 550],
    ESP: [22000, 1600],
    GER: [22000, 1600, 800],
    ITA: [22000, 1600, 800],
    FRA: [18700, 1350, 680],
    POR: [14300, 1050],
    NED: [14300, 1050],
    BEL: [13200, 950],
  } as Record<string, readonly number[]>,
  /** Reputation 0–100 reads as ×0.75–1.25. */
  reputation: { base: 0.75, per: 1 / 200 },
  /** Last season's finish: the champion ×(1 + finish), the bottom club ×(1 − finish). */
  finish: 0.1,
  /** The following with diminishing returns: (fans / reference)^power, no ceiling (→ECON-23). */
  following: { reference: 20000, power: 0.2 },
  slots: {
    local: { share: 0.1, bonus: 'none' },
    kit: { share: 0.25, bonus: 'promotion' },
    shirt: { share: 0.45, bonus: 'results' },
    stadium: { share: 0.15, bonus: 'none' },
    sleeve: { share: 0.1, bonus: 'none' },
  } as Record<SponsorSlot, { share: number; bonus: SponsorBonus }>,
  /** Stadium naming needs a ground worth naming. */
  /** Stadium naming needs a ground of this many seats (→ECON-8, ECON-32). */
  stadiumCapacity: 30000,
  /** Annual and bonus as shares of the slot's value, and the seasons each kind is signed for. */
  kinds: {
    stable: { annual: 1, bonus: 0.2, term: 3 },
    performance: { annual: 0.7, bonus: 0.7, term: 2 },
    exclusive: { annual: 1.2, bonus: 0.2, term: 4 },
    indexed: { annual: 0.9, bonus: 0.2, term: 5 },
  } as Record<SponsorKind, { annual: number; bonus: number; term: number }>,
  /** A relegation keeps this share of every running contract's remaining seasons, rounded. */
  relegationKeeps: 0.7,
};
/** What a slot's bonus rewards: nothing, a promotion or title at the close, or league results. */
export type SponsorBonus = 'none' | 'promotion' | 'results';
export const SPONSOR_KINDS: readonly SponsorKind[] = [
  'stable',
  'performance',
  'exclusive',
  'indexed',
];
export const SPONSOR_KIND_LABELS: Record<SponsorKind, string> = {
  stable: sourceMessage('copy.sponsors.5d1dcbbdbf'),
  performance: sourceMessage('copy.sponsors.533b745d4c'),
  exclusive: sourceMessage('copy.sponsors.c8cd282a33'),
  indexed: sourceMessage('copy.sponsors.5e515c2a83'),
};
/** Partner trades by slot, one per kind in SPONSOR_KINDS order. */
const PARTNERS: Record<SponsorSlot, readonly string[]> = {
  local: ['Cooperative', 'Bakery', 'Brewery', 'Ironworks'],
  kit: ['Athletic', 'Sportswear', 'Outfitters', 'Knitwear'],
  shirt: ['Motors', 'Insurance', 'Electronics', 'Airways'],
  stadium: ['Holdings', 'Building Society', 'Bank', 'Energy'],
  sleeve: ['Logistics', 'Telecom', 'Games', 'Travel'],
};

export type SponsorOffer = Omit<SponsorContract, 'slot' | 'from' | 'lastPaid'> & {
  slot: SponsorSlot;
  term: number;
};
export interface SponsorSlotView {
  slot: SponsorSlot;
  label: string;
  share: number;
  bonus: SponsorBonus;
  open: boolean;
  /** Season year the slot opens in the club's country, and how sure the catalog is of it. */
  opens: number;
  status: Observation;
  /** Seats the ground needs, for stadium naming. */
  capacity?: number;
  contract?: SponsorContract;
  /** Signable offers: only an open slot without a contract has them. */
  offers: SponsorOffer[];
}

/** A season as the club's books name it: 1979/80. */
const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(2)}`;

export function contractOf(w: World, slot: SponsorSlot) {
  return w.sponsors?.find((contract) => contract.slot === slot);
}
/** Open by the year in the club's country; stadium naming also needs a stadium of 30,000+. */
export function sponsorSlotOpen(w: World, slot: SponsorSlot) {
  return (
    sponsorSlotOpens(clubOf(w).country, slot).year <= w.year &&
    (slot !== 'stadium' || STADIUM_STEPS[w.stadium].capacity >= SPONSOR_CONFIG.stadiumCapacity)
  );
}
/**
 * An exclusive contract in any slot holds the club's merchandise rights: 해외 마케팅 adds this share
 * of its fans while it runs (→ECON-14).
 */
export const EXCLUSIVE_MARKETING = 0.5;
/** The running exclusive contract, if any. */
export function exclusiveSponsor(w: World) {
  return w.sponsors?.find((contract) => contract.kind === 'exclusive');
}
/** The amount a contract pays this season: an inflation-linked one follows prices since signing. */
export function sponsorAnnual(w: World, contract: SponsorContract) {
  return contract.kind === 'indexed'
    ? ratio(
        contract.annual,
        BigInt(Math.round(w.priceIndex * 1000000)),
        BigInt(Math.round(contract.index * 1000000)),
      )
    : contract.annual;
}

/** Last season's finish in its division: ×1.1 for the champion down to ×0.9 for the bottom club. */
function finishFactor(w: World) {
  // A season the world archived before the takeover keeps no finish of the club's: neutral.
  const last = lastOwnSeason(w);
  if (!last || last.year !== w.year - 1) return 1;
  const clubs = last.standings.filter(
    (row) => row[1] === last.tier && row[2] === last.group,
  ).length;
  if (clubs < 2) return 1;
  return 1 + SPONSOR_CONFIG.finish * (1 - (2 * (last.rank - 1)) / (clubs - 1));
}
/**
 * The club's yearly commercial value in price units (→ECON-8): its division, reputation, last
 * season's finish and following, with the operating strategy and synergies on new offers
 * (→ECON-22, CLUB-21). Each slot offers its share of it on the football index.
 */
export function commercialValue(w: World) {
  const c = clubOf(w),
    table = SPONSOR_CONFIG.value[c.country] ?? SPONSOR_CONFIG.value.ENG,
    { reputation, following } = SPONSOR_CONFIG;
  return (
    table[Math.min(c.tier, table.length - 1)] *
    (reputation.base + c.reputation * reputation.per) *
    finishFactor(w) *
    (c.fans / following.reference) ** following.power *
    buildEffects(w).sponsor *
    synergyEffects(w).sponsor
  );
}
/**
 * A slot's offers, valued today (→ECON-8): one per kind, except that a slot without a bonus has
 * no performance-linked offer, whose lower base would buy nothing. 마케팅 귀재 raises every offer,
 * its base and bonus alike (→OWNER-5).
 */
export function sponsorOffers(w: World, slot: SponsorSlot): SponsorOffer[] {
  const c = clubOf(w),
    { share, bonus } = SPONSOR_CONFIG.slots[slot],
    bases = baseEffects(w),
    // The 지역 후원 slot grows with 지역 기반, every other with 글로벌 인지도 (→ECON-34).
    value =
      commercialValue(w) *
      share *
      (slot === 'local' ? bases.localSponsor : bases.globalSponsor) *
      sponsorFactor(w),
    town = c.name.split(' ')[0];
  return SPONSOR_KINDS.flatMap((kind, i) => {
    if (kind === 'performance' && bonus === 'none') return [];
    const terms = SPONSOR_CONFIG.kinds[kind];
    return [
      {
        slot,
        name: `${town} ${PARTNERS[slot][i]}`,
        kind,
        annual: footballQuote(c.country, w.year, value * terms.annual),
        bonus: bonus === 'none' ? '0' : footballQuote(c.country, w.year, value * terms.bonus),
        until: w.year + terms.term,
        term: terms.term,
        index: w.priceIndex,
      },
    ];
  });
}
/** Every slot in opening order (→WEB-39): its contract, or its offers while it is open and empty. */
export function sponsorSlots(w: World): SponsorSlotView[] {
  const code = clubOf(w).country;
  return SPONSOR_SLOTS.map((slot) => {
    const era = sponsorSlotOpens(code, slot),
      open = sponsorSlotOpen(w, slot),
      contract = contractOf(w, slot);
    return {
      slot,
      label: SPONSOR_SLOT_LABELS[slot],
      share: SPONSOR_CONFIG.slots[slot].share,
      bonus: SPONSOR_CONFIG.slots[slot].bonus,
      open,
      opens: era.year,
      status: era.status,
      ...(slot === 'stadium' ? { capacity: SPONSOR_CONFIG.stadiumCapacity } : {}),
      ...(contract ? { contract } : {}),
      offers: open && !contract ? sponsorOffers(w, slot) : [],
    };
  });
}

function sign(w: World, offer: SponsorOffer) {
  const contract: SponsorContract = {
    slot: offer.slot,
    name: offer.name,
    kind: offer.kind,
    annual: offer.annual,
    bonus: offer.bonus,
    from: w.year,
    until: offer.until,
    // Installments start with the next league game; earlier games are never paid (→ECON-14).
    lastPaid: w.year - 1,
    index: offer.index,
  };
  w.sponsors = [...(w.sponsors ?? []), contract].sort(
    (a, b) => SPONSOR_SLOTS.indexOf(a.slot) - SPONSOR_SLOTS.indexOf(b.slot),
  );
  addEvent(
    w,
    'sponsor-sign',
    sourceMessage('copy.BusinessWorkbench.5709f4c478', { p0: SPONSOR_SLOT_LABELS[offer.slot] }),
    sourceMessage('copy.sponsors.3a1ebc5e90', {
      p0: offer.name,
      p1: SPONSOR_KIND_LABELS[offer.kind],
      p2: moneyLabel(w, offer.annual),
      p3: seasonLabel(offer.until - 1),
    }),
  );
  return contract;
}
/** The owner signs one offer of an open, empty slot (→ECON-8); a running contract is never replaced. */
export function signSponsor(w: World, slot: SponsorSlot, index: number) {
  if (!SPONSOR_SLOTS.includes(slot)) throw new Error(sourceMessage('copy.sponsors.44b8898d48'));
  if (!sponsorSlotOpen(w, slot)) throw new Error(sourceMessage('copy.sponsors.5b68ce6f8f'));
  if (contractOf(w, slot)) throw new Error(sourceMessage('copy.sponsors.7ba0c74b60'));
  const offer = sponsorOffers(w, slot)[index];
  if (!Number.isInteger(index) || !offer)
    throw new Error(sourceMessage('copy.sponsors.b5ca9b7cd3'));
  sign(w, offer);
}
/**
 * With business delegated (→ECON-21) the commercial staff sign every empty open slot's best
 * guaranteed offer at once and report it.
 */
export function delegatedSponsors(w: World) {
  if (!isDelegated(w, 'sponsors')) return;
  const signed = SPONSOR_SLOTS.filter(
    (slot) => sponsorSlotOpen(w, slot) && !contractOf(w, slot),
  ).map((slot) =>
    sign(
      w,
      sponsorOffers(w, slot)
        .filter((offer) => offer.kind === 'stable')
        .reduce((best, offer) => (BigInt(offer.annual) > BigInt(best.annual) ? offer : best)),
    ),
  );
  if (!signed.length) return;
  pushInbox(w, {
    kind: 'finance',
    title:
      signed.length === 1
        ? sourceMessage('copy.sponsors.7ca0db7e9b', {
            p0: signed[0].name,
            p1: SPONSOR_SLOT_LABELS[signed[0].slot],
          })
        : sourceMessage('copy.sponsors.a78b99c077', { p0: signed.length }),
    detail: sourceMessage('copy.sponsors.32ba1ea60f', {
      p0: signed
        .map((contract) =>
          sourceMessage('copy.sponsors.fc8d178c45', {
            p0: SPONSOR_SLOT_LABELS[contract.slot],
            p1: contract.name,
            p2: moneyLabel(w, contract.annual),
            p3: seasonLabel(contract.until - 1),
          }),
        )
        .join(' / '),
    }),
    attention: false,
  });
}
/** Season start (→ECON-21): the owner is told once of every empty open slot, unless delegated. */
export function sponsorReminder(w: World) {
  if (isDelegated(w, 'sponsors')) return;
  const empty = SPONSOR_SLOTS.filter((slot) => sponsorSlotOpen(w, slot) && !contractOf(w, slot));
  if (!empty.length) return;
  pushInbox(w, {
    kind: 'finance',
    title: sourceMessage('copy.sponsors.c793e474ef'),
    detail: sourceMessage('copy.sponsors.6dccb367d0', {
      p0: empty.map((slot) => SPONSOR_SLOT_LABELS[slot]).join(', '),
    }),
    attention: true,
  });
}
/**
 * 1 April (→ECON-21): each contract in its final season tells an owner who has not delegated
 * business that its slot empties at the close.
 */
export function sponsorEnding(w: World) {
  if (isDelegated(w, 'sponsors') || currentDay(w) !== seasonDayOf(w.year, 4, 1)) return;
  for (const contract of w.sponsors ?? []) {
    const ref = `sponsor:${contract.slot}:${contract.until}`;
    if (contract.until !== w.year + 1 || w.inbox?.some((item) => item.ref === ref)) continue;
    pushInbox(w, {
      kind: 'sponsor-ending',
      title: sourceMessage('copy.sponsors.f0be0ea919', {
        p0: SPONSOR_SLOT_LABELS[contract.slot],
        p1: contract.name,
      }),
      detail: sourceMessage('copy.sponsors.86a82d3a9e', {
        p0: moneyLabel(w, sponsorAnnual(w, contract)),
      }),
      attention: true,
      ref,
    });
  }
}
/**
 * The season boundary, after promotion and relegation (→ECON-8): a kit contract that ran through
 * the season pays its bonus for a promotion or title, a relegation keeps 70% of every running
 * contract's remaining seasons, and contracts that have run their term end.
 */
export function yearlySponsor(w: World) {
  const last = lastOwnSeason(w),
    tier = clubOf(w).tier;
  if (last && last.year === w.year - 1) {
    const promoted = tier < last.tier;
    for (const contract of w.sponsors ?? []) {
      if (contract.from > last.year || contract.until <= last.year) continue;
      if (SPONSOR_CONFIG.slots[contract.slot].bonus !== 'promotion') continue;
      if ((!promoted && last.rank !== 1) || BigInt(contract.bonus) <= 0n) continue;
      credit(w, contract.bonus);
      addEvent(
        w,
        `sponsor:${contract.slot}`,
        sourceMessage('copy.sponsors.c3e582047a', {
          p0: SPONSOR_SLOT_LABELS[contract.slot],
          p1: promoted
            ? sourceMessage('copy.AcademyPanel.8e70a8dda1')
            : sourceMessage('copy.CupHistory.31e52393f3'),
        }),
        sourceMessage('copy.sponsors.9a9b684211', {
          p0: contract.name,
          p1: seasonLabel(last.year),
        }),
        contract.bonus,
      );
    }
    if (tier > last.tier)
      for (const contract of w.sponsors ?? []) {
        const remaining = contract.until - w.year;
        const keeps = Math.round(remaining * SPONSOR_CONFIG.relegationKeeps);
        if (remaining <= 0 || keeps === remaining) continue;
        contract.until = w.year + keeps;
        addEvent(
          w,
          'sponsor-cut',
          sourceMessage('copy.sponsors.d9349a1324', { p0: SPONSOR_SLOT_LABELS[contract.slot] }),
          sourceMessage('copy.sponsors.e2d858673f', {
            p0: contract.name,
            p1: remaining,
            p2: keeps,
          }),
        );
      }
  }
  const ending = (w.sponsors ?? []).filter((contract) => contract.until <= w.year);
  for (const contract of ending)
    addEvent(
      w,
      'sponsor-end',
      sourceMessage('copy.contracts.41d78072fe', { p0: SPONSOR_SLOT_LABELS[contract.slot] }),
      sourceMessage('copy.sponsors.c60c3ee696', {
        p0: contract.name,
        p1: seasonLabel(contract.from),
        p2: seasonLabel(contract.until - 1),
      }),
    );
  w.sponsors = w.sponsors?.filter((contract) => !ending.includes(contract));
  if (!w.sponsors?.length) delete w.sponsors;
}
