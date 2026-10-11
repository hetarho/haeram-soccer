import s from './App.module.css';
/**
 * One series over seasons: a thin line on recessive guides, the highest and lowest values on the
 * axis, the latest value labelled at its point and every point hoverable.
 */
export function Chart({
  values,
  labels,
  label,
  inverse = false,
  format = (value) => Math.round(value).toLocaleString(),
}: {
  values: number[];
  labels: string[];
  label: string;
  /** Lower is better (league position): the best value sits at the top. */
  inverse?: boolean;
  format?: (value: number) => string;
}) {
  if (!values.length)
    return <div className={s.empty}>첫 시즌이 쌓이면 {label} 그래프가 시작됩니다.</div>;
  const min = Math.min(...values),
    max = Math.max(...values),
    range = Math.max(inverse ? 1 : 1e-9, max - min);
  const x = (i: number) => 30 + (i / Math.max(1, values.length - 1)) * 560;
  const y = (v: number) =>
    inverse ? 25 + ((v - min) / range) * 110 : 135 - ((v - min) / range) * 110;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values.length - 1;
  return (
    <figure className={s.chart}>
      <svg
        viewBox="0 0 640 175"
        role="img"
        aria-label={`${label}: ${labels.map((l, i) => `${l} ${format(values[i])}`).join(', ')}`}
      >
        <path
          d="M30 25H590 M30 80H590 M30 135H590"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeDasharray="3 5"
          fill="none"
        />
        <polyline
          points={points}
          fill="none"
          style={{ stroke: 'var(--accent)' }}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="10" fill="transparent">
            <title>{`${labels[i]} · ${format(v)}`}</title>
          </circle>
        ))}
        <circle
          cx={x(last)}
          cy={y(values[last])}
          r="4.5"
          style={{ fill: 'var(--accent)', stroke: 'var(--surface)' }}
          strokeWidth="2"
        />
        <text x={x(last)} y={Math.max(14, y(values[last]) - 10)} textAnchor="end">
          {format(values[last])}
        </text>
        <text x="30" y="165">
          {labels[0]}
        </text>
        <text x="590" y="165" textAnchor="end">
          {labels.at(-1)}
        </text>
        <text x="634" y="29" textAnchor="end">
          {format(inverse ? min : max)}
        </text>
        <text x="634" y="139" textAnchor="end">
          {format(inverse ? max : min)}
        </text>
      </svg>
    </figure>
  );
}
