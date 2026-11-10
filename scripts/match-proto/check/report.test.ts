import { describe, expect, it } from 'vitest';
import { scriptStats } from '../script/stats.ts';
import { producePlayback, type ProduceInfo } from '../stage/pipeline.ts';
import { computeMetrics, METRIC_IDS, type Metric } from './metrics.ts';
import { formatReport } from './report.ts';

describe('metrics report', () => {
  it('computeMetrics on a staged script returns every id once with finite values', () => {
    const { playback } = producePlayback('t1', { showcase: false, duration: 60 });
    const metrics = computeMetrics(playback);
    expect(metrics.map((m) => m.id)).toEqual(METRIC_IDS);
    for (const m of metrics) expect(Number.isFinite(m.value)).toBe(true);
  });

  it('formatReport prints one line per metric and the pass count', () => {
    const info: ProduceInfo = {
      seed: 's#0',
      attempts: 2,
      staged: 1,
      check: { counts: { goals: 1 }, met: ['goals'], missing: ['shots'] },
    };
    const metrics: Metric[] = [
      { id: 'a.b', value: 1, limit: '<= 2', pass: true },
      { id: 'c', value: 3, limit: '= 0', pass: false, detail: 'n=3/4' },
    ];
    const lines = formatReport(info, scriptStats([]), metrics).split('\n');
    expect(lines).toContain('seed=s#0');
    expect(lines).toContain('missing=shots');
    expect(lines.filter((l) => l.startsWith('a.b '))).toEqual(['a.b 1 <= 2 ok']);
    expect(lines.filter((l) => l.startsWith('c '))).toEqual(['c 3 = 0 FAIL n=3/4']);
    expect(lines.at(-1)).toBe('passed 1/2');
  });
});
