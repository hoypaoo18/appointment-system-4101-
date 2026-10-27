import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { chromium, expect, request } from '@playwright/test';
import { openDatabase, today } from '../server/database.mjs';
import { webHandler } from '../server/web-handler.mjs';
import { scheduleDefaults } from '../shared/appointment-rules.mjs';

// All application reads/writes below use this newly created database, never DB_NAME's original target.
const originalName = process.env.DB_NAME;
const name = 'appointment_qa_' + randomUUID().replaceAll('-', '');
assert.match(name, /^appointment_qa_[a-f0-9]{32}$/);
assert.notEqual(name, originalName);
const config = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', connectTimeout: 5000 };
process.env.APP_ENV = 'test'; process.env.NODE_ENV = 'development'; process.env.DB_NAME = name;
for (const key of ['SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASSWORD']) delete process.env[key];
process.env.NOTIFICATION_INTERVAL_MS = '3600000';
const date = today(), realNow = Date.now;
const morning = Date.parse(date + 'T09:00:00+08:00');
let clock = morning;
Date.now = () => clock;
const future = new Date(Date.parse(date + 'T00:00:00Z') + 14 * 86400000).toISOString().slice(0, 10);
const closedDate = new Date(Date.parse(future + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const output = new URL('./evidence-high-priority/', import.meta.url);
const checks = [];
let admin, database, server, browser, staffApi, adminApi, qaCreated = false;
const pass = message => { checks.push(message); console.log('PASS: ' + message); };
const input = (label, changes = {}) => ({ clientName: label, clientOrg: 'Isolated QA', clientEmail: 'sample@example.test', clientPhone: '09171234567', purpose: 'High priority regression', notes: 'Disposable QA fixture', executiveId: 'exec-1', date: future, startTime: '10:00', duration: 30, ...changes });
async function result(response) { return { status: response.status(), body: await response.json() }; }
async function create(label, changes = {}) {
  const response = await result(await staffApi.post('/api/appointments', { data: input(label, changes) }));
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.appointment;
}
const act = (appointment, action, changes = {}) => staffApi.post(`/api/appointments/${appointment.id}/${action}`, { data: { updatedAt: appointment.updatedAt, ...changes } }).then(result);
async function login(api, email) { assert.equal((await api.post('/api/auth/login', { data: { email, password: 'MeridianDemo123!' } })).status(), 200); }
const assertLayout = async (page, label) => {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth, scrollX, roots: ['body', '.appointment-app', '.app-frame', '.app-header', '.header-inner', '.app-main'].map(selector => { const element = document.querySelector(selector); const box = element.getBoundingClientRect(); return { selector, left: box.left, right: box.right, width: box.width }; }), elements: [...document.querySelectorAll('body *')].filter(element => {
    const box = element.getBoundingClientRect();
    if (!box.width || box.right <= innerWidth + 1) return false;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(ancestor).overflowX)) return false;
    return true;
  }).slice(0, 8).map(element => ({ tag: element.tagName, class: element.className, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })) }));
  if (dimensions.content > dimensions.width) {
    await page.screenshot({ path: fileURLToPath(new URL('layout-failure.png', output)), fullPage: true });
    console.log(JSON.stringify(dimensions));
  }
  assert.ok(dimensions.content <= dimensions.width, label + ' has no document overflow');
};
try {
  await mkdir(output, { recursive: true });
  admin = await mysql.createConnection(config);
  const [existing] = await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [name]);
  assert.equal(existing.length, 0, 'Refuse to reuse an existing database');
  qaCreated = true;
  database = await openDatabase({ database: name });
  server = createServer(webHandler(database, fileURLToPath(new URL('../dist/', import.meta.url))));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  staffApi = await request.newContext({ baseURL }); adminApi = await request.newContext({ baseURL });
  await login(staffApi, 'sarah.mitchell@meridian.com'); await login(adminApi, 'j.alderton@meridian.com');
  const policy = { ...structuredClone(scheduleDefaults), startTime: '09:00', endTime: '17:00', bufferMinutes: 15, breaks: [{ startTime: '12:00', endTime: '13:00' }], unavailableDates: [closedDate] };
  assert.equal((await adminApi.put('/api/executive-schedules/exec-1', { data: policy })).status(), 200);
  assert.equal((await staffApi.post('/api/availability', { data: input('Break', { startTime: '12:00' }) })).status(), 409);
  assert.equal((await staffApi.post('/api/appointments', { data: input('Break', { startTime: '12:00' }) })).status(), 409);
  assert.equal((await staffApi.post('/api/availability', { data: input('Closed', { date: closedDate }) })).status(), 409);
  assert.equal((await staffApi.post('/api/availability', { data: input('Hours', { startTime: '08:00' }) })).status(), 409);
  const occupied = await create('QA buffer reservation');
  assert.equal((await staffApi.post('/api/availability', { data: input('Buffer', { startTime: '10:30' }) })).status(), 409);
  assert.equal((await staffApi.post('/api/availability', { data: input('Boundary', { startTime: '10:45' }) })).status(), 200);
  pass('Real API enforces breaks, working hours, unavailable dates, buffers and exact buffer boundaries');

  const race = await Promise.all([staffApi.post('/api/appointments', { data: input('QA race A', { startTime: '14:00' }) }), staffApi.post('/api/appointments', { data: input('QA race B', { startTime: '14:00' }) })]);
  assert.deepEqual(race.map(response => response.status()).sort(), [201, 409]);
  const concurrent = (await race.find(response => response.status() === 201).json()).appointment;
  assert.equal((await act(concurrent, 'reschedule', { date: future, startTime: '12:00', duration: 30 })).status, 409);
  const moved = await act(concurrent, 'reschedule', { date: future, startTime: '15:00', duration: 30 });
  assert.equal(moved.status, 200); assert.equal(moved.body.appointment.status, 'rescheduled');
  const cancelled = await create('QA released reservation', { startTime: '16:00' });
  assert.equal((await act(cancelled, 'cancel', { reason: 'QA released slot' })).status, 200);
  assert.equal((await staffApi.post('/api/availability', { data: input('Released', { startTime: '16:00' }) })).status(), 200);
  pass('Concurrent booking still saves one record; rescheduling revalidates; cancellation releases the slot');

  const completion = await create('QA completion boundary', { date, startTime: '09:30' });
  assert.equal((await act(completion, 'complete')).status, 409);
  clock = Date.parse(date + 'T10:00:00+08:00') - 1;
  assert.equal((await act(completion, 'complete')).status, 409);
  clock++;
  const completed = await act(completion, 'complete');
  assert.equal(completed.status, 200); assert.equal(completed.body.appointment.status, 'completed');
  assert.equal((await act(completed.body.appointment, 'complete')).status, 409);
  clock = morning;
  const pendingPolicy = { ...structuredClone(scheduleDefaults), requireApproval: true };
  assert.equal((await adminApi.put('/api/executive-schedules/exec-2', { data: pendingPolicy })).status(), 200);
  const pending = await create('QA approval protection', { executiveId: 'exec-2', date, startTime: '09:30' });
  assert.equal(pending.status, 'pending'); clock = Date.parse(date + 'T10:00:00+08:00');
  assert.equal((await act(pending, 'complete')).status, 409); clock = morning;
  const uiCompletion = await create('QA future completion UI', { date, startTime: '15:00' });
  await create('QA other executive lane', { executiveId: 'exec-2' });
  pass('Actual API rejects early completion, accepts the exact end time, and retains approval/closed-record guards');

  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' }) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.clock.install({ time: new Date(morning) });
  await page.goto(baseURL);
  await page.getByLabel('Email', { exact: true }).fill('sarah.mitchell@meridian.com');
  await page.getByLabel('Password', { exact: true }).fill('MeridianDemo123!');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
  await nav.getByRole('button', { name: 'Appointments', exact: true }).click();
  await page.getByLabel('Search appointments', { exact: true }).fill(uiCompletion.id);
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mark as Completed', exact: true })).toBeDisabled();
  await expect(page.getByText('Appointments can only be completed after their scheduled end time.', { exact: true })).toBeVisible();
  clock = Date.parse(date + 'T15:30:00+08:00');
  await page.clock.setSystemTime(new Date(clock)); await page.clock.runFor(1000);
  await expect(page.getByRole('button', { name: 'Mark as Completed', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Mark as Completed', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  clock = morning; await page.clock.setSystemTime(new Date(clock));
  pass('Completion dialog stays disabled before the end and unlocks after the end without reloading');

  await nav.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByLabel('Calendar executive', { exact: true }).selectOption('exec-1');
  await page.getByLabel('Calendar appointment length', { exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Next schedule period', exact: true }).click();
  await page.getByRole('button', { name: 'Next schedule period', exact: true }).click();
  const slot = (time, day = future) => page.locator(`.calendar-slot[data-executive="exec-1"][data-date="${day}"][data-time="${time}"]`);
  await expect(slot('12:00')).toHaveAttribute('data-state', 'break'); await expect(slot('12:00')).toBeDisabled();
  await expect(slot('08:00')).toHaveAttribute('data-state', 'working-hours');
  await expect(slot('10:30')).toHaveAttribute('data-state', 'buffer');
  await expect(slot('10:00')).toHaveAttribute('data-state', 'occupied');
  await expect(slot('09:00', closedDate)).toHaveAttribute('data-state', 'unavailable-date');
  await expect(slot('11:00')).toBeEnabled();
  await page.screenshot({ path: fileURLToPath(new URL('calendar-desktop.png', output)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(100);
  await expect(page.locator('.app-frame')).toHaveCSS('margin-left', '0px');
  await assertLayout(page, 'Mobile calendar');
  await page.screenshot({ path: fileURLToPath(new URL('calendar-mobile.png', output)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.clock.runFor(100);
  await expect(page.locator('.app-frame')).toHaveCSS('margin-left', '240px');
  pass('Calendar disables and labels occupied slots, breaks, buffers, closed dates and working-hour restrictions on desktop/mobile');

  await slot('11:00').click();
  await page.getByLabel('Full Name').fill('QA browser booking'); await page.getByLabel('Organization').fill('Isolated QA');
  await page.getByLabel('Email Address').fill('browser@example.test'); await page.getByLabel('Phone Number').fill('09171234567');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Meeting Purpose').fill('Policy-aware booking'); await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.equal(await page.getByLabel('Appointment Date').inputValue(), future);
  assert.equal(await page.getByLabel('Start Time').inputValue(), '11:00');
  assert.equal(await page.getByLabel('Duration', { exact: false }).inputValue(), '30');
  await page.getByRole('button', { name: 'Check Availability', exact: true }).click();
  await expect(page.getByText('Available', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Select 12:00 PM:/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Select 10:30 AM:/ })).toBeDisabled();
  pass('Calendar selection preserves executive, date, start time and appointment length in the booking form');

  const availabilityTimes = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/availability' && request.method() === 'POST') availabilityTimes.push(request.postDataJSON().startTime); });
  await page.route('**/api/availability', async route => {
    const time = route.request().postDataJSON().startTime;
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, time === '14:00' ? 250 : 60));
    try { await route.fulfill({ response }); } catch { /* An intentionally superseded browser request may already be aborted. */ }
  });
  await page.getByRole('button', { name: 'Select 2:00 PM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeDisabled();
  await expect(page.getByText('Checking current availability…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select 4:00 PM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeEnabled();
  await expect(page.getByText(new RegExp('is available on .* at 4:00 PM'))).toBeVisible();
  assert.ok(availabilityTimes.includes('14:00') && availabilityTimes.includes('16:00'));
  pass('Every time-tile change reaches the actual API; loading disables review and stale responses cannot restore the old selection');

  await page.unroute('**/api/availability');
  await page.route('**/api/availability', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Select 2:00 PM', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to check current availability' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry availability check', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Select 4:00 PM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeEnabled();
  pass('A failed availability request keeps review disabled and can recover through an explicit retry');

  const changedPolicy = { ...policy, breaks: [...policy.breaks, { startTime: '16:00', endTime: '16:30' }] };
  assert.equal((await adminApi.put('/api/executive-schedules/exec-1', { data: changedPolicy })).status(), 200);
  await page.getByRole('button', { name: 'Continue to Review', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Appointment', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Appointment overlaps an executive break' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeDisabled();
  const unsaved = (await (await staffApi.get('/api/state')).json()).appointments.filter(appointment => appointment.clientName === 'QA browser booking');
  assert.equal(unsaved.length, 0);
  assert.equal((await adminApi.put('/api/executive-schedules/exec-1', { data: policy })).status(), 200);
  pass('A policy changed after verification is checked again at confirmation and prevents saving');

  await page.unroute('**/api/availability');
  await page.getByRole('button', { name: 'Select 2:00 PM', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to Review', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue to Review', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Appointment', exact: true }).evaluate(button => { button.click(); button.click(); });
  await expect(page.getByRole('heading', { name: 'Appointment Confirmed!', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Appointment', exact: true }).click();
  await expect(page.locator('main')).toContainText('QA browser booking');
  await page.reload();
  const state = await (await context.request.get(baseURL + '/api/state')).json();
  const saved = state.appointments.filter(appointment => appointment.clientName === 'QA browser booking');
  assert.equal(saved.length, 1); assert.equal(saved[0].startTime, '14:00'); assert.equal(saved[0].executiveId, 'exec-1');
  await context.close();
  assert.deepEqual(pageErrors, []);
  pass('Complete browser booking saves once despite repeated confirmation, and persists through reload');

  await writeFile(new URL('results.json', output), JSON.stringify({ passed: true, checks, database: name, scope: 'Actual API + isolated MySQL database + compiled frontend; original database untouched; no SMTP delivery' }, null, 2));
  console.log(`Completed ${checks.length} high-priority integration checks.`);
} catch (error) {
  await writeFile(new URL('results.json', output), JSON.stringify({ passed: false, checks, error: error.message }, null, 2)).catch(() => {});
  throw error;
} finally {
  Date.now = realNow;
  if (browser) await browser.close();
  if (staffApi) await staffApi.dispose(); if (adminApi) await adminApi.dispose();
  if (server) await new Promise(resolve => server.close(resolve));
  if (database) await database.close();
  if (admin) {
    try { if (qaCreated && /^appointment_qa_[a-f0-9]{32}$/.test(name) && name !== originalName) await admin.query('DROP DATABASE IF EXISTS ' + mysql.escapeId(name)); }
    finally { await admin.end(); }
  }
}
