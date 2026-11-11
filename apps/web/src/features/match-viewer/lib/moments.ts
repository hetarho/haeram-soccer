import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import type {
  Incident,
  MatchFrame,
  MatchRecord,
} from '../../../../../../packages/contracts/src/types';

export function recordedGoals(record: MatchRecord) {
  let home = 0,
    away = 0;
  return record.highlights
    .filter((h) => h.action === sourceMessage('copy.summary.68a6cf8ed8'))
    .slice()
    .sort((a, b) => a.minute - b.minute)
    .map((h) => {
      if (h.side === 0) home++;
      else away++;
      return { ...h, home, away };
    });
}

/** The frame a recorded goal lands on: the first whose score includes it, or -1. */
export function goalFrame(frames: MatchFrame[], goal: { home: number; away: number }) {
  return frames.findIndex((f) => f.score.home >= goal.home && f.score.away >= goal.away);
}

/** An incident's minute label: `45+2` in added time, else the minute. */
export function incidentLabel(incident: Incident) {
  return incident.added ? `${incident.minute}+${incident.added}` : String(incident.minute);
}

/**
 * The frame an incident happens in: the one with its label; else, for added time the period's last
 * frame of that minute (an archived replay has no added-time frames), otherwise the first frame of
 * its minute; else the last frame.
 */
export function incidentFrame(frames: MatchFrame[], incident: Incident, complete = true) {
  const label = incidentLabel(incident);
  const exact = frames.findIndex((f) => f.label === label);
  if (exact >= 0) return exact;
  if (incident.added && !complete) return -1;
  const minute = incident.added
    ? frames.findLastIndex((f) => f.minute === incident.minute)
    : frames.findIndex((f) => f.minute >= incident.minute);
  return minute >= 0 ? minute : complete ? frames.length - 1 : -1;
}

/** An unfinished picture never substitutes its current last instant for a later moment. */
export function momentReady(frames: MatchFrame[], moment: Moment, complete: boolean) {
  if (complete) return frames.length > 0;
  if (moment === 'fullTime') return false;
  if (moment === 'kickoff') return frames.length > 0;
  if (moment === 'halfTime') return frames.some((frame) => frame.period >= 2);
  return frames.some((frame) =>
    typeof moment === 'number' ? frame.minute >= moment : frame.label === moment,
  );
}

/** Red cards (a second yellow included) per side, shown up to frame `shown` (→WEB-50). */
export function sentOff(record: MatchRecord, frames: MatchFrame[], shown: number, complete = true) {
  const reds: [number, number] = [0, 0];
  for (const incident of record.incidents ?? [])
    if (
      (incident.kind === 'red' || incident.kind === 'secondYellow') &&
      incidentFrame(frames, incident, complete) >= 0 &&
      incidentFrame(frames, incident, complete) <= shown
    )
      reds[incident.side]++;
  return reds;
}

/** Red cards and substitutions to seek to, in time order with their minute labels (→WEB-23). */
export function recordedIncidents(record: MatchRecord) {
  return (record.incidents ?? [])
    .filter(
      (incident): incident is Incident & { kind: 'red' | 'secondYellow' | 'sub' } =>
        incident.kind === 'red' || incident.kind === 'secondYellow' || incident.kind === 'sub',
    )
    .map((incident) => ({ ...incident, label: incidentLabel(incident) }));
}

/**
 * A place to seek to: kick-off, half-time, the final whistle, a recorded match minute or a minute
 * label such as `90+3`.
 */
export type Moment = 'kickoff' | 'halfTime' | 'fullTime' | number | string;

/**
 * The sample a moment opens on: the first, the second half's first, the last, or the first of the
 * minute; added minutes are frames of their own, so the final whistle is the last frame. A label
 * no frame carries opens its minute.
 */
export function sampleAt(frames: MatchFrame[], samples: { frame: number }[], moment: Moment) {
  if (!samples.length) return 0;
  if (moment === 'kickoff') return 0;
  if (moment === 'fullTime') return samples.length - 1;
  if (typeof moment === 'string' && moment !== 'halfTime') {
    const index = samples.findIndex((sample) => frames[sample.frame]?.label === moment);
    if (index >= 0) return index;
    moment = parseInt(moment, 10) || 0;
  }
  const index = samples.findIndex((sample) => {
    const frame = frames[sample.frame];
    return moment === 'halfTime' ? (frame?.period ?? 1) >= 2 : (frame?.minute ?? 0) >= moment;
  });
  return index < 0 ? samples.length - 1 : index;
}
