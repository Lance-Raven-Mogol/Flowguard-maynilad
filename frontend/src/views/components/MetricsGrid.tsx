import { useState } from 'react';
import type { Metric } from '../../models/types';
import { Icon } from './Icon';
import { Modal } from './Modal';

export function MetricsGrid({ metrics }: { metrics: Metric[] }) {
  const [selected, setSelected] = useState<Metric | null>(null);

  return (
    <>
      <section className="metrics" aria-label="Dashboard metrics">
        {metrics.map((m) => {
          const valueLength = m.value.replace(/\s/g, '').length;
          const valueSize = valueLength >= 18 ? ' is-xlong' : valueLength >= 12 ? ' is-long' : '';
          return (
            <article
              key={m.id}
              className={`metric metric-clickable ${m.accent}`}
              role="button"
              tabIndex={0}
              aria-label={`View full ${m.label}: ${m.value}`}
              onClick={() => setSelected(m)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelected(m);
                }
              }}
            >
              <span className="metric-line" />
              <div className="metric-head">
                <p>{m.label}</p>
                <span className="metric-icon">
                  <Icon name={m.icon} />
                </span>
              </div>
              <strong className={`metric-value${valueSize}`} title={m.value}>{m.value}</strong>
              {m.hint && <small className={m.trend ?? ''}>{m.hint}</small>}
            </article>
          );
        })}
      </section>
      <Modal
        title={selected?.label ?? 'Metric Details'}
        open={selected !== null}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className={`metric-detail ${selected.accent}`}>
            <span className="metric-icon metric-detail-icon">
              <Icon name={selected.icon} />
            </span>
            <p>{selected.label}</p>
            <strong>{selected.value}</strong>
            {selected.hint && <small>{selected.hint}</small>}
          </div>
        )}
      </Modal>
    </>
  );
}
