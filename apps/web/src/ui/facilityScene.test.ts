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

const base = { year: 1950, round: 0, stadium: 0, trainingGround: 0, academyFacility: 0 };

describe('facility artwork follows the current club', () => {
  it('keeps the current Korean descriptions and resolves synthetic resources through the same service', () => {
    expect(facilityScene('stadium', base).alt).toBe('1950–60년대 구장 1단계 픽셀아트');
    expect(facilityScene('locker', base).alt).toBe('1950–60년대 구장 1단계 라커룸 픽셀아트');
    expect(facilityScene('training', base).alt).toBe('1950–60년대 기본 훈련장 픽셀아트');
    expect(facilityScene('academy', base).alt).toBe('1950–60년대 기본 유소년 시설 픽셀아트');
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
    for (const kind of ['stadium', 'locker', 'training', 'academy'] as const)
      expect(facilityScene(kind, w).era).toBe(era);
  });

  it('keeps old-save round-only calendars in the same displayed era', () => {
    expect(facilityScene('stadium', { ...base, year: 1969, round: 21 }).era).toBe('heritage');
    expect(facilityScene('stadium', { ...base, year: 1969, round: 22 }).era).toBe('terraces');
  });

  it('changes facility artwork only when the actual work completes', () => {
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
    w.academyFacility = 2;
    operate(w, { type: 'facility', part: 'stadium' });
    operate(w, { type: 'facility', part: 'training' });
    operate(w, { type: 'facility', part: 'academy' });
    expect(w.facilityWorks?.stadium?.to).toBe(2);
    expect(facilityScene('stadium', w).src).toBe('/art/scenes/heritage/stadium-1.webp');
    expect(facilityScene('locker', w).src).toBe('/art/scenes/heritage/locker-1.webp');
    expect(facilityScene('training', w).src).toBe('/art/scenes/heritage/training-2.webp');
    expect(w.facilityWorks?.academy?.to).toBe(3);
    expect(facilityScene('academy', w).src).toBe('/art/scenes/heritage/academy-2.webp');
    w.facilityWorks!.stadium!.day -= 540;
    w.facilityWorks!.training!.day -= 90;
    w.facilityWorks!.academy!.day -= 90;
    progressFacilityWorks(w);
    expect(facilityScene('stadium', w).src).toBe('/art/scenes/heritage/stadium-2.webp');
    expect(facilityScene('locker', w).src).toBe('/art/scenes/heritage/locker-2.webp');
    expect(facilityScene('training', w).src).toBe('/art/scenes/heritage/training-3.webp');
    expect(facilityScene('academy', w).src).toBe('/art/scenes/heritage/academy-3.webp');
    expect(facilityScene('academy', w).alt).toContain('3단계 유소년 시설');
  });

  it('bounds scene lookups to available completed stages', () => {
    expect(facilityScene('stadium', { ...base, stadium: -1 }).stage).toBe(0);
    expect(facilityScene('locker', { ...base, stadium: 99 }).stage).toBe(8);
    expect(facilityScene('training', { ...base, trainingGround: 99 }).stage).toBe(5);
    expect(facilityScene('academy', { ...base, academyFacility: -1 }).stage).toBe(0);
    expect(facilityScene('academy', { ...base, academyFacility: 99 }).stage).toBe(5);
    expect(facilityScene('academy', { ...base, academyFacility: 2.9 }).stage).toBe(2);
    expect(facilityScene('academy', { ...base, academyFacility: NaN }).stage).toBe(0);
  });

  it.each([
    ['manager', 'manager-office-v2.webp', '감독실'],
    ['staff', 'staff-office-v2.webp', '스태프 사무실'],
  ] as const)(
    'keeps the %s overview independent of era and facility upgrades',
    (kind, file, label) => {
      const expected = `/art/scenes/${file}`;
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
          expect(scene.alt).toContain(label);
        }
      }
      const body = readFileSync(new URL(`../../public${expected}`, import.meta.url));
      expect(body.toString('ascii', 0, 4)).toBe('RIFF');
      expect(body.toString('ascii', 8, 12)).toBe('WEBP');
    },
  );

  it('ships eighteen distinct academy scenes and two offices on the existing coarse grid', () => {
    type Asset = {
      file: string;
      width: number;
      height: number;
      bytes: number;
      sha256: string;
      era?: string;
      stage?: number;
    };
    const academy = json('../../public/art/academy-manifest.json') as { assets: Asset[] };
    const offices = json('../../public/art/office-manifest.json') as { assets: Asset[] };
    expect(academy.assets).toHaveLength(18);
    expect(offices.assets).toHaveLength(2);
    for (const [year, era] of [
      [1950, 'heritage'],
      [1980, 'terraces'],
      [2020, 'contemporary'],
    ] as const) {
      for (let stage = 0; stage <= 5; stage++) {
        const scene = facilityScene('academy', { ...base, year, academyFacility: stage });
        expect(scene.stage).toBe(stage);
        expect(scene.src).toBe(`/art/scenes/${era}/academy-${stage}.webp`);
        expect(academy.assets).toContainEqual(
          expect.objectContaining({ era, stage, file: scene.src, width: 240, height: 80 }),
        );
      }
    }
    const hashes = new Set<string>();
    for (const asset of [...academy.assets, ...offices.assets]) {
      const body = readFileSync(new URL(`../../public${asset.file}`, import.meta.url));
      expect(body.length).toBe(asset.bytes);
      const hash = createHash('sha256').update(body).digest('hex');
      expect(hash).toBe(asset.sha256);
      hashes.add(hash);
      expect(body.toString('ascii', 0, 4)).toBe('RIFF');
      expect(body.toString('ascii', 8, 16)).toBe('WEBPVP8L');
      // RGB lossless WebP stores the real pixel dimensions in its packed VP8L header.
      expect(body[20]).toBe(0x2f);
      const dimensions = body.readUInt32LE(21);
      expect((dimensions & 0x3fff) + 1).toBe(240);
      expect(((dimensions >>> 14) & 0x3fff) + 1).toBe(80);
    }
    expect(hashes.size).toBe(20);
  });

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
