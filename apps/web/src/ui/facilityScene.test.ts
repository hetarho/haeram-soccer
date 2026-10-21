import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWorld, operate, progressFacilityWorks } from '../../../../packages/engine/src/index';
import { facilityScene as resolveFacilityScene, type FacilityScene } from './facilityScene';
import { createLoadedLocale } from '../presentation/locale';
import { createThemeResolver } from '../presentation/theme';
import { validateRegistry } from '../presentation/registry';

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const localeRegistry = validateRegistry(
  json('../../public/presentation/locales/index.json'),
  'locale',
);
const localePack = json('../../public/presentation/locales/ko-KR.json');
const themePack = json('../../public/presentation/themes/pixel.json');
const presentation = {
  locale: createLoadedLocale(localeRegistry, localePack),
  theme: createThemeResolver(themePack, { url: '/presentation/themes/pixel.json' }),
  themeLabel: '픽셀아트',
};
const facilityScene = (kind: FacilityScene, world: Parameters<typeof resolveFacilityScene>[1]) =>
  resolveFacilityScene(kind, world, presentation);

const base = { year: 1950, round: 0, stadium: 0, trainingGround: 0 };

describe('facility artwork follows the current club', () => {
  it('keeps the current Korean descriptions and resolves synthetic resources through the same service', () => {
    expect(facilityScene('stadium', base).alt).toBe('1950–60년대 구장 1단계 픽셀아트');
    expect(facilityScene('locker', base).alt).toBe('1950–60년대 구장 1단계 라커룸 픽셀아트');
    expect(facilityScene('training', base).alt).toBe('1950–60년대 기본 훈련장 픽셀아트');
    const theme = createThemeResolver(
      {
        ...themePack,
        id: 'unseen-theme',
        images: {
          facility: { pattern: './unseen/{kind}/{era}/{stage}.webp' },
        },
      },
      { url: '/presentation/themes/unseen.json' },
    );
    const scene = resolveFacilityScene('stadium', base, {
      ...presentation,
      theme,
      themeLabel: 'Synthetic art',
    });
    expect(scene.src).toBe('/presentation/themes/unseen/stadium/heritage/0.webp');
    expect(scene.alt).toBe('1950–60년대 구장 1단계 Synthetic art');
  });
  it.each([
    [1969, 152, 'heritage'],
    [1969, 153, 'terraces'],
    [1999, 152, 'terraces'],
    [1999, 153, 'contemporary'],
    [2350, 0, 'contemporary'],
  ])('uses calendar year at season %i day %i', (year, day, era) => {
    const w = { ...base, year, calendar: { day } };
    for (const kind of ['stadium', 'locker', 'training'] as const)
      expect(facilityScene(kind, w).era).toBe(era);
  });

  it('keeps old-save round-only calendars in the same displayed era', () => {
    expect(facilityScene('stadium', { ...base, year: 1969, round: 21 }).era).toBe('heritage');
    expect(facilityScene('stadium', { ...base, year: 1969, round: 22 }).era).toBe('terraces');
  });

  it('changes stadium and locker together only when a real rebuild completes', () => {
    const w = createWorld({
      country: 'ENG',
      name: 'Art Fixture',
      color: '#2e713d',
      seed: 'art-upgrades',
      level: 'easy',
    });
    w.cash = '999999999999';
    w.stadium = 1;
    w.trainingGround = 2;
    operate(w, { type: 'facility', part: 'stadium' });
    operate(w, { type: 'facility', part: 'training' });
    expect(w.facilityWorks?.stadium?.to).toBe(2);
    expect(facilityScene('stadium', w).src).toBe('/art/scenes/heritage/stadium-1.webp');
    expect(facilityScene('locker', w).src).toBe('/art/scenes/heritage/locker-1.webp');
    expect(facilityScene('training', w).src).toBe('/art/scenes/heritage/training-2.webp');
    w.facilityWorks!.stadium!.day -= 540;
    w.facilityWorks!.training!.day -= 90;
    progressFacilityWorks(w);
    expect(facilityScene('stadium', w).src).toBe('/art/scenes/heritage/stadium-2.webp');
    expect(facilityScene('locker', w).src).toBe('/art/scenes/heritage/locker-2.webp');
    expect(facilityScene('training', w).src).toBe('/art/scenes/heritage/training-3.webp');
  });

  it('bounds scene lookups to available completed stages', () => {
    expect(facilityScene('stadium', { ...base, stadium: -1 }).stage).toBe(0);
    expect(facilityScene('locker', { ...base, stadium: 99 }).stage).toBe(8);
    expect(facilityScene('training', { ...base, trainingGround: 99 }).stage).toBe(5);
  });

  it.each(['manager', 'staff'] as const)(
    'keeps the %s room independent of era and facility upgrades',
    (kind) => {
      const expected = `/art/scenes/${kind}-office-v1.webp`;
      for (const year of [1950, 1980, 2020]) {
        for (const level of [0, 3, 8, 99]) {
          const scene = facilityScene(kind, {
            ...base,
            year,
            stadium: level,
            trainingGround: level,
          });
          expect(scene.stage).toBe(0);
          expect(scene.src).toBe(expected);
          expect(scene.alt).toContain(kind === 'manager' ? '감독실' : '스태프 사무실');
        }
      }
      const body = readFileSync(new URL(`../../public${expected}`, import.meta.url));
      expect(body.toString('ascii', 0, 4)).toBe('RIFF');
      expect(body.toString('ascii', 8, 12)).toBe('WEBP');
    },
  );

  it('ships distinct local WebP drawings for every valid era and facility stage', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../public/art/manifest.json', import.meta.url), 'utf8'),
    ) as {
      assets: { file: string; width: number; height: number }[];
    };
    expect(manifest.assets).toHaveLength(72);
    const hashes = new Set<string>();
    for (const year of [1950, 1980, 2020]) {
      for (const [kind, count] of [
        ['stadium', 9],
        ['locker', 9],
        ['training', 6],
      ] as const) {
        for (let stage = 0; stage < count; stage++) {
          const scene = facilityScene(kind as FacilityScene, {
            ...base,
            year,
            stadium: stage,
            trainingGround: stage,
          });
          expect(manifest.assets).toContainEqual(
            expect.objectContaining({ file: scene.src, width: 240, height: 80 }),
          );
          const body = readFileSync(new URL(`../../public${scene.src}`, import.meta.url));
          expect(body.toString('ascii', 0, 4)).toBe('RIFF');
          expect(body.toString('ascii', 8, 12)).toBe('WEBP');
          hashes.add(createHash('sha256').update(body).digest('hex'));
        }
      }
    }
    expect(hashes.size).toBe(72);
  });
});
