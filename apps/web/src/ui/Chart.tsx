import s from './App.module.css';
export function Chart({
  values,
  labels,
  label,
  inverse = false,
}: {
  values: number[];
  labels: string[];
  label: string;
  inverse?: boolean;
}) {
  if (!values.length)
    return <div className={s.empty}>첫 시즌이 쌓이면 {label} 그래프가 시작됩니다.</div>;
  const min = Math.min(...values),
    max = Math.max(...values),
    range = Math.max(1, max - min);
  const points = values
    .map(
      (v, i) =>
        `${30 + (i / Math.max(1, values.length - 1)) * 580},${inverse ? 25 + ((v - min) / range) * 110 : 135 - ((v - min) / range) * 110}`,
    )
    .join(' ');
  return (
    <figure className={s.chart}>
      <svg
        viewBox="0 0 640 175"
        role="img"
        aria-label={`${label}: ${labels.map((l, i) => `${l} ${values[i]}`).join(', ')}`}
      >
        <path
          d="M30 25H610 M30 80H610 M30 135H610"
          stroke="#d8ded5"
          strokeDasharray="3 5"
          fill="none"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#28694d"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {values.length === 1 && <circle cx="30" cy="135" r="4" fill="#28694d" />}
        <text x="30" y="165">
          {labels[0]}
        </text>
        <text x="610" y="165" textAnchor="end">
          {labels.at(-1)}
        </text>
        <text x="610" y="20" textAnchor="end">
          {Math.round(max).toLocaleString()}
        </text>
      </svg>
    </figure>
  );
}
