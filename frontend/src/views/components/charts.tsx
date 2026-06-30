/** Decorative chart primitives carried over from the original SVG mock-ups. */

export interface LegendItem {
  label: string;
  value: string;
  dot: 'dark' | 'blue' | 'pale';
}

export function DonutPanel({ value, label, legend }: { value: string; label: string; legend: LegendItem[] }) {
  return (
    <div className="invoice-content">
      <div className="donut">
        <span>{value}</span>
        <small>{label}</small>
      </div>
      <dl className="legend">
        {legend.map((l) => (
          <div key={l.label}>
            <dt>{l.label}</dt>
            <dd>
              <span className={`dot ${l.dot}`} />
              {l.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A simple line chart driven by normalised data points. */
export function LineChart({ points, months }: { points: number[]; months: string[] }) {
  const W = 640;
  const H = 260;
  const left = 50;
  const right = 610;
  const top = 24;
  const bottom = 216;
  const max = Math.max(...points, 1);
  const stepX = (right - left) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = left + i * stepX;
    const y = bottom - (p / max) * (bottom - top);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');
  const fill = `${line}L${right} ${bottom}L${left} ${bottom}Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="flowLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2f6bff" />
            <stop offset="100%" stopColor="#5965f0" />
          </linearGradient>
          <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(47, 107, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(47, 107, 255, 0)" />
          </linearGradient>
        </defs>
        <g className="grid-lines">
          <path d="M50 216H610M50 168H610M50 120H610M50 72H610M50 24H610" />
        </g>
        <path className="chart-fill" d={fill} />
        <path className="chart-line" d={line} />
        <g className="points">
          {coords.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={6} />
          ))}
        </g>
        <g className="months">
          {months.map((m, i) => (
            <text key={m} x={left + i * stepX} y={246}>
              {m}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
