import data from '../../server/seed.json';
export const STATIC_PREVIEW = import.meta.env.MODE === 'pages';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = Date.parse(today + 'T00:00:00Z') - Date.parse('2026-09-08T00:00:00Z');
const shiftDate = (value: string) => new Date(Date.parse(value + 'T00:00:00Z') + shift).toISOString().slice(0,10);
export const previewData = { ...data, INITIAL_APPOINTMENTS: data.INITIAL_APPOINTMENTS.map(appointment => ({ ...appointment, date: shiftDate(appointment.date), ...('previousDate' in appointment ? { previousDate: shiftDate(appointment.previousDate as string) } : {}) })) };
export const previewAudit = data.INITIAL_ACTIVITY.map((entry, index) => ({
  id: index + 1, timestamp: entry.timestamp, actorName: entry.user, actorRole: 'assistant',
  action: 'appointment.' + entry.action, outcome: 'success' as const,
  entityType: 'appointment', entityId: entry.aptId, ip: null,
  details: { source: 'existing_appointment_history' },
})).reverse();
