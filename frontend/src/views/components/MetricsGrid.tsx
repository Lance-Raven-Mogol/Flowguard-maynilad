import type { Metric } from '../../models/types';
import { Icon } from './Icon';

export function MetricsGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="metrics" aria-label="Dashboard metrics">
      {metrics.map((m) => (
        <article key={m.id} className={`metric ${m.accent}`}>
          <span className="metric-line" />
          <div>
            <p>{m.label}</p>
            <strong>{m.value}</strong>
            {m.hint && <small className={m.trend ?? ''}>{m.hint}</small>}
          </div>
          <span className="metric-icon">
            <Icon name={m.icon} />
          </span>
        </article>
      ))}
    </section>
  );
}
