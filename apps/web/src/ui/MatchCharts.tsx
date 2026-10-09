import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import { CrestMark } from './ClubCrest';
import { colourDistance, contrast, type Crest } from './crests';
import t from './Pitch.module.css';

type Chart = 'possession' | 'xg' | 'shots';
const CHARTS: [Chart, string][] = [
  ['possession', '점유율'],
  ['xg', 'xG'],
  ['shots', '슈팅'],
];
/** Minutes in the rolling possession window. */
const WINDOW = 10;
/** The chart surface (`--surface-deep`); series must clear 3:1 against it. */
const SURFACE = '#07110e';
const W = 320,
  H = 92,
  LEFT = 26,
  RIGHT = 8,
  TOP = 8,
  BOTTOM = 16;

function mix(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (value: number) => Math.round(value + (255 - value) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((value) => channel(value).toString(16).padStart(2, '0'))
    .join('')}`;
}
/** A kit colour lifted until it reads as a line on the dark chart surface. */
export function seriesColour(kit: string) {
  let colour = kit;
  for (let step = 1; step <= 10 && contrast(colour, SURFACE) < 3; step++)
    colour = mix(kit, step * 0.1);
  return colour;
}

/** Per-minute series for both sides, up to the presented minute only. */
export function chartSeries(playback: MatchPlayback, minute: number, chart: Chart) {
  const frames = playback.frames.slice(0, Math.max(0, minute));
  return [0, 1].map((side) =>
    frames.map((frame, i) => {
      if (chart === 'xg') return frame.xg?.[side] ?? 0;
      if (chart === 'shots') return frame.metrics[side][4];
      const window = frames.slice(Math.max(0, i - WINDOW + 1), i + 1);
      return (window.filter((f) => f.side === side).length / window.length) * 100;
    }),
  ) as [number[], number[]];
}

/** Live charts of the presented match: possession share, cumulative xG and shots (→WEB-50). */
export function MatchCharts({
  playback,
  minute,
  kits,
  crests,
  names,
  details,
  detailsId,
  onDetails,
}: {
  playback: MatchPlayback;
  minute: number;
  kits: [string, string];
  crests: [Crest, Crest];
  names: [string, string];
  details: boolean;
  detailsId: string;
  onDetails: () => void;
}) {
  const [chart, setChart] = useState<Chart>('possession');
  const [focus, setFocus] = useState<number>();
  const series = useMemo(() => chartSeries(playback, minute, chart), [playback, minute, chart]);
  const colours = useMemo(() => {
    const home = seriesColour(kits[0]);
    let away = seriesColour(kits[1]);
    // Two lines must never look alike: fall back to the away crest's other colour, then to warm.
    if (colourDistance(home, away) < 120) away = seriesColour(crests[1].secondary);
    if (colourDistance(home, away) < 120) away = '#ff9257';
    return [home, away];
  }, [kits, crests]);
  const max =
    chart === 'possession'
      ? 100
      : chart === 'xg'
        ? Math.max(1, Math.ceil(Math.max(...series.flat(), 0) * 2) / 2)
        : Math.max(4, Math.ceil(Math.max(...series.flat(), 0) / 2) * 2);
  const x = (m: number) => LEFT + ((m - 1) / 89) * (W - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - v / max) * (H - TOP - BOTTOM);
  const ticks = chart === 'possession' ? [0, 50, 100] : [0, max / 2, max];
  const label = (v: number) =>
    chart === 'possession' ? `${Math.round(v)}%` : chart === 'xg' ? v.toFixed(2) : String(v);
  const tickLabel = (v: number) =>
    chart === 'possession' ? `${v}%` : chart === 'xg' ? String(Math.round(v * 10) / 10) : String(v);
  const goals = playback.record.highlights.filter((h) => h.action === '골' && h.minute <= minute);
  const shown = series[0].length;
  const active = focus !== undefined && focus <= shown ? focus : undefined;
  const latest = shown ? [series[0][shown - 1], series[1][shown - 1]] : [0, 0];
  const pick = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const m = Math.round(((ratio * W - LEFT) / (W - LEFT - RIGHT)) * 89 + 1);
    setFocus(Math.max(1, Math.min(shown, m)));
  };
  const keyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!shown || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = active ?? shown;
    setFocus(
      event.key === 'Home'
        ? 1
        : event.key === 'End'
          ? shown
          : Math.max(1, Math.min(shown, current + (event.key === 'ArrowRight' ? 1 : -1))),
    );
  };
  const title = CHARTS.find(([id]) => id === chart)![1];
  return (
    <section className={t.charts} aria-label="경기 흐름 그래프">
      <header>
        <div role="tablist" aria-label="그래프 종류">
          {CHARTS.map(([id, text]) => (
            <button
              key={id}
              role="tab"
              aria-selected={chart === id}
              className={chart === id ? t.chartOn : undefined}
              onClick={() => {
                setChart(id);
                setFocus(undefined);
              }}
            >
              {text}
            </button>
          ))}
        </div>
        <button
          className={t.detailToggle}
          aria-expanded={details}
          aria-controls={detailsId}
          aria-label="경기 상세"
          onClick={onDetails}
        >
          상세 {details ? '▴' : '▾'}
        </button>
      </header>
      <ul className={t.legend}>
        {[0, 1].map((side) => (
          <li key={side}>
            <i style={{ background: colours[side] }} aria-hidden="true" />
            <CrestMark crest={crests[side]} size={14} />
            <span>{names[side]}</span>
            <b>{label(active !== undefined ? series[side][active - 1] : latest[side])}</b>
          </li>
        ))}
        <li className={t.legendMinute}>
          {active !== undefined
            ? `${active}′`
            : chart === 'possession'
              ? `최근 ${WINDOW}분`
              : `${minute}′까지`}
        </li>
      </ul>
      <div className={t.plot}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={`${title}: ${names[0]} ${label(latest[0])}, ${names[1]} ${label(latest[1])} · ${minute}분까지`}
          onPointerMove={(event: PointerEvent<SVGSVGElement>) =>
            pick(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onPointerDown={(event: PointerEvent<SVGSVGElement>) =>
            pick(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onPointerLeave={() => setFocus(undefined)}
          onBlur={() => setFocus(undefined)}
          onKeyDown={keyboard}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={LEFT}
                x2={W - RIGHT}
                y1={y(tick)}
                y2={y(tick)}
                className={chart === 'possession' && tick === 50 ? t.gridMid : t.grid}
              />
              <text x={LEFT - 4} y={y(tick) + 3} textAnchor="end" className={t.tick}>
                {tickLabel(tick)}
              </text>
            </g>
          ))}
          {[45, 90].map((m) => (
            <text key={m} x={x(m)} y={H - 3} textAnchor="middle" className={t.tick}>
              {m}′
            </text>
          ))}
          {shown > 0 &&
            [1, 0].map((side) => (
              <g key={side}>
                {chart !== 'possession' && (
                  <path
                    d={`M${x(1)},${y(0)} ${series[side]
                      .map((v, i) => `L${x(i + 1)},${y(v)}`)
                      .join(' ')} L${x(shown)},${y(0)}Z`}
                    fill={colours[side]}
                    opacity={0.1}
                  />
                )}
                <polyline
                  points={series[side].map((v, i) => `${x(i + 1)},${y(v)}`).join(' ')}
                  fill="none"
                  stroke={colours[side]}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle
                  cx={x(shown)}
                  cy={y(series[side][shown - 1])}
                  r="4"
                  fill={colours[side]}
                  stroke={SURFACE}
                  strokeWidth="2"
                />
              </g>
            ))}
          {chart === 'xg' &&
            goals.map((goal, i) => (
              <circle
                key={i}
                cx={x(goal.minute)}
                cy={y(series[goal.side][goal.minute - 1] ?? 0)}
                r="5"
                fill="#ffffff"
                stroke={colours[goal.side]}
                strokeWidth="2.5"
              >
                <title>
                  {goal.minute}′ {goal.player} 골
                </title>
              </circle>
            ))}
          {active !== undefined && (
            <line x1={x(active)} x2={x(active)} y1={TOP} y2={H - BOTTOM} className={t.crosshair} />
          )}
        </svg>
      </div>
    </section>
  );
}
