import { message as sourceMessage } from '../../contracts/src/messages';
import type { DirectionKey, ManagerStyle, World } from '../../contracts/src/types';
import { MANAGER_STYLES, STYLE_INFO } from './styles';

/**
 * The direction rows the staff follow (→ECON-25): 재계약 기조 (→CLUB-26), 선호 학파 and 감독 기조
 * (→STAFF-18), 코치 기조 (→STAFF-15), 육성 목표 and 데뷔 시점 (→CLUB-32). Each option is a named
 * choice like a dial step; the default keeps the club as it was before the rows existed, and is
 * never stored. A delegated person sets the rows of his work (`DELEGATE_CONTROLS`).
 */
export interface DirectionOption {
  id: string;
  name: string;
  /** What the option makes the staff do, in the owner's words. */
  summary: string;
}
export const DIRECTION_KEYS: readonly DirectionKey[] = [
  'recruitmentSupport',
  'renewal',
  'school',
  'manager',
  'coaches',
  'youthGoal',
  'debut',
];
/** Each row's default option: 표준, or any school. */
export const DIRECTION_DEFAULT: Readonly<Record<DirectionKey, string>> = {
  recruitmentSupport: 'balanced',
  renewal: 'standard',
  school: 'any',
  manager: 'standard',
  coaches: 'standard',
  youthGoal: 'standard',
  debut: 'standard',
};

export const DIRECTION_INFO: Readonly<
  Record<DirectionKey, { label: string; options: readonly DirectionOption[] }>
> = {
  recruitmentSupport: {
    label: sourceMessage('copy.direction.7395b71a41'),
    options: [
      {
        id: 'director',
        name: sourceMessage('copy.MediationReview.2841b94571'),
        summary: sourceMessage('copy.direction.5ba4847a57'),
      },
      {
        id: 'balanced',
        name: sourceMessage('copy.stories.634269a095'),
        summary: sourceMessage('copy.direction.c3ff005889'),
      },
      {
        id: 'manager',
        name: sourceMessage('copy.MediationReview.4d8060891b'),
        summary: sourceMessage('copy.direction.5bf528c57b'),
      },
    ],
  },
  renewal: {
    label: sourceMessage('copy.influences.ab3ba3b4eb'),
    options: [
      {
        id: 'standard',
        name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
        summary: sourceMessage('copy.direction.4447df3977'),
      },
      {
        id: 'keepAll',
        name: sourceMessage('copy.direction.39d77c1327'),
        summary: sourceMessage('copy.direction.1b722afbd8'),
      },
      {
        id: 'coreOnly',
        name: sourceMessage('copy.direction.fbe1bfad0c'),
        summary: sourceMessage('copy.direction.3bad2ff505'),
      },
      {
        id: 'frugal',
        name: sourceMessage('copy.direction.5ec703d9c6'),
        summary: sourceMessage('copy.direction.4e037fd22a'),
      },
      {
        id: 'youngFirst',
        name: sourceMessage('copy.direction.dcce9eb3c4'),
        summary: sourceMessage('copy.direction.fe69a88dc0'),
      },
    ],
  },
  school: {
    label: sourceMessage('copy.DecisionRuleFacts.6b8a766f44'),
    options: [
      {
        id: 'any',
        name: sourceMessage('copy.direction.64e37cabfc'),
        summary: sourceMessage('copy.direction.d4e568728a'),
      },
      ...MANAGER_STYLES.map((style) => ({
        id: style,
        name: STYLE_INFO[style].label,
        summary: sourceMessage('copy.direction.59fd1462ff', { p0: STYLE_INFO[style].label }),
      })),
    ],
  },
  manager: {
    label: sourceMessage('copy.direction.87d61d5f88'),
    options: [
      {
        id: 'standard',
        name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
        summary: sourceMessage('copy.direction.1d92ded78c'),
      },
      {
        id: 'developer',
        name: sourceMessage('copy.direction.3e586cc06a'),
        summary: sourceMessage('copy.direction.e520f136dd'),
      },
      {
        id: 'proven',
        name: sourceMessage('copy.direction.6d05effb8d'),
        summary: sourceMessage('copy.direction.5b82820c65'),
      },
      {
        id: 'young',
        name: sourceMessage('copy.direction.c12c54fe91'),
        summary: sourceMessage('copy.direction.ef2dcb9b46'),
      },
      {
        id: 'cheap',
        name: sourceMessage('copy.direction.2802c1a4c4'),
        summary: sourceMessage('copy.direction.2b21e9a778'),
      },
    ],
  },
  coaches: {
    label: sourceMessage('copy.direction.3f7683d5c9'),
    options: [
      {
        id: 'volunteer',
        name: sourceMessage('copy.direction.db7179aec9'),
        summary: sourceMessage('copy.direction.8c0ad72cbb'),
      },
      {
        id: 'cheap',
        name: sourceMessage('copy.direction.2802c1a4c4'),
        summary: sourceMessage('copy.direction.db729ea09d'),
      },
      {
        id: 'standard',
        name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
        summary: sourceMessage('copy.direction.785e3d67cd'),
      },
      {
        id: 'elite',
        name: sourceMessage('copy.direction.befcee018a'),
        summary: sourceMessage('copy.direction.f868e909cc'),
      },
    ],
  },
  youthGoal: {
    label: sourceMessage('copy.direction.1046577cf5'),
    options: [
      {
        id: 'standard',
        name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
        summary: sourceMessage('copy.direction.83a8df0ce9'),
      },
      {
        id: 'firstTeam',
        name: sourceMessage('copy.direction.d0529b70ec'),
        summary: sourceMessage('copy.direction.6008298fb5'),
      },
      {
        id: 'sell',
        name: sourceMessage('copy.direction.e0718f101a'),
        summary: sourceMessage('copy.direction.cf6c4e83e5'),
      },
      {
        id: 'minimal',
        name: sourceMessage('copy.direction.64068d31fd'),
        summary: sourceMessage('copy.direction.98b5b3c691'),
      },
    ],
  },
  debut: {
    label: sourceMessage('copy.direction.801589279c'),
    options: [
      {
        id: 'standard',
        name: sourceMessage('copy.ClubSettingControl.54af05f0bf'),
        summary: sourceMessage('copy.direction.5dfc0fb45a'),
      },
      {
        id: 'early',
        name: sourceMessage('copy.direction.d16c4195e9'),
        summary: sourceMessage('copy.direction.1f46cb6e29'),
      },
      {
        id: 'ready',
        name: sourceMessage('copy.direction.c4f7d2e2aa'),
        summary: sourceMessage('copy.direction.ec0d1d466b'),
      },
      {
        id: 'late',
        name: sourceMessage('copy.direction.f953561284'),
        summary: sourceMessage('copy.direction.129dd292d3'),
      },
    ],
  },
};

/**
 * When the delegated youth director calls a prospect ready (→CLUB-32): within `weakestMargin` of
 * the weakest first-teamer of his role or `startersMargin` of its starters' level (no margin to
 * the weakest when it is undefined), from `fromAge` at the earliest beside the promotion age.
 */
export function debutRule(w: Pick<World, 'direction'>) {
  switch (directionOf(w, 'debut')) {
    case 'early':
      return { weakestMargin: 3, startersMargin: 15, fromAge: 0, gap: 10, u21Growth: 1 };
    case 'ready':
      return { weakestMargin: undefined, startersMargin: 0, fromAge: 0, gap: 5, u21Growth: 1 };
    case 'late':
      return { weakestMargin: 0, startersMargin: 10, fromAge: 19, gap: 5, u21Growth: 1.15 };
    default:
      return { weakestMargin: 0, startersMargin: 10, fromAge: 0, gap: 5, u21Growth: 1 };
  }
}
/**
 * Whom the delegated youth director releases (→CLUB-32): from `age`, a prospect whose potential
 * is below the weakest first-teamer of his role or its starters' level; never before 21 under 1군
 * 공급.
 */
export function releaseRule(w: Pick<World, 'direction'>) {
  switch (directionOf(w, 'youthGoal')) {
    case 'firstTeam':
      return { age: Infinity, against: 'weakest' as const };
    case 'minimal':
      return { age: 18, against: 'starters' as const };
    default:
      return { age: 19, against: 'weakest' as const };
  }
}

/** The option in force for a row, its default when absent. */
export function directionOf(w: Pick<World, 'direction'>, key: DirectionKey): string {
  return w.direction?.[key] ?? DIRECTION_DEFAULT[key];
}
/** The option record in force for a row. */
export function directionOption(w: Pick<World, 'direction'>, key: DirectionKey) {
  const id = directionOf(w, key);
  return DIRECTION_INFO[key].options.find((option) => option.id === id)!;
}
/** The 선호 학파 in force, or undefined for any school. */
export function preferredSchool(w: Pick<World, 'direction'>): ManagerStyle | undefined {
  return w.direction?.school;
}
/** "감독 기조 육성가": a row and its option in force, for the staff's reports. */
export function directionLine(w: Pick<World, 'direction'>, key: DirectionKey) {
  return `${DIRECTION_INFO[key].label} ${directionOption(w, key).name}`;
}
