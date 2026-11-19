import { describe, expect, it } from 'vitest';
import { canonical } from '../../../../packages/contracts/src/index';
import type { World } from '../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../packages/engine/src/career.testkit';
import { advanceDays } from '../../../../packages/engine/src/season';
import { memoryRecordStore } from '../../../../tests/fixtures/node-sqlite';
import { tenRichSeasons } from './persistence.testkit';
import { RowSaver } from './rowSaver';
import { rowsToWorld } from './worldRows';

function roundTrip(w: World) {
  const store = memoryRecordStore();
  const saver = new RowSaver(store);
  const first = saver.save(w);
  expect(first.written).toBe(first.rows);
  const back = rowsToWorld(store, { includeCold: true });
  expect(canonical(back)).toBe(canonical(w));
  expect(Object.keys(back.people ?? {})).toEqual(Object.keys(w.people ?? {}));
  return { store, saver };
}

describe('world rows on simulated worlds', () => {
  it('round-trips a fresh career and a ten-season career', () => {
    roundTrip(careerWorld({ country: 'ENG', seed: 'world-rows' }));
    roundTrip(tenRichSeasons());
  });

  it('saves a day of play as under a tenth of the rows', () => {
    const w = tenRichSeasons();
    // The host's explicit acknowledgement resumes the world's informational critical stop.
    if (w.critical) {
      delete w.critical;
      w.revision++;
    }
    const { store, saver } = roundTrip(w);
    const day = w.calendar?.day;
    advanceDays(w, 1);
    expect(w.calendar?.day).not.toBe(day);
    const second = saver.save(w);
    expect(second.written).toBeGreaterThan(0);
    expect(second.written / second.rows).toBeLessThan(0.1);
    expect(canonical(rowsToWorld(store, { includeCold: false }))).toBe(canonical(w));
  });
});
