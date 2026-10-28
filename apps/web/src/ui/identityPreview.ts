import type {
  AppearanceSide,
  ClubIdentity,
  KitRole,
  KitWarning,
  MatchAppearance,
} from '../../../../packages/contracts/src/identity';
import { selectMatchKits } from '../../../../packages/engine/src/kit-selection';
import { FIGURE_POSE_CONFIG, gaitDistanceAt, poseAt } from './figurePose';
import { describeShirt } from './kitPainting';

/**
 * KIT-6–8, WEB-87: the club-design editor's pitch preview pairing (spec/ssot/KIT.md
 * §§4, 7). Pure: the opponents are fixed synthetic identities and the pairing comes from the shared
 * `selectMatchKits`, so no world, fixture, command, save, progression or score takes part.
 */

export const KIT_ROLE_LABELS: Readonly<Record<KitRole, string>> = {
  home: '홈',
  away: '어웨이',
  third: '세컨',
};

export type PreviewOpponent = 'light' | 'dark';
export type EditorKitRole = KitRole | 'goalkeeper';

/** The preview's set step: pace of top speed and the point of the gait cycle, legs furthest apart. */
export const PREVIEW_STEP = { pace: 1, cycle: 0.25 } as const;

/**
 * A still preview figure caught mid-step toward the ball (down-screen unless it is looking into the
 * pitch), so the legs clear the torso and the shorts and socks show (→WEB-87, KIT-3). It is one
 * drawn instant, never animated, so reduced motion draws it the same.
 */
export function previewPose(id: string, keeper: boolean, toBall: [number, number] = [0, 1]) {
  const speed = FIGURE_POSE_CONFIG.topSpeed * PREVIEW_STEP.pace;
  const length = Math.hypot(toBall[0], toBall[1]) || 1;
  const velocity: [number, number] = [(toBall[0] / length) * speed, (toBall[1] / length) * speed];
  return poseAt(
    {
      id,
      keeper,
      time: 0,
      position: [0, 0],
      speed,
      velocity,
      velocityBefore: velocity,
      toBall,
      ballHeight: 0,
      carrier: false,
      distance: gaitDistanceAt(id, PREVIEW_STEP.cycle),
    },
    undefined,
    { reducedMotion: false },
  );
}
/** The own side in the preview, never a club of any world. */
const OWN = { id: 'preview:own', label: '우리 팀' } as const;

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
/**
 * WEB-87: one light and one dark example opponent, clearly a preview. All three of a side's shirts
 * keep its tone, so the automatic choice cannot turn the light example dark or the dark one light.
 */
export const PREVIEW_OPPONENTS: Readonly<
  Record<PreviewOpponent, { id: string; label: string; identity: ClubIdentity }>
> = frozen({
  light: {
    id: 'preview:light',
    label: '밝은 상대 예시',
    identity: {
      version: 1,
      colours: ['#ffffff', '#1f4fd1'],
      crest: {
        shape: 'round',
        pattern: 'plain',
        emblem: 'star',
        primary: '#ffffff',
        secondary: '#1f4fd1',
      },
      kits: {
        home: { pattern: 'plain', primary: '#ffffff', trim: '#1f4fd1' },
        away: { pattern: 'hoops', primary: '#f3e3c3', secondary: '#ffffff' },
        third: { pattern: 'stripes', primary: '#ffffff', secondary: '#8ecae6' },
      },
    },
  },
  dark: {
    id: 'preview:dark',
    label: '어두운 상대 예시',
    identity: {
      version: 1,
      colours: ['#121212', '#f77f00'],
      crest: {
        shape: 'shield',
        pattern: 'halves',
        emblem: 'bolt',
        primary: '#121212',
        secondary: '#f77f00',
      },
      kits: {
        home: { pattern: 'plain', primary: '#121212', trim: '#f77f00' },
        away: { pattern: 'stripes', primary: '#0b1f44', secondary: '#121212' },
        third: { pattern: 'plain', primary: '#121212', trim: '#a7b0ba' },
      },
    },
  },
});

export interface EditorPreview {
  appearance: MatchAppearance;
  /** Home side's label, then the away side's. */
  labels: [string, string];
  /** Which side the own club plays. */
  ownSide: 0 | 1;
}

/**
 * The own club wearing exactly the chosen shirt against an example opponent. The home shirt plays at
 * home; the away and third shirts are worn away, so the own club is then the away side (index 1)
 * with its label, crest and keeper, not a relabelled home side. The opponent takes its clearest
 * saved shirt against it, as in a real fixture.
 */
export function editorPreviewAppearance(
  own: ClubIdentity,
  selected: EditorKitRole,
  opponent: PreviewOpponent,
): EditorPreview {
  const role = selected === 'goalkeeper' ? 'home' : selected;
  const other = PREVIEW_OPPONENTS[opponent];
  const ownSide: 0 | 1 = role === 'home' ? 0 : 1;
  const clubs = ownSide === 0 ? [OWN, other] : [other, OWN];
  const identities = ownSide === 0 ? [own, other.identity] : [other.identity, own];
  const kits = selectMatchKits(identities[0], identities[1], { side: ownSide, role });
  const side = (i: 0 | 1): AppearanceSide => ({
    club: clubs[i].id,
    crest: { ...identities[i].crest },
    role: kits.roles[i],
    shirt: kits.shirts[i],
    goalkeeper: kits.goalkeepers[i],
    shorts: kits.kits[i].shorts,
    socks: kits.kits[i].socks,
    keeper: kits.keepers[i],
    ...(kits.keeperFallback[i] ? { keeperFallback: true as const } : {}),
  });
  return {
    appearance: { version: 2, sides: [side(0), side(1)], warnings: kits.warnings },
    labels: [clubs[0].label, clubs[1].label],
    ownSide,
  };
}

const WARNING_TEXT: Readonly<Record<KitWarning, string>> = {
  teams: '두 팀 유니폼이 비슷해 구분하기 어려워요.',
  grass: '잔디와 비슷한 색의 유니폼이 있어요.',
  goalkeepers: '골키퍼 색을 충분히 구분하지 못했어요.',
};
/**
 * The preview's caption, one line each: what it is, both sides' shirts, the worn keepers and
 * every warning (or that there is none). The pitch's accessible description is the same text.
 */
export function previewLines(appearance: MatchAppearance, labels: [string, string]): string[] {
  const [home, away] = appearance.sides;
  const shirt = (side: AppearanceSide, label: string, venue: string) =>
    `${venue} ${label}: ${KIT_ROLE_LABELS[side.role]} 유니폼 (${describeShirt(side.shirt)})`;
  const keeper = (side: AppearanceSide, i: number) => {
    const design = side.keeper?.shirt ?? { pattern: 'plain' as const, primary: side.goalkeeper };
    return `${labels[i]} ${describeShirt(design)}${side.keeperFallback ? ' (이번 경기 자동 대체)' : ''}`;
  };
  return [
    '미리보기 · 실제 경기가 아닌 예시 배치예요.',
    shirt(home, labels[0], '홈'),
    shirt(away, labels[1], '원정'),
    `골키퍼 착용: ${appearance.sides.map(keeper).join(' · ')}.`,
    ...(appearance.warnings.length
      ? appearance.warnings.map((warning) => `경고: ${WARNING_TEXT[warning]}`)
      : ['경고 없음: 두 팀과 골키퍼를 구분할 수 있어요.']),
  ];
}
