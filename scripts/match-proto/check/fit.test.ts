import { describe, expect, it } from 'vitest';
import type { Settled } from '../core/settled.ts';
import { demoFixture } from '../core/squads.ts';
import type { Playback, Script, StageEvent } from '../core/types.ts';
import { countScript } from '../fit/count.ts';
import { loadSettled } from '../fit/fit.testkit.ts';
import { writeFitted } from '../fit/write.ts';
import { performScript } from '../stage/perform.ts';
import { scriptOf, type BeatSpec } from '../stage/script.testkit.ts';
import { countPlayback, fitMetrics } from './fit.ts';
import { fakePlayback, frameOf } from './playback.testkit.ts';

// s01 cut to its first five match minutes (exported synthetic match, ARCH-21); the full match is
// T822's and the CLI's (`report.ts --match s01`).
const settled = loadSettled('s01');
const full = writeFitted(settled, 'fit');
const cut: Script = { ...full, beats: full.beats.filter((b) => b.clock! < 300) };
const staged = performScript(cut);
const NO_TIME = { writeMs: 0, stageMs: 0 };
/** `settled` whose record is the cut script's own count, so the cut is judged against itself. */
const cutRecord = (): Settled => {
  const counted = countScript(cut, settled);
  return { ...settled, record: { team: counted.team, players: counted.players } };
};
const byId = (metrics: ReturnType<typeof fitMetrics>, id: string) => {
  const found = metrics.find((m) => m.id === id);
  if (!found) throw new Error('no metric ' + id);
  return found;
};

describe('fit of a staged fitted match (T821)', () => {
  it('a staged fitted match counts back to the record', () => {
    expect(countPlayback(staged, settled)).toEqual(countScript(cut, settled));
    const metrics = fitMetrics(staged, cut, cutRecord(), NO_TIME);
    expect(metrics.slice(0, 3).map((m) => [m.id, m.value, m.pass])).toEqual([
      ['fit.exact', 0, true],
      ['fit.performed', 0, true],
      ['fit.recast', 0, true],
    ]);
  });

  it('fit.recast is zero for a bound script and counts a forced re-cast in an unbound one', () => {
    const fixture = demoFixture();
    const list: BeatSpec[] = [
      { kind: 'kickOff', actor: 9, receiver: 5, to: [45, 30] },
      { kind: 'pass', actor: 5, receiver: 4, to: [40, 60], outcome: 'intercepted', opponent: 13 },
      { team: 1, kind: 'pass', actor: 13, receiver: 14, to: [50, 50], possession: 2 },
    ];
    const script = scriptOf(fixture, list);
    script.beats.forEach((b, i) => (b.clock = i * 5));
    const loose = performScript(script, { duration: 60 });
    const bound = performScript({ ...script, bound: true });
    expect(byId(fitMetrics(bound, script, settled, NO_TIME), 'fit.recast').value).toBe(0);
    const recast = byId(fitMetrics(loose, script, settled, NO_TIME), 'fit.recast');
    expect(recast.value).toBe(1);
    expect(recast.pass).toBe(false);
  });

  it('fit.exact reports each mismatch', () => {
    const record = cutRecord();
    record.record.team[0][0] += 1;
    record.record.players[3][1] += 2;
    const exact = byId(fitMetrics(staged, cut, record, NO_TIME), 'fit.exact');
    expect(exact.value).toBe(2);
    expect(exact.pass).toBe(false);
    expect(exact.detail?.split(',')).toHaveLength(2);
    // A beat left unstaged is a `fit.performed` miss.
    const short: Playback = { ...staged, beats: staged.beats.slice(0, -1) };
    expect(byId(fitMetrics(short, cut, cutRecord(), NO_TIME), 'fit.performed').value).toBe(1);
  });

  it('the strain numbers read stretch, late owners and staged time against the clock', () => {
    // 120 staged live seconds carry one match minute: a minute takes two to perform.
    const frames = Array.from({ length: 1200 }, (_, i) => ({ ...frameOf(i / 10), clock: i / 20 }));
    const ev = (kind: StageEvent['kind'], extra: Partial<StageEvent> = {}): StageEvent => ({
      t: 1,
      beat: 0,
      kind,
      team: 0,
      actor: 6,
      other: 17,
      at: [50, 30],
      ...extra,
    });
    const playback = fakePlayback({
      frames,
      events: [
        ev('intercept', { stretch: true }),
        ev('tackle', { stretch: true, late: true }),
        ev('foul'),
        ev('save'),
        ev('kick'),
      ],
    });
    const metrics = fitMetrics(playback, cut, settled, { writeMs: 12.4, stageMs: 340.6 });
    expect(byId(metrics, 'fit.stretch').value).toBe(0.5);
    expect(byId(metrics, 'fit.stretch').detail).toBe('2/4');
    expect(byId(metrics, 'fit.late').value).toBe(1);
    expect(byId(metrics, 'fit.stagedSeconds').value).toBe(119.9);
    expect(byId(metrics, 'fit.clockRatio').value).toBe(2);
    expect(byId(metrics, 'fit.writeMs').value).toBe(12);
    expect(byId(metrics, 'fit.stageMs').value).toBe(341);
    expect(metrics.map((m) => m.id)).toEqual([
      'fit.exact',
      'fit.performed',
      'fit.recast',
      'fit.stretch',
      'fit.late',
      'fit.links',
      'fit.linkMetres',
      'fit.miscontrols',
      'fit.connectiveRestarts',
      'fit.orphans',
      'fit.stagedSeconds',
      'fit.clockRatio',
      'fit.writeMs',
      'fit.stageMs',
    ]);
    expect(metrics.slice(3).every((m) => m.pass === undefined)).toBe(true);
  });
});
