import type { Command, World } from '../../contracts/src/types';
import { addEvent, clubOf, quote } from './world';
import { clamp } from './primitives';
import { campaignEffectiveness } from './finance';
import { setPolicy } from './policy';
import { buildEffects, setBuild } from './build';
import { facilityCost, MAX_FACILITIES } from './facilities';
import { credit, debit } from './operations';
import { delegatedSponsors, exclusiveSponsor, signSponsor, sponsorEnding } from './sponsors';

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
    case 'campaign': {
      const o = campaignOffers(w).find((c) => c.kind === cmd.kind);
      if (!o || w.campaigns.some((c) => c.kind === cmd.kind))
        throw new Error('이미 진행 중이거나 없는 캠페인입니다.');
      if (exclusiveSponsor(w) && cmd.kind === 'merchandise')
        throw new Error('독점 후원 계약 중에는 자체 상품 캠페인을 진행할 수 없습니다.');
      debit(w, o.cost);
      w.campaigns.push({
        // One campaign of a kind runs at a time, so its round names it.
        id: `${w.year}:${w.round}:${o.kind}`,
        kind: o.kind,
        cost: o.cost,
        started: w.round,
        remaining: 4,
        income: '0',
        fans: 0,
      });
      addEvent(
        w,
        'campaign',
        `${o.label} 시작`,
        '4라운드 후 수입과 신규 팬을 확인합니다. 수익은 보장되지 않습니다.',
        o.cost,
      );
      break;
    }
    case 'facility': {
      if (w.facilities >= MAX_FACILITIES) throw new Error('시설 확장 한도입니다.');
      const fee = facilityCost(code, w.year, w.facilities + 1);
      debit(w, fee);
      w.facilities++;
      addEvent(
        w,
        'facility',
        '더 나은 내일의 운동장',
        `시설 ${w.facilities}단계 · 관중 수용과 선수 성장 개선 · 운영비 증가`,
        fee,
      );
      break;
    }
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
