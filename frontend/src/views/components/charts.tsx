/** Decorative chart primitives carried over from the original SVG mock-ups. */

export interface LegendItem {
  label: string;
  value: string;
  dot: 'dark' | 'blue' | 'pale';
}

const DOT_COLOR: Record<LegendItem['dot'], string> = {
  dark: '#2f6bff',
  blue: '#5965f0',
  pale: '#c3d6f7',
};

/** A real, data-driven donut: arc lengths are computed from the legend values. */
export function DonutPanel({ value, label, legend }: { value: string; label: string; legend: LegendItem[] }) {
  const nums = legend.map((l) => Math.max(0, parseFloat(String(l.value).replace(/[^0-9.]/g, '')) || 0));
  const total = nums.reduce((a, b) => a + b, 0);

  let before = 0;
  const segments = legend.map((l, i) => {
    const frac = total > 0 ? (nums[i] / total) * 100 : 0;
    const seg = { color: DOT_COLOR[l.dot], frac, offset: -before };
    before += frac;
    return seg;
  });

  return (
    <div className="invoice-content">
      <div className="donut-chart">
        <svg viewBox="0 0 36 36" role="img" aria-label={`${label}: ${value}`}>
          <circle className="donut-track" cx="18" cy="18" r="15.5" fill="none" strokeWidth="4" pathLength={100} />
          {total > 0 &&
            segments.map((s, i) => (
              <circle
                key={i}
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke={s.color}
                strokeWidth="4"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${Math.max(s.frac - 1.2, 0)} ${100 - Math.max(s.frac - 1.2, 0)}`}
                strokeDashoffset={s.offset}
                transform="rotate(-90 18 18)"
              />
            ))}
        </svg>
        <div className="donut-center">
          <span>{value}</span>
          <small>{label}</small>
        </div>
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
