import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import type { MatchFrame, MatchRecord } from '../../../../../../packages/contracts/src/types';
import {
  goalFrame,
  incidentFrame,
  momentReady,
  recordedGoals,
  recordedIncidents,
  type Moment,
} from '../lib/moments';
import s from '../../../shared/ui/styles/Analysis.module.css';

const incidentText = {
  sub: sourceMessage('copy.LabPage.084c5a6dd7'),
  secondYellow: sourceMessage('copy.LabPage.3561565380'),
  red: sourceMessage('copy.LabPage.68e69c7b9c'),
} as const;

export function MatchMoments({
  record,
  frames,
  names,
  onSeek,
  live = false,
  complete = true,
}: {
  record: MatchRecord;
  /** The playback's frames: they give each moment its minute label (`45+2`). */
  frames: MatchFrame[];
  /** Player names by ID; incidents name players by ID. */
  names?: Map<string, string>;
  onSeek: (moment: Moment) => void;
  live?: boolean;
  complete?: boolean;
}) {
  useTextLocale();
  const name = (id?: string) => (id && names?.get(id)) || id || sourceMessage('team.column.player');
  const goals = recordedGoals(record);
  // Goals, red cards and substitutions in match order, each labelled as its frame reads.
  // A moment seeks to the frame it lands on; without one, to its recorded minute.
  const moments = [
    ...goals.map((goal) => {
      const at = goalFrame(frames, goal);
      const label = frames[at]?.label ?? `${goal.minute}`;
      return { at, goal, incident: undefined, label, seek: label };
    }),
    ...recordedIncidents(record).map((incident) => {
      const at = incidentFrame(frames, incident, complete);
      const seek = frames[at]?.label ?? incident.label;
      return { at, goal: undefined, incident, label: incident.label, seek };
    }),
  ].sort((a, b) => (a.goal?.minute ?? a.incident!.minute) - (b.goal?.minute ?? b.incident!.minute));
  const preparing = (ready: boolean) => !ready && <span>{richMessage('match.preparing')}</span>;
  return (
    <details data-ui="disclosure" className={s.disclosure}>
      <summary>{richMessage('copy.MatchMoments.00d5ac8ed5')}</summary>
      <section className={s.content} aria-label={displayMessage('copy.MatchMoments.00d5ac8ed5')}>
        <div className={s.controls}>
          <button
            disabled={!momentReady(frames, 'kickoff', complete)}
            onClick={() => onSeek('kickoff')}
          >
            {richMessage('copy.MatchMoments.97fe972721')}
            {preparing(momentReady(frames, 'kickoff', complete))}
          </button>
          <button
            disabled={!momentReady(frames, 'halfTime', complete)}
            onClick={() => onSeek('halfTime')}
          >
            {richMessage('copy.MatchMoments.3956ba3c7a')}
            {preparing(momentReady(frames, 'halfTime', complete))}
          </button>
          <button
            disabled={!momentReady(frames, 'fullTime', complete)}
            onClick={() => onSeek('fullTime')}
          >
            {richMessage('copy.MatchMoments.b29ac15161')}
            {preparing(momentReady(frames, 'fullTime', complete))}
          </button>
        </div>
        <ol className={s.momentList}>
          {localizeValue(
            moments.map(({ at, goal, incident, label, seek }, i) => (
              <li key={i}>
                {localizeValue(
                  goal ? (
                    <button
                      data-testid="recorded-goal"
                      disabled={at < 0}
                      onClick={() => onSeek(seek)}
                    >
                      <b>
                        {localizeValue(label)}′ · {localizeValue(goal.player)}
                      </b>
                      <span>
                        {richMessage('copy.MatchMoments.e354fc1bd6', {
                          p0:
                            goal.side === 0
                              ? sourceMessage('fixture.home')
                              : sourceMessage('fixture.away'),
                          p1: goal.home,
                          p2: goal.away,
                        })}
                      </span>
                      {preparing(at >= 0)}
                    </button>
                  ) : (
                    incident && (
                      <button
                        data-testid="recorded-incident"
                        disabled={at < 0}
                        onClick={() => onSeek(seek)}
                      >
                        <b>
                          {localizeValue(label)}′ ·{localizeValue(' ')}
                          {localizeValue(
                            incident.kind === 'sub'
                              ? `${name(incident.player)} ↔ ${name(incident.other)}`
                              : name(incident.player),
                          )}
                        </b>
                        <span>
                          {localizeValue(
                            incident.side === 0
                              ? sourceMessage('fixture.home')
                              : sourceMessage('fixture.away'),
                          )}{' '}
                          {localizeValue(incidentText[incident.kind])}
                        </span>
                        {preparing(at >= 0)}
                      </button>
                    )
                  ),
                )}
              </li>
            )),
          )}
        </ol>
        {localizeValue(
          !goals.length && <p className={s.note}>{richMessage('copy.MatchMoments.55c625eb90')}</p>,
        )}
        {localizeValue(
          record.highlights
            .filter((h) => h.action !== sourceMessage('copy.summary.68a6cf8ed8'))
            .map((h, i) => (
              <p className={s.note} key={i}>
                {localizeValue(h.minute)}′ · {localizeValue(h.action)}
              </p>
            )),
        )}
        <p className={s.note}>
          {richMessage('copy.MatchMoments.53b20710d3', {
            p0: live && sourceMessage('copy.MatchMoments.001b522f40'),
          })}
        </p>
      </section>
    </details>
  );
}
