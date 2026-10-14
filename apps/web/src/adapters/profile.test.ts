import { describe, expect, it } from 'vitest';
import {
  DEVICE_KEY,
  STRATEGIES_KEY,
  STRATEGY_LIMIT,
  StrategyLibrary,
  deviceOwner,
} from './profile';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('device strategy library', () => {
  it('keeps one random device owner on every record', () => {
    const storage = memory();
    const owner = deviceOwner(storage);
    expect(owner.kind).toBe('device');
    expect(deviceOwner(storage)).toEqual(owner);
    new StrategyLibrary(storage).save({ name: '우리 방식', build: { youth: 'elite' } });
    const stored = JSON.parse(storage.data.get(STRATEGIES_KEY)!);
    expect(stored).toMatchObject({ v: 1, owner, items: [{ name: '우리 방식' }] });
    expect(storage.data.get(DEVICE_KEY)).toBe(owner.id);
  });

  it('saves, edits and removes by stable ID with unique trimmed names', () => {
    let tick = 0;
    const library = new StrategyLibrary(memory(), () => `2026-10-12T00:00:0${tick++}Z`);
    const first = library.save({ name: '  동네 축구  ', build: { fans: 'community' } });
    expect(first.name).toBe('동네 축구');
    const second = library.save({ name: '두 번째', build: {} });
    expect(() => library.save({ name: '동네 축구', build: {} })).toThrow('같은 이름');
    expect(() => library.save({ name: ' ', build: {} })).toThrow('이름');
    expect(() => library.save({ name: '가'.repeat(21), build: {} })).toThrow('20자');
    expect(() => library.save({ name: '이상한 카드', build: { fans: 'moon' } as never })).toThrow();
    const edited = library.save({ id: first.id, name: '동네 축구', build: { culture: 'family' } });
    expect(edited).toMatchObject({ id: first.id, createdAt: first.createdAt });
    expect(edited.updatedAt > first.updatedAt).toBe(true);
    // Most recently changed first.
    expect(library.list().map((item) => item.id)).toEqual([first.id, second.id]);
    library.remove(second.id);
    expect(library.list()).toHaveLength(1);
  });

  it('caps the library and skips malformed entries instead of failing', () => {
    const storage = memory();
    const library = new StrategyLibrary(storage);
    for (let i = 0; i < STRATEGY_LIMIT; i++) library.save({ name: `전략 ${i}`, build: {} });
    expect(() => library.save({ name: '하나 더', build: {} })).toThrow(`${STRATEGY_LIMIT}개`);
    const stored = JSON.parse(storage.data.get(STRATEGIES_KEY)!);
    stored.items.push({ id: 'x', name: '', build: {} }, 'junk');
    storage.setItem(STRATEGIES_KEY, JSON.stringify(stored));
    expect(library.list()).toHaveLength(STRATEGY_LIMIT);
    storage.setItem(STRATEGIES_KEY, '{not json');
    expect(library.list()).toEqual([]);
  });

  it('loads a saved direction holding 1군 직행 경로 or 글로벌 브랜드 without it', () => {
    const storage = memory();
    const owner = deviceOwner(storage);
    storage.setItem(
      STRATEGIES_KEY,
      JSON.stringify({
        v: 1,
        owner,
        items: [
          {
            id: 'old',
            name: '옛 방식',
            build: { youth: 'pathway', fans: 'community' },
            createdAt: '2026-10-12T00:00:00Z',
            updatedAt: '2026-10-12T00:00:00Z',
          },
          {
            id: 'brand',
            name: '해외 브랜드',
            build: { fans: 'global', revenue: 'commercial' },
            createdAt: '2026-10-12T00:00:00Z',
            updatedAt: '2026-10-12T00:00:00Z',
          },
        ],
      }),
    );
    expect(new StrategyLibrary(storage).list()).toMatchObject([
      { id: 'old', name: '옛 방식', build: { fans: 'community' } },
      { id: 'brand', name: '해외 브랜드', build: { revenue: 'commercial' } },
    ]);
  });

  it('keeps every row of a saved direction and loads older entries with cards only', () => {
    const storage = memory();
    const library = new StrategyLibrary(storage, () => '2026-10-14T00:00:00Z');
    const rows = {
      policy: { academy: 4, recruitment: 1 },
      ticket: 0.035,
      direction: { debut: 'early', coaches: 'elite' },
    };
    const saved = library.save({ name: '유스 방식', build: { youth: 'elite' }, rows });
    expect(saved.rows).toEqual(rows);
    expect(new StrategyLibrary(storage).list()[0].rows).toEqual(rows);
    // Malformed rows are refused on save and dropped (cards kept) on load.
    expect(() =>
      library.save({ name: '이상한 방식', build: {}, rows: { policy: { academy: 9 } } }),
    ).toThrow('방향 줄');
    const raw = JSON.parse(storage.getItem(STRATEGIES_KEY)!);
    raw.items.push(
      {
        id: 'old',
        name: '옛 방식',
        build: { culture: 'family' },
        createdAt: '2026-10-12T00:00:00Z',
        updatedAt: '2026-10-12T00:00:00Z',
      },
      {
        id: 'broken',
        name: '깨진 줄',
        build: { culture: 'stars' },
        rows: { ticket: 9 },
        createdAt: '2026-10-12T00:00:00Z',
        updatedAt: '2026-10-12T00:00:00Z',
      },
    );
    storage.setItem(STRATEGIES_KEY, JSON.stringify(raw));
    const items = new StrategyLibrary(storage).list();
    expect(items.find((item) => item.id === 'old')).not.toHaveProperty('rows');
    expect(items.find((item) => item.id === 'broken')).toMatchObject({
      build: { culture: 'stars' },
    });
    expect(items.find((item) => item.id === 'broken')).not.toHaveProperty('rows');
  });
});
