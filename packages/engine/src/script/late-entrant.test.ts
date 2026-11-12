import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MatchDetail } from './detail';
import { compareRecord, countScript } from './count';
import { validateScript } from './validate';
import { writeScript } from './write';

// A released own fixture (T840: 2024 takeover, seed `t840-curve-2024:probe4`, fixture
// 2024:ENG:0:0:4:1) whose 86th-minute substitute had a touch in the same minute while the
// minute's last pass was still in flight: the writer dropped the substitution and the match fell
// back to a record-only replay.
const detail = JSON.parse(
  readFileSync(new URL('./fixtures/t840-late-entrant.json', import.meta.url), 'utf8'),
) as MatchDetail;

it('stops for a waiting substitution when the minute ends with a pass in flight', () => {
  const written = writeScript(detail, 't840-curve-2024:probe4:2024:ENG:0:0:4:1');
  expect('problems' in written ? written.problems : []).toEqual([]);
  if (!('script' in written)) return;
  expect(validateScript(detail, written.script)).toEqual([]);
  expect(compareRecord(detail, countScript(written.script, detail))).toEqual([]);
  const sub = written.script.beats.find((b) =>
    b.incidents?.some((x) => x.kind === 'sub' && x.side === 0 && x.line === 1 && x.other === 15),
  );
  expect(sub && Math.floor(sub.clock / 60)).toBe(85);
});
