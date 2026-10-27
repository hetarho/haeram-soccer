import type { ReactNode } from 'react';
import type { Position } from '../../../../packages/contracts/src/player';
import type { Tactic } from '../../../../packages/contracts/src/types';
import { MATCH_MOTION_CONFIG } from '../../../../packages/engine/src/grid/playback';
import { FORMATIONS } from '../../../../packages/engine/src/player';
import s from './FormationPitch.module.css';

/** Where each position stands on a vertical pitch, our goal at the bottom (left/top in %). */
export const POSITION_SPOT: Record<Position, readonly [number, number]> = {
  GK: [50, 92],
  CB: [50, 76],
  LB: [12, 72],
  RB: [88, 72],
  LWB: [10, 58],
  RWB: [90, 58],
  DM: [50, 62],
  CM: [50, 48],
  LM: [12, 44],
  RM: [88, 44],
  AM: [50, 34],
  LW: [14, 24],
  RW: [86, 24],
  ST: [50, 13],
};

/**
 * A formation drawn on a vertical pitch (→CLUB-10, STAFF-22): each of its 11 slots where its
 * position stands, holding what `slot` renders for it. `compact` draws a shorter pitch for a card,
 * such as one of the tactic laboratory's four (→WEB-21).
 */
export function FormationPitch({
  tactic,
  label,
  slot,
  compact,
}: {
  tactic: Tactic;
  label: string;
  slot: (index: number) => ReactNode;
  compact?: boolean;
}) {
  const spots = MATCH_MOTION_CONFIG.formations[tactic];
  return (
    <div className={compact ? `${s.pitch} ${s.compact}` : s.pitch} role="group" aria-label={label}>
      <span className={s.half} aria-hidden="true" />
      <span className={s.box} aria-hidden="true" />
      {FORMATIONS[tactic].slots.map((place, index) => {
        // The motion spots run along the pitch from our goal; drawn upright, they climb.
        const [along, across] = spots[index] ?? [50, 50];
        return (
          <div
            data-surface="panel"
            key={index}
            className={s.slot}
            data-line={place.position === 'GK' ? 'GK' : undefined}
            style={{
              left: `${Math.min(90, Math.max(10, 50 + (across - 50) * 1.12))}%`,
              top: `${93 - (along - 5) * 1.22}%`,
            }}
          >
            {slot(index)}
          </div>
        );
      })}
    </div>
  );
}

/** Level marks on a mini pitch: 최상 gold, 준수 green, 어색 grey (→PLAYER-4). */
export const LEVEL_LABEL = { 3: '최상', 2: '준수', 1: '어색' } as const;
/** His positions with levels, best first: "CB 최상 · LB 준수" (→PLAYER-4). */
export function positionsLabel(positions: Partial<Record<Position, 1 | 2 | 3>>) {
  return (Object.entries(positions) as [Position, 1 | 2 | 3][])
    .sort((a, b) => b[1] - a[1])
    .map(([position, level]) => `${position} ${LEVEL_LABEL[level]}`)
    .join(' · ');
}
/** A player's positions on a small pitch, each marked by his level there. */
export function PositionMap({
  positions,
  main,
}: {
  positions: Partial<Record<Position, 1 | 2 | 3>>;
  main: Position;
}) {
  const listed = (Object.entries(positions) as [Position, 1 | 2 | 3][]).sort((a, b) => b[1] - a[1]);
  return (
    <div
      className={`${s.pitch} ${s.mini}`}
      data-ui="position-map"
      role="img"
      aria-label={`포지션 ${listed.map(([p, level]) => `${p} ${LEVEL_LABEL[level]}`).join(', ')}`}
    >
      <span className={s.half} aria-hidden="true" />
      <span className={s.box} aria-hidden="true" />
      {listed.map(([position, level]) => (
        <span
          key={position}
          className={s.dot}
          data-ui="position-mark"
          data-level={level}
          data-main={position === main || undefined}
          style={{ left: `${POSITION_SPOT[position][0]}%`, top: `${POSITION_SPOT[position][1]}%` }}
        >
          {position}
        </span>
      ))}
    </div>
  );
}
