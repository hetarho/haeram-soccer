import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeRgbPng } from './png.mjs';
import { SCENE_HEIGHT, SCENE_WIDTH, largeStadiumScenes } from './source.mjs';

type Asset = {
  era: string;
  kind: string;
  stage: number;
  file: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  source: string;
  sourceBytes: number;
  sourceSha256: string;
};

const generation = JSON.parse(
  readFileSync(new URL('./generation.json', import.meta.url), 'utf8'),
) as { assets: Asset[] };
const publicRoot = new URL('../../../public/', import.meta.url);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const scenes = largeStadiumScenes();

function assetFor(era: string, kind: string, stage: number): Asset {
  const asset = generation.assets.find(
    (entry) => entry.era === era && entry.kind === kind && entry.stage === stage,
  );
  if (!asset) throw new Error(`No record for ${era} ${kind} ${stage}`);
  return asset;
}

describe('large stadium and locker-room pixel scenes', () => {
  it('renders the twelve stage 9 and 10 scenes deterministically at the scene grid', () => {
    const again = largeStadiumScenes();
    expect(scenes).toHaveLength(12);
    for (const [index, scene] of scenes.entries()) {
      expect(scene.rgb.length).toBe(SCENE_WIDTH * SCENE_HEIGHT * 3);
      expect(sha(scene.rgb)).toBe(sha(again[index]!.rgb));
    }
    expect(new Set(scenes.map((scene) => sha(scene.rgb))).size).toBe(12);
  });

  it('keeps every source PNG decodable and identical to its generator output', () => {
    expect(generation.assets).toHaveLength(12);
    for (const scene of scenes) {
      const asset = assetFor(scene.era, scene.kind, scene.stage);
      const png = readFileSync(new URL(`./${asset.source}`, import.meta.url));
      expect(png.length).toBe(asset.sourceBytes);
      expect(sha(png)).toBe(asset.sourceSha256);
      const decoded = decodeRgbPng(png);
      expect([decoded.width, decoded.height]).toEqual([SCENE_WIDTH, SCENE_HEIGHT]);
      expect(Buffer.from(decoded.rgb).equals(Buffer.from(scene.rgb))).toBe(true);
    }
  });

  it('deploys lossless 240×80 WebP files into the existing era and stage slots', () => {
    const shipped = JSON.parse(
      readFileSync(new URL('../../../public/art/manifest.json', import.meta.url), 'utf8'),
    ) as { assets: { sha256: string }[] };
    const shippedHashes = new Set(shipped.assets.map((asset) => asset.sha256));
    const deployed = new Set<string>();
    for (const scene of scenes) {
      const asset = assetFor(scene.era, scene.kind, scene.stage);
      expect(asset.file).toBe(`/art/scenes/${scene.era}/${scene.kind}-${scene.stage}.webp`);
      expect([asset.width, asset.height]).toEqual([SCENE_WIDTH, SCENE_HEIGHT]);
      const body = readFileSync(new URL(`.${asset.file}`, publicRoot));
      expect(body.length).toBe(asset.bytes);
      expect(sha(body)).toBe(asset.sha256);
      expect(body.toString('ascii', 0, 4)).toBe('RIFF');
      expect(body.toString('ascii', 8, 16)).toBe('WEBPVP8L');
      // Lossless VP8L stores the real width and height minus one in its packed header.
      expect(body[20]).toBe(0x2f);
      const dimensions = body.readUInt32LE(21);
      expect((dimensions & 0x3fff) + 1).toBe(SCENE_WIDTH);
      expect(((dimensions >>> 14) & 0x3fff) + 1).toBe(SCENE_HEIGHT);
      deployed.add(asset.sha256);
      expect(shippedHashes.has(asset.sha256)).toBe(false);
    }
    expect(deployed.size).toBe(12);
  });
});
