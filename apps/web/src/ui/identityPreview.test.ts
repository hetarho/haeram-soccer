import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  KIT_ROLES,
  type ClubIdentity,
  type ShirtDesign,
} from '../../../../packages/contracts/src/identity';
import { matchAppearanceSchema } from '../../../../packages/contracts/src/identitySchema';
import { luminance } from '../../../../packages/engine/src/identity-legacy';
import { selectMatchKits } from '../../../../packages/engine/src/kit-selection';
import {
  editorPreviewAppearance,
  PREVIEW_OPPONENTS,
  previewLines,
  type PreviewOpponent,
} from './identityPreview';
import { createKitPainter, type KitDrawOptions } from './kitPainting';
import { markerRadius, paintKitPreview, PREVIEW_FORMATION } from './KitPitchPreview';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
/** An own draft with custom, mixed-case colours and three different shirts. */
const OWN: ClubIdentity = deepFreeze({
  version: 1,
  colours: ['#C9184A', '#FfFfFf'],
  crest: { shape: 'crown', pattern: 'sash', emblem: 'bird', primary: '#C9184A', accent: '#fcbf49' },
  kits: {
    home: { pattern: 'stripes', primary: '#C9184A', secondary: '#FfFfFf' },
    away: { pattern: 'sash', primary: '#1F4FD1', secondary: '#ffffff', trim: '#FCBF49' },
    third: { pattern: 'checks', primary: '#2B9348', secondary: '#121212' },
  },
} satisfies ClubIdentity);
const SNAPSHOT = structuredClone(OWN);
const OPPONENTS = Object.keys(PREVIEW_OPPONENTS) as PreviewOpponent[];

describe('editor pitch preview pairing (→KIT-6/7/8, WEB-87)', () => {
  it('wears exactly the selected own shirt and its custom colours on the right side', () => {
    for (const role of KIT_ROLES)
      for (const opponent of OPPONENTS) {
        const { appearance, labels, ownSide } = editorPreviewAppearance(OWN, role, opponent);
        expect(matchAppearanceSchema.parse(appearance)).toEqual(appearance);
        const own = appearance.sides[ownSide];
        const other = appearance.sides[1 - ownSide];
        expect(own).toEqual({
          club: 'preview:own',
          crest: OWN.crest,
          role,
          shirt: OWN.kits[role],
          goalkeeper: own.goalkeeper,
        });
        expect(own.shirt).not.toBe(OWN.kits[role]);
        expect(other.club).toBe(PREVIEW_OPPONENTS[opponent].id);
        expect(other.crest).toEqual(PREVIEW_OPPONENTS[opponent].identity.crest);
        expect(Object.values(PREVIEW_OPPONENTS[opponent].identity.kits)).toContainEqual(
          other.shirt,
        );
        expect(labels[ownSide]).toBe('우리 팀');
        expect(labels[1 - ownSide]).toBe(PREVIEW_OPPONENTS[opponent].label);
      }
    expect(OWN).toEqual(SNAPSHOT);
  });

  it('plays the away and third shirts as the away side, not a relabelled home side', () => {
    expect(editorPreviewAppearance(OWN, 'home', 'light').ownSide).toBe(0);
    for (const role of ['away', 'third'] as const) {
      const { appearance, labels, ownSide } = editorPreviewAppearance(OWN, role, 'dark');
      expect(ownSide).toBe(1);
      expect(appearance.sides.map((side) => side.club)).toEqual(['preview:dark', 'preview:own']);
      expect(labels).toEqual(['어두운 상대 예시', '우리 팀']);
      expect(appearance.sides[1].shirt).toEqual(OWN.kits[role]);
      expect(appearance.sides[0].shirt).not.toEqual(OWN.kits[role]);
    }
  });

  it('takes the shirts, keepers and warnings from the shared selector with the own role forced', () => {
    for (const role of KIT_ROLES)
      for (const opponent of OPPONENTS) {
        const { appearance, ownSide } = editorPreviewAppearance(OWN, role, opponent);
        const other = PREVIEW_OPPONENTS[opponent].identity;
        const [home, away] = ownSide === 0 ? [OWN, other] : [other, OWN];
        const expected = selectMatchKits(home, away, { side: ownSide, role });
        expect(appearance.sides.map((side) => side.role)).toEqual(expected.roles);
        expect(appearance.sides.map((side) => side.shirt)).toEqual(expected.shirts);
        expect(appearance.sides.map((side) => side.goalkeeper)).toEqual(expected.goalkeepers);
        expect(appearance.warnings).toEqual(expected.warnings);
        // The keepers stand apart from each other and from both outfield shirts.
        expect(appearance.sides[0].goalkeeper).not.toBe(appearance.sides[1].goalkeeper);
      }
  });

  it('gives independent, readable light and dark examples and shows a real clash', () => {
    const light = editorPreviewAppearance(OWN, 'home', 'light');
    const dark = editorPreviewAppearance(OWN, 'home', 'dark');
    const tone = (shirt: ShirtDesign) => luminance(shirt.primary);
    expect(tone(light.appearance.sides[1].shirt)).toBeGreaterThan(0.6);
    expect(tone(dark.appearance.sides[1].shirt)).toBeLessThan(0.05);
    // A red-and-white home shirt reads against both examples and the grass.
    expect(light.appearance.warnings).toEqual([]);
    expect(dark.appearance.warnings).toEqual([]);
    // Every example shirt is a fixed light or dark design, whatever the own shirt.
    for (const shirt of Object.values(PREVIEW_OPPONENTS.light.identity.kits))
      expect(tone(shirt)).toBeGreaterThan(0.6);
    for (const shirt of Object.values(PREVIEW_OPPONENTS.dark.identity.kits))
      expect(tone(shirt)).toBeLessThan(0.05);
    // Previews share nothing: writing one changes neither the other nor the examples.
    light.appearance.sides[1].shirt.primary = '#000000';
    light.appearance.sides[0].crest.primary = '#000000';
    expect(editorPreviewAppearance(OWN, 'home', 'dark')).toEqual(dark);
    expect(
      editorPreviewAppearance(OWN, 'home', 'light').appearance.sides[1].shirt.primary,
    ).not.toBe('#000000');
    expect(Object.isFrozen(PREVIEW_OPPONENTS.light.identity.kits.home)).toBe(true);
    expect(OWN).toEqual(SNAPSHOT);
    // A white own shirt against the light example is warned about, never repainted.
    const white: ClubIdentity = {
      ...OWN,
      kits: { ...OWN.kits, home: { pattern: 'plain', primary: '#ffffff' } },
    };
    const clash = editorPreviewAppearance(white, 'home', 'light');
    expect(clash.appearance.warnings).toContain('teams');
    expect(clash.appearance.sides[0].shirt).toEqual({ pattern: 'plain', primary: '#ffffff' });
    expect(editorPreviewAppearance(white, 'home', 'dark').appearance.warnings).not.toContain(
      'teams',
    );
  });

  it('describes both sides, the automatic keepers and every warning without a score', () => {
    const { appearance, labels } = editorPreviewAppearance(OWN, 'away', 'light');
    const lines = previewLines(appearance, labels);
    expect(lines[0]).toBe('미리보기 · 실제 경기가 아닌 예시 배치예요.');
    expect(lines[1]).toMatch(/^홈 밝은 상대 예시: (홈|원정|서드) 유니폼 \(/);
    expect(lines[2]).toBe(
      '원정 우리 팀: 원정 유니폼 (대각선 띠, 주색 #1F4FD1, 보조색 #ffffff, 테두리 #FCBF49)',
    );
    expect(lines[3]).toBe(
      `골키퍼는 자동으로 골라요: 밝은 상대 예시 ${appearance.sides[0].goalkeeper}, 우리 팀 ${appearance.sides[1].goalkeeper}.`,
    );
    // The blue-and-white away shirt is close to the light example: the caption says so.
    expect(appearance.warnings).toEqual(['teams']);
    expect(lines.slice(4)).toEqual(['경고: 두 팀 유니폼이 비슷해 구분하기 어려워요.']);
    // A clear pairing says there is nothing to warn about.
    const clear = editorPreviewAppearance(OWN, 'home', 'light');
    const clearLines = previewLines(clear.appearance, clear.labels);
    expect(clearLines.slice(4)).toEqual(['경고 없음: 두 팀과 골키퍼를 구분할 수 있어요.']);
    for (const line of [...lines, ...clearLines])
      expect(line).not.toMatch(/\d+\s*[–:-]\s*\d+|득점|스코어|승리/);
  });
});

describe('preview pitch drawing', () => {
  /** A 2D target that accepts the ground's calls and records nothing. */
  const surface = () =>
    new Proxy({} as Record<string, unknown>, {
      get: (target, key) => (typeof key === 'string' && key in target ? target[key] : () => {}),
      set: (target, key, value) => ((target[key as string] = value), true),
    }) as unknown as CanvasRenderingContext2D;

  it('draws both sides and their keepers through the painter at the live marker scale', () => {
    const { appearance } = editorPreviewAppearance(OWN, 'third', 'dark');
    for (const width of [360, 800]) {
      const height = width / 1.9;
      const calls: {
        shirt: ShirtDesign;
        x: number;
        y: number;
        radius: number;
        options?: KitDrawOptions;
      }[] = [];
      paintKitPreview(
        surface(),
        { draw: (_, shirt, x, y, radius, options) => calls.push({ shirt, x, y, radius, options }) },
        appearance,
        width,
        height,
        2,
        'Galmuri11',
      );
      expect(calls).toHaveLength(PREVIEW_FORMATION.length * 2);
      for (const [side, half] of [
        [0, calls.slice(0, 11)],
        [1, calls.slice(11)],
      ] as const) {
        const { shirt, goalkeeper } = appearance.sides[side];
        expect(half[0].shirt).toEqual({ pattern: 'plain', primary: goalkeeper });
        for (const call of half.slice(1)) expect(call.shirt).toBe(shirt);
        expect(half.map((call) => call.options?.number)).toEqual([
          1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
        ]);
        for (const call of half) {
          expect(call.radius).toBe(Math.max(6, width * 0.011));
          expect(call.options).toMatchObject({ dpr: 2, outline: '#ffffffcc' });
          expect(side === 0 ? call.x < width / 2 : call.x > width / 2).toBe(true);
        }
      }
      expect(calls[0].radius).toBe(markerRadius(width));
    }
  });

  it('paints every marker from one cached sprite per shirt, as the large samples do', () => {
    const { appearance } = editorPreviewAppearance(OWN, 'home', 'light');
    // Sprite surfaces that accept any painting, standing in for offscreen canvases.
    const blank = () =>
      ({ width: 0, height: 0, getContext: () => surface() }) as unknown as HTMLCanvasElement;
    const painter = createKitPainter(blank);
    const target = surface();
    paintKitPreview(target, painter, appearance, 390, 390 / 1.9, 1, 'Galmuri11');
    // Two outfield shirts and two keepers: four sprites for twenty-two markers.
    expect(painter.size).toBe(4);
    paintKitPreview(target, painter, appearance, 390, 390 / 1.9, 1, 'Galmuri11');
    expect(painter.size).toBe(4);
  });

  it('uses no world, match simulation, command, storage or animation clock', () => {
    for (const file of ['./identityPreview.ts', './KitPitchPreview.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map(([, path]) => path);
      for (const path of imports)
        expect(path).toMatch(
          /^(react|\.\/(identityPreview|kitPainting|KitPitchPreview\.module\.css)|(\.\.\/){4}packages\/(contracts\/src\/identity|engine\/src\/kit-selection))$/,
        );
      expect(source).not.toMatch(
        /createWorld|simulateMatch|GameClient|command\(|localStorage|indexedDB|requestAnimationFrame|setInterval/,
      );
    }
  });
});
