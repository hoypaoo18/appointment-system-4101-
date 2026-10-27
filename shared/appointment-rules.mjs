// Pure rules shared by the server and the interactive schedule. All instants use UTC+8.
export const scheduleDefaults = {
  workingDays: [0, 1, 2, 3, 4, 5, 6], startTime: '08:00', endTime: '18:00',
  bufferMinutes: 0, requireApproval: false, breaks: [], unavailableDates: [],
};
export const minute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const validTime = time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const blocked = (code, reason, status = 409) => ({ available: false, code, reason, status });
export const businessDate = (now = Date.now()) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);

export function appointmentEndTime(appointment) {
  if (!validDate(appointment.date) || !validTime(appointment.startTime)
    || !Number.isFinite(appointment.duration) || appointment.duration <= 0) return NaN;
  return Date.parse(`${appointment.date}T${appointment.startTime}:00+08:00`) + appointment.duration * 60000;
}

export function canCompleteAppointment(appointment, now = Date.now()) {
  return ['confirmed', 'rescheduled', 'pending'].includes(appointment.status)
    && Number.isFinite(appointmentEndTime(appointment)) && appointmentEndTime(appointment) <= now;
}

export function scheduleRestriction(appointment, policy) {
  const day = new Date(appointment.date + 'T12:00:00+08:00').getUTCDay();
  const start = minute(appointment.startTime), end = start + appointment.duration;
  if (policy.unavailableDates.includes(appointment.date)) return blocked('unavailable-date', 'Executive is unavailable on this date');
  if (!policy.workingDays.includes(day)) return blocked('non-working-day', 'Executive is unavailable on this date');
  if (start < minute(policy.startTime) || end > minute(policy.endTime)) return blocked('working-hours', 'Appointment falls outside executive working hours');
  if (policy.breaks.some(period => start < minute(period.endTime) && end > minute(period.startTime))) return blocked('break', 'Appointment overlaps an executive break');
  return null;
}

export function checkSchedule(appointment, policy) {
  const restriction = scheduleRestriction(appointment, policy);
  if (restriction) throw Object.assign(new Error(restriction.reason), { status: restriction.status });
}

export function slotAvailability(appointment, policy, appointments, options = {}) {
  const now = options.now ?? Date.now();
  if (!validDate(appointment.date)) return blocked('invalid-date', 'Choose a valid appointment date', 400);
  if (!validTime(appointment.startTime) || ![15, 30, 45, 60, 90, 120].includes(appointment.duration)) return blocked('invalid-time', 'Invalid time or duration', 400);
  const start = minute(appointment.startTime), end = start + appointment.duration;
  if (start < 480 || end > 1080) return blocked('office-hours', 'Appointments must fit within 8:00 AM–6:00 PM (Asia/Manila)', 400);
  if (!options.allowPast && Date.parse(`${appointment.date}T${appointment.startTime}:00+08:00`) <= now) return blocked('past', 'Choose a start time in the future (Asia/Manila)', 400);
  const restriction = scheduleRestriction(appointment, policy);
  if (restriction) return restriction;
  const conflict = appointments.find(existing => existing.id !== (options.excludeId ?? appointment.id)
    && existing.executiveId === appointment.executiveId && existing.date === appointment.date
    && !['cancelled', 'completed'].includes(existing.status)
    && start < minute(existing.startTime) + existing.duration + policy.bufferMinutes
    && end + policy.bufferMinutes > minute(existing.startTime));
  if (conflict) {
    const overlaps = start < minute(conflict.startTime) + conflict.duration && end > minute(conflict.startTime);
    return { ...blocked(overlaps ? 'occupied' : 'buffer', `Schedule conflict with ${conflict.id}. Choose another time.`), conflictId: conflict.id };
  }
  return { available: true, code: null, reason: null, status: 200 };
}
