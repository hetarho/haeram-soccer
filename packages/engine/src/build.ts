import {
  BUILD_OPTIONS,
  BUILD_SLOTS,
  type BuildSlot,
  type ClubBuild,
} from '../../contracts/src/build';
import type { World } from '../../contracts/src/types';
import { BUILD_PRESETS } from './preset-data';

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
export interface BuildCard {
  label: string;
  effects: Partial<BuildEffects>;
}
export const BUILD_SLOT_INFO: Record<BuildSlot, { label: string }> = {
  youth: { label: '유입 방식' },
  scouting: { label: '스카우팅' },
  market: { label: '매각 기조' },
  revenue: { label: '수익 모델' },
  fans: { label: '지역 관계 방식' },
  culture: { label: '라커룸 문화' },
};
const STANDARD: BuildCard = {
  label: '표준',
  effects: {},
};
export const BUILD_CARDS: {
  [S in BuildSlot]: Record<(typeof BUILD_OPTIONS)[S][number], BuildCard>;
} = {
  youth: {
    homegrown: {
      label: '성골 유스',
      effects: { academyIntake: 1, academyPotential: 3, marketCandidates: -1 },
    },
    partnership: {
      label: '유소년 클럽 제휴',
      effects: { academyIntake: 2, academyPotential: -2 },
    },
    worldwide: {
      label: '해외 유스 스카우트',
      effects: { academyIntake: -1, academyPotential: 5 },
    },
    elite: {
      label: '엘리트 선발',
      effects: { academyIntake: -2, academyPotential: 8 },
    },
  },
  scouting: {
    data: {
      label: '데이터 스카우팅',
      effects: { marketPotential: 3, marketCandidates: 1, marketAbility: -2 },
    },
    proven: {
      label: '즉시 전력',
      effects: { marketAbility: 4, wage: 1.05 },
    },
    network: {
      label: '광역 네트워크',
      effects: { marketCandidates: 3, marketPotential: -1 },
    },
    local: {
      label: '지역 인재 우선',
      effects: { gateDemand: 0.02, wage: 0.97, marketCandidates: -1 },
    },
  },
  market: {
    selling: {
      label: '셀링 클럽',
      effects: { incomingBids: 1.6, saleFee: 1.25, moraleBaseline: -2 },
    },
    showcase: {
      label: '쇼케이스',
      effects: { incomingBids: 1.3, saleFee: 1.1, moraleBaseline: -1 },
    },
    hold: {
      label: '핵심 지키기',
      effects: { incomingBids: 0.5, moraleBaseline: 2 },
    },
    hardball: {
      label: '강경 협상',
      effects: { saleFee: 1.15, incomingBids: 0.8 },
    },
  },
  revenue: {
    commercial: {
      label: '상업 확장',
      effects: { sponsor: 1.2, marketingFans: 1.2, gateDemand: -0.03 },
    },
    owner: {
      label: '구단주 투자',
      effects: { wage: 1.05 },
    },
    frugal: {
      label: '긴축 재정',
      effects: { wage: 0.94, moraleBaseline: -2, marketAbility: -2 },
    },
    members: {
      label: '회원제 운영',
      effects: { gateDemand: 0.05, winFans: 1.2, sponsor: 0.9 },
    },
  },
  fans: {
    community: {
      label: '지역 밀착',
      effects: { gateDemand: 0.06, winFans: 1.4, marketingFans: 0.9 },
    },
    fortress: {
      label: '홈 요새',
      effects: { homeStrength: 1.5, winFans: 1.1, marketingFans: 0.85 },
    },
    mutual: {
      label: '지역 상생',
      effects: { localBaseRate: 1.5, sponsor: 0.95 },
    },
    families: {
      label: '가족 관중',
      effects: { gateDemand: 0.04, marketingFans: 1.1, homeStrength: -0.5 },
    },
  },
  culture: {
    family: {
      label: '가족 같은 클럽',
      effects: { moraleBaseline: 3, wage: 1.03 },
    },
    meritocracy: {
      label: '철저한 경쟁',
      effects: { youthGrowth: 1.1, moraleBaseline: -1 },
    },
    stars: {
      label: '스타 대우',
      effects: { marketAbility: 2, moraleBaseline: 1, wage: 1.1 },
    },
    veterans: {
      label: '베테랑 리더십',
      effects: { moraleBaseline: 2, youthGrowth: 0.9 },
    },
  },
};

export { BUILD_PRESETS, type PresetRows } from './preset-data';

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
