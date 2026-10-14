import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { accountStore } from './accounts.mjs';
import { auditStore } from './audit.mjs';
import { parseDatabaseJson } from './db-json.mjs';
import { isProduction, validateProductionConfig } from './config.mjs';
import { notificationStore } from './notifications.mjs';
import { schedulingStore, checkSchedule } from './scheduling.mjs';

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const minutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export async function openDatabase(options = {}) {
  validateProductionConfig();
  const initialize = options.initialize ?? !isProduction();
  const name = options.database || process.env.DB_NAME || 'appointment';
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(name)) throw new Error('Invalid database name');
  if (process.env.APP_ENV === 'test' && !/^(appointment_test|appointment_qa_[a-f0-9]{32})$/.test(name)) throw new Error('Test environment cannot connect to the main database');
  const config = { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', charset: 'utf8mb4', dateStrings: true };
  if (process.env.DB_SSL_CA_FILE) config.ssl = { ca: readFileSync(process.env.DB_SSL_CA_FILE, 'utf8'), rejectUnauthorized: true };
  if (!isProduction()) {
  const admin = await mysql.createConnection(config);
  try { await admin.query('CREATE DATABASE IF NOT EXISTS '+mysql.escapeId(name)+' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); }
  finally { await admin.end(); }
  }
  const pool = mysql.createPool({ ...config, database: name, connectionLimit: 5 });
  const context = new AsyncLocalStorage();
  const query = async (sql, params = []) => (await (context.getStore() || pool).execute(sql, params))[0];
  const db = {
    prepare: sql => ({
      run: (...params) => query(sql, params),
      all: (...params) => query(sql, params),
      get: async (...params) => (await query(sql, params))[0],
    }),
    close: () => pool.end(),
  };
  try {
    const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
    if (initialize) for (const sql of schema.split(';').map(part => part.trim()).filter(Boolean)) await pool.query(sql);
    const insert = async a => await db.prepare('INSERT INTO appointments VALUES (?, ?, ?, ?, ?, ?, ?)').run(a.id, a.executiveId, a.date, minutes(a.startTime), a.duration, a.status, JSON.stringify(a));
    const log = async (a, action, actor, note) => {
      const entry = { id: `ACT-${randomUUID()}`, aptId: a.id, action, user: actor, timestamp: new Date().toISOString(), clientName: a.clientName, ...(note ? { note } : {}) };
      await db.prepare('INSERT INTO activity (id, appointment_id, data) VALUES (?, ?, ?)').run(entry.id, a.id, JSON.stringify(entry));
    };
    const transaction = async fn => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        // Serialize writes so concurrent bookings cannot pass the same conflict check.
        await connection.query('SELECT id FROM write_lock WHERE id = 1 FOR UPDATE');
        const result = await context.run(connection, fn);
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    };
    if (initialize) await transaction(async () => {
      if (await db.prepare('SELECT version FROM migrations WHERE version = 1').get()) return;
      const seed = options.seed || JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
      for (const e of seed.EXECUTIVES) await db.prepare('INSERT INTO executives VALUES (?, ?, ?, ?)').run(e.id, e.name, e.title, e.initials);
      if (!isProduction()) {
      for (const a of seed.INITIAL_APPOINTMENTS) await insert(a);
      for (const e of seed.INITIAL_ACTIVITY) await db.prepare('INSERT INTO activity (id, appointment_id, data) VALUES (?, ?, ?)').run(e.id, e.aptId, JSON.stringify(e));
      }
      await query('INSERT INTO migrations VALUES (1)');
    });
    const audit = auditStore(query);
    const accounts = accountStore(query, transaction, audit);
    const notifications = notificationStore(query, transaction);
    const scheduling = schedulingStore(query, transaction, audit);
    if (initialize) await accounts.seed(isProduction() ? [] : JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8')).INITIAL_USERS);
    if (initialize) await transaction(async () => {
      if ((await query('SELECT version FROM migrations WHERE version = 3')).length) return;
      const users = await accounts.users();
      for (const row of await query('SELECT data FROM activity ORDER BY sequence')) {
        const entry = parseDatabaseJson(row.data);
        await audit.record({ user: users.find(user => user.name === entry.user), actorName: entry.user, action: 'appointment.' + entry.action, entityType: 'appointment', entityId: entry.aptId, timestamp: entry.timestamp, details: { source: 'existing_appointment_history' } });
      }
      await audit.record({ action: 'system.audit_enabled', actorName: 'System', details: { importedAppointmentHistory: true } });
      await query('INSERT INTO migrations VALUES (3)');
    });
    if (initialize) await query('INSERT IGNORE INTO migrations VALUES (4)');
    if (initialize) await query('INSERT IGNORE INTO migrations VALUES (5)');
    if (initialize) await query('INSERT IGNORE INTO migrations VALUES (6)');
    if (!initialize && (await query('SELECT version FROM migrations WHERE version IN (1,2,3,4,5,6)')).length !== 6) throw new Error('Run db:deploy before starting production');
    const notificationTimer=setInterval(()=>void notifications.tick().catch(()=>console.error('Notification worker failed; will retry')),Math.max(1000,Number(process.env.NOTIFICATION_INTERVAL_MS)||10000));
    notificationTimer.unref();
    const get = async id => {
      const row = await db.prepare('SELECT data FROM appointments WHERE id = ?').get(id);
      if (!row) fail('Appointment not found', 404);
      return parseDatabaseJson(row.data);
    };
    const state = async () => ({
      executives: await query('SELECT id,name,title,initials FROM executives ORDER BY id'),
      appointments: (await db.prepare('SELECT data FROM appointments ORDER BY date, start_min, id').all()).map(r => parseDatabaseJson(r.data)),
      activityLog: (await db.prepare('SELECT data FROM activity ORDER BY sequence').all()).map(r => parseDatabaseJson(r.data)),
    });
    const validate = async (a, old = null) => {
      for (const field of ['clientName','clientOrg','clientEmail','clientPhone','purpose','executiveId','date','startTime']) {
        if (typeof a[field] !== 'string' || !a[field].trim() || a[field].length > 500) fail(`Invalid ${field}`);
        a[field] = a[field].trim();
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.clientEmail)) fail('Invalid email address');
      if (!/^[+\d\s().-]+$/.test(a.clientPhone) || a.clientPhone.replace(/\D/g, '').length < 7) fail('Invalid phone number');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date) || !Number.isFinite(Date.parse(a.date)) || new Date(a.date).toISOString().slice(0,10) !== a.date || a.date < today()) fail('Choose a valid date today or later');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.startTime) || ![15,30,45,60,90,120].includes(a.duration)) fail('Invalid time or duration');
      if (minutes(a.startTime) < 480 || minutes(a.startTime) + a.duration > 1080) fail('Appointments must fit within 8:00 AM–6:00 PM (Asia/Manila)');
      if ((!old || old.date !== a.date || old.startTime !== a.startTime) && Date.parse(`${a.date}T${a.startTime}:00+08:00`) <= Date.now()) fail('Choose a start time in the future (Asia/Manila)');
      if (typeof a.notes !== 'string' || a.notes.length > 10000) fail('Invalid notes');
      if (!(await db.prepare('SELECT id FROM executives WHERE id = ?').get(a.executiveId))) fail('Invalid executive');
      const policy = await scheduling.get(a.executiveId);
      checkSchedule(a,policy);
      const conflict = await db.prepare(`SELECT id FROM appointments WHERE executive_id = ? AND date = ? AND id != ?
        AND status NOT IN ('cancelled','completed') AND start_min < ? AND start_min + duration > ?`).get(a.executiveId, a.date, a.id, minutes(a.startTime) + a.duration + policy.bufferMinutes, minutes(a.startTime) - policy.bufferMinutes);
      if (conflict) fail(`Schedule conflict with ${conflict.id}. Choose another time.`, 409);
    };
    const write = async a => await db.prepare('UPDATE appointments SET executive_id=?, date=?, start_min=?, duration=?, status=?, data=? WHERE id=?').run(a.executiveId,a.date,minutes(a.startTime),a.duration,a.status,JSON.stringify(a),a.id);
    return {
      state, get, accounts, audit, notifications, scheduling, close: () => {clearInterval(notificationTimer);return db.close();},
      async availability(input) { const old=input.id?await get(input.id):null;await validate({...input,id:input.id||'new-appointment',notes:input.notes||''},old);return {available:true,requireApproval:(await scheduling.get(input.executiveId)).requireApproval}; },
      async save(input, id, actor = 'Sarah Mitchell', meta = {}) {
        return transaction(async () => {
          const old = id ? await get(id) : null;
          if (old && ['cancelled','completed'].includes(old.status)) fail('Closed appointments cannot be edited', 409);
          if (old && input.updatedAt !== old.updatedAt) fail('This appointment changed. Refresh and try again.', 409);
          const now = new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString();
          const a = { ...old, ...Object.fromEntries(['clientName','clientOrg','clientEmail','clientPhone','purpose','notes','executiveId','date','startTime','duration'].map(k => [k,input[k]])),
            id: id || `APT-${randomUUID()}`, status: old?.status || 'confirmed', createdAt: old?.createdAt || now, createdBy: old?.createdBy || actor, updatedAt: now, updatedBy: actor };
          await validate(a,old);
          const policy=await scheduling.get(a.executiveId);
          if(!old||old.executiveId!==a.executiveId||old.date!==a.date||old.startTime!==a.startTime||old.duration!==a.duration){if(policy.requireApproval)a.status='pending';}
          if (old) await write(a); else await insert(a);
          await log(a, old ? 'updated' : 'created', actor);
          if (!old && a.status==='confirmed') await log(a, 'confirmed', actor);
          await notifications.event(a,a.status==='pending'?'pending':old?'updated':'confirmed');
          await audit.record({ ...meta, actorName: actor, action: old ? 'appointment.updated' : 'appointment.created', entityType: 'appointment', entityId: a.id, details: { before: old ? { date: old.date, startTime: old.startTime, duration: old.duration, executiveId: old.executiveId, status: old.status } : null, after: { date: a.date, startTime: a.startTime, duration: a.duration, executiveId: a.executiveId, status: a.status } } });
          return { appointment: a, ...await state() };
        });
      },
      async action(id, action, input, actor = 'Sarah Mitchell', meta = {}) {
        return transaction(async () => {
          const old = await get(id);
          if (['completed','cancelled'].includes(old.status)) fail('Appointment is already closed', 409);
          if (input.updatedAt !== old.updatedAt) fail('This appointment changed. Refresh and try again.', 409);
          const a = { ...old, updatedAt: new Date(Math.max(Date.now(), Date.parse(old.updatedAt) + 1)).toISOString(), updatedBy: actor };
          if (action === 'cancel') {
            if (typeof input.reason !== 'string' || input.reason.length > 2000) fail('Cancellation reason must be at most 2000 characters');
            a.status = 'cancelled'; a.cancellationReason = input.reason.trim();
          } else if (action === 'approve' || action === 'decline') {
            if(meta.user?.role!=='admin' && (meta.user?.role!=='executive'||meta.user.executiveId!==a.executiveId))fail('Only the assigned executive or administrator can decide this request',403);
            if(a.status!=='pending')fail('Only pending requests can be approved or declined',409);
            if(action==='decline'){
              if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000)fail('Provide a decline reason (up to 2000 characters)');
              a.status='cancelled';a.cancellationReason='Declined: '+input.reason.trim();
            }else{await validate(a,old);a.status='confirmed';}
          } else if (action === 'complete') {
            if(a.status==='pending'&&(await scheduling.get(a.executiveId)).requireApproval)fail('Approve the appointment before completing it',409);
            if (a.date > today()) fail('Future appointments cannot be completed');
            a.status = 'completed';
          } else if (action === 'reschedule') {
            a.previousDate = old.date; a.previousStartTime = old.startTime;
            a.date = input.date; a.startTime = input.startTime; a.duration = input.duration; a.status = 'rescheduled';
            await validate(a);
            if((await scheduling.get(a.executiveId)).requireApproval)a.status='pending';
          } else fail('Unknown action', 404);
          await write(a); await log(a, a.status, actor, a.cancellationReason || (action === 'reschedule' ? `Moved from ${old.date} ${old.startTime} to ${a.date} ${a.startTime}` : undefined));
          await notifications.event(a,a.status);
          await audit.record({ ...meta, actorName: actor, action: 'appointment.' + a.status, entityType: 'appointment', entityId: a.id, details: { before: { date: old.date, startTime: old.startTime, duration: old.duration, status: old.status }, after: { date: a.date, startTime: a.startTime, duration: a.duration, status: a.status } } });
          return { appointment: a, ...await state() };
        });
      },
    };
  } catch (error) { await pool.end(); throw error; }
}
