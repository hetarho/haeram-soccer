/** The staged picture in the theatre's existing one-minute contract (MATCH-12, ARCH-7). */
import type { MatchScript, StagingSide } from '../../../contracts/src/match-script';
import { NEUTRAL_FRAME_PACE } from '../../../contracts/src/match-model';
import { message as sourceMessage } from '../../../contracts/src/messages';
import type { MatchEvent, MatchFrame, MatchRecord, Player } from '../../../contracts/src/types';
import { FORMATIONS } from '../formations';
import { stampAt } from '../match/clock';
import { SAMPLING } from '../match/motion';
import { M } from '../match/record';
import { countScript } from '../script/count';
import type { MatchDetail } from '../script/detail';
import { invalidDetail } from '../script/failure';
import { clockRates, framePeriods, matchSecond, rateAt, type ClockStaging } from './frame-clock';
import { actionEnd, beatEvents, leadingEvent, type FrameIdentity } from './frame-events';
import {
  ballAt,
  frameStoppages,
  lastAt,
  ownership,
  pictureAt,
  timedEvents,
  timedFrames,
} from './frame-samples';
import { advance, createStaging, type StageEvent, type StageFrame } from './staging';

export { clockRates } from './frame-clock';
export type { ClockRate, ClockStaging } from './frame-clock';

/** IDs follow participating record lines; names come from the supplied frozen match squads. */
function frameInputs(
  record: MatchRecord,
  sides: readonly [StagingSide, StagingSide],
  squads: [Player[], Player[]],
) {
  const counts = record.lineCounts ?? sides.map((s) => s.players.length);
  const lines = [
    record.players.slice(0, counts[0]),
    record.players.slice(counts[0], counts[0] + counts[1]),
  ];
  const ids = lines.map((s) => s.map((p) => p.id)) as [string[], string[]];
  const names = ids.map((list, side) => {
    const byId = new Map(squads[side].map((p) => [p.id, p.name]));
    return list.map((id) => byId.get(id) ?? id);
  }) as [string[], string[]];
  const identity: FrameIdentity = { ids, names };
  const detail: MatchDetail = {
    version: 1,
    id: record.id,
    length: record.metrics[0][M.minutes] === 120 ? 120 : 90,
    added: record.added ?? [],
    score: [record.score.home, record.score.away],
    sides: sides.map((s, side) => ({
      tactic: s.tactic,
      lines: s.players.map((p) => {
        const id = ids[side][p.line];
        if (!id) throw invalidDetail('staging:identity');
        return {
          id,
          slot: p.slot,
          role: p.role,
          position: FORMATIONS[s.tactic].slots[p.slot].position,
        };
      }),
    })) as MatchDetail['sides'],
    // Team counters need no re-created participation history; the record supplies that fact.
    stints: [],
    events: [],
    shots: [],
    fouls: [],
    incidents: [],
    shootout: [],
    penalties: [],
  };
  return { identity, detail };
}

/**
 * Advance only until a minute has a known right clock anchor, then yield it. A caller that stops
 * consuming the generator stops the motion program too; no full-match staging precedes frame 1.
 */
export function* stageFrames(
  script: MatchScript,
  sides: readonly [StagingSide, StagingSide],
  record: MatchRecord,
  squads: [Player[], Player[]],
): Generator<MatchFrame> {
  if (!script.beats.length) return;
  const { identity, detail } = frameInputs(record, sides, squads);
  const staging = createStaging(script, sides);
  const raw: ClockStaging & { frames: StageFrame[]; events: StageEvent[] } = {
    frames: [],
    events: [],
    added: record.added,
  };
  const periods = framePeriods(script, record.added);
  let emitted = 0;
  const total = periods.reduce((sum, p) => sum + p.minutes, 0);
  let lead: { action: string; player: number } = {
    action: sourceMessage('copy.summary.17242c9658'),
    player: 0,
  };
  let until = 0;
  while (emitted < total) {
    const chunk = advance(staging, until);
    for (const f of chunk.frames) {
      if (raw.frames.at(-1)?.t === f.t) raw.frames.pop();
      raw.frames.push(f);
    }
    raw.events.push(...chunk.events);
    const rates = clockRates(script, raw);
    if (rates.length) {
      const frames = timedFrames(raw.frames, rates);
      const events = timedEvents(raw.events, rates);
      const owners = ownership(frames, events, script, identity);
      const stops = frameStoppages(script, events);
      const byBeat = new Map<number, StageEvent[]>();
      for (const e of raw.events) {
        const list = byBeat.get(e.beat) ?? [];
        list.push(e);
        byBeat.set(e.beat, list);
      }
      const presented = script.beats
        .flatMap((b) => beatEvents(b, byBeat.get(b.index) ?? [], identity))
        .flatMap((e) => {
          const r = rateAt(rates, e.at);
          return r && r.period === e.period ? [{ ...e, time: matchSecond(r, e.at) }] : [];
        })
        .sort((a, b) => a.time - b.time);
      const counted = script.beats.flatMap((b) => {
        if (b.period === 5) return [];
        const end = actionEnd(b, byBeat.get(b.index) ?? []);
        const r = end && rateAt(rates, end.t);
        return end && r ? [{ beat: b, time: matchSecond(r, end.t) }] : [];
      });
      let ordinal = 0;
      for (const p of periods) {
        const stable = rates.filter((r) => r.period === p.period).at(-1)?.endSeconds ?? -Infinity;
        for (let m = 0; m < p.minutes; m++, ordinal++) {
          if (ordinal < emitted) continue;
          const start = p.start + m * 60,
            end = start + 60;
          if (end > stable + 1e-8) break;
          const inside = (t: number) =>
            t >= start - 1e-9 && (t < end - 1e-9 || (m === p.minutes - 1 && t <= end + 1e-9));
          const mine: MatchEvent[] = presented
            .filter((e) => e.period === p.period && inside(e.time))
            .map((e) => ({ ...e.value, t: Math.max(0, Math.min(60, e.time - start)) }));
          const keep = events
            .filter(
              (e) =>
                inside(e.time) &&
                [
                  'kick',
                  'shot',
                  'receive',
                  'intercept',
                  'tackle',
                  'save',
                  'block',
                  'goal',
                  'begin',
                  'sub',
                  'exit',
                  'injury',
                  'card',
                ].includes(e.event.kind),
            )
            .map((e) => e.time);
          const sampleTimes = [
            ...new Set([
              start,
              end,
              ...keep,
              ...Array.from(
                { length: Math.ceil(60 / SAMPLING.spacing) },
                (_, i) => start + i * SAMPLING.spacing,
              ),
            ]),
          ]
            .filter((t) => t >= start && t <= end)
            .sort((a, b) => a - b);
          const periodFrames = frames.filter((f) => f.rate.period === p.period);
          const picture = (t: number) => pictureAt(periodFrames, owners, t, identity);
          const motion = sampleTimes.map((t) => picture(t).sample);
          const trackTimes = [
            ...new Set([
              start,
              end,
              ...periodFrames.filter((f) => f.time > start && f.time < end).map((f) => f.time),
              ...keep,
            ]),
          ]
            .filter((t) => t >= start && t <= end)
            .sort((a, b) => a - b);
          const ballTrack = trackTimes.map((t): [number, number, number] => {
            const v = ballAt(periodFrames, t);
            return [v.ball[0], v.ball[1], v.height];
          });
          const holders: [number, string][] = [
            [
              0,
              owners[
                Math.max(
                  0,
                  lastAt(owners, start, (o) => o[0]),
                )
              ]?.[1] ?? '',
            ],
          ];
          for (const [t, who] of owners)
            if (t > start && t < end && who !== holders.at(-1)![1]) holders.push([t - start, who]);
          const prefix = counted
            .filter((x) => x.time < end - 1e-9 || (m === p.minutes - 1 && x.time <= end + 1e-9))
            .map((x) => x.beat);
          const totals = countScript({ ...script, beats: prefix }, detail, 'prefix');
          const stamp = stampAt(p.period, m * 60);
          const metrics = totals.metrics;
          for (const side of [0, 1] as const) {
            metrics[side][M.minutes] = Math.min(stamp.minute, record.metrics[side][M.minutes]);
            // Possession is pass-share accounting in the record's 90-minute unit. Each performed
            // attempt contributes its share of that fixed denominator, so these running totals
            // grow and the last rows reconcile even in extra time.
            const attempts = record.metrics[side][M.passes];
            metrics[side][M.possession] = attempts
              ? Math.round(
                  (record.metrics[side][M.possession] * metrics[side][M.passes]) / attempts,
                )
              : Math.round((record.metrics[side][M.possession] * (ordinal + 1)) / total);
          }
          let leading: MatchEvent | undefined;
          for (const e of mine)
            if (
              e.kind !== 'whistle' &&
              (!leading || leadingEvent(e).weight >= leadingEvent(leading).weight)
            )
              leading = e;
          const final = motion.at(-1)!;
          const rawEnd =
            periodFrames[
              Math.max(
                0,
                lastAt(periodFrames, end, (f) => f.time),
              )
            ].frame;
          if (leading) {
            // A minute led by a departed player keeps the slot he occupied at the action.
            const at = start + leading.t;
            const before =
              periodFrames[
                Math.max(
                  0,
                  lastAt(periodFrames, at - 1e-8, (f) => f.time),
                )
              ].frame;
            const player =
              before.p.find((p) => identity.ids[p.player.side][p.player.line] === leading.actor)
                ?.slot ?? 0;
            lead = { action: leadingEvent(leading).action, player };
          }
          const stoppages = stops
            .filter((s) => s.period === p.period && inside(s.kick))
            .map(({ kind, dead, settled, kick }) => ({
              kind,
              dead: dead - start,
              settled: settled - start,
              kick: kick - start,
            }));
          const share = [0, 0];
          for (let i = 0; i < periodFrames.length; i++) {
            const f = periodFrames[i],
              next = periodFrames[i + 1];
            if (f.time >= end) break;
            share[f.frame.team] += Math.max(
              0,
              Math.min(end, next?.time ?? end) - Math.max(start, f.time),
            );
          }
          emitted++;
          yield {
            minute: stamp.minute,
            label: stamp.added ? `${stamp.minute}+${stamp.added}` : String(stamp.minute),
            period: p.period,
            score: totals.score,
            metrics,
            xg: totals.xg,
            ball: final.ball,
            side: share[1] > share[0] ? 1 : share[0] > share[1] ? 0 : rawEnd.team,
            player: lead.player,
            action: lead.action,
            startSeconds: start,
            elapsedSeconds: end,
            players: final.players,
            motion,
            events: mine,
            ballTrack,
            ballTimes: trackTimes,
            holders,
            stoppages,
            pace: NEUTRAL_FRAME_PACE,
            onPitch: final.players.map((side) => side.map((p) => p.id)) as [string[], string[]],
          };
        }
      }
    }
    if (chunk.done && emitted < total) throw invalidDetail('staging:clock');
    if (emitted && rates.length) {
      const end = periods.flatMap((p) =>
        Array.from({ length: p.minutes }, (_, i) => p.start + (i + 1) * 60),
      )[emitted - 1];
      const rate = rates.find((r) => r.startSeconds <= end && end <= r.endSeconds);
      if (rate) {
        const t = rate.from + (end - rate.startSeconds) / rate.rate;
        const keep = Math.max(
          0,
          lastAt(raw.frames, t, (f) => f.t),
        );
        raw.frames.splice(0, keep);
      }
    }
    until += 60;
  }
}

export function stageAll(
  script: MatchScript,
  sides: readonly [StagingSide, StagingSide],
  record: MatchRecord,
  squads: [Player[], Player[]],
): MatchFrame[] {
  return [...stageFrames(script, sides, record, squads)];
}
