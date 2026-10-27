import test from 'node:test';
import assert from 'node:assert/strict';
import { appointmentEndTime, businessDate, canCompleteAppointment, scheduleDefaults, slotAvailability } from '../shared/appointment-rules.mjs';

const date = '2030-01-08';
const beforeDay = Date.parse(date + 'T07:00:00+08:00');
const appointment = { id: 'candidate', executiveId: 'exec-1', date, startTime: '10:00', duration: 30, status: 'confirmed' };
const policy = overrides => ({ ...structuredClone(scheduleDefaults), ...overrides });
const check = (changes = {}, overrides = {}, existing = [], options = {}) => slotAvailability({ ...appointment, ...changes }, policy(overrides), existing, { now: beforeDay, ...options });

test('Completion uses the meeting end instant, including the exact UTC+8 boundary', () => {
  const meeting = { ...appointment, startTime: '17:00', duration: 60 };
  const end = Date.parse(date + 'T18:00:00+08:00');
  assert.equal(appointmentEndTime(meeting), end);
  assert.equal(canCompleteAppointment(meeting, Date.parse(date + 'T09:00:00+08:00')), false);
  assert.equal(canCompleteAppointment(meeting, end - 1), false);
  assert.equal(canCompleteAppointment(meeting, end), true);
  assert.equal(canCompleteAppointment(meeting, end + 1), true);
});

test('Closed records and invalid schedules are never eligible for completion', () => {
  const after = Date.parse(date + 'T20:00:00+08:00');
  for (const status of ['cancelled', 'completed']) assert.equal(canCompleteAppointment({ ...appointment, status }, after), false);
  assert.equal(canCompleteAppointment({ ...appointment, duration: 0 }, after), false);
  assert.equal(canCompleteAppointment({ ...appointment, date: '2030-02-30' }, after), false);
  assert.equal(canCompleteAppointment({ ...appointment, startTime: 'invalid' }, after), false);
});

test('Business dates roll over at midnight in Asia/Manila, independently of host timezone', () => {
  assert.equal(businessDate(Date.parse('2030-01-08T15:59:59Z')), '2030-01-08');
  assert.equal(businessDate(Date.parse('2030-01-08T16:00:00Z')), '2030-01-09');
});

test('Availability rejects invalid dates, times, durations, and appointments ending after office hours', () => {
  assert.equal(check({ date: '2030-02-30' }).code, 'invalid-date');
  assert.equal(check({ startTime: '25:00' }).code, 'invalid-time');
  assert.equal(check({ duration: 20 }).code, 'invalid-time');
  assert.equal(check({ startTime: '17:30', duration: 60 }).code, 'office-hours');
  assert.equal(check({ startTime: '17:30', duration: 30 }).available, true);
});

test('Availability distinguishes working hours, non-working days, and unavailable dates', () => {
  assert.equal(check({ startTime: '08:30' }, { startTime: '09:00' }).code, 'working-hours');
  assert.equal(check({}, { workingDays: [1, 3, 4, 5] }).code, 'non-working-day');
  assert.equal(check({}, { unavailableDates: [date] }).code, 'unavailable-date');
});

test('Breaks reject partial overlaps but allow appointments ending or starting at their boundaries', () => {
  const breaks = [{ startTime: '12:00', endTime: '13:00' }];
  assert.equal(check({ startTime: '11:45', duration: 30 }, { breaks }).code, 'break');
  assert.equal(check({ startTime: '12:00' }, { breaks }).code, 'break');
  assert.equal(check({ startTime: '11:30' }, { breaks }).available, true);
  assert.equal(check({ startTime: '13:00' }, { breaks }).available, true);
});

test('Pending, confirmed, and rescheduled appointments reserve their executive slot', () => {
  for (const status of ['pending', 'confirmed', 'rescheduled']) {
    const occupied = { ...appointment, id: 'existing', status };
    const result = check({}, {}, [occupied]);
    assert.equal(result.code, 'occupied'); assert.equal(result.conflictId, 'existing');
  }
});

test('Closed appointments and different executives do not block availability', () => {
  for (const status of ['completed', 'cancelled']) assert.equal(check({}, {}, [{ ...appointment, id: 'existing', status }]).available, true);
  assert.equal(check({}, {}, [{ ...appointment, id: 'existing', executiveId: 'exec-2' }]).available, true);
});

test('Buffers are enforced on both sides and allow the exact minimum gap', () => {
  const existing = [{ ...appointment, id: 'existing' }];
  assert.equal(check({ startTime: '10:30' }, { bufferMinutes: 15 }, existing).code, 'buffer');
  assert.equal(check({ startTime: '10:45' }, { bufferMinutes: 15 }, existing).available, true);
  assert.equal(check({ startTime: '09:30' }, { bufferMinutes: 15 }, existing).code, 'buffer');
  assert.equal(check({ startTime: '09:15' }, { bufferMinutes: 15 }, existing).available, true);
});

test('Editing can exclude its own record without ignoring other conflicts', () => {
  assert.equal(check({}, {}, [{ ...appointment }]).available, true);
  assert.equal(check({}, {}, [{ ...appointment }, { ...appointment, id: 'other' }]).code, 'occupied');
  assert.equal(check({ id: 'new' }, {}, [{ ...appointment }], { excludeId: appointment.id }).available, true);
});

test('Elapsed start times are blocked unless an unchanged appointment is being checked for editing', () => {
  const now = Date.parse(date + 'T10:00:00+08:00');
  assert.equal(check({}, {}, [], { now }).code, 'past');
  assert.equal(check({}, {}, [], { now, allowPast: true }).available, true);
  assert.equal(check({ startTime: '10:30' }, {}, [], { now }).available, true);
});
