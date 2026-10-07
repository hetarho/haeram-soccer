import type { World, Command, MatchRecord, Sponsor, Tactic } from '../../contracts/src/types';
import {
  activePlayers,
  addEvent,
  clubOf,
  makeManager,
  makePlayer,
  overall,
  quote,
  tacticLabel,
  TACTICS,
} from './world';
import { clamp, integer, random, ratio } from './primitives';
import {
  campaignEffectiveness,
  FINANCE_CONFIG,
  gateProjection,
  matchBonus,
  operatingCosts,
  roundShare,
} from './finance';
import { setLineup } from './strategy';
import { setTrainingFocus } from './training';
export function operatingCost(w: World) {
  return operatingCosts(w).annual;
}
export function credit(w: World, amount: string) {
  if (BigInt(amount) < 0) throw new Error('음수 수입');
  w.cash = (BigInt(w.cash) + BigInt(amount)).toString();
  w.income = (BigInt(w.income) + BigInt(amount)).toString();
}
export function debit(w: World, amount: string, mandatory = false) {
  if (BigInt(amount) < 0) throw new Error('음수 지출');
  if (!mandatory && BigInt(w.cash) < BigInt(amount)) throw new Error('보유 자금이 부족합니다.');
  w.cash = (BigInt(w.cash) - BigInt(amount)).toString();
  w.expense = (BigInt(w.expense) + BigInt(amount)).toString();
}
export function gate(w: World, m: MatchRecord) {
  if (m.home !== w.playerClub && m.away !== w.playerClub) return;
  const bonus = matchBonus(w, m);
  if (BigInt(bonus.amount) > 0n) {
    credit(w, bonus.amount);
    addEvent(
      w,
      'match-bonus',
      `${bonus.result} 성과 수입`,
      `${m.id} · 홈·원정 동일 기준`,
      bonus.amount,
    );
  }
  if (BigInt(bonus.sponsored) > 0n) {
    credit(w, bonus.sponsored);
    addEvent(
      w,
      'sponsor-bonus',
      `${bonus.result} 후원 성과 보너스`,
      `${w.sponsor!.name} · ${m.id}`,
      bonus.sponsored,
    );
  }
  if (
    w.sponsor &&
    w.sponsor.lastPaid < w.year &&
    w.sponsor.until > w.year &&
    ['league', 'lower'].includes(m.kind)
  ) {
    const games = w.fixtures.filter(
      (f) =>
        ['league', 'lower'].includes(f.kind) &&
        (f.home === w.playerClub || f.away === w.playerClub),
    ).length;
    const amount = roundShare(sponsorAnnual(w), w.tables[w.playerClub].played, games);
    credit(w, amount);
    addEvent(
      w,
      'sponsor-payment',
      '후원 노출 대금',
      `${w.sponsor.name} · 리그 경기 ${w.tables[w.playerClub].played}/${games} · ${m.id}`,
      amount,
    );
    if (w.tables[w.playerClub].played === games) w.sponsor.lastPaid = w.year;
  }
  if (m.home !== w.playerClub) return;
  const c = clubOf(w),
    r = random(`${w.seed}:gate:${m.id}`);
  const projection = gateProjection(w, m.id);
  const attendance = Math.round(
    projection.attendanceLow + r() * (projection.attendanceHigh - projection.attendanceLow),
  );
  const income = quote(c.country, w.year, attendance * projection.perFan);
  credit(w, income);
  addEvent(
    w,
    'gate',
    '홈 경기의 수입',
    `관중 ${attendance}명 · 티켓과 구단 상품 · ${m.id}`,
    income,
  );
  const cost = quote(
    c.country,
    w.year,
    FINANCE_CONFIG.homeMatchBaseCost + attendance * FINANCE_CONFIG.homeMatchCostPerFan,
  );
  debit(w, cost, true);
  addEvent(w, 'match-cost', '홈 경기 개최비', `관중 ${attendance}명 · ${m.id}`, cost);
}
export function sponsorAnnual(w: World) {
  if (!w.sponsor) return '0';
  return w.sponsor.kind === 'indexed'
    ? ratio(
        w.sponsor.annual,
        BigInt(Math.round(w.priceIndex * 1000000)),
        BigInt(Math.round(w.sponsor.index * 1000000)),
      )
    : w.sponsor.annual;
}
export function settleSeasonPrize(w: World, rank: number, clubs: number) {
  if (w.events.some((event) => event.year === w.year && event.kind === 'season-prize')) return;
  const band =
    rank === 1
      ? 0
      : rank === 2
        ? 1
        : rank <= Math.ceil(clubs / 4)
          ? 2
          : rank <= Math.floor(clubs / 2)
            ? 3
            : -1;
  if (band < 0) return;
  const amount = quote(
    clubOf(w).country,
    w.year,
    FINANCE_CONFIG.rankAwards[band as 0 | 1 | 2 | 3] * (1 + Math.max(0, 3 - clubOf(w).tier) * 0.35),
  );
  credit(w, amount);
  addEvent(
    w,
    'season-prize',
    '리그 최종 순위 상금',
    `${rank}/${clubs}위 · 하위권 상금 없음`,
    amount,
  );
}
export function sponsorOffers(w: World) {
  const c = clubOf(w);
  return (['stable', 'performance', 'exclusive', 'indexed'] as const).map((kind, i) => ({
    name: `${c.name.split(' ')[0]} ${['Cooperative', 'Motors', 'Textiles', 'Foundry'][i]}`,
    kind,
    annual: quote(
      c.country,
      w.year,
      (150 + c.reputation * 5 + c.fans / 50) * [1, 0.65, 1.6, 0.9][i],
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
  return CAMPAIGNS.map((c) => ({
    ...c,
    cost: quote(clubOf(w).country, w.year, c.units),
    min: quote(
      clubOf(w).country,
      w.year,
      c.units *
        0.25 *
        campaignEffectiveness(w, c.kind) *
        Math.max(0.2, 1 - clubOf(w).fans / 1000000),
    ),
    max: quote(
      clubOf(w).country,
      w.year,
      c.units *
        1.8 *
        campaignEffectiveness(w, c.kind) *
        Math.max(0.2, 1 - clubOf(w).fans / 1000000),
    ),
    rounds: 4,
  }));
}
export function settleRound(w: World) {
  const cost = operatingCosts(w, w.round);
  debit(w, cost.nextRound, true);
  addEvent(
    w,
    'operating-cost',
    '급여와 시설 유지비',
    `선수 ${cost.payments.playerWages} · 감독 ${cost.payments.managerWage} · 시설 ${cost.payments.maintenance} ${w.currency}`,
    cost.nextRound,
  );
  for (const c of w.campaigns) {
    c.remaining--;
    if (c.remaining > 0) continue;
    const offer = CAMPAIGNS.find((o) => o.kind === c.kind)!;
    const r = random(`${w.seed}:campaign:${c.id}`);
    const saturation = Math.max(0.2, 1 - clubOf(w).fans / 1000000);
    const fit = campaignEffectiveness(w, c.kind);
    const income = ratio(
      c.cost,
      BigInt(Math.round((0.25 + r() * 1.55) * fit * saturation * 1000)),
      1000n,
    );
    const fans = Math.round(clubOf(w).fans * offer.fans * (0.5 + r()) * fit * saturation);
    credit(w, income);
    clubOf(w).fans = Math.round(clamp(clubOf(w).fans + fans, 200, 5000000));
    c.income = income;
    c.fans = fans;
    addEvent(
      w,
      'campaign-result',
      `${offer.label} 결과`,
      `팬 +${fans}명 · 비용 ${c.cost} · 순수익 ${BigInt(income) - BigInt(c.cost)} ${w.currency}`,
      income,
    );
  }
  w.campaigns = w.campaigns.filter((c) => c.remaining > 0);
  if (
    BigInt(w.cash) < 0 &&
    !w.events.some((e) => e.year === w.year && e.kind === 'budget-warning')
  ) {
    addEvent(
      w,
      'budget-warning',
      '운영자금 경고',
      '필수 비용으로 잔고가 음수가 되었습니다. 지출 조정, 매각, 명시적인 구단주 출자로 회복할 수 있습니다. 자동 지원금은 없습니다.',
    );
  }
  if (BigInt(w.cash) < 0) w.critical ||= '운영자금이 부족합니다.';
}
export function managerOffers(w: World) {
  return Array.from({ length: 4 }, (_, i) => {
    const manager = makeManager(clubOf(w).country, w.seed, w.year, i + 1);
    return {
      ...manager,
      fee: quote(clubOf(w).country, w.year, 60 + i * 40),
      ambition: Math.round((manager.ability + manager.pride) / 2),
    };
  });
}
export function transferOffers(w: World) {
  const roles = ['GK', 'DEF', 'MID', 'FWD'] as const;
  return Array.from({ length: 8 }, (_, i) => {
    const r = random(`${w.seed}:market:${w.year}:${i}`);
    const p = makePlayer(
      clubOf(w).country,
      w.seed,
      `market:${w.year}:${i}`,
      w.year,
      integer(r, 40, 85),
      roles[i % 4],
      integer(r, 18, 30),
    );
    return {
      player: p,
      fee: quote(
        clubOf(w).country,
        w.year,
        i === 0 ? 0 : Math.round((overall(p) - 25) * 9 + (p.potential - overall(p)) * 3),
      ),
      loanFee: quote(clubOf(w).country, w.year, Math.max(15, overall(p) * 1.5)),
      available: !w.players.some((owned) => owned.id === p.id),
    };
  });
}
function resign(w: World, reason: string) {
  const old = w.manager;
  addEvent(
    w,
    'manager-departure',
    `${old.name} 감독의 마지막 날`,
    `${old.since}–${w.year} · ${reason}`,
  );
  const interim = makeManager(clubOf(w).country, `${w.seed}:interim:${w.revision}`, w.year, 99);
  interim.ability = 35;
  interim.youth = 30;
  interim.wage = quote(clubOf(w).country, w.year, 40);
  interim.interim = true;
  w.manager = interim;
  w.critical = '감독이 떠났습니다. 새 감독을 선임하세요.';
}

const requestTones = { respect: 12, evidence: 16, support: 8, demand: -25 } as const;

function validateTacticRequest(tactic: Tactic, tone: string) {
  if (!TACTICS.includes(tactic) || !Object.hasOwn(requestTones, tone))
    throw new Error('전술 요청을 확인하세요.');
}

/** Shared response calculation excludes only the unchanged seeded ±6 noise. */
function requestScoreBase(w: World, tactic: Tactic, tone: string) {
  const m = w.manager;
  return (
    m.flexibility * 0.45 +
    m.trust * 0.55 +
    requestTones[tone as keyof typeof requestTones] -
    (tactic === m.philosophy ? 0 : 24) -
    m.pride * (tone === 'demand' ? 0.3 : 0.05) -
    m.conflicts * 5
  );
}

function responseLabel(score: number) {
  return score >= 65
    ? '수락'
    : score >= 50
      ? '마지못해 수락'
      : score >= 30
        ? '조건부 수락'
        : '거절';
}

export function tacticRequestOutlook(w: World, tactic: Tactic, tone: string) {
  validateTacticRequest(tactic, tone);
  const base = requestScoreBase(w, tactic, tone),
    min = base - 6,
    max = base + 6,
    low = responseLabel(min),
    high = responseLabel(max),
    history = w.manager.requestHistory;
  const trustAfterDemand = clamp(w.manager.trust - (tone === 'demand' ? 18 : 0));
  const resignationRisk =
    w.manager.pride >= 75 &&
    trustAfterDemand <= 25 &&
    (w.manager.conflicts >= 2 || tone === 'demand');
  return {
    label: resignationRisk ? '사직 위험' : low === high ? low : `${low} ~ ${high}`,
    min,
    max,
    trustRisk: tone === 'demand' ? 18 : min < 30 ? 4 : min < 65 && max >= 50 ? 3 : 0,
    alreadyAnswered:
      history?.at === `${w.year}:${w.round}` && history.keys.includes(`${tactic}:${tone}`),
  };
}

function currentRequestHistory(w: World) {
  const at = `${w.year}:${w.round}`;
  if (w.manager.requestHistory?.at !== at)
    w.manager.requestHistory = { at, keys: [], trustAwarded: false };
  return w.manager.requestHistory;
}

function awardRequestTrust(w: World, amount: number) {
  const history = currentRequestHistory(w);
  if (history.trustAwarded) return;
  w.manager.trust = clamp(w.manager.trust + amount);
  history.trustAwarded = true;
}

export function yearlyStaff(w: World) {
  if (w.sponsor && w.sponsor.until <= w.year) {
    addEvent(w, 'sponsor-end', '후원 계약 만료', w.sponsor.name);
    delete w.sponsor;
  }
  if (w.manager.since + 25 <= w.year && !w.manager.interim)
    resign(w, '긴 지도자 생활을 마치고 은퇴했습니다.');
  else if (w.manager.until <= w.year && !w.manager.interim) {
    w.manager.until = w.year + 3;
    w.manager.wage = quote(clubOf(w).country, w.year, 120 + w.manager.ability);
    addEvent(w, 'manager-renew', '감독 계약 갱신', `${w.manager.name} · 3년`);
  }
  delete w.manager.lastRequest;
  delete w.manager.requestHistory;
  delete w.manager.pending;
  delete w.requested;
}
export function operate(w: World, cmd: Exclude<Command, { type: 'advance' | 'season' }>) {
  const code = clubOf(w).country;
  switch (cmd.type) {
    case 'lineup':
      setLineup(w, cmd.ids);
      break;
    case 'training':
      setTrainingFocus(w, cmd.focus);
      break;
    case 'tactics': {
      validateTacticRequest(cmd.tactic, cmd.tone);
      const m = w.manager,
        key = `${cmd.tactic}:${cmd.tone}`,
        history = currentRequestHistory(w);
      if (history.keys.includes(key)) throw new Error('동일한 요청에 이번 라운드 이미 답했습니다.');
      history.keys.push(key);
      m.lastRequest = key;
      w.requested = cmd.tactic;
      delete m.pending;
      const noise = random(`${w.seed}:request:${w.year}:${w.round}:${m.id}:${key}`)() * 12 - 6;
      const score = requestScoreBase(w, cmd.tactic, cmd.tone) + noise;
      if (cmd.tone === 'demand') {
        m.trust = clamp(m.trust - 18);
        m.conflicts++;
      }
      if (m.pride >= 75 && m.trust <= 25 && (m.conflicts >= 2 || cmd.tone === 'demand')) {
        addEvent(
          w,
          'manager-response',
          '감독의 사직서',
          '제 판단을 존중받을 수 없다면 함께할 수 없습니다.',
        );
        resign(w, '구단주의 강한 전술 간섭');
        break;
      }
      let response: string;
      if (score >= 65) {
        w.tactic = cmd.tactic;
        awardRequestTrust(w, 2);
        response = '수락했습니다. 선수들과 새로운 방향을 준비하겠습니다.';
      } else if (score >= 50) {
        w.tactic = cmd.tactic;
        m.trust = clamp(m.trust - 3);
        response = '마음에 들지는 않지만 시도하겠습니다. 결과를 함께 봅시다.';
      } else if (score >= 30) {
        m.pending = cmd.tactic;
        response = '조건부 수락입니다. 훈련 지원금이 확보되면 전환하겠습니다.';
      } else {
        m.trust = clamp(m.trust - 4);
        m.conflicts++;
        response = '거절합니다. 현재 선수단과 제 철학에는 맞지 않습니다.';
      }
      addEvent(
        w,
        'manager-response',
        `${m.name}의 답변`,
        `${tacticLabel[cmd.tactic]} 요청 · ${response}`,
      );
      break;
    }
    case 'accept-condition': {
      if (!w.manager.pending) throw new Error('대기 중인 조건이 없습니다.');
      const cost = quote(code, w.year, 30);
      debit(w, cost);
      w.tactic = w.manager.pending;
      delete w.manager.pending;
      awardRequestTrust(w, 3);
      addEvent(w, 'training', '훈련 지원과 전술 전환', tacticLabel[w.tactic], cost);
      break;
    }
    case 'hire': {
      const offer = managerOffers(w)[cmd.candidate];
      if (!offer || offer.id === w.manager.id) throw new Error('유효하지 않은 감독 제안');
      const fee =
        BigInt(offer.fee) + (w.manager.interim ? 0n : BigInt(ratio(w.manager.wage, 1n, 4n)));
      debit(w, fee.toString());
      addEvent(
        w,
        'manager-departure',
        `${w.manager.name} 감독 교체`,
        `${w.manager.since}–${w.year} · 구단의 선택`,
      );
      const { fee: _fee, ambition: _ambition, ...manager } = offer;
      void _fee;
      void _ambition;
      w.manager = manager;
      w.tactic = manager.philosophy;
      delete w.requested;
      delete w.critical;
      addEvent(
        w,
        'manager-hire',
        `${manager.name} 감독 선임`,
        `${tacticLabel[manager.philosophy]} · 계약 ${manager.until}년까지`,
        fee.toString(),
      );
      break;
    }
    case 'recruit': {
      const o = transferOffers(w)[cmd.candidate];
      if (!o?.available) throw new Error('이미 계약했거나 없는 선수입니다.');
      if (activePlayers(w).length >= 26) throw new Error('선수단 정원은 26명입니다.');
      const cost = cmd.loan ? o.loanFee : o.fee;
      debit(w, cost);
      if (cmd.loan) o.player.loanUntil = w.year + 1;
      w.players.push(o.player);
      addEvent(
        w,
        'transfer-in',
        `${o.player.name} ${cmd.loan ? '임대' : '영입'}`,
        `${o.player.role} · ${w.year - o.player.born}세 · 연봉 ${o.player.wage} · 계약 ${o.player.until}년`,
        cost,
      );
      break;
    }
    case 'sell': {
      const p = w.players.find((p) => p.id === cmd.id && p.status === 'active');
      if (!p || p.loanUntil) throw new Error('매각 가능한 선수가 아닙니다.');
      if (
        activePlayers(w).length <= 14 ||
        (p.role === 'GK' && activePlayers(w).filter((p) => p.role === 'GK').length <= 1)
      )
        throw new Error('최소 선수단과 골키퍼를 유지해야 합니다.');
      const fee = quote(code, w.year, Math.max(10, (overall(p) - 25) * 5));
      p.status = 'sold';
      credit(w, fee);
      addEvent(
        w,
        'transfer-out',
        `${p.name}의 새로운 도전`,
        '매각 · 개인 경력 기록은 보존됩니다.',
        fee,
      );
      break;
    }
    case 'campaign': {
      const o = campaignOffers(w).find((c) => c.kind === cmd.kind);
      if (!o || w.campaigns.some((c) => c.kind === cmd.kind))
        throw new Error('이미 진행 중이거나 없는 캠페인입니다.');
      if (w.sponsor?.kind === 'exclusive' && cmd.kind === 'merchandise')
        throw new Error('독점 후원 계약 중에는 자체 상품 캠페인을 진행할 수 없습니다.');
      debit(w, o.cost);
      w.campaigns.push({
        id: `${w.year}:${w.round}:${w.revision}:${o.kind}`,
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
      if (w.sponsor) throw new Error('기존 주 후원 계약이 남아 있습니다.');
      const offer = sponsorOffers(w).find((o) => o.kind === cmd.kind);
      if (!offer) throw new Error('없는 후원 제안');
      w.sponsor = offer;
      addEvent(
        w,
        'sponsor-sign',
        '우리의 첫 번째 파트너',
        `${offer.name} · ${offer.kind} · 연간 ${offer.annual} · ${offer.until}년까지`,
      );
      break;
    }
    case 'facility': {
      if (w.facilities >= 30) throw new Error('시설 확장 한도입니다.');
      const fee = quote(code, w.year, 200 * (w.facilities + 1) ** 1.5);
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
      if (w.events.filter((e) => e.kind === 'support' && e.year === w.year).length >= 3)
        throw new Error('구단주 추가 출자는 시즌당 3회입니다.');
      const amount = quote(code, w.year, 150);
      credit(w, amount);
      w.support++;
      clubOf(w).reputation = clamp(clubOf(w).reputation - 2);
      if (BigInt(w.cash) >= 0 && w.critical === '운영자금이 부족합니다.') delete w.critical;
      addEvent(
        w,
        'support',
        '구단주 추가 출자',
        '운영 매출과 별도 · 시즌당 최대 3회 · 자금 조달 의존으로 평판 -2',
        amount,
      );
      break;
    }
  }
  w.revision++;
}
export type SponsorKind = Sponsor['kind'];
