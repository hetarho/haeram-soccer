import { useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { HeatMap } from '../../../../packages/engine/src/material';
import {
  BAND_EDGES,
  LANE_EDGES,
  PITCH,
  cellName,
} from '../../../../packages/engine/src/grid/pitch';
import { paintHeat } from './heatPaint';
import { VIEW, cellAt, cellRect, heatCells, px, py } from './materialView';
import s from './MatchMaterial.module.css';
import { usePitchSkin } from './usePitchSkin';

export const FIELD = {
  x: VIEW.pad,
  y: VIEW.pad,
  width: VIEW.width - VIEW.pad * 2,
  height: VIEW.height - VIEW.pad * 2,
};

/** The pitch lines at their real places, so the 40 cells sit on the boxes they are named after. */
function Markings() {
  const box = [LANE_EDGES[1], LANE_EDGES[4]] as const;
  const six = [LANE_EDGES[2], LANE_EDGES[3]] as const;
  const end = (x: number, depth: number, span: readonly [number, number]) => (
    <rect
      x={px(Math.min(x, x + depth))}
      y={py(span[0])}
      width={px(Math.abs(depth)) - px(0)}
      height={py(span[1]) - py(span[0])}
    />
  );
  return (
    <g className={s.lines}>
      <rect {...FIELD} />
      <line x1={px(PITCH.length / 2)} y1={FIELD.y} x2={px(PITCH.length / 2)} y2={py(PITCH.width)} />
      <ellipse
        cx={px(PITCH.length / 2)}
        cy={py(PITCH.width / 2)}
        rx={FIELD.width * 0.09}
        ry={FIELD.height * 0.15}
      />
      {end(0, BAND_EDGES[2], box)}
      {end(0, BAND_EDGES[1], six)}
      {end(PITCH.length, -BAND_EDGES[2], box)}
      {end(PITCH.length, -BAND_EDGES[1], six)}
    </g>
  );
}

/**
 * The 1.9:1 pitch with the side it describes attacking right. Tapping it names the cell under the
 * finger (→WEB-84), or what a marked shape stands for.
 */
export function MaterialPitch({
  label,
  children,
  heat,
  describe,
  legend,
}: {
  label: string;
  children?: ReactNode;
  /** A heat map's layer, over the grass and under the markings. */
  heat?: ReactNode;
  /** What a tap on a cell says beyond its name. */
  describe?: (cell: number) => string;
  legend?: ReactNode;
}) {
  const [note, setNote] = useState<{ cell?: number; text: string }>();
  const groundId = useId();
  const pitch = useRef<SVGSVGElement>(null);
  const skin = usePitchSkin(pitch);
  const tap = (event: MouseEvent<SVGSVGElement>) => {
    const marked = (event.target as Element).closest('[data-label]');
    if (marked) return setNote({ text: marked.getAttribute('data-label')! });
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const cell = cellAt(
      ((event.clientX - box.left) / box.width) * VIEW.width,
      ((event.clientY - box.top) / box.height) * VIEW.height,
    );
    setNote(cell === undefined ? undefined : { cell, text: describe?.(cell) ?? cellName(cell) });
  };
  const stripe = FIELD.width / 10;
  return (
    <figure className={s.figure}>
      <svg
        ref={pitch}
        className={s.pitch}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label={label}
        onClick={tap}
        data-testid="material-pitch"
      >
        <rect className={s.grass} width={VIEW.width} height={VIEW.height} />
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            className={i % 2 ? s.stripe : s.stripeAlt}
            x={FIELD.x + stripe * i}
            y={FIELD.y}
            width={stripe + 0.2}
            height={FIELD.height}
          />
        ))}
        {skin.textureUrl && (
          <>
            <defs>
              <pattern
                id={groundId}
                width={skin.textureSize / 4}
                height={skin.textureSize / 4}
                patternUnits="userSpaceOnUse"
              >
                <image
                  href={skin.textureUrl}
                  width={skin.textureSize / 4}
                  height={skin.textureSize / 4}
                />
              </pattern>
            </defs>
            <rect
              width={VIEW.width}
              height={VIEW.height}
              fill={`url(#${groundId})`}
              opacity={skin.textureOpacity}
              pointerEvents="none"
            />
          </>
        )}
        {heat}
        <Markings />
        <path
          className={s.arrow}
          d={`M ${VIEW.width - 30} 6 h 18 m -4 -2.5 l 4 2.5 l -4 2.5`}
          aria-hidden="true"
        />
        {children}
        {note?.cell !== undefined && (
          <rect className={s.picked} {...cellRect(note.cell)} pointerEvents="none" />
        )}
      </svg>
      <figcaption className={s.caption} aria-live="polite">
        {note?.text ?? '칸이나 표시를 누르면 이름과 기록이 보여요 · 오른쪽으로 공격'}
      </figcaption>
      {legend}
    </figure>
  );
}

/** Painted maps by their cells, so a tab switch or a reopened sheet never repaints (bounded). */
const painted = new Map<string, string | undefined>();
const PAINTED_KEPT = 32;

function paintedHeat(cells: readonly number[]) {
  const key = cells.join(',');
  if (painted.has(key)) return painted.get(key);
  const url =
    typeof document === 'undefined'
      ? undefined
      : paintHeat(document.createElement('canvas'), cells);
  if (painted.size >= PAINTED_KEPT) painted.delete(painted.keys().next().value!);
  painted.set(key, url);
  return url;
}

/**
 * A heat map on the material pitch (→WEB-99): the canvas-painted blobs as one image layer under the
 * markings, or the cells shaded by their share where the browser has no 2D canvas. A tap names the
 * cell and its touches; the label adds the busiest cell for assistive technology.
 */
export function HeatPitch({
  map,
  label,
  legend,
}: {
  map: HeatMap | undefined;
  /** What the map is, with its total touches; the busiest cell's name is appended. */
  label: string;
  legend?: ReactNode;
}) {
  const cells = useMemo(() => heatCells(map), [map]);
  const touches = useMemo(() => cells.map((c) => c.touches), [cells]);
  const url = useMemo(() => paintedHeat(touches), [touches]);
  const busiest = cells.reduce((top, c) => (c.touches > top.touches ? c : top), cells[0]!);
  return (
    <MaterialPitch
      label={busiest.touches ? `${label} · 가장 많은 곳 ${cellName(busiest.cell)}` : label}
      describe={(cell) => cells[cell]!.label}
      legend={legend}
      heat={
        url ? (
          <image
            href={url}
            width={VIEW.width}
            height={VIEW.height}
            preserveAspectRatio="none"
            pointerEvents="none"
            data-testid="heat-image"
          />
        ) : (
          cells.map((c) => (
            <rect
              key={c.cell}
              className={s.heat}
              x={c.x}
              y={c.y}
              width={c.width}
              height={c.height}
              fillOpacity={c.shade * 0.82}
            />
          ))
        )
      }
    />
  );
}
