import { describe, expect, it } from 'vitest';
import { GAMES_KEY, GameIndexStore, type GameEntry, type SlotSummary } from './games';

const memory = (games?: unknown) => {
  const data = new Map<string, string>();
  if (games !== undefined) data.set(GAMES_KEY, JSON.stringify(games));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
const entry = (id: string, crest: unknown): GameEntry => ({
  id,
  worldId: `world-${id}`,
  summary: {
    club: 'Crest Club',
    country: '잉글랜드',
    division: '아마추어 리그',
    date: '1950년 8월 1일',
    seasons: 1,
    crest: crest as SlotSummary['crest'],
  },
  playedAt: '2026-10-20T00:00:00.000Z',
  engine: '0.7.0',
});
/** A summary as every earlier build wrote it: two colours, both required. */
const twoColour = {
  shape: 'shield',
  pattern: 'stripes',
  primary: '#24664f',
  secondary: '#F3E3C3',
  emblem: 'ball',
};
const oneColour = { shape: 'round', pattern: 'plain', emblem: 'star', primary: '#6A0DAD' };
const threeColour = { ...twoColour, accent: '#fcbf49' };
const read = (slots: unknown[], active = 0) =>
  new GameIndexStore(memory({ v: 1, owner: { kind: 'device', id: 'd' }, active, slots })).read();

describe('slot summaries with one to three crest colours (→WEB-62, SAVE-14)', () => {
  it('reads existing two-colour summaries and new one- and three-colour ones as written', () => {
    const slots = [entry('a', twoColour), entry('b', oneColour), entry('c', threeColour)];
    const index = read(slots, 1);
    expect(index.slots).toEqual(slots);
    expect(index.active).toBe(1);
    expect(index.slots[1]!.summary.crest).not.toHaveProperty('secondary');
    expect(index.slots[1]!.summary.crest).not.toHaveProperty('accent');
    expect(index.slots[2]!.summary.crest.accent).toBe('#fcbf49');
    // Stored spelling survives a write and read.
    const store = new GameIndexStore(memory());
    store.write({ ...index, owner: store.read().owner });
    expect(store.read().slots).toEqual(slots);
  });

  it.each([
    ['a missing primary', { ...oneColour, primary: undefined }],
    ['a named colour', { ...twoColour, secondary: 'white' }],
    ['a non-string accent', { ...threeColour, accent: 7 }],
    ['an executable accent', { ...threeColour, accent: 'url(#x)' }],
    ['alpha in the primary', { ...oneColour, primary: '#6a0dadff' }],
    ['a missing emblem', { ...twoColour, emblem: undefined }],
    ['an overlong part', { ...twoColour, shape: 'x'.repeat(21) }],
    ['a crest list', [twoColour]],
  ])('skips only the slot with %s', (_, crest) => {
    const index = read([entry('a', crest), entry('b', oneColour), entry('c', threeColour)], 0);
    expect(index.slots.map((slot) => slot?.id ?? null)).toEqual([null, 'b', 'c']);
    // The slot in play pointed at the skipped entry; it no longer claims a game.
    expect(index.active).toBeNull();
  });
});
