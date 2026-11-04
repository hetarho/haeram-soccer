import { message as sourceMessage } from '../../contracts/src/messages';
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
  /**
   * The chief scout's search (→CLUB-51): players listed per line, the shift of the ability band
   * at both ends, the countries abroad he adds; flags (above 0 = on) for ranking potential before
   * ability, never doing so, and searching nobody abroad.
   */
  scoutPerLine: number;
  scoutAbilityShift: number;
  scoutAbroadExtra: number;
  scoutPotentialFirst: number;
  scoutNeverPotentialFirst: number;
  scoutNoAbroad: number;
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
  scoutPerLine: 0,
  scoutAbilityShift: 0,
  scoutAbroadExtra: 0,
  scoutPotentialFirst: 0,
  scoutNeverPotentialFirst: 0,
  scoutNoAbroad: 0,
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
  youth: { label: sourceMessage('copy.build.ba4ad47e0b') },
  scouting: { label: sourceMessage('copy.investmentAreas.f163d8ed88') },
  market: { label: sourceMessage('copy.build.714cde092c') },
  revenue: { label: sourceMessage('copy.build.5b3a8115d5') },
  fans: { label: sourceMessage('copy.build.3bf4cd4f00') },
  culture: { label: sourceMessage('copy.build.2382a6ed40') },
};
const STANDARD: BuildCard = {
  label: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
  effects: {},
};
export const BUILD_CARDS: {
  [S in BuildSlot]: Record<(typeof BUILD_OPTIONS)[S][number], BuildCard>;
} = {
  youth: {
    homegrown: {
      label: sourceMessage('copy.build.7632514195'),
      effects: { academyIntake: 1, academyPotential: 3, scoutPerLine: -1 },
    },
    partnership: {
      label: sourceMessage('copy.build.ec297d9d41'),
      effects: { academyIntake: 2, academyPotential: -2 },
    },
    worldwide: {
      label: sourceMessage('copy.build.3bc9336df1'),
      effects: { academyIntake: -1, academyPotential: 5 },
    },
    elite: {
      label: sourceMessage('copy.build.416f207008'),
      effects: { academyIntake: -2, academyPotential: 8 },
    },
  },
  scouting: {
    data: {
      label: sourceMessage('copy.build.8ac1576fda'),
      effects: { scoutPotentialFirst: 1, scoutPerLine: 1, scoutAbilityShift: -2 },
    },
    proven: {
      label: sourceMessage('copy.build.9fa10575b1'),
      effects: { scoutAbilityShift: 4, wage: 1.05 },
    },
    network: {
      label: sourceMessage('copy.build.fce3f37294'),
      effects: { scoutPerLine: 1, scoutAbroadExtra: 1, scoutNeverPotentialFirst: 1 },
    },
    local: {
      label: sourceMessage('copy.build.935088b315'),
      effects: { gateDemand: 0.02, wage: 0.97, scoutPerLine: -1, scoutNoAbroad: 1 },
    },
  },
  market: {
    selling: {
      label: sourceMessage('copy.build.7f0539dbda'),
      effects: { incomingBids: 1.6, saleFee: 1.25, moraleBaseline: -2 },
    },
    showcase: {
      label: sourceMessage('copy.build.9a48da1a5a'),
      effects: { incomingBids: 1.3, saleFee: 1.1, moraleBaseline: -1 },
    },
    hold: {
      label: sourceMessage('copy.build.a8fd93bd1f'),
      effects: { incomingBids: 0.5, moraleBaseline: 2 },
    },
    hardball: {
      label: sourceMessage('copy.build.3ca5f7813b'),
      effects: { saleFee: 1.15, incomingBids: 0.8 },
    },
  },
  revenue: {
    commercial: {
      label: sourceMessage('copy.build.084571b70e'),
      effects: { sponsor: 1.2, marketingFans: 1.2, gateDemand: -0.03 },
    },
    owner: {
      label: sourceMessage('copy.build.af4648c9db'),
      effects: { wage: 1.05 },
    },
    frugal: {
      label: sourceMessage('copy.build.d4e31ebbfc'),
      effects: { wage: 0.94, moraleBaseline: -2, scoutAbilityShift: -2 },
    },
    members: {
      label: sourceMessage('copy.build.4f2c1a4618'),
      effects: { gateDemand: 0.05, winFans: 1.2, sponsor: 0.9 },
    },
  },
  fans: {
    community: {
      label: sourceMessage('copy.build.67357919b9'),
      effects: { gateDemand: 0.06, winFans: 1.4, marketingFans: 0.9 },
    },
    fortress: {
      label: sourceMessage('copy.build.15ec9af002'),
      effects: { homeStrength: 1.5, winFans: 1.1, marketingFans: 0.85 },
    },
    mutual: {
      label: sourceMessage('copy.build.0ab380f812'),
      effects: { localBaseRate: 1.5, sponsor: 0.95 },
    },
    families: {
      label: sourceMessage('copy.build.273eeda011'),
      effects: { gateDemand: 0.04, marketingFans: 1.1, homeStrength: -0.5 },
    },
  },
  culture: {
    family: {
      label: sourceMessage('copy.build.df2852e45c'),
      effects: { moraleBaseline: 3, wage: 1.03 },
    },
    meritocracy: {
      label: sourceMessage('copy.build.b4b429047e'),
      effects: { youthGrowth: 1.1, moraleBaseline: -1 },
    },
    stars: {
      label: sourceMessage('copy.build.e42fda7924'),
      effects: { scoutAbilityShift: 2, moraleBaseline: 1, wage: 1.1 },
    },
    veterans: {
      label: sourceMessage('copy.build.79a7398867'),
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
    (BUILD_SLOTS.some((slot) => build[slot])
      ? sourceMessage('copy.build.017848335b')
      : sourceMessage('copy.build.c8e41c9c28'))
  );
}

/** Names worlds recorded before the strategy became the club's direction (→ECON-22). */
const RENAMED: Record<string, string> = {
  [sourceMessage('copy.build.1746bb30e7')]: sourceMessage('copy.build.c8e41c9c28'),
  [sourceMessage('copy.build.e6cf2fdc9b')]: sourceMessage('copy.build.017848335b'),
};
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
  return sourceMessage('copy.build.018abc891d', { p0: buildTitleName(title) });
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
