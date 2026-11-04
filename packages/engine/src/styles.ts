import { message as sourceMessage } from '../../contracts/src/messages';
import type { Manager, ManagerStyle, ManagerTrait, Tactic, World } from '../../contracts/src/types';
import { integer, random } from './primitives';
import { MANAGER_CAREER } from './coaching';

/** Everything a manager's school changes, as additions or multipliers (→STAFF-14). */
export interface StyleEffects {
  /** Percentage-point modifiers of our tactical profile. */
  pass: number;
  possession: number;
  shot: number;
  defense: number;
  /** Added to the tactic's defensive line (pass success taken off the opponent). */
  lineHigh: number;
  lineLow: number;
  /** In-match fatigue drain multiplier and fatigue added per match. */
  drain: number;
  fatigueCost: number;
  /** Squad strength points in every match. */
  strength: number;
  /** Morale baseline points; morale points a defeat costs less. */
  moraleBaseline: number;
  defeatCushion: number;
  /** Round growth multipliers: everyone, and players aged 21 or younger. */
  growth: number;
  youthGrowth: number;
  /** Chance a selling club accepts our bid (0–1). */
  bidAcceptance: number;
  /** Automatic selection favours players aged 21 or younger. */
  youthSelection: boolean;
}

export const NEUTRAL_STYLE: Readonly<StyleEffects> = Object.freeze({
  pass: 0,
  possession: 0,
  shot: 0,
  defense: 0,
  lineHigh: 0,
  lineLow: 0,
  drain: 1,
  fatigueCost: 0,
  strength: 0,
  moraleBaseline: 0,
  defeatCushion: 0,
  growth: 1,
  youthGrowth: 1,
  bidAcceptance: 0,
  youthSelection: false,
});

export const MANAGER_STYLES: readonly ManagerStyle[] = [
  'positional',
  'gegenpress',
  'counter',
  'organizer',
  'motivator',
  'developer',
  'firefighter',
  'headcoach',
];

/** Selection value a youth-minded manager adds to players aged 21 or younger (→STAFF-12). */
export const YOUTH_SELECTION_BONUS = 4;

type Band = readonly [number, number];
/**
 * Ranges a manager's attributes are drawn in: `peak` is the level he reaches (→STAFF-16), youth
 * speeds the growth of players under 27, flexibility and pride shape his answers to requests.
 */
export interface ManagerBands {
  peak: Band;
  youth: Band;
  flexibility: Band;
  pride: Band;
  ages: Band;
}
/** The whole market, for the founding manager and an interim, who belong to no school. */
export const MARKET_BANDS: Readonly<ManagerBands> = {
  peak: [45, 85],
  youth: [40, 90],
  flexibility: [15, 90],
  pride: [25, 95],
  ages: MANAGER_CAREER.ages,
};

export const STYLE_INFO: Record<
  ManagerStyle,
  {
    label: string;
    /** The school in one line, as football writers describe it. */
    school: string;
    /** Styles that only play one way set the manager's tactic. */
    tactic?: Tactic;
    effects: Partial<StyleEffects>;
    pros: string[];
    cons: string[];
    /** Contract length in seasons. */
    term: number;
    /** Where the school's candidates sit; peak and ages default to the whole market. */
    bands: Pick<ManagerBands, 'youth' | 'flexibility' | 'pride'> &
      Partial<Pick<ManagerBands, 'peak' | 'ages'>>;
    /** Selection habits the school never shows, mapped to the one it shows instead (null: none). */
    traits?: Partial<Record<ManagerTrait, ManagerTrait | null>>;
  }
> = {
  positional: {
    label: sourceMessage('copy.styles.3bb8d37eff'),
    school: sourceMessage('copy.styles.894f4fd681'),
    tactic: 'possession',
    effects: { pass: 2, possession: 2, shot: -0.5, lineHigh: 0.01 },
    pros: [
      sourceMessage('copy.styles.8a99fd3a0d'),
      sourceMessage('copy.styles.525ebd18c7'),
      sourceMessage('copy.styles.9fd3d33355'),
    ],
    cons: [sourceMessage('copy.styles.306b3ccced')],
    term: 3,
    bands: { youth: [50, 80], flexibility: [15, 45], pride: [60, 95] },
  },
  gegenpress: {
    label: sourceMessage('copy.styles.b85861b766'),
    school: sourceMessage('copy.styles.5bf114d193'),
    tactic: 'press',
    effects: { shot: 0.8, lineHigh: 0.03, drain: 1.1, fatigueCost: 1 },
    pros: [sourceMessage('copy.styles.3c7d7ebc77'), sourceMessage('copy.styles.c8b8b58210')],
    cons: [sourceMessage('copy.styles.89e788ec31'), sourceMessage('copy.styles.00b0273e39')],
    term: 3,
    bands: { youth: [55, 85], flexibility: [25, 55], pride: [45, 80], ages: [34, 58] },
    // A pressing side cannot keep one tired XI: the school rotates.
    traits: { stable: 'rotation' },
  },
  counter: {
    label: sourceMessage('copy.styles.ce57a4117c'),
    school: sourceMessage('copy.styles.afb2564459'),
    tactic: 'counter',
    effects: { defense: 1.2, possession: -2, shot: 0.3, lineLow: 0.015 },
    pros: [
      sourceMessage('copy.styles.b844856d1f'),
      sourceMessage('copy.styles.cb569a23a7'),
      sourceMessage('copy.styles.f8d9cddd17'),
    ],
    cons: [sourceMessage('copy.styles.1614c8a4e9')],
    term: 3,
    bands: { youth: [40, 65], flexibility: [45, 80], pride: [50, 90] },
  },
  organizer: {
    label: sourceMessage('copy.styles.b13b7bd7b6'),
    school: sourceMessage('copy.styles.ad0934ee5d'),
    tactic: 'balanced',
    effects: { defense: 1.8, shot: -0.8, lineLow: 0.01 },
    pros: [sourceMessage('copy.styles.703d82c1fc'), sourceMessage('copy.styles.dfba84930f')],
    cons: [sourceMessage('copy.styles.d9a59ace08')],
    term: 3,
    bands: { youth: [40, 65], flexibility: [25, 55], pride: [40, 75] },
  },
  motivator: {
    label: sourceMessage('copy.styles.891fe0e146'),
    school: sourceMessage('copy.styles.b31c7a2b42'),
    effects: { moraleBaseline: 6, defeatCushion: 2 },
    pros: [sourceMessage('copy.styles.70421de67b'), sourceMessage('copy.styles.0e01b40a03')],
    cons: [sourceMessage('copy.styles.9c7305ad37')],
    term: 3,
    bands: { youth: [45, 75], flexibility: [50, 85], pride: [35, 70] },
  },
  developer: {
    label: sourceMessage('copy.staff_info.c4a9093e6c'),
    school: sourceMessage('copy.styles.3c2e0268a8'),
    effects: { youthGrowth: 1.3, youthSelection: true },
    pros: [sourceMessage('copy.styles.1453c22594'), sourceMessage('copy.styles.ada9b46d54')],
    cons: [sourceMessage('copy.styles.a9ec6d575a', { p0: YOUTH_SELECTION_BONUS })],
    term: 3,
    bands: { youth: [70, 90], flexibility: [40, 75], pride: [25, 60] },
    // The school already selects young players, so the youth habit would add nothing.
    traits: { youth: null },
  },
  firefighter: {
    label: sourceMessage('copy.styles.280fb9f589'),
    school: sourceMessage('copy.styles.f4da258d48'),
    effects: { strength: 1.5, moraleBaseline: 3, growth: 0.85 },
    pros: [
      sourceMessage('copy.styles.1d65123980'),
      sourceMessage('copy.styles.87bc607505'),
      sourceMessage('copy.styles.a5bf7c0330'),
    ],
    cons: [sourceMessage('copy.styles.5d2645a4d0'), sourceMessage('copy.styles.a2d77f7a98')],
    term: 1,
    // A veteran crisis manager at or past his prime: what he shows is what he is.
    bands: {
      peak: [55, 85],
      youth: [35, 55],
      flexibility: [55, 90],
      pride: [45, 80],
      ages: [50, 64],
    },
    // A relegation fight is no time for youngsters: he keeps his best XI.
    traits: { youth: 'stable' },
  },
  headcoach: {
    label: sourceMessage('copy.styles.9639eba604'),
    school: sourceMessage('copy.styles.5caf1bd651'),
    effects: { bidAcceptance: 0.05, moraleBaseline: -2 },
    pros: [sourceMessage('copy.styles.80f5cc051c')],
    cons: [sourceMessage('copy.styles.3a3ef16722')],
    term: 3,
    bands: { youth: [50, 80], flexibility: [60, 90], pride: [25, 50], ages: [32, 48] },
  },
};

/** Morale added the day a firefighter takes over. */
export const FIREFIGHTER_ARRIVAL_MORALE = 10;

export function styleEffects(style: ManagerStyle | undefined): StyleEffects {
  return style ? { ...NEUTRAL_STYLE, ...STYLE_INFO[style].effects } : { ...NEUTRAL_STYLE };
}

export function managerStyleEffects(w: Pick<World, 'manager'>): StyleEffects {
  return styleEffects(w.manager.interim ? undefined : w.manager.style);
}

/**
 * Seasons the manager's school signs for; a one-season deal ends at the close unless renewed. The
 * founding all-rounder signs for three like most schools.
 */
export function managerTerm(m: Pick<Manager, 'style'>) {
  return m.style ? STYLE_INFO[m.style].term : 3;
}

/**
 * This season's four candidates show four different schools: a seeded order of all eight,
 * drawn from its own stream so the other candidate attributes stay put.
 */
export function candidateStyles(seed: string, year: number): ManagerStyle[] {
  const r = random(`${seed}:manager-style:${year}`);
  const order = [...MANAGER_STYLES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = integer(r, 0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
