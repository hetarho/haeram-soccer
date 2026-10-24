import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { MatchPlayback } from '../../../../packages/contracts/src/types';
import { colourDistance, contrast, type Crest } from './crests';
import { KIT_ROLE_LABELS } from './identityPreview';
import { KitSwatch } from './KitSwatch';
import { UNRECORDED_KIT, type MatchLook, type SideLook } from './matchAppearance';
import { goalFrame, recordedGoals } from './moments';
import t from './Pitch.module.css';

type Chart = 'possession' | 'xg' | 'shots';
const CHARTS: [Chart, string][] = [
  ['possession', '점유율'],
  ['xg', 'xG'],
  ['shots', '슈팅'],
];
/** Minutes in the rolling possession window. */
const WINDOW = 10;
/** Legacy dark-chart fallback; callers supply the installed pitch chart material color. */
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
/**
 * A kit colour lifted until it reads as a line on the dark chart surface. Only the chart line
 * changes: the lifted colour is a new value, never written back to a shirt or a snapshot.
 */
export function seriesColour(kit: string, surface = SURFACE) {
  let colour = kit;
  for (let step = 1; step <= 10 && contrast(colour, surface) < 3; step++)
    colour = mix(kit, step * 0.1);
  return colour;
}
/** Fixed lines for an away side whose colours all look like home's: warm, else neutral ivory. */
const FALLBACK_SERIES = ['#ff9257', '#f6f1e1'] as const;
/**
 * Both sides' line colours. Two lines must never look alike: the away line falls back to the
 * away side's other colours (its shirt's secondary, then its trim) when it has them, then to the
 * fixed lines.
 */
export function seriesColours(
  kits: [string, string],
  away: Pick<Crest, 'secondary' | 'accent'>,
  surface = SURFACE,
): [string, string] {
  const home = seriesColour(kits[0], surface);
  let line = seriesColour(kits[1], surface);
  for (const candidate of [away.secondary, away.accent, ...FALLBACK_SERIES]) {
    if (colourDistance(home, line) >= 120) break;
    if (candidate !== undefined) line = seriesColour(candidate, surface);
  }
  return [home, line];
}

/**
 * The series' lines follow each side's worn shirt (lifted for contrast) and differ in dash as well,
 * so colour is never the only link from a line to its team (WEB-49): home solid, away dashed.
 */
export function chartLines(look: MatchLook, surface = SURFACE) {
  const [home, away] = look.sides;
  const colours = seriesColours(
    [home.shirt.primary, away.shirt.primary],
    {
      secondary: away.shirt.secondary,
      accent: away.shirt.trim,
    },
    surface,
  );
  return colours.map((colour, side) => ({ colour, dash: side ? '5 3' : undefined })) as [
    { colour: string; dash: string | undefined },
    { colour: string; dash: string | undefined },
  ];
}
/** The legend's name for a side's swatch: the worn role, or that the shirt was not recorded. */
export function swatchLabel(look: MatchLook, side: SideLook, name: string) {
  return look.recorded && side.role
    ? `${name} ${KIT_ROLE_LABELS[side.role]} 유니폼`
    : `${name} 기본 표시 (${UNRECORDED_KIT})`;
}

/** Per-minute series for both sides, over the first `shown` frames (the presented ones) only. */
export function chartSeries(playback: MatchPlayback, shown: number, chart: Chart) {
  const frames = playback.frames.slice(0, Math.max(0, shown));
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
  groundColor = SURFACE,
  playback,
  shown: presented,
  look,
  names,
  details,
  detailsId,
  onDetails,
}: {
  playback: MatchPlayback;
  /** Frames presented so far, added minutes included. */
  shown: number;
  /** What both sides wore, from the record (KIT-12). */
  look: MatchLook;
  groundColor?: string;
  names: [string, string];
  details: boolean;
  detailsId: string;
  onDetails: () => void;
}) {
  const [chart, setChart] = useState<Chart>('possession');
  const [focus, setFocus] = useState<number>();
  const series = useMemo(
    () => chartSeries(playback, presented, chart),
    [playback, presented, chart],
  );
  const lines = useMemo(() => chartLines(look, groundColor), [look, groundColor]);
  const colours = lines.map((line) => line.colour);
  const max =
    chart === 'possession'
      ? 100
      : chart === 'xg'
        ? Math.max(1, Math.ceil(Math.max(...series.flat(), 0) * 2) / 2)
        : Math.max(4, Math.ceil(Math.max(...series.flat(), 0) / 2) * 2);
  // The x axis runs over the match's frames, so added minutes take their place on it.
  const frames = playback.frames;
  const span = Math.max(1, frames.length - 1);
  const x = (m: number) => LEFT + ((m - 1) / span) * (W - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - v / max) * (H - TOP - BOTTOM);
  const ticks = chart === 'possession' ? [0, 50, 100] : [0, max / 2, max];
  const label = (v: number) =>
    chart === 'possession' ? `${Math.round(v)}%` : chart === 'xg' ? v.toFixed(2) : String(v);
  const tickLabel = (v: number) =>
    chart === 'possession' ? `${v}%` : chart === 'xg' ? String(Math.round(v * 10) / 10) : String(v);
  const shown = series[0].length;
  const labelAt = (m: number) => frames[m - 1]?.label ?? String(m);
  // Each goal sits on the first frame whose score includes it.
  const goals = recordedGoals(playback.record)
    .map((goal) => ({ ...goal, at: goalFrame(frames, goal) + 1 }))
    .filter((goal) => goal.at > 0 && goal.at <= shown);
  const active = focus !== undefined && focus <= shown ? focus : undefined;
  const latest = shown ? [series[0][shown - 1], series[1][shown - 1]] : [0, 0];
  const pick = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width;
    const m = Math.round(((ratio * W - LEFT) / (W - LEFT - RIGHT)) * span + 1);
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
    <section className={t.charts} data-ui="match-chart" aria-label="경기 흐름 그래프">
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
        {([0, 1] as const).map((side) => (
          <li key={side}>
            <svg className={t.legendLine} width="14" height="6" aria-hidden="true">
              <line
                x1="1"
                x2="13"
                y1="3"
                y2="3"
                stroke={colours[side]}
                strokeWidth="2"
                strokeDasharray={lines[side].dash}
              />
            </svg>
            <KitSwatch
              shirt={look.sides[side].shirt}
              label={swatchLabel(look, look.sides[side], names[side])}
              size={16}
            />
            <span>{names[side]}</span>
            <b>{label(active !== undefined ? series[side][active - 1] : latest[side])}</b>
          </li>
        ))}
        <li className={t.legendMinute}>
          {active !== undefined
            ? `${labelAt(active)}′`
            : chart === 'possession'
              ? `최근 ${WINDOW}분`
              : `${labelAt(shown)}′까지`}
        </li>
      </ul>
      <div className={t.plot}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          tabIndex={0}
          aria-label={`${title}: ${names[0]} ${label(latest[0])} (실선), ${names[1]} ${label(latest[1])} (점선) · ${labelAt(shown)}분까지`}
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
          {(
            [
              // The second half starts after the first half's added minutes; the 90′ tick marks
              // the last regulation frame, its added minutes included.
              ['45', frames.findIndex((f) => f.period >= 2) + 1],
              ['90', frames.findLastIndex((f) => f.period <= 2) + 1],
            ] as const
          ).map(
            ([label, m]) =>
              m > 0 && (
                <text key={label} x={x(m)} y={H - 3} textAnchor="middle" className={t.tick}>
                  {label}′
                </text>
              ),
          )}
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
                  strokeDasharray={lines[side].dash}
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
                cx={x(goal.at)}
                cy={y(series[goal.side][goal.at - 1] ?? 0)}
                r="5"
                fill="#ffffff"
                stroke={colours[goal.side]}
                strokeWidth="2.5"
              >
                <title>
                  {labelAt(goal.at)}′ {goal.player} 골
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
