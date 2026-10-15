import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWorld, operate, progressFacilityWorks } from '../../../../packages/engine/src/index';
import { facilityScene, type FacilityScene } from './facilityScene';

const base = { year: 1950, round: 0, stadium: 0, trainingGround: 0 };

describe('facility artwork follows the current club', () => {
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
