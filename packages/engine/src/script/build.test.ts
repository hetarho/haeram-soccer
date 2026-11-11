import { describe, expect, it } from 'vitest';
import { SCRIPTED_RELEASE } from '../match-model-release';
import { aggregateRecord } from '../aggregate/engine';
import { traceAggregate } from '../aggregate/trace';
import { matchDetail, recordOf } from './build';
import { detailIssues } from './detail';
import { detailSample, FEATURES, featuresOf, SAMPLE } from './sample.testkit';

// Every row counts back to the record (→MATCH-27, MATCH-38, T825), on T825's sample
// (sample.testkit.ts).
const REVISION = SCRIPTED_RELEASE.revision;

describe('the own match’s detail (→MATCH-38, T825)', () => {
  it('every row counts back to the record', () => {
    const { chosen, missing } = detailSample();
    expect(missing).toEqual([]);
    expect(chosen.length).toBeGreaterThanOrEqual(SAMPLE);
    const seen = new Set<string>();
    let rows = 0;
    for (const { f, rosters, match } of chosen) {
      for (const x of featuresOf(match)) seen.add(x);
      expect(match.plan.placed).toBe(true);
      const detail = matchDetail(match, rosters, traceAggregate(match));
      expect(detailIssues(detail), f.id).toEqual([]);
      rows += detail.events.length;
      const record = aggregateRecord(f, rosters, match, REVISION);
      const back = recordOf(detail);
      expect(back.score, f.id).toEqual(record.score);
      expect(back.metrics, f.id).toEqual(record.metrics);
      expect(back.detail, f.id).toEqual(record.detail);
      expect(back.players, f.id).toEqual(record.players);
      expect(back.xg, f.id).toEqual(record.xg);
      expect(back.incidents, f.id).toEqual(record.incidents);
      expect(back.regulation, f.id).toEqual(record.regulation);
      expect(back.shootout, f.id).toEqual(record.shootout);
      expect(detail.added, f.id).toEqual(record.added);
    }
    expect([...seen].sort()).toEqual([...FEATURES].sort());
    console.log(`T825 detail: ${chosen.length} matches, ${rows} event rows`);
  });
});
