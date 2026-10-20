import { expect, it } from 'vitest';
import { createWorld, simulateMatch, nextOwnFixture } from '../../../../packages/engine/src/index';
import { archivePlayback } from './replay';
import {
  goalFrame,
  incidentFrame,
  recordedGoals,
  recordedIncidents,
  sampleAt,
  sentOff,
} from './moments';

const w = createWorld({
  country: 'ENG',
  name: 'Moments',
  color: '#24664f',
  seed: 'moments',
  level: 'easy' as const,
});
const { record, frames } = simulateMatch(w, nextOwnFixture(w)!, true, true);
const samples = frames.flatMap((frame, i) => (frame.motion || [frame]).map(() => ({ frame: i })));

it('orders recorded goals, keeps penalty decisions distinct and maps actual samples', () => {
  const highlights = record.highlights;
  record.highlights = [
    { minute: 70, side: 1, player: 'Away', action: '골' },
    { minute: 10, side: 0, player: 'Home', action: '골' },
    { minute: 120, side: 0, player: 'Penalties', action: '승부차기 홈 승리' },
  ];
  expect(recordedGoals(record).map((g) => [g.minute, g.home, g.away])).toEqual([
    [10, 1, 0],
    [70, 1, 1],
  ]);
  expect(frames[samples[sampleAt(frames, samples, 30)].frame].label).toBe('30');
  // Half-time opens the second half; the final whistle is the last frame, added minutes included.
  const second = frames[samples[sampleAt(frames, samples, 'halfTime')].frame];
  expect([second.period, second.label]).toEqual([2, '46']);
  expect(samples[sampleAt(frames, samples, 'fullTime')].frame).toBe(frames.length - 1);
  expect(frames.at(-1)!.label).toMatch(/^90(\+\d+)?$/);
  expect(sampleAt(frames, samples, 'kickoff')).toBe(0);
  expect(sampleAt([], [], 45)).toBe(0);
  record.highlights = [];
  expect(recordedGoals(record)).toEqual([]);
  record.highlights = highlights;
  // A goal lands on the first frame whose score includes it.
  for (const goal of recordedGoals(record)) {
    const at = frames[goalFrame(frames, goal)]!;
    expect([at.score.home >= goal.home, at.score.away >= goal.away]).toEqual([true, true]);
  }
});

it('lists red cards and substitutions with their labels', () => {
  const incidents = record.incidents;
  const last = frames.at(-1)!;
  const added = Number(last.label.split('+')[1] ?? 0);
  record.incidents = [
    { minute: 30, side: 0, kind: 'yellow', player: 'h1' },
    { minute: 45, added: 1, side: 1, kind: 'injury', player: 'a2' },
    { minute: 60, side: 1, kind: 'sub', player: 'a2', other: 'a14' },
    { minute: 75, side: 0, kind: 'secondYellow', player: 'h1' },
    { minute: 90, ...(added ? { added } : {}), side: 1, kind: 'red', player: 'a5' },
  ];
  const listed = recordedIncidents(record);
  expect(listed.map((i) => [i.kind, i.label, i.player, i.other])).toEqual([
    ['sub', '60', 'a2', 'a14'],
    ['secondYellow', '75', 'h1', undefined],
    ['red', last.label, 'a5', undefined],
  ]);
  // Each opens on its own frame, an added-time one included.
  for (const incident of listed)
    expect(frames[samples[sampleAt(frames, samples, incident.label)].frame].label).toBe(
      incident.label,
    );
  expect(incidentFrame(frames, listed[2]!)).toBe(frames.length - 1);
  // Added time the frames do not reach falls on the half's last frame.
  const late = incidentFrame(frames, { minute: 45, added: 30, side: 0, kind: 'red', player: 'h' });
  expect([frames[late]!.period, frames[late + 1]!.period]).toEqual([1, 2]);
  // The scoreboard counts a sending-off from its frame on.
  const at75 = frames.findIndex((f) => f.label === '75');
  expect(sentOff(record, frames, at75 - 1)).toEqual([0, 0]);
  expect(sentOff(record, frames, at75)).toEqual([1, 0]);
  expect(sentOff(record, frames, frames.length - 1)).toEqual([1, 1]);
  // An archived replay has no added-time frames: the moment opens the minute it belongs to.
  const archived = archivePlayback(record).frames;
  const one = archived.map((_, i) => ({ frame: i }));
  expect(archived[sampleAt(archived, one, '45+1')]!.label).toBe('45');
  expect(archived[incidentFrame(archived, listed[2]!)]!.label).toBe('90');
  record.incidents = incidents;
  expect(recordedIncidents({ ...record, incidents: undefined })).toEqual([]);
});
