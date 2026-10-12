import type { Command, Sponsor, World } from '../../contracts/src/types';
import { addEvent, clubOf, quote } from './world';
import { clamp, ratio } from './primitives';
import { campaignEffectiveness, clubSponsor, moneyLabel } from './finance';
import { pushInbox } from './inbox';
import { setPolicy } from './policy';
import { buildEffects, reserveBuild, setBuild } from './build';
import { synergyEffects } from './synergy';
import { facilityCostUnits, MAX_FACILITIES } from './facilities';
import { credit, debit } from './operations';

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
export type SponsorKind = Sponsor['kind'];

export function sponsorAnnual(w: World) {
  const sponsor = clubSponsor(w);
  if (!sponsor) return '0';
  return sponsor.kind === 'indexed'
    ? ratio(
        sponsor.annual,
        BigInt(Math.round(w.priceIndex * 1000000)),
        BigInt(Math.round(sponsor.index * 1000000)),
      )
    : sponsor.annual;
}
function signSponsor(w: World, offer: Sponsor) {
  w.sponsor = offer;
  addEvent(
    w,
    'sponsor-sign',
    '우리의 첫 번째 파트너',
    `${offer.name} · ${offer.kind} · 연간 ${moneyLabel(w, offer.annual)} · ${offer.until}년까지`,
  );
}
/** With business delegated, the commercial staff fill an empty sponsor slot with the stable offer. */
export function delegatedBusiness(w: World) {
  if (!w.delegation?.business || clubSponsor(w)) return;
  const offer = sponsorOffers(w).find((o) => o.kind === 'stable')!;
  signSponsor(w, offer);
  pushInbox(w, {
    kind: 'finance',
    title: `운영팀이 ${offer.name}와 후원 계약을 맺었어요`,
    detail: `안정형 · 연간 ${moneyLabel(w, offer.annual)} · ${offer.until}년까지 · 리그 경기마다 나눠 들어오고, 끝나면 운영팀이 다시 계약해요.`,
    attention: false,
  });
}
/** Season start without a sponsor: the owner is told once, unless the staff handle business. */
export function sponsorReminder(w: World) {
  if (clubSponsor(w) || w.delegation?.business) return;
  pushInbox(w, {
    kind: 'finance',
    title: '후원 계약이 비어 있어요',
    detail:
      '구단 운영에서 후원사를 고르면 리그 경기마다 후원금이 들어와요. 운영을 스태프에게 맡기면 안정형 후원을 대신 맺어요.',
    attention: true,
  });
}
/** Season boundary: a sponsor contract that has run its term ends. */
export function yearlySponsor(w: World) {
  const sponsor = clubSponsor(w);
  if (sponsor && sponsor.until <= w.year) {
    addEvent(w, 'sponsor-end', '후원 계약 만료', sponsor.name);
    delete w.sponsor;
    w.sponsors = w.sponsors?.filter((contract) => contract !== sponsor);
    if (!w.sponsors?.length) delete w.sponsors;
  }
}
export function sponsorOffers(w: World) {
  const c = clubOf(w);
  // A commercial club negotiates bigger deals; a community club smaller ones.
  const scale = buildEffects(w).sponsor * synergyEffects(w).sponsor;
  return (['stable', 'performance', 'exclusive', 'indexed'] as const).map((kind, i) => ({
    name: `${c.name.split(' ')[0]} ${['Cooperative', 'Motors', 'Textiles', 'Foundry'][i]}`,
    kind,
    annual: quote(
      c.country,
      w.year,
      (150 + c.reputation * 5 + c.fans / 50) * [1, 0.65, 1.6, 0.9][i] * scale,
    ),
    bonus: quote(c.country, w.year, kind === 'performance' ? 220 + c.reputation * 3 : 0),
    until: w.year + (kind === 'exclusive' ? 4 : 2),
    lastPaid: w.year - 1,
    index: w.priceIndex,
  }));
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
      // Rules 1.16 commands are refused, never ignored, until their rules land.
      throw new Error(`${cmd.type} 명령은 아직 지원하지 않습니다.`);
    case 'policy':
      setPolicy(w, cmd.key, cmd.level);
      break;
    case 'build':
      if (cmd.next) reserveBuild(w, cmd.build, cmd.name);
      else setBuild(w, cmd.build, cmd.name);
      break;
    case 'campaign': {
      const o = campaignOffers(w).find((c) => c.kind === cmd.kind);
      if (!o || w.campaigns.some((c) => c.kind === cmd.kind))
        throw new Error('이미 진행 중이거나 없는 캠페인입니다.');
      if (clubSponsor(w)?.kind === 'exclusive' && cmd.kind === 'merchandise')
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
    case 'sponsor': {
      if (clubSponsor(w)) throw new Error('기존 주 후원 계약이 남아 있습니다.');
      const offer = sponsorOffers(w).find((o) => o.kind === cmd.kind);
      if (!offer) throw new Error('없는 후원 제안');
      signSponsor(w, offer);
      break;
    }
    case 'facility': {
      if (w.facilities >= MAX_FACILITIES) throw new Error('시설 확장 한도입니다.');
      const fee = quote(code, w.year, facilityCostUnits(w.facilities + 1));
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
