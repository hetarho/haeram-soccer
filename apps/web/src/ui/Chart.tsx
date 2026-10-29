import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { bubblePlacement, nearestIndex } from './chartPoints';
import s from './App.module.css';

/** A range per season drawn behind the line, such as our league's lowest to highest Club Elo. */
export interface ChartBand {
  label: string;
  /** Per season, aligned with the values; a season without the range leaves a gap. */
  lo: (number | undefined)[];
  hi: (number | undefined)[];
  /** `faint` for the wider context, `strong` for the nearer one. */
  tone: 'faint' | 'strong';
}

type ChartProps = {
  values: number[];
  labels: string[];
  label: string;
  /** Lower is better (league position): the best value sits at the top. */
  inverse?: boolean;
  format?: (value: number) => string;
  /** The selected season's line in the bubble; its label and formatted value by default. */
  detail?: (index: number) => string;
  /** Ranges behind the line, part of the vertical scale. */
  bands?: ChartBand[];
};

const HEIGHT = 175,
  LEFT = 30,
  RIGHT_GUTTER = 50,
  TOP = 25,
  BOTTOM = 135;
const defaultFormat = (value: number) => Math.round(value).toLocaleString();

/** One polygon per run of seasons that have the range; a lone season is a narrow bar. */
function bandShapes(band: ChartBand, x: (i: number) => number, y: (v: number) => number) {
  const shapes: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const edge = (values: (number | undefined)[]) =>
      run.length === 1
        ? [
            [x(run[0]) - 3, y(values[run[0]]!)],
            [x(run[0]) + 3, y(values[run[0]]!)],
          ]
        : run.map((i) => [x(i), y(values[i]!)]);
    shapes.push(
      [...edge(band.hi), ...edge(band.lo).reverse()].map((point) => point.join(',')).join(' '),
    );
    run = [];
  };
  for (let i = 0; i < band.lo.length; i++) {
    if (band.lo[i] !== undefined && band.hi[i] !== undefined) run.push(i);
    else flush();
  }
  flush();
  return shapes;
}

/**
 * One series over seasons: a primary line on quiet guides, optional context bands, axis bounds
 * and a latest-value heading. Drawn in CSS pixels at
 * the figure's width so its labels stay legible on a phone. Every season reads in a bubble
 * (→WEB-54): a pointer anywhere on the plot picks the nearest season, the keyboard steps through
 * them, and tapping the same season again, Escape or leaving the chart closes it.
 */
export function Chart(props: ChartProps) {
  if (!props.values.length)
    return <div className={s.empty}>첫 시즌이 쌓이면 {props.label} 그래프가 시작됩니다.</div>;
  return <Plot {...props} />;
}

function Plot({
  values,
  labels,
  label,
  inverse = false,
  format = defaultFormat,
  detail,
  bands,
}: ChartProps) {
  const areaId = useId();
  const figure = useRef<HTMLElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  // `index` absent follows the latest season; `pinned` keeps the bubble when the mouse leaves;
  // `quiet` keeps a bubble closed by a tap from reopening under a mouse resting on that season.
  const [selection, setSelection] = useState<{
    index?: number;
    open: boolean;
    pinned: boolean;
    quiet?: boolean;
  }>({ open: false, pinned: false });
  useLayoutEffect(() => {
    const node = figure.current;
    if (!node) return;
    const measure = () => {
      if (node.clientWidth) setWidth(Math.round(node.clientWidth));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const right = Math.max(LEFT + 1, width - RIGHT_GUTTER);
  // Everything a pointer move needs is computed once per data or width change.
  const geometry = useMemo(() => {
    const extent = [...values];
    for (const band of bands ?? [])
      for (const value of [...band.lo, ...band.hi]) if (value !== undefined) extent.push(value);
    const min = Math.min(...extent),
      max = Math.max(...extent),
      range = Math.max(inverse ? 1 : 1e-9, max - min);
    const x = (i: number) => LEFT + (i / Math.max(1, values.length - 1)) * (right - LEFT);
    const y = (v: number) =>
      inverse
        ? TOP + ((v - min) / range) * (BOTTOM - TOP)
        : BOTTOM - ((v - min) / range) * (BOTTOM - TOP);
    return {
      min,
      max,
      xs: values.map((_, i) => x(i)),
      ys: values.map(y),
      line: values.map((v, i) => `${x(i)},${y(v)}`).join(' '),
      bands: (bands ?? [])
        .map((band) => ({ label: band.label, tone: band.tone, shapes: bandShapes(band, x, y) }))
        .filter((band) => band.shapes.length),
    };
  }, [values, bands, inverse, right]);
  const last = values.length - 1,
    current = Math.min(selection.index ?? last, last),
    open = selection.open,
    describe = (i: number) => (detail ? detail(i) : `${labels[i]} · ${format(values[i])}`),
    text = describe(current);
  useLayoutEffect(() => {
    const node = bubble.current;
    if (!open || !node) return;
    const place = bubblePlacement(
      geometry.xs[current],
      geometry.ys[current],
      node.offsetWidth,
      node.offsetHeight,
      width,
      HEIGHT,
    );
    node.style.left = `${place.left}px`;
    node.style.top = `${place.top}px`;
    node.style.setProperty('--tip', `${place.tip}px`);
    node.dataset.side = place.side;
  }, [open, current, geometry, width, text]);
  const pick = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.width ? ((event.clientX - box.left) / box.width) * width : 0;
    return nearestIndex(x, values.length, LEFT, right);
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      setSelection((state) => ({ ...state, open: false }));
      return;
    }
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : step === undefined
            ? undefined
            : Math.min(last, Math.max(0, current + step));
    if (index === undefined) return;
    event.preventDefault();
    setSelection({ index, open: true, pinned: true });
  };
  const latest = { x: geometry.xs[last], y: geometry.ys[last] };
  return (
    <figure ref={figure} className={s.chart} data-ui="chart">
      <header className={s.chartHeading}>
        <span>{label}</span>
        <div>
          <strong>{format(values[last])}</strong>
          <small>{labels[last]}</small>
        </div>
      </header>
      <div className={s.chartPlot}>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`${label}: ${labels.map((l, i) => `${l} ${format(values[i])}`).join(', ')}`}
        >
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-primary, var(--accent))"
                stopOpacity="0.18"
              />
              <stop
                offset="100%"
                stopColor="var(--chart-primary, var(--accent))"
                stopOpacity="0.015"
              />
            </linearGradient>
          </defs>
          <path
            d={`M${LEFT} ${TOP}H${right} M${LEFT} ${(TOP + BOTTOM) / 2}H${right} M${LEFT} ${BOTTOM}H${right}`}
            stroke="currentColor"
            strokeOpacity="0.12"
            fill="none"
          />
          {geometry.bands.map((band) =>
            band.shapes.map((points, i) => (
              <polygon
                key={`${band.label}:${i}`}
                points={points}
                className={band.tone === 'strong' ? s.chartBandStrong : s.chartBand}
              />
            )),
          )}
          {!inverse && values.length > 1 && (
            <polygon
              points={`${LEFT},${BOTTOM} ${geometry.line} ${right},${BOTTOM}`}
              fill={`url(#${areaId})`}
            />
          )}
          {open && (
            <line
              className={s.chartGuide}
              x1={geometry.xs[current]}
              x2={geometry.xs[current]}
              y1={TOP - 10}
              y2={BOTTOM + 6}
            />
          )}
          <polyline
            points={geometry.line}
            fill="none"
            style={{ stroke: 'var(--chart-primary, var(--accent))' }}
            strokeWidth="2.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {values.length <= 20 &&
            geometry.xs.map((x, i) => (
              <circle
                key={i}
                cx={x}
                cy={geometry.ys[i]}
                r="2.5"
                fill="var(--chart-primary, var(--accent))"
              />
            ))}
          <circle
            cx={latest.x}
            cy={latest.y}
            r="8"
            fill="var(--chart-primary, var(--accent))"
            fillOpacity="0.14"
          />
          <circle
            cx={latest.x}
            cy={latest.y}
            r="4.5"
            style={{ fill: 'var(--chart-primary, var(--accent))', stroke: 'var(--surface)' }}
            strokeWidth="2"
          />
          {open && (
            <circle
              className={s.chartMarker}
              cx={geometry.xs[current]}
              cy={geometry.ys[current]}
              r="6"
            />
          )}
          <text x={LEFT} y="165">
            {labels[0]}
          </text>
          {last > 0 && (
            <text x={right} y="165" textAnchor="end">
              {labels[last]}
            </text>
          )}
          <text x={width - 6} y={TOP + 4} textAnchor="end">
            {format(inverse ? geometry.min : geometry.max)}
          </text>
          <text x={width - 6} y={BOTTOM + 4} textAnchor="end">
            {format(inverse ? geometry.max : geometry.min)}
          </text>
        </svg>
        <div
          className={s.chartScrub}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={current}
          aria-valuetext={text}
          onPointerDown={(event) => {
            const index = pick(event),
              mouse = event.pointerType === 'mouse';
            setSelection((state) =>
              state.open && state.pinned && Math.min(state.index ?? last, last) === index
                ? { index, open: false, pinned: false, quiet: mouse }
                : { index, open: true, pinned: true },
            );
          }}
          onPointerMove={(event) => {
            // A finger only drags a season it has picked; a mouse previews wherever it rests.
            if (event.pointerType === 'touch' && !(open && selection.pinned)) return;
            const index = pick(event);
            setSelection((state) => {
              if (state.quiet && state.index === index) return state;
              const pinned = state.open && state.pinned;
              return state.open && state.index === index && state.pinned === pinned
                ? state
                : { index, open: true, pinned };
            });
          }}
          onPointerLeave={() =>
            setSelection((state) =>
              state.open && !state.pinned
                ? { ...state, open: false }
                : state.quiet
                  ? { ...state, quiet: false }
                  : state,
            )
          }
          onFocus={(event) => {
            // Keyboard focus shows the season the slider stands on; a pointer has already picked.
            let visible = false;
            try {
              visible = event.currentTarget.matches(':focus-visible');
            } catch {
              visible = false;
            }
            if (visible)
              setSelection((state) => ({ ...state, open: true, pinned: true, quiet: false }));
          }}
          onBlur={() => setSelection((state) => (state.open ? { ...state, open: false } : state))}
          onKeyDown={keyboard}
        />
        {open && (
          <div
            ref={bubble}
            className={s.chartBubble}
            data-surface="inset"
            data-testid="chart-bubble"
            aria-hidden="true"
          >
            {text}
          </div>
        )}
      </div>
      {geometry.bands.length > 0 && (
        <figcaption className={s.chartLegend}>
          <span>
            <i className={s.legendLine} />
            {label}
          </span>
          {geometry.bands.map((band) => (
            <span key={band.label}>
              <i className={band.tone === 'strong' ? s.legendStrong : s.legendFaint} />
              {band.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
