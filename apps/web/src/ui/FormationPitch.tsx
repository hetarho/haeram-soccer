import { useId, useState, type ReactNode } from 'react';
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

/** A proportional field with small player discs; full slot facts sit below the field. */
export function FormationPitch({
  tactic,
  label,
  slot,
  slotLabel,
  slotTitle,
  compact,
}: {
  tactic: Tactic;
  label: string;
  slot: (index: number) => ReactNode;
  slotLabel?: (index: number) => string;
  slotTitle?: (index: number) => string;
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const detailId = useId();
  const spots = MATCH_MOTION_CONFIG.formations[tactic];
  return (
    <div className={s.formation} role="group" aria-label={label}>
      <div className={compact ? `${s.pitch} ${s.compact}` : s.pitch} data-ui="formation-pitch">
        <svg className={s.markings} viewBox="0 0 68 105" aria-hidden="true">
          <rect x="3" y="3" width="62" height="99" />
          <path d="M3 52.5H65 M13.84 3V19.5H54.16V3 M13.84 102V85.5H54.16V102 M24.84 3V8.5H43.16V3 M24.84 102V96.5H43.16V102" />
          <circle cx="34" cy="52.5" r="9.15" />
          <circle cx="34" cy="52.5" r="0.6" className={s.spot} />
          <circle cx="34" cy="14" r="0.6" className={s.spot} />
          <circle cx="34" cy="91" r="0.6" className={s.spot} />
        </svg>
        {FORMATIONS[tactic].slots.map((place, index) => {
          const [along, across] = spots[index] ?? [50, 50];
          const style = {
            left: `${Math.min(88, Math.max(12, 50 + (across - 50) * 1.22))}%`,
            top: `${88 - (along - 5) * 1.08}%`,
          };
          const marker = (
            <>
              <span className={s.disc} aria-hidden="true">
                {place.position}
              </span>
              <span className={s.name}>{slotLabel ? slotLabel(index) : slot(index)}</span>
            </>
          );
          return compact ? (
            <div
              key={index}
              className={s.slot}
              style={style}
              title={`${place.position} · ${slotTitle?.(index) ?? slotLabel?.(index) ?? ''}`}
            >
              {marker}
            </div>
          ) : (
            <button
              key={index}
              className={s.slot}
              style={style}
              type="button"
              data-ui="formation-player"
              aria-label={`선발 ${index + 1} · ${place.position} · ${slotTitle?.(index) ?? slotLabel?.(index) ?? ''}`}
              aria-pressed={selected === index}
              aria-controls={`${detailId}-${index}`}
              onClick={() => setSelected(index)}
            >
              {marker}
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className={s.details} data-ui="formation-details" aria-live="polite">
          {FORMATIONS[tactic].slots.map((_, index) => (
            <div id={`${detailId}-${index}`} key={index} hidden={selected !== index}>
              {slot(index)}
            </div>
          ))}
          <small>선수 표식을 누르면 자리별 상세 정보가 보여요.</small>
        </div>
      )}
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
