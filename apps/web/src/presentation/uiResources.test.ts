import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import registry from '../../public/presentation/themes/index.json';
import pixelData from '../../public/presentation/themes/pixel.json';
import { validateThemePack } from './contracts';
import { collectThemeImageResources, createThemeResolver, selectFacilityImage } from './theme';

const publicRoot = new URL('../../public/', import.meta.url);
const asset = (url: string) => readFileSync(new URL(`.${url}`, publicRoot));

describe('portable presentation skins and delivery budgets', () => {
  it.each(registry.entries)(
    'validates $id UI metadata, nine-slice insets and compact deployment sizes',
    (entry) => {
      const url = `/presentation/themes/${entry.resource}`;
      const pack = validateThemePack(JSON.parse(asset(url).toString()));
      const theme = createThemeResolver(pack, { url });
      expect(Object.keys(theme.uiImages).length).toBeGreaterThan(25);
      let total = 0;
      for (const [role, image] of Object.entries(theme.uiImages)) {
        const data = asset(image.resource);
        total += data.length;
        expect(image.width * image.height, `${role} decoded pixels`).toBeLessThanOrEqual(160_000);
        if (image.mode === 'tile') {
          expect(image.width, role).toBeLessThanOrEqual(256);
          expect(image.height, role).toBeLessThanOrEqual(256);
        }
        expect(data.length, role).toBeLessThan(
          image.resource.includes('sidebar-') ? 65_000 : 35_000,
        );
        expect(theme.token(role)).toBe(`url(${JSON.stringify(image.resource)})`);
        if (image.mode === 'nine-slice') {
          expect(image.slice! * 2).toBeLessThan(Math.min(image.width, image.height));
          expect(image.width).toBeLessThanOrEqual(192);
          expect(theme.token(`${role}-slice`)).toBe(String(image.slice));
        }
      }
      // Room for the result-badge frames (three 8–9 KB nine-slices) beside the home set.
      expect(total).toBeLessThan(330_000);
      expect(theme.tokens['image-rendering']).toBe(pack.tokens.imageTreatment.imageRendering);
    },
  );

  it('rejects malformed native geometry and external UI resources', () => {
    const pack = validateThemePack(pixelData);
    const frame = pack.images.ui!['image-art-frame-button'];
    frame.slice = frame.width;
    expect(() => validateThemePack(pack)).toThrow('Invalid nine-slice insets');
    frame.slice = 16;
    frame.resource = 'https://example.com/frame.png';
    expect(() => validateThemePack(pack)).toThrow();
  });

  it('preserves resource-only packs without optional UI skins', () => {
    const pack = validateThemePack(pixelData);
    delete pack.images.ui;
    delete pack.tokens.ui;
    delete pack.images.facility.variants;
    const theme = createThemeResolver(pack, { url: '/packs/new/theme.json' });
    expect(theme.uiImages).toEqual({});
    expect(theme.facility({ era: 'heritage', kind: 'stadium', stage: 0 }).variants).toEqual([]);
  });

  it.each(registry.entries.filter((entry) => entry.id !== 'pixel'))(
    'keeps $id scenes responsive, distinct and within transfer budgets',
    (entry) => {
      const url = `/presentation/themes/${entry.resource}`;
      const pack = validateThemePack(JSON.parse(asset(url).toString()));
      const theme = createThemeResolver(pack, { url });
      for (const era of ['heritage', 'terraces', 'contemporary'] as const) {
        for (const kind of [
          'stadium',
          'locker',
          'training',
          'academy',
          'manager',
          'staff',
        ] as const) {
          const scene = theme.facility({ era, kind, stage: 0 });
          expect(scene.variants.map((variant) => variant.width)).toEqual([480, 960]);
          for (const variant of scene.variants) {
            expect(variant.width / variant.height).toBe(3);
            expect(statSync(new URL(`.${variant.src}`, publicRoot)).size).toBeLessThan(
              variant.width === 480 ? 55_000 : 180_000,
            );
          }
          expect(selectFacilityImage(scene, 360).src).toBe(scene.variants[0].src);
          expect(selectFacilityImage(scene, 780).src).toBe(scene.src);
          expect(selectFacilityImage(scene, 2400).src).toBe(scene.src);
          expect(
            collectThemeImageResources(theme, [
              { type: 'facility', era, kind, stage: 0, width: 360 },
            ]),
          ).toEqual([scene.variants[0].src]);
        }
      }
    },
  );
});
