import {
  BUILD_OPTIONS,
  BUILD_SLOTS,
  STRATEGY_NAME_LIMIT,
  type BuildSlot,
  type ClubBuild,
} from '../../contracts/src/build';
import type { World } from '../../contracts/src/types';
import { addEvent } from './world';

/** Everything the club build changes, as additions or multipliers (→ECON-22). */
export interface BuildEffects {
  /** Academy intake prospects and their potential. */
  academyIntake: number;
  academyPotential: number;
  /** Round growth of first-team players aged 21 or younger. */
  youthGrowth: number;
  /** Transfer market candidates, potential and ability. */
  marketCandidates: number;
  marketPotential: number;
  marketAbility: number;
  /** Daily chance multiplier of another club's offer, and the fee every sale earns. */
  incomingBids: number;
  saleFee: number;
  /** Sponsor offer amounts, campaign income and marketing fan growth. */
  sponsor: number;
  campaignIncome: number;
  marketingFans: number;
  /** How fast 지역 기반 moves (→ECON-34). */
  localBaseRate: number;
  /** Added to home gate demand (0.08 = +8%). */
  gateDemand: number;
  /** Multiplier on the supporters a win brings. */
  winFans: number;
  /** Strength points at home. */
  homeStrength: number;
  /** Owner capital injections allowed per season. */
  ownerCapital: number;
  /** Player wage multiplier. */
  wage: number;
  moraleBaseline: number;
}

export const NEUTRAL_BUILD: Readonly<BuildEffects> = Object.freeze({
  academyIntake: 0,
  academyPotential: 0,
  youthGrowth: 1,
  marketCandidates: 0,
  marketPotential: 0,
  marketAbility: 0,
  incomingBids: 1,
  saleFee: 1,
  sponsor: 1,
  campaignIncome: 1,
  marketingFans: 1,
  localBaseRate: 1,
  gateDemand: 0,
  winFans: 1,
  homeStrength: 0,
  ownerCapital: 3,
  wage: 1,
  moraleBaseline: 0,
});
/** Keys that multiply across cards; the rest add. */
const MULTIPLIED = new Set<keyof BuildEffects>([
  'youthGrowth',
  'incomingBids',
  'saleFee',
  'sponsor',
  'campaignIncome',
  'marketingFans',
  'localBaseRate',
  'winFans',
  'wage',
]);
/** How each effect reads on a card, and which direction helps the club. */
const EFFECT_TEXT: Record<keyof BuildEffects, { label: string; unit?: string; good: 1 | -1 }> = {
  academyIntake: { label: '유스 입단', unit: '명', good: 1 },
  academyPotential: { label: '유스 입단 잠재력', good: 1 },
  youthGrowth: { label: '21세 이하 성장', good: 1 },
  marketCandidates: { label: '이적시장 후보', unit: '명', good: 1 },
  marketPotential: { label: '영입 후보 잠재력', good: 1 },
  marketAbility: { label: '영입 후보 능력', good: 1 },
  incomingBids: { label: '다른 구단 제안', good: 1 },
  saleFee: { label: '매각 이적료', good: 1 },
  sponsor: { label: '새 후원 계약 금액', good: 1 },
  campaignIncome: { label: '캠페인 수입', good: 1 },
  marketingFans: { label: '해외 마케팅 팬 증가', good: 1 },
  localBaseRate: { label: '지역 기반 성장 속도', good: 1 },
  gateDemand: { label: '홈 관중 수요', good: 1 },
  winFans: { label: '승리 시 팬 증가', good: 1 },
  homeStrength: { label: '홈 경기 전력', good: 1 },
  ownerCapital: { label: '구단주 출자 시즌', unit: '회', good: 1 },
  wage: { label: '선수 급여', good: -1 },
  moraleBaseline: { label: '분위기 기준점', good: 1 },
};

export interface BuildCard {
  label: string;
  /** The football idea behind the card. */
  model: string;
  effects: Partial<BuildEffects>;
}
export const BUILD_SLOT_INFO: Record<BuildSlot, { label: string; question: string }> = {
  youth: { label: '유입 방식', question: '아카데미 아이들을 어디서 데려올까' },
  scouting: { label: '스카우팅', question: '어떤 선수를 찾아 데려올까' },
  market: { label: '매각 기조', question: '우리 선수를 원하는 구단에 어떻게 응할까' },
  revenue: { label: '수익 모델', question: '구단 살림은 어디서 벌고 아낄까' },
  fans: { label: '지역 관계 방식', question: '연고지와 어떻게 지낼까' },
  culture: { label: '라커룸 문화', question: '선수단은 어떤 분위기로 뭉칠까' },
};
const STANDARD: BuildCard = {
  label: '표준',
  model: '특별한 방향 없이 표준으로 운영',
  effects: {},
};
export const BUILD_CARDS: {
  [S in BuildSlot]: Record<(typeof BUILD_OPTIONS)[S][number], BuildCard>;
} = {
  youth: {
    homegrown: {
      label: '성골 유스',
      model: '아카데미 출신으로 1군 뼈대를 세우는 유스 명가',
      effects: { academyIntake: 1, academyPotential: 3, marketCandidates: -1 },
    },
    partnership: {
      label: '유소년 클럽 제휴',
      model: '지역 유소년 클럽과 손잡고 많이 데려와 고르는 방식',
      effects: { academyIntake: 2, academyPotential: -2 },
    },
    worldwide: {
      label: '해외 유스 스카우트',
      model: '적게 뽑되 재능이 확실한 아이만 데려오는 방식',
      effects: { academyIntake: -1, academyPotential: 5 },
    },
    elite: {
      label: '엘리트 선발',
      model: '아주 적게 뽑아 가장 뛰어난 아이에게만 투자하는 방식',
      effects: { academyIntake: -2, academyPotential: 8 },
    },
  },
  scouting: {
    data: {
      label: '데이터 스카우팅',
      model: '지표로 저평가된 선수를 찾는 데이터 영입',
      effects: { marketPotential: 3, marketCandidates: 1, marketAbility: -2 },
    },
    proven: {
      label: '즉시 전력',
      model: '이미 증명한 선수를 사 오는 즉시 전력 영입',
      effects: { marketAbility: 4, wage: 1.05 },
    },
    network: {
      label: '광역 네트워크',
      model: '여러 나라에 스카우트를 두어 후보를 넓히는 방식',
      effects: { marketCandidates: 3, marketPotential: -1 },
    },
    local: {
      label: '지역 인재 우선',
      model: '연고지 출신을 먼저 찾아 관중과 가까워지는 영입',
      effects: { gateDemand: 0.02, wage: 0.97, marketCandidates: -1 },
    },
  },
  market: {
    selling: {
      label: '셀링 클럽',
      model: '싸게 사서 키운 뒤 비싸게 파는 트레이딩 모델',
      effects: { incomingBids: 1.6, saleFee: 1.25, moraleBaseline: -2 },
    },
    showcase: {
      label: '쇼케이스',
      model: '빅클럽에 선수를 보여 주는 무대가 되는 구단',
      effects: { incomingBids: 1.3, saleFee: 1.1, moraleBaseline: -1 },
    },
    hold: {
      label: '핵심 지키기',
      model: '주축은 팔지 않는다는 메시지로 라커룸을 지키는 방식',
      effects: { incomingBids: 0.5, moraleBaseline: 2 },
    },
    hardball: {
      label: '강경 협상',
      model: '제값이 아니면 팔지 않는 협상 태도',
      effects: { saleFee: 1.15, incomingBids: 0.8 },
    },
  },
  revenue: {
    commercial: {
      label: '상업 확장',
      model: '스폰서와 해외 마케팅으로 수익을 키우는 상업 구단',
      effects: { sponsor: 1.2, marketingFans: 1.2, gateDemand: -0.03 },
    },
    owner: {
      label: '구단주 투자',
      model: '구단주의 자금으로 버티며 투자하는 구조',
      effects: { ownerCapital: 2, wage: 1.05 },
    },
    frugal: {
      label: '긴축 재정',
      model: '급여 체계를 묶어 오래 버티는 재정 운영',
      effects: { wage: 0.94, moraleBaseline: -2, marketAbility: -2 },
    },
    members: {
      label: '회원제 운영',
      model: '팬이 주인인 회원제(소시오) 구단',
      effects: { gateDemand: 0.05, winFans: 1.2, sponsor: 0.9, ownerCapital: -1 },
    },
  },
  fans: {
    community: {
      label: '지역 밀착',
      model: '지역 공동체와 함께 홈 경기장을 채우는 구단',
      effects: { gateDemand: 0.06, winFans: 1.4, marketingFans: 0.9 },
    },
    fortress: {
      label: '홈 요새',
      model: '원정팀이 두려워하는 홈 분위기',
      effects: { homeStrength: 1.5, winFans: 1.1, marketingFans: 0.85 },
    },
    mutual: {
      label: '지역 상생',
      model: '연고지와 함께 자라 지역의 뿌리가 빨리 깊어지는 구단',
      effects: { localBaseRate: 1.5, sponsor: 0.95 },
    },
    families: {
      label: '가족 관중',
      model: '가족 단위 관중이 편한 경기장',
      effects: { gateDemand: 0.04, marketingFans: 1.1, homeStrength: -0.5 },
    },
  },
  culture: {
    family: {
      label: '가족 같은 클럽',
      model: '서로 챙기는 라커룸, 대신 급여 기대치가 높아요',
      effects: { moraleBaseline: 3, wage: 1.03 },
    },
    meritocracy: {
      label: '철저한 경쟁',
      model: '나이와 이름값 없이 실력으로만 뛰는 팀',
      effects: { youthGrowth: 1.1, moraleBaseline: -1 },
    },
    stars: {
      label: '스타 대우',
      model: '스타가 오고 싶어 하는 대우',
      effects: { marketAbility: 2, moraleBaseline: 1, wage: 1.1 },
    },
    veterans: {
      label: '베테랑 리더십',
      model: '고참이 중심을 잡는 라커룸',
      effects: { moraleBaseline: 2, youthGrowth: 0.9 },
    },
  },
};

/**
 * Ready-made operating strategies (→ECON-22), one tap to fill the slots. Each has one identity and
 * lights or aims at a synergy (→CLUB-21); the owner can still compose any other mix.
 */
export const BUILD_PRESETS: {
  id: string;
  label: string;
  model: string;
  /** The synergy the preset lights at once or points toward, in the owner's terms. */
  aim: string;
  build: ClubBuild;
}[] = [
  {
    id: 'local-pride',
    label: '동네의 자부심',
    model: '동네 아이들과 동네 관중으로 버티는 구단',
    aim: '시너지 우리 동네 아이들 바로 발동',
    build: {
      youth: 'homegrown',
      scouting: 'local',
      market: 'hold',
      revenue: 'members',
      fans: 'community',
      culture: 'family',
    },
  },
  {
    id: 'trading',
    label: '트레이딩 머신',
    model: '지표로 찾고 1군에서 키워 비싸게 팔아요',
    aim: '데뷔 시점을 빠른 데뷔로 두면 시너지 트레이딩 머신 · 발굴형 스카우트를 쓰면 머니볼까지',
    build: { scouting: 'data', market: 'selling', culture: 'meritocracy' },
  },
  {
    id: 'commercial',
    label: '상업 제국',
    model: '브랜드로 벌어 스타를 데려와요',
    aim: '해외 마케팅 4단계 · 3만 석 경기장을 채우면 시너지 상업 제국',
    build: { scouting: 'network', revenue: 'commercial', culture: 'stars' },
  },
  {
    id: 'ambition',
    label: '승격 올인',
    model: '구단주 돈과 홈 요새로 지금 올라가요',
    aim: '유스 성장을 내주고 당장의 전력을 사요',
    build: {
      scouting: 'proven',
      market: 'hold',
      revenue: 'owner',
      fans: 'fortress',
      culture: 'veterans',
    },
  },
  {
    id: 'shoestring',
    label: '알뜰 생존',
    model: '적은 돈으로 오래 버티는 작은 구단',
    aim: '분위기를 지키며 선수 급여 ×0.91 · 작은 출발에 맞춰요',
    build: {
      youth: 'partnership',
      scouting: 'local',
      market: 'hardball',
      revenue: 'frugal',
      fans: 'families',
      culture: 'veterans',
    },
  },
];
/** Every distinct build: each slot's cards plus its standard card. */
export const BUILD_COMBINATIONS = BUILD_SLOTS.reduce(
  (count, slot) => count * (BUILD_OPTIONS[slot].length + 1),
  1,
);

export function buildOf(w: Pick<World, 'build'>): ClubBuild {
  return w.build ?? {};
}
export function cardOf(build: ClubBuild, slot: BuildSlot): BuildCard {
  const option = build[slot];
  return option ? (BUILD_CARDS[slot] as Record<string, BuildCard>)[option] : STANDARD;
}
const key = (build: ClubBuild) => BUILD_SLOTS.map((slot) => build[slot] ?? '').join('|');
export const sameBuild = (a: ClubBuild, b: ClubBuild) => key(a) === key(b);
/** The preset this build matches, if any. */
export function buildPreset(build: ClubBuild) {
  return BUILD_PRESETS.find((preset) => sameBuild(preset.build, build));
}
/** The direction's name: its preset's, 기본 방향 with every card standard, else 맞춤 방향. */
export function buildLabel(build: ClubBuild) {
  return (
    buildPreset(build)?.label ??
    (BUILD_SLOTS.some((slot) => build[slot]) ? '맞춤 방향' : '기본 방향')
  );
}

/** Names worlds recorded before the strategy became the club's direction (→ECON-22). */
const RENAMED: Record<string, string> = { '기본 전략': '기본 방향', '맞춤 전략': '맞춤 방향' };
/**
 * The name in a build event's title (`방향 · <name>`, or `운영 전략 · <name>` as recorded before
 * the rename), with the old default names read as 기본 방향 and 맞춤 방향 (→ECON-22).
 */
export function buildTitleName(title: string) {
  const at = title.indexOf(' · ');
  const name = at < 0 ? title : title.slice(at + 3);
  return RENAMED[name] ?? name;
}
/** A build event's title as it reads now: `방향 · <name>`, whatever words recorded it. */
export function readBuildTitle(title: string) {
  return `방향 · ${buildTitleName(title)}`;
}

const composed = new Map<string, BuildEffects>();
/** The build's combined effects: additions add up, multipliers multiply across slots. */
export function composeBuild(build: ClubBuild): BuildEffects {
  const cacheKey = key(build);
  const cached = composed.get(cacheKey);
  if (cached) return cached;
  const effects: BuildEffects = { ...NEUTRAL_BUILD };
  for (const slot of BUILD_SLOTS)
    for (const [name, value] of Object.entries(cardOf(build, slot).effects) as [
      keyof BuildEffects,
      number,
    ][])
      effects[name] = MULTIPLIED.has(name) ? effects[name] * value : effects[name] + value;
  composed.set(cacheKey, Object.freeze(effects));
  return composed.get(cacheKey)!;
}
/**
 * The build's combined effects, with 데뷔 시점 빠른 데뷔's (→CLUB-32) joined: it carries what the
 * 1군 직행 경로 card gave before rules 1.18.
 */
export function buildEffects(
  w: Pick<World, 'build'> & Partial<Pick<World, 'direction'>>,
): BuildEffects {
  const effects = composeBuild(buildOf(w));
  if (w.direction?.debut !== 'early') return effects;
  return {
    ...effects,
    youthGrowth: effects.youthGrowth * EARLY_DEBUT.youthGrowth,
    moraleBaseline: effects.moraleBaseline + EARLY_DEBUT.moraleBaseline,
  };
}
/** What 데뷔 시점 빠른 데뷔 adds to the build's effects (→CLUB-32). */
export const EARLY_DEBUT = { youthGrowth: 1.2, moraleBaseline: -1 } as const;

/** Card lines in the owner's terms: ▲ what it helps, ▼ what it costs. */
export function effectLines(effects: Partial<BuildEffects>) {
  const pros: string[] = [],
    cons: string[] = [];
  for (const [name, value] of Object.entries(effects) as [keyof BuildEffects, number][]) {
    const text = EFFECT_TEXT[name],
      multiplied = MULTIPLIED.has(name),
      change = multiplied
        ? value - 1
        : name === 'ownerCapital'
          ? value - NEUTRAL_BUILD.ownerCapital
          : value;
    // Changes that round away (0.97 × 1.03) read as no change at all.
    if (Math.abs(change) < (multiplied || name === 'gateDemand' ? 0.005 : 0.05)) continue;
    const amount = multiplied
      ? `×${Math.round(value * 100) / 100}`
      : name === 'gateDemand'
        ? `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change) * 100)}%`
        : `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change) * 10) / 10}${text.unit ?? ''}`;
    (change * text.good > 0 ? pros : cons).push(`${text.label} ${amount}`);
  }
  return { pros, cons };
}
/** A single card's lines: its effects are changes from neutral. */
export function cardLines(card: BuildCard) {
  const effects: Partial<BuildEffects> = { ...card.effects };
  if (effects.ownerCapital !== undefined)
    effects.ownerCapital = NEUTRAL_BUILD.ownerCapital + effects.ownerCapital;
  return effectLines(effects);
}

/** Valid cards only, standard slots left out. */
function normalize(build: ClubBuild): ClubBuild {
  const clean: ClubBuild = {};
  for (const [slot, option] of Object.entries(build) as [BuildSlot, string | undefined][]) {
    if (!Object.hasOwn(BUILD_OPTIONS, slot)) throw new Error('방향 부문을 확인하세요.');
    if (option === undefined) continue;
    if (!(BUILD_OPTIONS[slot] as readonly string[]).includes(option))
      throw new Error('방향 카드를 확인하세요.');
    (clean as Record<string, string>)[slot] = option;
  }
  return clean;
}

/**
 * Applies a direction at once (→ECON-22): cards change at any time, like the dials. `name` is the
 * owner's saved direction (→WEB-61); without it the history names the preset or the mix.
 */
export function setBuild(w: World, build: ClubBuild, name?: string) {
  const next = normalize(build);
  const current = buildOf(w);
  if (sameBuild(next, current)) return;
  if (Object.keys(next).length) w.build = next;
  else delete w.build;
  const cards = BUILD_SLOTS.filter((slot) => next[slot]).map((slot) => cardOf(next, slot).label);
  const label = name?.trim().slice(0, STRATEGY_NAME_LIMIT) || buildLabel(next);
  addEvent(w, 'build', `방향 · ${label}`, cards.join(' · ') || '모든 부문 표준');
}
