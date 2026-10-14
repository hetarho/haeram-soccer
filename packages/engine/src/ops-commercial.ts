import type { Command, World } from '../../contracts/src/types';
import { addEvent, clubOf, quote } from './world';
import { clamp } from './primitives';
import { campaignEffectiveness } from './finance';
import { setPolicy } from './policy';
import { buildEffects, setBuild } from './build';
import { startFacilityWork } from './facilities';
import { credit, debit } from './operations';
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

/** Sponsors, campaigns, tickets, facilities, owner capital, the operating dials and strategy. */
export type CommercialCommand = Extract<
  Command,
  {
    type:
      | 'sponsor'
      | 'sign-sponsor'
      | 'campaign'
      | 'ticket'
      | 'facility'
      | 'support'
      | 'policy'
      | 'build';
  }
>;
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
  const code = clubOf(w).country;
  switch (cmd.type) {
    case 'sign-sponsor':
      signSponsor(w, cmd.slot, cmd.offer);
      break;
    case 'sponsor':
      // The single sponsor of rules before 1.16 is signed by slot now (→ECON-8).
      throw new Error('후원은 자리별로 계약해요. 후원 탭에서 자리와 제안을 고르세요.');
    case 'policy':
      setPolicy(w, cmd.key, cmd.level);
      break;
    case 'build':
      setBuild(w, cmd.build, cmd.name);
      break;
    case 'campaign':
      // Campaigns became the 지역 and 글로벌 rows (→ECON-7); one started before still settles.
      throw new Error('캠페인은 이제 없어요. 방향의 지역·글로벌 부문에서 투자해 주세요.');
    case 'facility':
      startFacilityWork(w, cmd.part, (fee) => debit(w, fee));
      break;
    case 'ticket': {
      if (!Number.isFinite(cmd.price) || cmd.price < 0.01 || cmd.price > 0.5)
        throw new Error('티켓 기본가격은 0.01–0.5입니다.');
      w.ticket = cmd.price;
      addEvent(w, 'ticket', '티켓 가격 조정', `1901년 기준 기본가격 ${cmd.price} · 현재 물가 반영`);
      break;
    }
    case 'support': {
      const limit = buildEffects(w).ownerCapital;
      if (w.events.filter((e) => e.kind === 'support' && e.year === w.year).length >= limit)
        throw new Error(`구단주 추가 출자는 시즌당 ${limit}회입니다.`);
      const amount = quote(code, w.year, 150);
      credit(w, amount);
      w.support++;
      clubOf(w).reputation = clamp(clubOf(w).reputation - 2);
      if (BigInt(w.cash) >= 0 && w.critical === '운영자금이 부족합니다.') delete w.critical;
      addEvent(
        w,
        'support',
        '구단주 추가 출자',
        `운영 매출과 별도 · 시즌당 최대 ${limit}회 · 자금 조달 의존으로 평판 -2`,
        amount,
      );
      break;
    }
  }
}
