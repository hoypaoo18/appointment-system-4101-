import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { businessDate, minute, slotAvailability, type SchedulingAppointment } from '../../../shared/appointment-rules.mjs';
import { useExecutiveSchedules } from '../hooks/useExecutiveSchedules';
import { useCurrentTime } from '../hooks/useCurrentTime';

interface Executive { id: string; name: string; initials: string; }
interface CalendarAppointment extends SchedulingAppointment { id: string; status: string; clientName: string; purpose: string; }
interface Props {
  appointments: CalendarAppointment[];
  executives: Executive[];
  onViewDetail: (id: string) => void;
  onNewAptFromSlot: (date: string, startTime: string, executiveId: string, duration: number) => void;
  defaultView: 'day' | 'week';
  defaultDuration: number;
  canCreate: boolean;
}
const times = Array.from({ length: 20 }, (_, index) => `${8 + Math.floor(index / 2)}`.padStart(2, '0') + (index % 2 ? ':30' : ':00'));
const durations = [15, 30, 45, 60, 90, 120];
const hourHeight = 64;
const dateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timeLabel = (time: string) => { const [hour, minutes] = time.split(':').map(Number); return `${hour % 12 || 12}:${String(minutes).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`; };
const statusClasses: Record<string, string> = {
  pending: 'border-l-amber-400 bg-amber-50 text-amber-900', confirmed: 'border-l-emerald-500 bg-emerald-50 text-emerald-900',
  rescheduled: 'border-l-blue-500 bg-blue-50 text-blue-900', completed: 'border-l-slate-400 bg-slate-100 text-slate-700', cancelled: 'border-l-red-400 bg-red-50 text-red-800',
};
const restrictionLabels: Record<string, string> = { break: 'Break', buffer: 'Buffer', 'working-hours': 'Outside hours', 'office-hours': 'Outside hours', 'unavailable-date': 'Unavailable', 'non-working-day': 'Closed', past: 'Past', loading: 'Loading', unknown: 'Unavailable' };

export function ScheduleView({ appointments, executives, onViewDetail, onNewAptFromSlot, defaultView, defaultDuration, canCreate }: Props) {
  const now = useCurrentTime();
  const today = businessDate(now);
  const [calView, setCalView] = useState(defaultView);
  const [currentDate, setCurrentDate] = useState(() => new Date(today + 'T00:00:00'));
  const [executiveFilter, setExecutiveFilter] = useState('all');
  const [duration, setDuration] = useState(defaultDuration);
  const { schedules, loading, error, retry } = useExecutiveSchedules();
  const policies = useMemo(() => new Map(schedules.map(schedule => [schedule.id, schedule.policy])), [schedules]);
  const appointmentsByLane = useMemo(() => {
    const grouped = new Map<string, CalendarAppointment[]>();
    for (const appointment of appointments) {
      const key = `${appointment.executiveId}|${appointment.date}`;
      const lane = grouped.get(key) || [];
      lane.push(appointment); grouped.set(key, lane);
    }
    return grouped;
  }, [appointments]);
  const visibleExecutives = executives.filter(executive => executiveFilter === 'all' || executive.id === executiveFilter);
  const laneCount = Math.max(1, visibleExecutives.length);
  const weekStart = useMemo(() => { const start = new Date(currentDate); start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1)); return start; }, [currentDate]);
  const days = calView === 'day' ? [currentDate] : Array.from({ length: 7 }, (_, index) => { const day = new Date(weekStart); day.setDate(day.getDate() + index); return day; });
  const move = (direction: number) => setCurrentDate(previous => { const date = new Date(previous); date.setDate(date.getDate() + direction * (calView === 'day' ? 1 : 7)); return date; });
  const range = calView === 'day'
    ? currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const columns = `60px repeat(${days.length}, minmax(0, 1fr))`;
  return <div className="p-4 md:p-6 flex flex-col gap-4">
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div><h1 className="text-xl font-semibold text-slate-900 tracking-tight">Schedule</h1><p className="text-sm text-slate-500 mt-0.5">{range}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCurrentDate(new Date(today + 'T00:00:00'))} className="ui-button-secondary px-3 py-2 text-sm rounded-lg">Today</button>
        <button aria-label="Previous schedule period" onClick={() => move(-1)} className="ui-icon-button rounded-lg text-slate-500 hover:bg-white"><ChevronLeft className="w-4 h-4" /></button>
        <button aria-label="Next schedule period" onClick={() => move(1)} className="ui-icon-button rounded-lg text-slate-500 hover:bg-white"><ChevronRight className="w-4 h-4" /></button>
        <div className="ui-surface flex rounded-lg overflow-hidden">{(['day', 'week'] as const).map(view => <button key={view} aria-pressed={calView === view} onClick={() => setCalView(view)} className={`px-4 py-2 text-sm capitalize ${calView === view ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{view}</button>)}</div>
      </div>
    </div>
    <div className="calendar-toolbar ui-surface rounded-xl p-4 flex flex-wrap gap-4 items-end">
      <label className="text-xs text-slate-600">Executive<select aria-label="Calendar executive" className="ui-input block mt-1 border rounded-lg px-3 py-2 text-sm" value={executiveFilter} onChange={event => setExecutiveFilter(event.target.value)}><option value="all">All executives</option>{executives.map(executive => <option key={executive.id} value={executive.id}>{executive.name}</option>)}</select></label>
      <label className="text-xs text-slate-600">Appointment length<select aria-label="Calendar appointment length" className="ui-input block mt-1 border rounded-lg px-3 py-2 text-sm" value={duration} onChange={event => setDuration(Number(event.target.value))}>{durations.map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
      <p className="text-xs text-slate-500 flex-1 min-w-40">Availability reflects this appointment length. Times use Asia/Manila.</p>
    </div>
    {loading && <p role="status" className="text-sm text-slate-500">Loading executive availability…</p>}
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}<button className="ml-3 underline" onClick={retry}>Retry</button><p className="mt-1 text-xs">Booking from the calendar is unavailable until availability can be verified.</p></div>}
    <div className="calendar-legend flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600"><span><i data-state="available" />Available</span><span><i data-state="occupied" />Occupied</span><span><i data-state="buffer" />Buffer</span><span><i data-state="closed" />Break / unavailable</span></div>
    <div className="calendar-surface ui-surface rounded-2xl overflow-auto" style={{ maxHeight: 'calc(100vh - 290px)', minHeight: 280 }}>
      <div style={{ minWidth: 60 + days.length * Math.max(120, laneCount * 70) }}>
        <div className="sticky top-0 bg-white z-20 border-b border-slate-200" style={{ display: 'grid', gridTemplateColumns: columns }}>
          <div className="border-r border-slate-200" />
          {days.map(day => <div key={dateString(day)} className={`text-center border-r border-slate-200 last:border-r-0 ${dateString(day) === today ? 'bg-blue-50' : ''}`}>
            <div className="pt-3 text-xs text-slate-500">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div><div className={`my-1 mx-auto w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold ${dateString(day) === today ? 'bg-blue-600 text-white' : 'text-slate-900'}`}>{day.getDate()}</div>
            <div className="calendar-lane-labels" style={{ display: 'grid', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))` }}>{visibleExecutives.map(executive => <span key={executive.id} title={executive.name}>{laneCount === 1 ? executive.name : executive.initials}</span>)}</div>
          </div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: columns, height: hourHeight * 10 }}>
          <div className="border-r border-slate-200">{Array.from({ length: 10 }, (_, index) => <div key={index} className="border-b border-slate-100 text-[10px] text-slate-500 text-right pr-2 pt-1" style={{ height: hourHeight }}>{timeLabel(`${8 + index}:00`)}</div>)}</div>
          {days.map(day => {
            const date = dateString(day);
            return <div key={date} className="relative border-r border-slate-200 last:border-r-0">
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))` }}>
                {visibleExecutives.map(executive => <div key={executive.id} className="calendar-lane">
                  {times.map(startTime => {
                    const policy = policies.get(executive.id);
                    const availability = !loading && !error && policy
                      ? slotAvailability({ executiveId: executive.id, date, startTime, duration }, policy, appointmentsByLane.get(`${executive.id}|${date}`) || [], { now })
                      : { available: false, reason: loading ? 'Loading executive availability' : 'Executive availability could not be verified', code: loading ? 'loading' : 'unknown' };
                    const label = availability.available ? `Book ${date} at ${startTime} with ${executive.name}` : `${executive.name}, ${date} ${timeLabel(startTime)}: ${availability.reason}`;
                    return <button key={startTime} className="calendar-slot" data-state={availability.available ? 'available' : availability.code} data-executive={executive.id} data-date={date} data-time={startTime} aria-label={label} title={`${executive.name}: ${availability.reason || `Available for ${duration} minutes`}`} disabled={!canCreate || !availability.available} onClick={() => onNewAptFromSlot(date, startTime, executive.id, duration)} style={{ height: hourHeight / 2 }}><span>{availability.available ? '' : restrictionLabels[availability.code || ''] || ''}</span></button>;
                  })}
                </div>)}
              </div>
              {appointments.filter(appointment => appointment.date === date && appointment.status !== 'cancelled' && visibleExecutives.some(executive => executive.id === appointment.executiveId)).map(appointment => {
                const start = minute(appointment.startTime);
                if (start < 480 || start >= 1080) return null;
                const lane = visibleExecutives.findIndex(executive => executive.id === appointment.executiveId);
                const height = Math.max(appointment.duration / 60 * hourHeight, 16);
                const end = `${Math.floor((start + appointment.duration) / 60)}`.padStart(2, '0') + ':' + `${(start + appointment.duration) % 60}`.padStart(2, '0');
                return <button key={appointment.id} title={`${appointment.clientName} · ${appointment.purpose} · ${visibleExecutives[lane].name} · ${timeLabel(appointment.startTime)}–${timeLabel(end)}`} onClick={() => onViewDetail(appointment.id)} className={`calendar-appointment absolute rounded-md border-l-2 overflow-hidden text-left text-xs z-10 ${statusClasses[appointment.status]}`} style={{ top: (start - 480) / 60 * hourHeight, height, left: `calc(${lane * 100 / laneCount}% + 2px)`, right: `calc(${(laneCount - lane - 1) * 100 / laneCount}% + 2px)` }}>
                  <div className="px-1.5 py-1"><div className="font-semibold truncate leading-tight">{appointment.clientName}</div>{height > 36 && <div className="truncate leading-tight">{appointment.purpose}</div>}{height > 52 && <div className="truncate leading-tight">{timeLabel(appointment.startTime)}–{timeLabel(end)}</div>}</div>
                </button>;
              })}
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
}
