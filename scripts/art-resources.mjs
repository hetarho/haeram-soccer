import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const WIDTH = 1440;
const HEIGHT = 480;

/** Shared deployment geometry and source validation for generated facility packs. */
export async function encodeFacilityPanorama(source, output, { quality = 85 } = {}) {
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
    String(quality),
    '-compression_level',
    '6',
    '-frames:v',
    '1',
    '-threads',
    '1',
    output,
  ]);
  const content = await readFile(output);
  return {
    width: WIDTH,
    height: HEIGHT,
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}
