import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { traceAggregate } from '../packages/engine/src/aggregate/trace';
import { matchDetail } from '../packages/engine/src/script/build';
import * as engine from '../packages/engine/src/script/detail';
import {
  EVENT_RESULTS,
  noSubstituteYear,
  protoCell,
  protoRows,
  SET_PIECES,
  settledExports,
  SHOT_KINDS,
  SHOT_OUTCOMES,
} from './export-settled';

const FILES = join(import.meta.dirname, 'match-proto/fixtures/settled');

describe('settled-match export (T819)', () => {
  it("cells are converted to the prototype's numbering", () => {
    // The acting side's own goal area: band 0, central lane.
    expect(protoCell(2)).toBe(2);
    // The opponent's goal area: band 7, central lane.
    expect(protoCell(37)).toBe(37);
    // The wide cell on the acting side's own left in the band before the opponent's box: band 5.
    expect(protoCell(25)).toBe(25);
    expect(() => protoCell(40)).toThrow();
  });

  it('plays in the latest year without substitutes', () => {
    expect(noSubstituteYear()).toBe(1964);
  });

  it('numbers its rows by the engine detail’s codes', () => {
    expect(EVENT_RESULTS).toEqual(engine.EVENT_RESULTS);
    expect(SET_PIECES).toEqual(engine.SET_PIECES);
    expect(SHOT_OUTCOMES).toEqual(engine.SHOT_OUTCOMES);
    expect(engine.SHOT_KINDS.slice(0, SHOT_KINDS.length)).toEqual(SHOT_KINDS);
  });

  // The ten files behind the prototype, rebuilt as the exporter builds them (T825): the engine's
  // detail of each match, from a trace of its own, gives the files' rows once the exporter's player
  // and cell mappings are applied, and the exporter, now building its rows through that detail,
  // writes the same bytes.
  it("the engine's detail equals the exported files", async () => {
    const { kept } = await settledExports(10);
    expect(kept.map((k) => k.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`),
    );
    for (const { id, match, rosters, text } of kept) {
      const disk = readFileSync(join(FILES, `${id}.json`), 'utf8');
      const file = JSON.parse(disk) as Record<string, unknown>;
      const rows = protoRows(matchDetail(match, rosters, traceAggregate(match)));
      expect(rows.events, id).toEqual(file.events);
      expect(rows.shots, id).toEqual(file.shots);
      expect(rows.fouls, id).toEqual(file.fouls);
      expect(rows.cards, id).toEqual(file.cards);
      expect(text === disk, `${id} is byte-identical`).toBe(true);
    }
  });
});
