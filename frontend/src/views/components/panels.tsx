/** Reusable presentational blocks shared by the role dashboards. */
import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useToast } from '../../controllers/ToastContext';

export function PanelHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function ActionButton({
  label,
  icon,
  onClick,
  variant = 'primary',
}: {
  label: string;
  icon?: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button className={variant === 'primary' ? 'btn-primary' : 'btn-secondary'} onClick={onClick}>
      {icon && <Icon name={icon} size={16} style={{ marginRight: 8 }} />}
      {label}
    </button>
  );
}

export interface InfoCard {
  icon: string;
  tint: string;
  color: string;
  label: string;
  value: string;
  note: string;
}

export function InfoCardGrid({ cards }: { cards: InfoCard[] }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 24 }}>
      {cards.map((c) => (
        <article className="panel" key={c.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c.tint, display: 'grid', placeItems: 'center' }}>
              <Icon name={c.icon} size={20} color={c.color} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{c.label}</h3>
              <strong style={{ fontSize: 20, color: 'var(--text)' }}>{c.value}</strong>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>{c.note}</p>
        </article>
      ))}
    </section>
  );
}

export interface StatItem {
  icon: string;
  color: string;
  label: string;
  value: string;
}

export function StatList({ title, items }: { title: string; items: StatItem[] }) {
  return (
    <article className="panel">
      <PanelHead title={title} />
      <div style={{ padding: 20, display: 'grid', gap: 15 }}>
        {items.map((it) => (
          <div
            key={it.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              background: '#f8f9fc',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon name={it.icon} size={18} color={it.color} />
              <span style={{ fontSize: 14 }}>{it.label}</span>
            </div>
            <strong style={{ fontSize: 18, color: it.color }}>{it.value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

export interface FaqEntry {
  q: string;
  a: string;
}

export function FaqAccordion({ items }: { items: FaqEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="faq-list">
      {items.map((item, i) => (
        <article className={`panel faq-item ${open === i ? 'is-open' : ''}`} key={item.q}>
          <button className="faq-question" onClick={() => setOpen(open === i ? null : i)}>
            <span>{item.q}</span>
            <Icon name="chevron-down" />
          </button>
          {open === i && <div className="faq-answer" style={{ padding: '0 16px 16px' }}>{item.a}</div>}
        </article>
      ))}
    </div>
  );
}

export interface ScheduleEntry {
  time: string;
  title: string;
  detail: string;
  color: string;
}

export function ScheduleTimeline({ entries }: { entries: ScheduleEntry[] }) {
  return (
    <section className="panel">
      <div style={{ display: 'grid', gap: 15, padding: 4 }}>
        {entries.map((e) => (
          <div key={e.title} style={{ padding: 15, borderLeft: `4px solid ${e.color}`, background: '#f8f9fc', borderRadius: 6 }}>
            <strong style={{ display: 'block', marginBottom: 5 }}>
              {e.time} - {e.title}
            </strong>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{e.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export interface SettingsTab {
  id: string;
  label: string;
  content: ReactNode;
}

export function SettingsView({ tabs }: { tabs: SettingsTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const { notify } = useToast();
  return (
    <div className="settings-grid">
      <aside className="panel settings-nav">
        {tabs.map((t) => (
          <button key={t.id} className={active === t.id ? 'active' : ''} onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </aside>
      <div className="panel settings-content">
        {tabs.map((t) => (
          <div key={t.id} className="tab-content" style={{ display: active === t.id ? 'block' : 'none' }}>
            {t.content}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => notify('Settings saved successfully!')}>
                Save Changes
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A read-only labelled field used inside settings forms. */
export function Field({ label, value, type = 'text', readOnly }: { label: string; value?: string; type?: string; readOnly?: boolean }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input type={type} defaultValue={value} readOnly={readOnly} style={readOnly ? { background: '#f8f9fc' } : undefined} />
    </div>
  );
}
