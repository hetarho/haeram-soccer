import type { SponsorContract, SponsorKind, SponsorSlot, World } from '../../contracts/src/types';
import { SPONSOR_SLOTS, sponsorSlotOpens, type Observation } from '../../catalogs/src/index';
import { addEvent, clubOf, footballQuote } from './world';
import { ratio } from './primitives';
import { moneyLabel, SPONSOR_SLOT_LABELS } from './finance';
import { buildEffects } from './build';
import { synergyEffects } from './synergy';
import { pushInbox } from './inbox';
import { currentDay, seasonDayOf } from './calendar';
import { credit } from './operations';

/**
 * Sponsor contracts by slot (→ECON-8), measured against ECON-29 (docs/FINANCES.md).
 * `value`: a club's yearly commercial value by division in 1901 price units before the football
 * index, from the top flight down, the last entry being the amateur league. Every factor below
 * multiplies it; each slot offers its share of the result.
 */
export const SPONSOR_CONFIG = {
  value: {
    ENG: [4800, 1900, 950, 550, 400],
    ESP: [4000, 1600, 360],
    GER: [4000, 1600, 800, 360],
    ITA: [4000, 1600, 800, 360],
    FRA: [3400, 1350, 680, 320],
    POR: [2600, 1050, 280],
    NED: [2600, 1050, 280],
    BEL: [2400, 950, 280],
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
  stadiumFacilities: 10,
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
  stable: '안정형',
  performance: '성과형',
  exclusive: '독점형',
  indexed: '물가 연동형',
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
  /** Facility level the slot needs, for stadium naming. */
  facilities?: number;
  contract?: SponsorContract;
  /** Signable offers: only an open slot without a contract has them. */
  offers: SponsorOffer[];
}

/** A season as the club's books name it: 1979/80. */
const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(2)}`;

export function contractOf(w: World, slot: SponsorSlot) {
  return w.sponsors?.find((contract) => contract.slot === slot);
}
/** Open by the year in the club's country; stadium naming also needs facilities 10+. */
export function sponsorSlotOpen(w: World, slot: SponsorSlot) {
  return (
    sponsorSlotOpens(clubOf(w).country, slot).year <= w.year &&
    (slot !== 'stadium' || w.facilities >= SPONSOR_CONFIG.stadiumFacilities)
  );
}
/** An exclusive contract in any slot blocks new merchandise campaigns (→ECON-14). */
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
  const last = w.history.at(-1);
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
 * no performance-linked offer, whose lower base would buy nothing.
 */
export function sponsorOffers(w: World, slot: SponsorSlot): SponsorOffer[] {
  const c = clubOf(w),
    { share, bonus } = SPONSOR_CONFIG.slots[slot],
    value = commercialValue(w) * share,
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
      ...(slot === 'stadium' ? { facilities: SPONSOR_CONFIG.stadiumFacilities } : {}),
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
    `${SPONSOR_SLOT_LABELS[offer.slot]} 계약`,
    `${offer.name} · ${SPONSOR_KIND_LABELS[offer.kind]} · 연간 ${moneyLabel(w, offer.annual)} · ${seasonLabel(offer.until - 1)} 시즌까지`,
  );
  return contract;
}
/** The owner signs one offer of an open, empty slot (→ECON-8); a running contract is never replaced. */
export function signSponsor(w: World, slot: SponsorSlot, index: number) {
  if (!SPONSOR_SLOTS.includes(slot)) throw new Error('없는 후원 자리입니다.');
  if (!sponsorSlotOpen(w, slot)) throw new Error('아직 열리지 않은 후원 자리입니다.');
  if (contractOf(w, slot)) throw new Error('이 자리의 후원 계약이 아직 남아 있습니다.');
  const offer = sponsorOffers(w, slot)[index];
  if (!Number.isInteger(index) || !offer) throw new Error('없는 후원 제안입니다.');
  sign(w, offer);
}
/**
 * With business delegated (→ECON-21) the commercial staff sign every empty open slot's best
 * guaranteed offer at once and report it.
 */
export function delegatedSponsors(w: World) {
  if (!w.delegation?.business) return;
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
        ? `운영팀이 ${signed[0].name}와 ${SPONSOR_SLOT_LABELS[signed[0].slot]} 계약을 맺었어요`
        : `운영팀이 후원 계약 ${signed.length}건을 맺었어요`,
    detail: `${signed
      .map(
        (contract) =>
          `${SPONSOR_SLOT_LABELS[contract.slot]} ${contract.name} 연간 ${moneyLabel(w, contract.annual)} · ${seasonLabel(contract.until - 1)} 시즌까지`,
      )
      .join(' / ')} · 안정형 · 리그 경기마다 나눠 들어오고, 끝나면 운영팀이 다시 계약해요.`,
    attention: false,
  });
}
/** Season start (→ECON-21): the owner is told once of every empty open slot, unless delegated. */
export function sponsorReminder(w: World) {
  if (w.delegation?.business) return;
  const empty = SPONSOR_SLOTS.filter((slot) => sponsorSlotOpen(w, slot) && !contractOf(w, slot));
  if (!empty.length) return;
  pushInbox(w, {
    kind: 'finance',
    title: '후원 계약이 비어 있어요',
    detail: `${empty.map((slot) => SPONSOR_SLOT_LABELS[slot]).join(', ')} 자리가 비어 있어요. 구단 운영의 후원 탭에서 제안을 고르면 리그 경기마다 후원금이 들어와요. 운영을 스태프에게 맡기면 안정형 후원을 대신 맺어요.`,
    attention: true,
  });
}
/**
 * 1 April (→ECON-21): each contract in its final season tells an owner who has not delegated
 * business that its slot empties at the close.
 */
export function sponsorEnding(w: World) {
  if (w.delegation?.business || currentDay(w) !== seasonDayOf(w.year, 4, 1)) return;
  for (const contract of w.sponsors ?? []) {
    const ref = `sponsor:${contract.slot}:${contract.until}`;
    if (contract.until !== w.year + 1 || w.inbox?.some((item) => item.ref === ref)) continue;
    pushInbox(w, {
      kind: 'sponsor-ending',
      title: `${SPONSOR_SLOT_LABELS[contract.slot]} ${contract.name} 계약이 이번 시즌으로 끝나요`,
      detail: `연간 ${moneyLabel(w, sponsorAnnual(w, contract))} · 시즌이 끝나면 자리가 비어요. 다음 시즌 첫날 후원 탭에서 새 제안을 고르거나 운영을 스태프에게 맡기세요.`,
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
  const last = w.history.at(-1),
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
        `${SPONSOR_SLOT_LABELS[contract.slot]} ${promoted ? '승격' : '우승'} 보너스`,
        `${contract.name} · ${seasonLabel(last.year)} 시즌`,
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
          `강등으로 ${SPONSOR_SLOT_LABELS[contract.slot]} 계약 단축`,
          `${contract.name} · 남은 ${remaining}시즌 → ${keeps}시즌`,
        );
      }
  }
  const ending = (w.sponsors ?? []).filter((contract) => contract.until <= w.year);
  for (const contract of ending)
    addEvent(
      w,
      'sponsor-end',
      `${SPONSOR_SLOT_LABELS[contract.slot]} 계약 만료`,
      `${contract.name} · ${seasonLabel(contract.from)}–${seasonLabel(contract.until - 1)} 시즌`,
    );
  w.sponsors = w.sponsors?.filter((contract) => !ending.includes(contract));
  if (!w.sponsors?.length) delete w.sponsors;
}
