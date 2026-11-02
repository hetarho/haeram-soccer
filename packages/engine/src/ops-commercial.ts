import type { Command, World } from '../../contracts/src/types';
import { clubOf } from './player-state';
import { quote } from './quotes';
import { campaignEffectiveness } from './finance';
import { buildEffects } from './build';
import { delegatedSponsors, signSponsor, sponsorEnding } from './sponsors';

export {
  commercialValue,
  contractOf,
  exclusiveSponsor,
  SPONSOR_CONFIG,
  SPONSOR_KIND_LABELS,
  SPONSOR_KINDS,
  sponsorAnnual,
  sponsorOffers,
  sponsorReminder,
  sponsorSlotOpen,
  sponsorSlots,
  yearlySponsor,
} from './sponsors';
export type { SponsorBonus, SponsorOffer, SponsorSlotView } from './sponsors';

/** Sponsors and campaigns; the owner adds no capital and starts no facility work (→ECON-11/32). */
export type CommercialCommand = Extract<Command, { type: 'sponsor' | 'sign-sponsor' | 'campaign' }>;
/**
 * Daily business (→ECON-21): with business delegated the commercial staff fill empty sponsor
 * slots; otherwise 1 April tells the owner of contracts in their final season.
 */
export function delegatedBusiness(w: World) {
  delegatedSponsors(w);
  sponsorEnding(w);
}
export const CAMPAIGNS = [
  { kind: 'outreach', label: '동네와 함께', units: 25, fans: 0.08 },
  { kind: 'tickets', label: '새로운 관중', units: 50, fans: 0.12 },
  { kind: 'merchandise', label: '클럽을 입다', units: 80, fans: 0.04 },
  { kind: 'player', label: '선수의 이야기', units: 120, fans: 0.16 },
];
export function campaignOffers(w: World) {
  const income = buildEffects(w).campaignIncome;
  return CAMPAIGNS.map((c) => ({
    ...c,
    cost: quote(clubOf(w).country, w.year, c.units),
    min: quote(
      clubOf(w).country,
      w.year,
      c.units *
        0.25 *
        campaignEffectiveness(w, c.kind) *
        Math.max(0.2, 1 - clubOf(w).fans / 1000000) *
        income,
    ),
    max: quote(
      clubOf(w).country,
      w.year,
      c.units *
        1.8 *
        campaignEffectiveness(w, c.kind) *
        Math.max(0.2, 1 - clubOf(w).fans / 1000000) *
        income,
    ),
    rounds: 4,
  }));
}
export function commercialCommand(w: World, cmd: CommercialCommand) {
  switch (cmd.type) {
    case 'sign-sponsor':
      signSponsor(w, cmd.slot, cmd.offer);
      break;
    case 'sponsor':
      // The single sponsor of rules before 1.16 is signed by slot now (→ECON-8).
      throw new Error('후원은 자리별로 계약해요. 후원 탭에서 자리와 제안을 고르세요.');
    case 'campaign':
      // Campaigns became the 지역 and 글로벌 rows (→ECON-7); one started before still settles.
      throw new Error('캠페인은 이제 없어요. 지역·글로벌 투자는 구단 방향을 따라요.');
  }
}
