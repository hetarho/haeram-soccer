import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { Select } from '../../../shared/ui/Select';
import { useState } from 'react';
import type { Player, World } from '../../../../../../packages/contracts/src/types';
import {
  activeMatchModel,
  type FullStatsRead,
} from '../../../../../../packages/contracts/src/match-model';
import { ATTRIBUTES } from '../../../../../../packages/contracts/src/player';
import { ATTRIBUTE_LABEL } from '../../../../../../packages/engine/src/player';
import type { GameClient } from '../../../runtime/client';
import { Dialog } from '../../../shared/ui/Dialog';
import { positionsLabel } from '../../../entities/player';
import {
  FULL_STATS_FAILED,
  fullStatsAdvanced,
  fullStatsAppearances,
  fullStatsCoverage,
  fullStatsPlayers,
  fullStatsRates,
  leagueStatsScope,
  useFullStats,
  type FullStatsPlayer,
} from '../../../entities/league';
import { PlayerAdvancedStats } from '../../../entities/player';
import { PlayerPerformance } from '../../../entities/player';
import { performanceRows, type PlayerScope } from '../../../entities/player';
import s from '../../../shared/ui/styles/Analysis.module.css';

/** The 16 attributes, then potential and fatigue (→WEB-25). */
const skills: readonly (readonly [string, string, (p: Player) => number])[] = [
  ...ATTRIBUTES.map((a) => [ATTRIBUTE_LABEL[a], a, (p: Player) => p.attrs[a]] as const),
  [sourceMessage('copy.AssigneeProfile.ad725da0ea'), 'potential', (p: Player) => p.potential],
  [sourceMessage('copy.PlayerComparison.e61ebab7c3'), 'fatigue', (p: Player) => p.fatigue],
];
const status = (p: Player) =>
  p.status === 'active'
    ? sourceMessage('copy.PlayerComparison.3aa8c5b4af')
    : p.status === 'retired'
      ? sourceMessage('copy.PlayerComparison.1aced77ca0')
      : sourceMessage('copy.PlayerComparison.c4b01f6215');
/** Own-club records, or this season's league with every club's players (→WEB-89). */
type ComparisonScope = PlayerScope | 'league';
const rate = (value: number | undefined) => (value === undefined ? '—' : value.toFixed(2));

export function PlayerComparison({
  w,
  client,
  initialScope,
  onClose,
}: {
  w: World;
  client: Pick<GameClient, 'fullStats'>;
  initialScope: PlayerScope;
  onClose: () => void;
}) {
  useTextLocale();
  const [scope, setScope] = useState<ComparisonScope>(initialScope),
    [a, setA] = useState(''),
    [b, setB] = useState('');
  // The league's complete statistics exist only once the world tracks them.
  const tracked = activeMatchModel(w) !== undefined;
  const full = useFullStats(client, w, scope === 'league' ? leagueStatsScope(w) : undefined);
  const pool = w.players.filter((p) => p.status === 'active' || scope === 'career');
  const left = pool.find((p) => p.id === a) || pool[0];
  const right =
    pool.find((p) => p.id === b && p.id !== left?.id) || pool.find((p) => p.id !== left?.id);
  const ownScope = scope === 'league' ? 'season' : scope;
  const statsA = left && performanceRows(left[ownScope]),
    statsB = right && performanceRows(right[ownScope]);
  return (
    <Dialog
      label={localizeValue(
        scope === 'league'
          ? sourceMessage('copy.PlayerComparison.b5cbdd27c7')
          : sourceMessage('copy.PlayerComparison.e5d818b4c3'),
      )}
      onClose={onClose}
      wide
      actions={<button onClick={onClose}>{richMessage('copy.PlayerComparison.ba98764c52')}</button>}
    >
      <div className={s.controls}>
        <label>
          {richMessage('copy.PlayerComparison.932e4d93a3', {
            p0: ' ',
            p1: (
              <Select
                aria-label={displayMessage('copy.PlayerComparison.96d3969d1f')}
                value={scope}
                onValueChange={(value) => setScope(value as ComparisonScope)}
              >
                <option value="season">{richMessage('copy.AnalysisExport.92da79e9ab')}</option>
                <option value="career">{richMessage('copy.AnalysisExport.05b05e1b81')}</option>
                {localizeValue(
                  tracked && (
                    <option value="league">
                      {richMessage('copy.PlayerComparison.994ca0df48')}
                    </option>
                  ),
                )}
              </Select>
            ),
          })}
        </label>
        {localizeValue(
          scope !== 'league' && (
            <>
              <label>
                {richMessage('copy.PlayerComparison.fddc552b70', {
                  p0: ' ',
                  p1: (
                    <Select
                      aria-label={displayMessage('copy.PlayerComparison.6d47f21b87')}
                      value={left?.id || ''}
                      onValueChange={(value) => setA(value)}
                    >
                      {localizeValue(
                        pool
                          .filter((p) => p.id !== right?.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {localizeValue(p.position)} · {localizeValue(status(p))}
                            </option>
                          )),
                      )}
                    </Select>
                  ),
                })}
              </label>
              <label>
                {richMessage('copy.PlayerComparison.ac57591843', {
                  p0: ' ',
                  p1: (
                    <Select
                      aria-label={displayMessage('copy.PlayerComparison.09887c4738')}
                      value={right?.id || ''}
                      onValueChange={(value) => setB(value)}
                    >
                      {localizeValue(
                        pool
                          .filter((p) => p.id !== left?.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {localizeValue(p.position)} · {localizeValue(status(p))}
                            </option>
                          )),
                      )}
                    </Select>
                  ),
                })}
              </label>
            </>
          ),
        )}
      </div>
      {localizeValue(
        scope === 'league' ? (
          full.status === 'failed' ? (
            <p className={s.note} role="status">
              {localizeValue(FULL_STATS_FAILED)}
              {localizeValue(' ')}
              <button type="button" onClick={full.retry}>
                {richMessage('copy.ConstantsPage.9cee01b433')}
              </button>
            </p>
          ) : full.status !== 'ready' ? (
            <p className={s.note} role="status">
              {richMessage('copy.PlayerComparison.064be3df2e')}
            </p>
          ) : (
            <LeagueComparison w={w} full={full.read} a={a} b={b} onA={setA} onB={setB} />
          )
        ) : left && right ? (
          <section
            className={s.content}
            aria-label={displayMessage('copy.PlayerComparison.4a5b0c4e96')}
          >
            <div className={s.matchTeams}>
              <b>
                {left.name}
                <small>
                  {localizeValue(left.position)} · {localizeValue(status(left))}
                </small>
                <small data-testid="compare-positions">
                  {localizeValue(positionsLabel(left.positions))}
                </small>
              </b>
              <span>{richMessage('copy.LeagueInsights.f130559f0e')}</span>
              <b>
                {right.name}
                <small>
                  {localizeValue(right.position)} · {localizeValue(status(right))}
                </small>
                <small>{localizeValue(positionsLabel(right.positions))}</small>
              </b>
            </div>
            <p className={s.note}>{richMessage('copy.PlayerComparison.825c011900')}</p>
            <div className={s.metricRows}>
              {localizeValue(
                skills.map(([label, key, read]) => (
                  <div key={key}>
                    <strong>
                      {localizeValue(read(left).toFixed(1))}
                      <progress
                        className={s.skillBar}
                        aria-label={localizeValue(`${left.name} ${label}`)}
                        max={100}
                        value={read(left)}
                      />
                    </strong>
                    <span>{localizeValue(label)}</span>
                    <strong>
                      {localizeValue(read(right).toFixed(1))}
                      <progress
                        className={s.skillBar}
                        aria-label={localizeValue(`${right.name} ${label}`)}
                        max={100}
                        value={read(right)}
                      />
                    </strong>
                  </div>
                )),
              )}
              <div>
                <strong>
                  {localizeValue(left[ownScope][10])}
                  <small>{richMessage('copy.PlayerComparison.ca4a187881')}</small>
                </strong>
                <span>{richMessage('copy.PlayerComparison.f0e9ef7161')}</span>
                <strong>
                  {localizeValue(right[ownScope][10])}
                  <small>{richMessage('copy.PlayerComparison.ca4a187881')}</small>
                </strong>
              </div>
              {localizeValue(
                statsA!.map((row, i) => (
                  <div key={row.label}>
                    <strong>{localizeValue(rate(row.per90))}</strong>
                    <span>
                      {richMessage('copy.PlayerComparison.a538caf9c4', { p0: row.label })}
                    </span>
                    <strong>{localizeValue(rate(statsB![i].per90))}</strong>
                  </div>
                )),
              )}
            </div>
            {localizeValue(
              (left[ownScope][10] < 180 || right[ownScope][10] < 180) && (
                <p className={s.note}>{richMessage('copy.PlayerComparison.1d1aa4b285')}</p>
              ),
            )}
            <details data-ui="disclosure" className={s.disclosure}>
              <summary>{richMessage('copy.PlayerComparison.75023f2b42')}</summary>
              <PlayerPerformance player={left} scope={ownScope} />
              <PlayerPerformance player={right} scope={ownScope} />
            </details>
          </section>
        ) : (
          <p className={s.note}>{richMessage('copy.PlayerComparison.08a41ccd96')}</p>
        ),
      )}
    </Dialog>
  );
}

/**
 * Any two players of our league this season, ours and other clubs' alike, read from the same
 * complete statistics: the same counters, denominators and appearance rule on both sides, from the
 * same tracking start (→WEB-89, HIST-17). Abilities stay with our own players' comparison.
 */
function LeagueComparison({
  w,
  full,
  a,
  b,
  onA,
  onB,
}: {
  w: World;
  full: FullStatsRead | undefined;
  a: string;
  b: string;
  onA: (id: string) => void;
  onB: (id: string) => void;
}) {
  useTextLocale();
  const coverage = fullStatsCoverage(full, w.year);
  if (!full || coverage.status === 'unavailable')
    return (
      <p className={s.note} data-testid="full-stats-coverage">
        {localizeValue(coverage.text)}
      </p>
    );
  const rows = fullStatsPlayers(full, w).sort(
    (x, y) => y.minutes - x.minutes || x.id.localeCompare(y.id),
  );
  const left = rows.find((row) => row.id === a) || rows.find((row) => row.ours) || rows[0];
  const right =
    rows.find((row) => row.id === b && row.id !== left?.id) ||
    rows.find((row) => !row.ours && row.id !== left?.id) ||
    rows.find((row) => row.id !== left?.id);
  const club = (id: string) => w.clubs.find((c) => c.id === id)?.short || id;
  const clubs = (row: FullStatsPlayer) => row.clubs.map(club).join(' → ');
  const option = (row: FullStatsPlayer) => (
    <option key={row.id} value={row.id}>
      {row.name} · {localizeValue(row.position)} · {localizeValue(clubs(row))}
      {localizeValue(row.ours ? sourceMessage('copy.PlayerComparison.4c74be1201') : '')}
    </option>
  );
  const rates = left && right && [fullStatsRates(left), fullStatsRates(right)];
  return (
    <>
      <div className={s.controls}>
        <label>
          {richMessage('copy.PlayerComparison.fddc552b70', {
            p0: ' ',
            p1: (
              <Select
                aria-label={displayMessage('copy.PlayerComparison.6d47f21b87')}
                value={left?.id || ''}
                onValueChange={(value) => onA(value)}
              >
                {localizeValue(rows.filter((row) => row.id !== right?.id).map(option))}
              </Select>
            ),
          })}
        </label>
        <label>
          {richMessage('copy.PlayerComparison.ac57591843', {
            p0: ' ',
            p1: (
              <Select
                aria-label={displayMessage('copy.PlayerComparison.09887c4738')}
                value={right?.id || ''}
                onValueChange={(value) => onB(value)}
              >
                {localizeValue(rows.filter((row) => row.id !== left?.id).map(option))}
              </Select>
            ),
          })}
        </label>
      </div>
      <p className={s.note} data-testid="full-stats-coverage">
        {localizeValue(coverage.text)}
      </p>
      {localizeValue(
        left && right && rates ? (
          <section
            className={s.content}
            aria-label={displayMessage('copy.PlayerComparison.4a5b0c4e96')}
          >
            <div className={s.matchTeams}>
              <b>
                {left.name}
                <small>
                  {localizeValue(left.position)} · {localizeValue(clubs(left))}
                </small>
              </b>
              <span>{richMessage('copy.LeagueInsights.f130559f0e')}</span>
              <b>
                {right.name}
                <small>
                  {localizeValue(right.position)} · {localizeValue(clubs(right))}
                </small>
              </b>
            </div>
            <div className={s.metricRows}>
              <div>
                <strong>{localizeValue(fullStatsAppearances(left))}</strong>
                <span>{richMessage('copy.BallonDorView.b849877c07')}</span>
                <strong>{localizeValue(fullStatsAppearances(right))}</strong>
              </div>
              <div>
                <strong>
                  {localizeValue(left.minutes)}
                  <small>{richMessage('copy.PlayerComparison.ca4a187881')}</small>
                </strong>
                <span>{richMessage('copy.PlayerComparison.f0e9ef7161')}</span>
                <strong>
                  {localizeValue(right.minutes)}
                  <small>{richMessage('copy.PlayerComparison.ca4a187881')}</small>
                </strong>
              </div>
              {localizeValue(
                rates[0].map((row, i) => (
                  <div key={row.label}>
                    <strong>{localizeValue(row.text)}</strong>
                    <span>
                      {richMessage('copy.PlayerComparison.a538caf9c4', { p0: row.label })}
                    </span>
                    <strong>{localizeValue(rates[1][i]!.text)}</strong>
                  </div>
                )),
              )}
            </div>
            {localizeValue(
              (left.minutes < 180 || right.minutes < 180) && (
                <p className={s.note}>{richMessage('copy.PlayerComparison.1d1aa4b285')}</p>
              ),
            )}
            <details data-ui="disclosure" className={s.disclosure}>
              <summary>{richMessage('copy.PlayerComparison.75023f2b42')}</summary>
              {localizeValue(
                [left, right].map((row) => (
                  <div key={row.id}>
                    <PlayerPerformance
                      stats={row.metrics}
                      title={displayMessage('copy.PlayerComparison.b2b1928be5', { p0: row.name })}
                    />
                    <PlayerAdvancedStats advanced={fullStatsAdvanced(row)} />
                  </div>
                )),
              )}
            </details>
          </section>
        ) : (
          <p className={s.note}>{richMessage('copy.PlayerComparison.a39e28516b')}</p>
        ),
      )}
    </>
  );
}
