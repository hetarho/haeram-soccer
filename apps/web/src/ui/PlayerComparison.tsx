import { Select } from './Select';
import { useState } from 'react';
import type { Player, World } from '../../../../packages/contracts/src/types';
import {
  activeMatchModel,
  type FullStatsRead,
} from '../../../../packages/contracts/src/match-model';
import { ATTRIBUTES } from '../../../../packages/contracts/src/player';
import { ATTRIBUTE_LABEL } from '../../../../packages/engine/src/player';
import type { GameClient } from '../runtime/client';
import { Dialog } from './Dialog';
import { positionsLabel } from './FormationPitch';
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
} from './fullStatsView';
import { PlayerAdvancedStats } from './PlayerAdvancedStats';
import { PlayerPerformance } from './PlayerPerformance';
import { performanceRows, type PlayerScope } from './playerAnalysis';
import s from './Analysis.module.css';

/** The 16 attributes, then potential and fatigue (→WEB-25). */
const skills: readonly (readonly [string, string, (p: Player) => number])[] = [
  ...ATTRIBUTES.map((a) => [ATTRIBUTE_LABEL[a], a, (p: Player) => p.attrs[a]] as const),
  ['잠재력', 'potential', (p: Player) => p.potential],
  ['피로 · 낮을수록 회복', 'fatigue', (p: Player) => p.fatigue],
];
const status = (p: Player) =>
  p.status === 'active'
    ? '활동 중'
    : p.status === 'retired'
      ? '은퇴 · 마지막 보존 능력'
      : '매각 · 마지막 보존 능력';
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
      label={scope === 'league' ? '리그 선수 비교' : '우리 선수 비교'}
      onClose={onClose}
      wide
      actions={<button onClick={onClose}>비교 마치기</button>}
    >
      <div className={s.controls}>
        <label>
          함께 비교할 기록{' '}
          <Select
            aria-label="비교 지표 범위"
            value={scope}
            onValueChange={(value) => setScope(value as ComparisonScope)}
          >
            <option value="season">현재 시즌 · 모든 대회</option>
            <option value="career">우리 클럽 통산</option>
            {tracked && <option value="league">이번 시즌 리그 · 다른 클럽 포함</option>}
          </Select>
        </label>
        {scope !== 'league' && (
          <>
            <label>
              선수 A{' '}
              <Select
                aria-label="비교 선수 A"
                value={left?.id || ''}
                onValueChange={(value) => setA(value)}
              >
                {pool
                  .filter((p) => p.id !== right?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.position} · {status(p)}
                    </option>
                  ))}
              </Select>
            </label>
            <label>
              선수 B{' '}
              <Select
                aria-label="비교 선수 B"
                value={right?.id || ''}
                onValueChange={(value) => setB(value)}
              >
                {pool
                  .filter((p) => p.id !== left?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.position} · {status(p)}
                    </option>
                  ))}
              </Select>
            </label>
          </>
        )}
      </div>
      {scope === 'league' ? (
        full.status === 'failed' ? (
          <p className={s.note} role="status">
            {FULL_STATS_FAILED}{' '}
            <button type="button" onClick={full.retry}>
              다시 불러오기
            </button>
          </p>
        ) : full.status !== 'ready' ? (
          <p className={s.note} role="status">
            리그 세부 기록을 불러오는 중…
          </p>
        ) : (
          <LeagueComparison w={w} full={full.read} a={a} b={b} onA={setA} onB={setB} />
        )
      ) : left && right ? (
        <section className={s.content} aria-label="두 선수 비교 결과">
          <div className={s.matchTeams}>
            <b>
              {left.name}
              <small>
                {left.position} · {status(left)}
              </small>
              <small data-testid="compare-positions">{positionsLabel(left.positions)}</small>
            </b>
            <span>vs</span>
            <b>
              {right.name}
              <small>
                {right.position} · {status(right)}
              </small>
              <small>{positionsLabel(right.positions)}</small>
            </b>
          </div>
          <p className={s.note}>
            능력은 100점 척도예요. 주 포지션이 다른 선수는 필요한 능력도 달라요.
          </p>
          <div className={s.metricRows}>
            {skills.map(([label, key, read]) => (
              <div key={key}>
                <strong>
                  {read(left).toFixed(1)}
                  <progress
                    className={s.skillBar}
                    aria-label={`${left.name} ${label}`}
                    max={100}
                    value={read(left)}
                  />
                </strong>
                <span>{label}</span>
                <strong>
                  {read(right).toFixed(1)}
                  <progress
                    className={s.skillBar}
                    aria-label={`${right.name} ${label}`}
                    max={100}
                    value={read(right)}
                  />
                </strong>
              </div>
            ))}
            <div>
              <strong>
                {left[ownScope][10]}
                <small>분</small>
              </strong>
              <span>실제 출전</span>
              <strong>
                {right[ownScope][10]}
                <small>분</small>
              </strong>
            </div>
            {statsA!.map((row, i) => (
              <div key={row.label}>
                <strong>{rate(row.per90)}</strong>
                <span>{row.label} /90분</span>
                <strong>{rate(statsB![i].per90)}</strong>
              </div>
            ))}
          </div>
          {(left[ownScope][10] < 180 || right[ownScope][10] < 180) && (
            <p className={s.note}>표본 주의 · 한 선수 이상의 출전 기록이 180분 미만이에요.</p>
          )}
          <details className={s.disclosure}>
            <summary>분모·원시 기록 펼치기</summary>
            <PlayerPerformance player={left} scope={ownScope} />
            <PlayerPerformance player={right} scope={ownScope} />
          </details>
        </section>
      ) : (
        <p className={s.note}>이 범위에서 비교할 선수 두 명이 필요해요.</p>
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
  const coverage = fullStatsCoverage(full, w.year);
  if (!full || coverage.status === 'unavailable')
    return (
      <p className={s.note} data-testid="full-stats-coverage">
        {coverage.text}
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
      {row.name} · {row.position} · {clubs(row)}
      {row.ours ? ' · 우리 선수' : ''}
    </option>
  );
  const rates = left && right && [fullStatsRates(left), fullStatsRates(right)];
  return (
    <>
      <div className={s.controls}>
        <label>
          선수 A{' '}
          <Select
            aria-label="비교 선수 A"
            value={left?.id || ''}
            onValueChange={(value) => onA(value)}
          >
            {rows.filter((row) => row.id !== right?.id).map(option)}
          </Select>
        </label>
        <label>
          선수 B{' '}
          <Select
            aria-label="비교 선수 B"
            value={right?.id || ''}
            onValueChange={(value) => onB(value)}
          >
            {rows.filter((row) => row.id !== left?.id).map(option)}
          </Select>
        </label>
      </div>
      <p className={s.note} data-testid="full-stats-coverage">
        {coverage.text}
      </p>
      {left && right && rates ? (
        <section className={s.content} aria-label="두 선수 비교 결과">
          <div className={s.matchTeams}>
            <b>
              {left.name}
              <small>
                {left.position} · {clubs(left)}
              </small>
            </b>
            <span>vs</span>
            <b>
              {right.name}
              <small>
                {right.position} · {clubs(right)}
              </small>
            </b>
          </div>
          <div className={s.metricRows}>
            <div>
              <strong>{fullStatsAppearances(left)}</strong>
              <span>출전</span>
              <strong>{fullStatsAppearances(right)}</strong>
            </div>
            <div>
              <strong>
                {left.minutes}
                <small>분</small>
              </strong>
              <span>실제 출전</span>
              <strong>
                {right.minutes}
                <small>분</small>
              </strong>
            </div>
            {rates[0].map((row, i) => (
              <div key={row.label}>
                <strong>{row.text}</strong>
                <span>{row.label} /90분</span>
                <strong>{rates[1][i]!.text}</strong>
              </div>
            ))}
          </div>
          {(left.minutes < 180 || right.minutes < 180) && (
            <p className={s.note}>표본 주의 · 한 선수 이상의 출전 기록이 180분 미만이에요.</p>
          )}
          <details className={s.disclosure}>
            <summary>분모·원시 기록 펼치기</summary>
            {[left, right].map((row) => (
              <div key={row.id}>
                <PlayerPerformance stats={row.metrics} title={`${row.name} · 이번 시즌 리그`} />
                <PlayerAdvancedStats advanced={fullStatsAdvanced(row)} />
              </div>
            ))}
          </details>
        </section>
      ) : (
        <p className={s.note}>이번 시즌 리그 기록이 있는 선수 두 명이 필요해요.</p>
      )}
    </>
  );
}
