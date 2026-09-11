/**
 * JobOrderCalendar — clean monthly calendar.
 * - Cells show only the day number + a slim colored accent bar at the bottom
 *   (one bar per status present, up to 4 stacked horizontally).
 * - Clicking a date opens an inline detail panel below the grid.
 * - Legend sits next to the month navigation, not below everything.
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useStats } from '../../controllers/StatsContext';
import type { EntityRow } from '../../services/resourceService';

/* ---------------------------------------------------------------- config */
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:     { label: 'Ongoing',     color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  in_progress: { label: 'In Progress', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  completed:   { label: 'Completed',   color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  cancelled:   { label: 'Cancelled',   color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
};

function getCfg(s: unknown) {
  return STATUS_CFG[String(s ?? '').toLowerCase()]
    ?? { label: String(s ?? ''), color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function iso(d: Date) { return d.toISOString().slice(0, 10); }

interface CalDay { date: Date; inMonth: boolean; isToday: boolean; jobs: EntityRow[] }

function buildDays(year: number, month: number, byDate: Map<string, EntityRow[]>): CalDay[] {
  const todayKey = iso(new Date());
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const days: CalDay[] = [];
  const pad = first.getDay();
  for (let i = pad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d, inMonth: false, isToday: false, jobs: byDate.get(iso(d)) ?? [] });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(year, month, d);
    days.push({ date, inMonth: true, isToday: iso(date) === todayKey, jobs: byDate.get(iso(date)) ?? [] });
  }
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - last.getDate() - pad + 1);
    days.push({ date: d, inMonth: false, isToday: false, jobs: byDate.get(iso(d)) ?? [] });
  }
  return days;
}

function titleCase(v: unknown) {
  return String(v ?? '').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ---------------------------------------------------------------- component */
export function JobOrderCalendar() {
  const { stats } = useStats();
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sel,   setSel]   = useState<string | null>(null);

  const byDate = new Map<string, EntityRow[]>();
  for (const jo of stats.jobOrders) {
    if (!jo.scheduled_date) continue;
    const key = String(jo.scheduled_date).slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(jo);
  }

  const days = buildDays(year, month, byDate);

  const prev    = () => { setMonth(m => { if (m === 0) { setYear(y => y - 1); return 11; } return m - 1; }); setSel(null); };
  const next    = () => { setMonth(m => { if (m === 11) { setYear(y => y + 1); return 0; } return m + 1; }); setSel(null); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSel(null); };

  const selJobs = sel ? (byDate.get(sel) ?? []) : [];
  const selDateObj = sel ? new Date(sel + 'T00:00:00') : null;

  const monthKey   = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthTotal = [...byDate.entries()]
    .filter(([k]) => k.startsWith(monthKey))
    .reduce((s, [, v]) => s + v.length, 0);

  return (
    <div className="jocal">

      {/* ── Top bar: title · legend · nav ── */}
      <div className="jocal-topbar">
        <div className="jocal-title-group">
          <CalendarDays size={16} className="jocal-title-icon" />
          <span className="jocal-title">Job Order Schedule</span>
          <span className="jocal-month-count">{monthTotal > 0 ? `${monthTotal} this month` : 'No orders this month'}</span>
        </div>

        <div className="jocal-controls">
          {/* Legend inline */}
          <div className="jocal-legend">
            {Object.values(STATUS_CFG).map(cfg => (
              <span key={cfg.label} className="jocal-legend-item">
                <span className="jocal-legend-dot" style={{ background: cfg.color }} />
                <span className="jocal-legend-label">{cfg.label}</span>
              </span>
            ))}
          </div>

          {/* Month nav */}
          <div className="jocal-nav">
            <button className="jocal-nav-btn" onClick={prev} aria-label="Previous month">
              <ChevronLeft size={14} />
            </button>
            <span className="jocal-month-label">{MONTHS[month]} {year}</span>
            <button className="jocal-nav-btn" onClick={next} aria-label="Next month">
              <ChevronRight size={14} />
            </button>
            <button className="jocal-today-btn" onClick={goToday}>Today</button>
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="jocal-grid">
        {DAYS.map(d => <div key={d} className="jocal-dow">{d}</div>)}

        {days.map((day, idx) => {
          const key        = iso(day.date);
          const isSelected = key === sel;
          const hasJobs    = day.jobs.length > 0;

          // Collect unique statuses for accent bars
          const statuses = [...new Set(day.jobs.map(j => String(j.status ?? '').toLowerCase()))];

          return (
            <button
              key={idx}
              className={[
                'jocal-cell',
                !day.inMonth  ? 'jocal-cell--out'      : '',
                day.isToday   ? 'jocal-cell--today'    : '',
                isSelected    ? 'jocal-cell--selected' : '',
                hasJobs       ? 'jocal-cell--busy'     : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSel(isSelected ? null : key)}
              aria-pressed={isSelected}
              aria-label={`${day.date.toLocaleDateString('en-GB')}${hasJobs ? `, ${day.jobs.length} job${day.jobs.length > 1 ? 's' : ''}` : ''}`}
            >
              <span className="jocal-day-num">{day.date.getDate()}</span>

              {/* Count badge — only when there are jobs */}
              {hasJobs && (
                <span className="jocal-job-count">{day.jobs.length}</span>
              )}

              {/* Bottom accent bars — one thin strip per unique status */}
              {hasJobs && (
                <span className="jocal-accents">
                  {statuses.slice(0, 4).map(s => (
                    <span
                      key={s}
                      className="jocal-accent"
                      style={{ background: getCfg(s).color }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Detail panel — only when a date is selected ── */}
      {sel && (
        <div className="jocal-detail">
          <div className="jocal-detail-header">
            <strong className="jocal-detail-date">
              {selDateObj?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </strong>
            {selJobs.length > 0 && (
              <span className="jocal-detail-count">
                {selJobs.length} job order{selJobs.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {selJobs.length === 0 ? (
            <p className="jocal-detail-empty">No job orders scheduled on this day.</p>
          ) : (
            <ul className="jocal-detail-list">
              {selJobs.map(j => {
                const cfg = getCfg(j.status);
                return (
                  <li key={String(j.id)} className="jocal-detail-item">
                    <span className="jocal-detail-stripe" style={{ background: cfg.color }} />
                    <div className="jocal-detail-body">
                      <span className="jocal-detail-ref">{String(j.ref_code)}</span>
                      <span className="jocal-detail-title">{String(j.title ?? '—')}</span>
                    </div>
                    <span className="jocal-detail-badge"
                          style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                      {titleCase(j.status)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
