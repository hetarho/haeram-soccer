import { createWorld } from '../../packages/engine/src/index';
/** Synthetic high-entropy names exercise the large-codec path; never century evidence. */
export function largeCodecWorld() {
  const world = createWorld({
    country: 'ENG',
    name: 'Codec fixture',
    color: '#224466',
    seed: 'large-codec',
    level: 'easy',
  });
  let state = 0x12345678;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < 12000; i++) {
    let name = '';
    for (let c = 0; c < 160; c++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      name += alphabet[(state >>> 0) % alphabet.length];
    }
    const id = `synthetic:codec:${i}`;
    world.people![id] = {
      id,
      name,
      born: 1900,
      position: 'GK',
      professionalism: 3,
      qualities: { understanding: 1, teaching: 2, judgement: 3 },
      playing: 'retired',
      employment: [],
      mentors: [],
    };
  }
  return world;
}
