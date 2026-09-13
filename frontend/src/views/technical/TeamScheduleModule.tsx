import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Clock3, Users } from 'lucide-react';
import { useToast } from '../../controllers/ToastContext';
import { api, ApiError } from '../../services/apiClient';
import {
  RESOURCE_CHANGE_EVENT,
  RESOURCE_CHANGE_KEY,
  resourceService,
  type EntityRow,
} from '../../services/resourceService';
import { Modal } from '../components/Modal';
import { ActionButton } from '../components/panels';

interface TeamMember {
  id: string;
  fullName: string;
  role: 'inhouse-team' | 'contractor' | string;
  availability?: 'available' | 'busy';
  activeJobOrderRef?: string | null;
  activeJobOrderTitle?: string | null;
  jobAssignments?: Array<{
    ref: string;
    title: string;
    date: string;
    period: string;
    startTime: string;
    endTime: string;
    status: string;
  }>;
  weeklyRoster?: Array<{
    weekday: number;
    amNoWork: boolean;
    pmNoWork: boolean;
    amStart: string;
    amEnd: string;
    pmStart: string;
    pmEnd: string;
  }>;
}

interface TeamScheduleModuleProps {
  filter?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKLY_ROSTER_PREFIX = 'WEEKLY_ROSTER:';
const WEEKLY_ROSTER_DATES = ['1970-01-05', '1970-01-06', '1970-01-07', '1970-01-08', '1970-01-09', '1970-01-10', '1970-01-11'];
type SchedulePeriod = 'AM' | 'PM' | 'NO_WORK';
interface WeeklyDaySettings {
  amNoWork: boolean;
  pmNoWork: boolean;
  amStart: string;
  amEnd: string;
  pmStart: string;
  pmEnd: string;
}

function localISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readableDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

const defaultWeeklyDay = (): WeeklyDaySettings => ({
  amNoWork: false,
  pmNoWork: false,
  amStart: '08:00',
  amEnd: '12:00',
  pmStart: '13:00',
  pmEnd: '17:00',
});

const timeValue = (value: unknown, fallback: string): string => String(value ?? fallback).slice(0, 5);

function encodeWeeklyDay(settings: WeeklyDaySettings): string {
  return `${WEEKLY_ROSTER_PREFIX}${JSON.stringify(settings)}`;
}

function decodeWeeklyDay(row: EntityRow | undefined): WeeklyDaySettings | null {
  if (!row) return null;
  const activity = String(row.activity ?? '');
  if (!activity.startsWith(WEEKLY_ROSTER_PREFIX)) return null;
  try {
    const parsed = JSON.parse(activity.slice(WEEKLY_ROSTER_PREFIX.length)) as Partial<WeeklyDaySettings>;
    const legacyNoWork = Boolean((parsed as Partial<WeeklyDaySettings> & { noWork?: boolean }).noWork);
    return {
      amNoWork: parsed.amNoWork === undefined ? legacyNoWork : Boolean(parsed.amNoWork),
      pmNoWork: parsed.pmNoWork === undefined ? legacyNoWork : Boolean(parsed.pmNoWork),
      amStart: timeValue(parsed.amStart, '08:00'),
      amEnd: timeValue(parsed.amEnd, '12:00'),
      pmStart: timeValue(parsed.pmStart, '13:00'),
      pmEnd: timeValue(parsed.pmEnd, '17:00'),
    };
  } catch {
    return null;
  }
}

const isWeeklyRosterRow = (row: EntityRow): boolean => String(row.activity ?? '').startsWith(WEEKLY_ROSTER_PREFIX);

function roleName(role: string): string {
  return role === 'contractor' ? 'Contractor' : 'In-house Team';
}

interface CalendarDay {
  date: Date;
  key: string;
  inMonth: boolean;
}

function buildCalendar(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: localISO(date), inMonth: date.getMonth() === month };
  });
}

function ScheduleMemberMultiSelect({
  members,
  value,
  onChange,
  single = false,
}: {
  members: TeamMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = members.filter((member) => value.includes(member.id));
  const options = members.filter((member) =>
    `${member.fullName} ${roleName(member.role)}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = (id: string) => {
    if (single) {
      onChange([id]);
      setOpen(false);
      setQuery('');
      return;
    }
    onChange(value.includes(id) ? value.filter((memberId) => memberId !== id) : [...value, id]);
  };

  return (
    <div className="ms-wrap schedule-member-select" ref={wrapperRef}>
      <button
        type="button"
        className={`ms-trigger${open ? ' is-open' : ''}${selected.length ? ' is-filled' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected.length ? (
          <div className="ms-chips">
            {selected.slice(0, 2).map((member) => <span className="ms-chip" key={member.id}>{member.fullName}</span>)}
            {selected.length > 2 && <span className="ms-chip ms-chip-more">+{selected.length - 2}</span>}
          </div>
        ) : <span className="ls-placeholder">Select in-house team or contractors…</span>}
        <svg className="ls-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="ms-dropdown" role="listbox" aria-multiselectable={!single}>
          <div className="schedule-member-search-wrap">
            <input
              className="schedule-member-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="Search name or team type"
              autoFocus
            />
          </div>
          <p className="ms-hint">{single ? 'Select a team member' : `${selected.length} selected · Click to select or deselect`}</p>
          <div className="schedule-member-options">
            {options.length === 0 ? <p className="schedule-member-empty">No matching team member.</p> : options.map((member) => {
              const isSelected = value.includes(member.id);
              const busy = member.availability === 'busy';
              return (
                <button
                  key={member.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={busy && !isSelected}
                  className={`ms-option${isSelected ? ' is-selected' : ''}${busy && !isSelected ? ' is-disabled' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (busy && !isSelected) return;
                    toggle(member.id);
                  }}
                >
                  <span className="ls-avatar">{member.fullName.slice(0, 1)}</span>
                  <span className="schedule-member-option-copy">
                    <strong>{member.fullName}</strong>
                    <small>{busy ? member.activeJobOrderRef ?? 'Ongoing Job Order' : roleName(member.role)}</small>
                  </span>
                  <span className={`availability-pill ${busy ? 'is-busy' : ''}`}>{busy ? 'Busy' : 'Available'}</span>
                  <span className={`ms-tick${isSelected ? ' is-selected' : ''}`}>
                    {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamScheduleModule({ filter = '' }: TeamScheduleModuleProps) {
  const { notify } = useToast();
  const today = new Date();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [schedules, setSchedules] = useState<EntityRow[]>([]);
  const [jobOrders, setJobOrders] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(localISO(today));
  const [editor, setEditor] = useState<EntityRow | 'new' | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState(localISO(today));
  const [period, setPeriod] = useState<SchedulePeriod>('AM');
  const [activity, setActivity] = useState('');
  const [saving, setSaving] = useState(false);
  const [weeklyMember, setWeeklyMember] = useState<TeamMember | null>(null);
  const [weekPlan, setWeekPlan] = useState<Record<number, WeeklyDaySettings>>({});
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [calendarDetailDate, setCalendarDetailDate] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [teamResult, scheduleResult, jobOrderResult] = await Promise.allSettled([
        api.get<{ data: TeamMember[] }>('/users/team-members'),
        resourceService.list('team-schedules'),
        resourceService.list('job-orders'),
      ]);
      if (teamResult.status === 'fulfilled') {
        setMembers(teamResult.value.data.filter((member) => ['inhouse-team', 'contractor'].includes(member.role)));
      } else if (!quiet) {
        notify('Could not load in-house and contractor accounts.', 'error');
      }
      if (scheduleResult.status === 'fulfilled') setSchedules(scheduleResult.value);
      else if (!quiet) notify('Could not load saved team schedules.', 'error');
      if (jobOrderResult.status === 'fulfilled') setJobOrders(jobOrderResult.value);
    } catch (error) {
      if (!quiet) notify(error instanceof ApiError ? error.message : 'Could not load the team schedule.', 'error');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
    const refresh = (event: Event) => {
      const entity = (event as CustomEvent<{ entity?: string }>).detail?.entity;
      if (!entity || ['team-schedules', 'job-orders'].includes(entity)) void load(true);
    };
    const storageRefresh = (event: StorageEvent) => {
      if (event.key === RESOURCE_CHANGE_KEY) void load(true);
    };
    window.addEventListener(RESOURCE_CHANGE_EVENT, refresh);
    window.addEventListener('storage', storageRefresh);
    const timer = window.setInterval(() => void load(true), 10000);
    return () => {
      window.removeEventListener(RESOURCE_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', storageRefresh);
      window.clearInterval(timer);
    };
  }, [load]);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleMembers = useMemo(() => members.filter((member) =>
    !normalizedFilter || `${member.fullName} ${roleName(member.role)}`.toLowerCase().includes(normalizedFilter),
  ), [members, normalizedFilter]);

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, EntityRow[]>();
    for (const schedule of schedules) {
      if (isWeeklyRosterRow(schedule)) continue;
      const key = String(schedule.schedule_date ?? '').slice(0, 10);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(schedule);
      map.set(key, list);
    }
    return map;
  }, [schedules]);

  const weeklySchedules = useMemo(() => schedules.filter(isWeeklyRosterRow), [schedules]);

  const calendarDays = useMemo(() => buildCalendar(year, month), [year, month]);
  const todayKey = localISO(today);
  const todaySchedules = schedulesByDate.get(todayKey) ?? [];
  const selectedWeekdayRaw = new Date(`${selectedDate}T00:00:00`).getDay();
  const selectedWeekday = selectedWeekdayRaw === 0 ? 7 : selectedWeekdayRaw;
  const memberAvailabilityForSelectedDate = (member: TeamMember): 'available' | 'partial' | 'unavailable' => {
    if ((member.jobAssignments ?? []).some((job) => job.date === selectedDate)) return 'unavailable';
    const roster = (member.weeklyRoster ?? []).find((entry) => entry.weekday === selectedWeekday);
    if (!roster) return 'available';
    if (roster.amNoWork && roster.pmNoWork) return 'unavailable';
    if (roster.amNoWork || roster.pmNoWork) return 'partial';
    return 'available';
  };
  const calendarDetailSchedules = calendarDetailDate
    ? (schedulesByDate.get(calendarDetailDate) ?? []).filter((schedule) => schedule.source === 'job_order')
    : [];
  const calendarDetailRefs = [...new Set(calendarDetailSchedules.map((schedule) => String(schedule.job_order_ref ?? '')).filter(Boolean))];

  const openNew = (member?: TeamMember, date = selectedDate) => {
    setEditor('new');
    setMemberIds(member ? [member.id] : []);
    setScheduleDate(date);
    setPeriod('AM');
    setActivity('');
  };

  const planForWeek = (member: TeamMember): Record<number, WeeklyDaySettings> =>
    Object.fromEntries(WEEK_DAYS.map((_, index) => {
      const saved = weeklySchedules.find((schedule) =>
        schedule.member_id === member.id && String(schedule.schedule_date).slice(0, 10) === WEEKLY_ROSTER_DATES[index],
      );
      return [index, decodeWeeklyDay(saved) ?? defaultWeeklyDay()];
    }));

  const openWeekly = (member: TeamMember) => {
    setWeeklyMember(member);
    setWeekPlan(planForWeek(member));
  };

  const saveWeek = async () => {
    if (!weeklyMember) return;
    for (let index = 0; index < WEEK_DAYS.length; index += 1) {
      const plan = weekPlan[index] ?? defaultWeeklyDay();
      if (!plan.amNoWork && (!plan.amStart || !plan.amEnd || plan.amStart >= plan.amEnd)) {
        return notify(`Set a valid AM time range for ${WEEK_DAYS[index]}, or mark AM as No Work.`, 'error');
      }
      if (!plan.pmNoWork && (!plan.pmStart || !plan.pmEnd || plan.pmStart >= plan.pmEnd)) {
        return notify(`Set a valid PM time range for ${WEEK_DAYS[index]}, or mark PM as No Work.`, 'error');
      }
    }
    setWeeklySaving(true);
    try {
      await Promise.all(WEEK_DAYS.map((_, index) => {
        const plan = weekPlan[index] ?? defaultWeeklyDay();
        const payload = {
          member_id: weeklyMember.id,
          schedule_date: WEEKLY_ROSTER_DATES[index],
          schedule_period: 'AM',
          activity: encodeWeeklyDay(plan),
        };
        const existing = weeklySchedules.find((schedule) =>
          schedule.member_id === weeklyMember.id && String(schedule.schedule_date).slice(0, 10) === WEEKLY_ROSTER_DATES[index],
        );
        return existing
          ? resourceService.update('team-schedules', String(existing.id), payload)
          : resourceService.create('team-schedules', payload);
      }));
      setWeeklyMember(null);
      await load(true);
      notify(`Weekly roster saved for ${weeklyMember.fullName}.`);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not save the weekly roster.', 'error');
    } finally {
      setWeeklySaving(false);
    }
  };

  const save = async () => {
    if (!memberIds.length) return notify('Select at least one team member.', 'error');
    if (!scheduleDate) return notify('Select a schedule date.', 'error');
    if (period !== 'NO_WORK' && !activity.trim()) return notify('Enter the activity or assignment.', 'error');
    setSaving(true);
    try {
      const payload = {
        schedule_date: scheduleDate,
        schedule_period: period,
        activity: period === 'NO_WORK' ? 'No Work' : activity.trim(),
      };
      if (editor === 'new') {
        await Promise.all(memberIds.map((selectedMemberId) =>
          resourceService.create('team-schedules', { ...payload, member_id: selectedMemberId }),
        ));
      } else if (editor) {
        await resourceService.update('team-schedules', String(editor.id), { ...payload, member_id: memberIds[0] });
      }
      setEditor(null);
      setSelectedDate(scheduleDate);
      setYear(Number(scheduleDate.slice(0, 4)));
      setMonth(Number(scheduleDate.slice(5, 7)) - 1);
      await load(true);
      notify(editor === 'new' ? `Schedule added for ${memberIds.length} team member${memberIds.length === 1 ? '' : 's'}.` : 'Team schedule updated.');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'Could not save the schedule.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const moveMonth = (amount: number) => {
    const next = new Date(year, month + amount, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayKey);
  };

  return (
    <div className="team-schedule-page">
      <div className="team-schedule-heading">
        <div>
          <h1>Team Schedule</h1>
          <p>Plan AM and PM assignments for every in-house and contractor account.</p>
        </div>
        <ActionButton label="Set Schedule" icon="calendar-plus" onClick={() => openNew()} />
      </div>

      <section className="team-schedule-stats">
        <article><Users size={21} /><div><strong>{members.length}</strong><span>Field Members</span></div></article>
        <article><Clock3 size={21} /><div><strong>{todaySchedules.filter((row) => row.schedule_period === 'AM').length}</strong><span>AM Today</span></div></article>
        <article><BriefcaseBusiness size={21} /><div><strong>{todaySchedules.filter((row) => row.schedule_period === 'PM').length}</strong><span>PM Today</span></div></article>
        <article><CalendarOff size={21} /><div><strong>{todaySchedules.filter((row) => row.schedule_period === 'NO_WORK').length}</strong><span>Off Today</span></div></article>
      </section>

      <div className="team-schedule-layout">
        <section className="panel team-calendar-panel">
          <div className="jocal-topbar">
            <div className="jocal-title-group">
              <CalendarDays size={17} className="jocal-title-icon" />
              <span className="jocal-title">Field Calendar</span>
            </div>
            <div className="jocal-controls">
              <div className="jocal-legend">
                <span className="jocal-legend-item"><i className="jocal-legend-dot team-am-dot" /><span className="jocal-legend-label">AM</span></span>
                <span className="jocal-legend-item"><i className="jocal-legend-dot team-pm-dot" /><span className="jocal-legend-label">PM</span></span>
              </div>
              <div className="jocal-nav">
                <button className="jocal-nav-btn" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={14} /></button>
                <span className="jocal-month-label">{MONTHS[month]} {year}</span>
                <button className="jocal-nav-btn" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={14} /></button>
                <button className="jocal-today-btn" onClick={goToday}>Today</button>
              </div>
            </div>
          </div>

          <div className="jocal-grid team-calendar-grid">
            {DAYS.map((day) => <div className="jocal-dow" key={day}>{day}</div>)}
            {calendarDays.map((day) => {
              const entries = schedulesByDate.get(day.key) ?? [];
              const amCount = entries.filter((row) => row.schedule_period === 'AM').length;
              const pmCount = entries.filter((row) => row.schedule_period === 'PM').length;
              const offCount = entries.filter((row) => row.schedule_period === 'NO_WORK').length;
              return (
                <button
                  key={day.key}
                  className={[
                    'jocal-cell', !day.inMonth ? 'jocal-cell--out' : '',
                    day.key === todayKey ? 'jocal-cell--today' : '',
                    day.key === selectedDate ? 'jocal-cell--selected' : '',
                    entries.some((entry) => entry.source === 'job_order') ? 'jocal-cell--has-job' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    setSelectedDate(day.key);
                    if (entries.some((entry) => entry.source === 'job_order')) setCalendarDetailDate(day.key);
                  }}
                >
                  <span className="jocal-day-num">{day.date.getDate()}</span>
                  {!!entries.length && <span className="team-slot-counts">
                    {!!amCount && <b className="team-slot team-slot-am">{amCount} AM</b>}
                    {!!pmCount && <b className="team-slot team-slot-pm">{pmCount} PM</b>}
                    {!!offCount && <b className="team-slot team-slot-off">{offCount} Off</b>}
                  </span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel team-roster-panel">
          <div className="team-roster-panel-head">
            <div>
              <h2>Field Roster</h2>
              <p>Availability for {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div className="team-roster-summary" aria-label="Availability summary">
              <span><i className="is-available" />{members.filter((member) => memberAvailabilityForSelectedDate(member) === 'available').length} available</span>
              <span><i className="is-partial" />{members.filter((member) => memberAvailabilityForSelectedDate(member) === 'partial').length} partial</span>
              <span><i className="is-busy" />{members.filter((member) => memberAvailabilityForSelectedDate(member) === 'unavailable').length} unavailable</span>
            </div>
          </div>
          {loading ? <p className="team-roster-empty">Loading team accounts…</p> : visibleMembers.length === 0 ? (
            <p className="team-roster-empty">No matching in-house or contractor accounts.</p>
          ) : (
            <div className="team-roster-list">
              {visibleMembers.map((member) => {
                const memberEntries = schedules.filter((schedule) => schedule.member_id === member.id && String(schedule.schedule_date) >= todayKey);
                const nextEntry = [...memberEntries].sort((a, b) => `${a.schedule_date}${a.schedule_period}`.localeCompare(`${b.schedule_date}${b.schedule_period}`))[0];
                const selectedDateJob = (member.jobAssignments ?? []).find((job) => job.date === selectedDate);
                const dateAvailability = memberAvailabilityForSelectedDate(member);
                const availabilityLabel = dateAvailability === 'partial' ? 'Partial' : dateAvailability === 'unavailable' ? 'Unavailable' : 'Available';
                return (
                  <article className="team-roster-row" key={member.id}>
                    <div className="team-roster-row-main">
                      <span className={`team-avatar ${member.role === 'contractor' ? 'is-contractor' : ''}`}>{member.fullName.slice(0, 1).toUpperCase()}</span>
                      <div className="team-roster-copy">
                        <strong>{member.fullName}</strong>
                        <span>{roleName(member.role)}</span>
                        <small>{nextEntry ? `Next: ${String(nextEntry.schedule_date).slice(0, 10)} · ${nextEntry.schedule_period === 'NO_WORK' ? 'Off' : nextEntry.schedule_period}` : 'No upcoming schedule'}</small>
                      </div>
                      <span title={selectedDateJob ? `${selectedDateJob.ref} · ${selectedDateJob.startTime}–${selectedDateJob.endTime}` : availabilityLabel} className={`availability-pill roster-availability ${dateAvailability === 'unavailable' ? 'is-busy' : dateAvailability === 'partial' ? 'is-partial' : ''}`}>{availabilityLabel}</span>
                      <button className="team-set-btn" onClick={() => openWeekly(member)}>Set Week</button>
                    </div>
                    <div className="team-week-strip" aria-label={`${member.fullName} current week roster`}>
                      {WEEK_DAYS.map((day, index) => {
                        const saved = weeklySchedules.find((schedule) => schedule.member_id === member.id && String(schedule.schedule_date).slice(0, 10) === WEEKLY_ROSTER_DATES[index]);
                        const settings = decodeWeeklyDay(saved);
                        const label = !settings ? '—' : settings.amNoWork && settings.pmNoWork ? 'Off' : settings.amNoWork ? 'PM' : settings.pmNoWork ? 'AM' : 'AM–PM';
                        const detail = settings
                          ? `AM ${settings.amNoWork ? 'No Work' : `${settings.amStart}-${settings.amEnd}`}; PM ${settings.pmNoWork ? 'No Work' : `${settings.pmStart}-${settings.pmEnd}`}`
                          : 'Not set';
                        return <span title={detail} className={`team-week-cell ${settings?.amNoWork && settings.pmNoWork ? 'is-no-work' : settings ? 'is-full-day' : 'is-empty'}`} key={day}><small>{day.slice(0, 1)}</small><b>{label}</b></span>;
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {editor && (
        <Modal
          title={editor === 'new' ? 'Set Team Schedule' : 'Edit Team Schedule'}
          open
          onClose={() => setEditor(null)}
          onSubmit={save}
          submitText={editor === 'new' ? 'Save Schedule' : 'Save Changes'}
          submitting={saving}
        >
          <div className="form-group">
            <label>Team Member{editor === 'new' ? 's' : ''}</label>
            <ScheduleMemberMultiSelect
              members={members}
              value={memberIds}
              onChange={setMemberIds}
              single={editor !== 'new'}
            />
          </div>
          <div className="team-schedule-form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
            </div>
            <div className="form-group">
              <label>Time Slot</label>
              <select value={period} onChange={(event) => setPeriod(event.target.value as SchedulePeriod)}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
                <option value="NO_WORK">No Work</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Activity / Assignment</label>
            <textarea rows={4} value={period === 'NO_WORK' ? 'No Work' : activity} disabled={period === 'NO_WORK'} onChange={(event) => setActivity(event.target.value)} placeholder="e.g. Preventive maintenance — Pump Station 4" />
          </div>
        </Modal>
      )}

      {calendarDetailDate && (
        <Modal
          title="Scheduled Job Orders"
          open
          wide
          className="team-calendar-detail-modal"
          onClose={() => setCalendarDetailDate(null)}
        >
          <div className="calendar-jo-summary">
            <span className="calendar-jo-summary-icon"><CalendarDays size={22} /></span>
            <div>
              <span>Selected date</span>
              <strong>{readableDate(calendarDetailDate)}</strong>
            </div>
            <b>{calendarDetailRefs.length} job order{calendarDetailRefs.length === 1 ? '' : 's'}</b>
          </div>
          <div className="calendar-jo-list">
            {calendarDetailRefs.map((ref) => {
              const job = jobOrders.find((row) => String(row.ref_code ?? '') === ref);
              const scheduleRows = calendarDetailSchedules.filter((row) => String(row.job_order_ref ?? '') === ref);
              const assignedMembers = job && Array.isArray(job.team_members)
                ? (job.team_members as unknown[]).map(String)
                : scheduleRows.map((row) => String(row.member_name ?? '')).filter(Boolean);
              const start = String(job?.scheduled_start_time ?? '').slice(0, 5);
              const end = String(job?.scheduled_end_time ?? '').slice(0, 5);
              const status = String(job?.status ?? 'in_progress').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
              return (
                <article className="calendar-jo-card" key={ref}>
                  <div className="calendar-jo-card-head">
                    <span className="calendar-jo-card-icon"><BriefcaseBusiness size={19} /></span>
                    <div><span>Job order · {ref}</span><h3>{String(job?.title ?? scheduleRows[0]?.activity ?? 'Job Order')}</h3></div>
                    <span className={`calendar-jo-status${job?.status === 'completed' ? ' is-completed' : ''}`}>{status}</span>
                  </div>
                  <div className="calendar-jo-facts">
                    <div><Clock3 size={16} /><span>Schedule</span><strong>{String(job?.schedule_period ?? scheduleRows[0]?.schedule_period ?? 'AM')} · {start && end ? `${start}–${end}` : 'Time not set'}</strong></div>
                    <div><Users size={16} /><span>Team</span><strong>{String(job?.team_name ?? job?.team ?? '—')}</strong></div>
                    <div><Users size={16} /><span>Team Leader</span><strong>{String(job?.team_leader ?? assignedMembers[0] ?? '—')}</strong></div>
                    <div><BriefcaseBusiness size={16} /><span>Linked Incident</span><strong>{String(job?.incident_ref ?? '—') || '—'}</strong></div>
                  </div>
                  <div className="calendar-jo-members">
                    <span>Assigned Members</span>
                    <div>{assignedMembers.map((name) => <b key={name}>{name}</b>)}</div>
                  </div>
                  {Boolean(job?.scope) && <div className="calendar-jo-scope"><span>Scope of Work</span><p>{String(job?.scope)}</p></div>}
                </article>
              );
            })}
          </div>
        </Modal>
      )}

      {weeklyMember && (
        <Modal
          title={`Weekly Roster — ${weeklyMember.fullName}`}
          open
          wide
          className="weekly-roster-modal"
          onClose={() => setWeeklyMember(null)}
          onSubmit={saveWeek}
          submitText="Save Weekly Roster"
          submitting={weeklySaving}
        >
          <div className="weekly-roster-intro is-general">
            <p>This is the member's general recurring Monday–Sunday roster. AM and PM can each have separate working hours or be marked No Work.</p>
          </div>
          <div className="weekly-roster-scroll">
            <div className="weekly-roster-grid">
              <div className="weekly-roster-table-head" aria-hidden="true">
                <span>Day</span>
                <span><i className="weekly-head-dot is-am" />AM schedule</span>
                <span><i className="weekly-head-dot is-pm" />PM schedule</span>
              </div>
              {WEEK_DAYS.map((day, index) => {
              const plan = weekPlan[index] ?? defaultWeeklyDay();
              const updatePlan = (patch: Partial<WeeklyDaySettings>) => setWeekPlan((current) => ({
                ...current,
                [index]: { ...(current[index] ?? defaultWeeklyDay()), ...patch },
              }));
              return (
                <div className="weekly-roster-day" key={day}>
                  <div className="weekly-day-name"><strong>{day}</strong><span>General schedule</span></div>
                  <div className="weekly-shift-block">
                    <button type="button" aria-pressed={plan.amNoWork} className={`weekly-no-work-toggle${plan.amNoWork ? ' is-active' : ''}`} onClick={() => updatePlan({ amNoWork: !plan.amNoWork })}>
                      <i><span /></i>{plan.amNoWork ? 'No Work' : 'Working'}
                    </button>
                    {plan.amNoWork ? <span className="weekly-off-state">No AM duty</span> : (
                      <div className="weekly-time-range">
                        <input aria-label={`${day} AM start`} type="time" value={plan.amStart} onChange={(event) => updatePlan({ amStart: event.target.value })} />
                        <span>→</span>
                        <input aria-label={`${day} AM end`} type="time" value={plan.amEnd} onChange={(event) => updatePlan({ amEnd: event.target.value })} />
                      </div>
                    )}
                  </div>
                  <div className="weekly-shift-block is-pm">
                    <button type="button" aria-pressed={plan.pmNoWork} className={`weekly-no-work-toggle${plan.pmNoWork ? ' is-active' : ''}`} onClick={() => updatePlan({ pmNoWork: !plan.pmNoWork })}>
                      <i><span /></i>{plan.pmNoWork ? 'No Work' : 'Working'}
                    </button>
                    {plan.pmNoWork ? <span className="weekly-off-state">No PM duty</span> : (
                      <div className="weekly-time-range">
                        <input aria-label={`${day} PM start`} type="time" value={plan.pmStart} onChange={(event) => updatePlan({ pmStart: event.target.value })} />
                        <span>→</span>
                        <input aria-label={`${day} PM end`} type="time" value={plan.pmEnd} onChange={(event) => updatePlan({ pmEnd: event.target.value })} />
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
