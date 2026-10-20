import { describe, expect, it } from 'vitest';
import { createWorld } from '../index';
import { playGrid } from './engine';
import { toUnits } from './pitch';
import { ballPath, buildFrames } from './playback';
import { buildGridSetup } from './setup';

const w = createWorld({
  country: 'ENG',
  name: 'Grid Playback Lab',
  color: '#2a5d8f',
  seed: 'grid-playback',
  level: 'normal',
});
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const setupFor = (id: string, observe = true) =>
  buildGridSetup(
    w,
    { ...w.fixtures[0]!, id, home: home!.id, away: away!.id },
    { observe, recordPlayers: true, tactics: ['press', 'possession'] },
  );
const watch = (id: string) => {
  const setup = setupFor(id);
  const result = playGrid(setup);
  return { setup, result, frames: buildFrames(result, setup, w.seed) };
};
const { setup, result, frames } = watch('playback-1');
const added = result.record.added!;

describe('grid playback', () => {
  it('builds one frame per played minute including added time', () => {
    expect(frames).toHaveLength(90 + added[0]! + added[1]!);
    expect(frames.filter((f) => f.period === 1)).toHaveLength(45 + added[0]!);
    expect(frames.filter((f) => f.period === 2)).toHaveLength(45 + added[1]!);
    expect(frames.at(-1)!.score).toEqual(result.record.score);
    expect(frames.at(-1)!.xg).toEqual(result.record.xg);
    for (let m = 0; m < 10; m++)
      expect(frames.at(-1)!.metrics[0]![m]).toBe(result.record.metrics[0]![m]);
  });

  it('samples 8 positions and 80 ball points per minute', () => {
    for (const f of frames) {
      expect(f.motion).toHaveLength(8);
      expect(f.ballTrack).toHaveLength(80);
      expect(f.motion!.at(-1)!.elapsedSeconds).toBe(f.elapsedSeconds);
    }
  });

  it('keeps everyone on the pitch inside 0–100 units and mirrors the second half', () => {
    const inside = (p: readonly number[]) => p.every((v) => v >= 0 && v <= 100);
    for (const f of frames) {
      for (const sample of f.motion!) {
        expect(inside(sample.ball)).toBe(true);
        for (const side of sample.players)
          for (const p of side) expect(inside(p.position) && inside(p.intent)).toBe(true);
      }
      for (const point of f.ballTrack!) expect(inside(point.slice(0, 2))).toBe(true);
    }
    const keeper = setup.rosters[0][0]!.id;
    const keeperX = (period: 1 | 2) =>
      frames
        .filter((f) => f.period === period)
        .flatMap((f) => f.players![0].filter((p) => p.id === keeper).map((p) => p.position[0]));
    expect(Math.max(...keeperX(1))).toBeLessThan(50);
    expect(Math.min(...keeperX(2))).toBeGreaterThan(50);
  });

  it('keeps the ball at the carrier while he carries', () => {
    let held = 0;
    for (const f of frames)
      for (const sample of f.motion!) {
        if (!sample.ownerId) continue;
        const carrier = sample.players.flat().find((p) => p.id === sample.ownerId)!;
        expect(carrier.state).toBe('carry');
        expect(sample.ball[0]).toBeCloseTo(carrier.position[0], 9);
        expect(sample.ball[1]).toBeCloseTo(carrier.position[1], 9);
        held++;
      }
    expect(held).toBeGreaterThan(50);
  });

  it('lands every flight at its recorded end', () => {
    const ball = ballPath(result, setup, w.seed);
    let flights = 0;
    for (const e of result.trace!) {
      if (!e.to || e.outcome === 'incident') continue;
      const to = toUnits(e.to, e.period);
      const at = ball(e.period, e.elapsed).at;
      // Snapshot positions are 32-bit floats.
      expect(at[0], `${e.action} ${e.outcome}`).toBeCloseTo(to[0], 4);
      expect(at[1], `${e.action} ${e.outcome}`).toBeCloseTo(to[1], 4);
      flights++;
    }
    expect(flights).toBeGreaterThan(500);
  });

  it('labels added time as 45+n and 90+n', () => {
    const labels = frames.map((f) => f.label);
    const regular = Array.from({ length: 90 }, (_, i) => String(i + 1));
    expect(labels.filter((l) => !l.includes('+'))).toEqual(regular);
    expect(labels.filter((l) => l.startsWith('45+'))).toEqual(
      Array.from({ length: added[0]! }, (_, i) => `45+${i + 1}`),
    );
    expect(labels.filter((l) => l.startsWith('90+'))).toEqual(
      Array.from({ length: added[1]! }, (_, i) => `90+${i + 1}`),
    );
    expect(labels.indexOf('45+1')).toBe(45);
    expect(frames.filter((f) => f.label.startsWith('90+')).every((f) => f.minute === 90)).toBe(
      true,
    );
  });

  it('shows each incident in a frame carrying its minute, none after the last frame (MATCH-24)', () => {
    let seen = 0;
    for (let n = 0; n < 6; n++) {
      const watched = n ? watch(`stamp-${n}`) : { result, frames };
      const shown = watched.frames.flatMap((f) =>
        f.events!.filter((e) => ['card', 'sub', 'injury'].includes(e.kind)).map((e) => ({ f, e })),
      );
      const incidents = watched.result.record.incidents ?? [];
      expect(shown).toHaveLength(incidents.length);
      incidents.forEach((x, k) => {
        const label = x.added ? `${x.minute}+${x.added}` : String(x.minute);
        expect(shown[k]!.e.actor).toBe(x.player);
        expect(shown[k]!.f.label, `${x.kind} ${label}`).toBe(label);
        expect(watched.frames.some((f) => f.label === label)).toBe(true);
        seen++;
      });
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('averages pace to 1 and slows minutes with shots and set pieces', () => {
    const paces = frames.map((f) => f.pace);
    expect(paces.reduce((a, b) => a + b, 0) / paces.length).toBeCloseTo(1, 9);
    const busy = frames.filter((f) =>
      f.events!.some((e) => e.outcome || e.restart === 'corner' || e.restart === 'penalty'),
    );
    expect(busy.length).toBeGreaterThan(5);
    const top = Math.max(...paces);
    expect(busy.every((f) => f.pace === top)).toBe(true);
    expect(Math.min(...paces)).toBeLessThan(1);
    expect(top / Math.min(...paces)).toBeCloseTo(1.6 / 0.6, 9);
  });

  it('shows ten players after a red card', () => {
    let id = '';
    for (let i = 0; i < 200 && !id; i++) {
      const quiet = playGrid(setupFor(`red-${i}`, false)).record;
      const reds = (quiet.incidents ?? []).filter(
        (x) => x.kind === 'red' || x.kind === 'secondYellow',
      );
      const injured = (quiet.incidents ?? []).some((x) => x.kind === 'injury');
      if (reds.length === 1 && !injured) id = `red-${i}`;
    }
    expect(id).not.toBe('');
    const watched = watch(id);
    const red = watched.result.record.incidents!.find(
      (x) => x.kind === 'red' || x.kind === 'secondYellow',
    )!;
    const at = watched.frames.findIndex((f) =>
      f.events!.some((e) => e.kind === 'card' && e.card === 'red'),
    );
    expect(at).toBeGreaterThanOrEqual(0);
    expect(watched.frames[at]!.events!.find((e) => e.card === 'red')!.actor).toBe(red.player);
    for (const f of watched.frames.slice(at)) {
      expect(f.players![red.side]).toHaveLength(10);
      expect(f.onPitch[red.side]).toHaveLength(10);
      expect(f.onPitch[red.side]).not.toContain(red.player);
    }
    if (at > 0) expect(watched.frames[at - 1]!.onPitch[red.side]).toHaveLength(11);
  });

  it('does not change the record', () => {
    const quiet = playGrid(setupFor('playback-1', false));
    expect(result.record).toEqual(quiet.record);
    const record = structuredClone(result.record);
    const again = buildFrames(result, setup, w.seed);
    expect(result.record).toEqual(record);
    expect(again).toEqual(frames);
  });
});
