import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export const FACILITY_ENCODING = Object.freeze({
  width: 960,
  height: 320,
  smallWidth: 480,
  smallHeight: 160,
  quality: 80,
  smallQuality: 78,
  maxBytes: 180_000,
  smallMaxBytes: 55_000,
});
const { width: WIDTH, height: HEIGHT } = FACILITY_ENCODING;

/** Shared deployment geometry and source validation for generated facility packs. */
export async function encodeFacilityPanorama(
  source,
  output,
  { quality = FACILITY_ENCODING.quality } = {},
) {
  const { stdout } = await execute('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    source,
  ]);
  const { width, height } = JSON.parse(stdout).streams[0];
  if (Math.abs(width / height - WIDTH / HEIGHT) > 0.015)
    throw new Error(`Expected a panoramic 3:1 source: ${width}x${height}`);
  await mkdir(dirname(output), { recursive: true });
  await execute('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-vf',
    `scale=${WIDTH}:${HEIGHT}`,
    '-c:v',
    'libwebp',
    '-quality',
    String(Math.min(quality, FACILITY_ENCODING.quality)),
    '-compression_level',
    '6',
    '-frames:v',
    '1',
    '-threads',
    '1',
    output,
  ]);
  const content = await readFile(output);
  const smallPath = output.replace(/\.webp$/, '.small.webp');
  await execute('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    source,
    '-vf',
    `scale=${FACILITY_ENCODING.smallWidth}:${FACILITY_ENCODING.smallHeight}`,
    '-c:v',
    'libwebp',
    '-quality',
    String(FACILITY_ENCODING.smallQuality),
    '-compression_level',
    '6',
    '-threads',
    '1',
    smallPath,
  ]);
  const small = await readFile(smallPath);
  if (content.length > FACILITY_ENCODING.maxBytes || small.length > FACILITY_ENCODING.smallMaxBytes)
    throw new Error(`Encoded facility exceeds deployment budget: ${output}`);
  return {
    width: WIDTH,
    height: HEIGHT,
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
    small: {
      width: FACILITY_ENCODING.smallWidth,
      height: FACILITY_ENCODING.smallHeight,
      bytes: small.length,
      sha256: createHash('sha256').update(small).digest('hex'),
    },
  };
}
