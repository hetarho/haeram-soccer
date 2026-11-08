import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { lazy, Suspense, useState } from 'react';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import { tacticLabel } from '../../../../../../packages/engine/src/tactics';
import { ClubLink } from '../../../entities/club';
import { kindLabel, seasonName } from '../../../presentation/format';
import {
  hundredths,
  matchComparison,
  PD,
  recordCounters,
  share,
  sideLines,
} from '../../../entities/match';
import { Term } from '../../../shared/ui/Term';
import s from '../../../shared/ui/styles/Analysis.module.css';

// The maps load when opened here or from a fixture row, as their own chunk (→ARCH-28).
export const MatchMaterial = lazy(() =>
  import('./MatchMaterial').then((module) => ({ default: module.MatchMaterial })),
);

/** Final analysis of one recorded match: both teams side by side, then our players (→WEB-22). */
export function MatchReport({ record, w }: { record: MatchRecord; w: World }) {
  useTextLocale();
  const players = new Map(w.players.map((p) => [p.id, p]));
  const own = record.home === w.playerClub ? 0 : 1;
  // Every own line that played, starters and substitutes alike (→WEB-22).
  const contributions = [...sideLines(record, own)].sort(
    (a, b) =>
      b.metrics[0] - a.metrics[0] ||
      b.metrics[1] - a.metrics[1] ||
      (b.detail?.[PD.xg] ?? 0) +
        (b.detail?.[PD.xa] ?? 0) -
        ((a.detail?.[PD.xg] ?? 0) + (a.detail?.[PD.xa] ?? 0)) ||
      a.id.localeCompare(b.id),
  );
  const [material, setMaterial] = useState(false);
  const rows = matchComparison(record);
  // A note names only the rules a match was played under, never the engine that settled it.
  const counters = recordCounters(record),
    grid = counters === 'all';
  const changes = new Map<string, string>();
  for (const incident of record.incidents ?? []) {
    if (incident.kind !== 'sub' || incident.side !== own) continue;
    const at = `${incident.minute}${incident.added ? `+${incident.added}` : ''}′`;
    if (incident.other)
      changes.set(incident.other, sourceMessage('copy.MatchReport.eae5c87cd9', { p0: at }));
    if (!changes.has(incident.player))
      changes.set(incident.player, sourceMessage('copy.MatchReport.6005129d1d'));
  }
  return (
    <section className={s.content} aria-label={displayMessage('copy.MatchReport.225c7bb3ac')}>
      <h3>{richMessage('copy.MatchReport.225c7bb3ac')}</h3>
      <p className={s.note}>
        {richMessage('copy.MatchReport.8698d0f920', {
          p0: seasonName(record.year),
          p1: kindLabel[record.kind],
        })}
      </p>
      <div className={s.matchTeams}>
        <b>
          <ClubLink w={w} id={record.home} crest={0} />
          <small>
            {richMessage('copy.MatchReport.b29e705a0b', { p0: tacticLabel[record.tactics[0]] })}
          </small>
        </b>
        <span>
          {localizeValue(record.score.home)}–{localizeValue(record.score.away)}
        </span>
        <b>
          <ClubLink w={w} id={record.away} crest={0} />
          <small>
            {richMessage('copy.MatchReport.e7c1e65933', { p0: tacticLabel[record.tactics[1]] })}
          </small>
        </b>
      </div>
      <div className={s.controls}>
        <button type="button" aria-expanded={material} onClick={() => setMaterial((open) => !open)}>
          {richMessage('copy.stories.a3b55318c6')}
        </button>
      </div>
      {localizeValue(
        material && (
          <Suspense
            fallback={<p className={s.note}>{richMessage('copy.FixtureNotebook.48fed68440')}</p>}
          >
            <MatchMaterial record={record} w={w} />
          </Suspense>
        ),
      )}
      <ul className={s.compare} aria-label={displayMessage('copy.MatchReport.ed17ce086f')}>
        {localizeValue(
          rows.map((row) => (
            <li key={row.label}>
              <b className={row.lead === 0 ? s.leading : undefined}>{localizeValue(row.home)}</b>
              <span>
                <Term id={row.term}>{localizeValue(row.label)}</Term>
              </span>
              <b className={row.lead === 1 ? s.leading : undefined}>{localizeValue(row.away)}</b>
              <i aria-hidden="true">
                <em style={{ width: `${Math.round(row.homeShare * 100)}%` }} />
              </i>
            </li>
          )),
        )}
      </ul>
      {localizeValue(
        counters === 'basic' && (
          <p className={s.note}>{richMessage('copy.MatchReport.042b7b522d')}</p>
        ),
      )}
      {localizeValue(
        counters === 'advanced' && (
          <p className={s.note}>{richMessage('copy.MatchReport.22701f2ab0')}</p>
        ),
      )}
      <p className={s.note}>{richMessage('copy.MatchReport.47eec9db89')}</p>
      <h4>{richMessage('copy.MatchReport.8641267f15', { p0: contributions.length })}</h4>
      <div className={s.cards}>
        {localizeValue(
          contributions.map((p) => {
            const d = p.detail;
            return (
              <article data-surface="panel" key={p.id}>
                <b>{localizeValue(players.get(p.id)?.name ?? p.id)}</b>
                <p className={s.note}>
                  {richMessage('copy.MatchReport.7245e3516c', {
                    p0: p.metrics[10],
                    p1: changes.has(p.id) && ` (${changes.get(p.id)})`,
                    p2: p.metrics[0],
                    p3: p.metrics[1],
                    p4: d && (
                      <>
                        {localizeValue(' ')}·{' '}
                        <Term id="xg">{richMessage('copy.LeagueFullStats.aa1170db7a')}</Term>{' '}
                        {localizeValue(hundredths(d[PD.xg]))} ·{' '}
                        <Term id="xa">{richMessage('copy.MatchReport.4ae9001b63')}</Term>
                        {localizeValue(' ')}
                        {localizeValue(hundredths(d[PD.xa]))}
                      </>
                    ),
                  })}
                </p>
                <p className={s.note}>
                  {richMessage('copy.MatchReport.c44b39fa02', {
                    p0: p.metrics[3],
                    p1: p.metrics[2],
                    p2: d && (
                      <>
                        {richMessage('copy.MatchReport.89eab2cffc', {
                          p0: ' ',
                          p1: (
                            <Term id="key-pass">{richMessage('copy.MatchReport.532ac6f371')}</Term>
                          ),
                          p2: d[PD.keyPasses],
                          p3: ' ',
                          p4: (
                            <Term id="final-third">
                              {richMessage('copy.MatchReport.ce19759276')}
                            </Term>
                          ),
                          p5: ' ',
                          p6: share(d[PD.finalThirdCompleted], d[PD.finalThirdPasses]),
                          p7: ' ',
                          p8: d[PD.progressivePasses],
                        })}
                      </>
                    ),
                  })}
                </p>
                <p className={s.note}>
                  {richMessage('copy.MatchReport.ce8f692935', {
                    p0: p.metrics[5],
                    p1: p.metrics[4],
                    p2: p.metrics[8],
                    p3: d ? `/${d[PD.takeOns]}` : '',
                    p4: p.metrics[6],
                    p5: p.metrics[7],
                    p6: p.metrics[9]
                      ? sourceMessage('copy.MatchReport.73cb75b111', { p0: p.metrics[9] })
                      : '',
                  })}
                </p>
                {localizeValue(
                  d && grid && (
                    <p className={s.note}>
                      <Term id="box-entry">{richMessage('copy.MatchReport.649752aebf')}</Term>{' '}
                      {localizeValue(d[PD.boxEntries])} ·{localizeValue(' ')}
                      <Term id="line-breaking">
                        {richMessage('copy.MatchReport.5986174268')}
                      </Term>{' '}
                      {localizeValue(d[PD.lineBreakingPasses])} ·{localizeValue(' ')}
                      <Term id="xt">{richMessage('copy.MatchReport.1265247a14')}</Term>{' '}
                      {localizeValue((d[PD.xtAdded] / 1000).toFixed(2))}
                      {localizeValue(
                        d[PD.yellowCards] + d[PD.redCards] > 0 && (
                          <>
                            {localizeValue(' ')}·{' '}
                            <Term id="cards">{richMessage('copy.MatchReport.54c8d68f37')}</Term>{' '}
                            {localizeValue(d[PD.yellowCards])}·{localizeValue(d[PD.redCards])}
                          </>
                        ),
                      )}
                    </p>
                  ),
                )}
              </article>
            );
          }),
        )}
      </div>
      {localizeValue(
        !contributions.length && (
          <p className={s.note}>{richMessage('copy.MatchReport.7b0846b6de')}</p>
        ),
      )}
    </section>
  );
}
