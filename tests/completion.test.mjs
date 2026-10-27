import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { openDatabase, today } from '../server/database.mjs';
import { scheduleDefaults } from '../shared/appointment-rules.mjs';

test('The actual completion action rejects early completion and retains approval and closed-record protection', async () => {
  const originals = { createConnection: mysql.createConnection, createPool: mysql.createPool, now: Date.now, nodeEnv: process.env.NODE_ENV, appEnv: process.env.APP_ENV };
  const date = today();
  let now = Date.parse(date + 'T09:00:00+08:00'), policy = structuredClone(scheduleDefaults), commits = 0;
  const original = { id: 'completion-test', executiveId: 'exec-1', date, startTime: '17:00', duration: 60, status: 'confirmed', updatedAt: new Date(now - 1000).toISOString() };
  let record = { ...original }, database;
  const execute = async (sql, params = []) => {
    let result = { affectedRows: 1 };
    if (sql.startsWith('SELECT version FROM migrations')) result = [1, 2, 3, 4, 5, 6].map(version => ({ version }));
    else if (sql.startsWith('SELECT data FROM executive_schedules')) result = [{ data: JSON.stringify(policy) }];
    else if (sql.startsWith('SELECT data FROM appointments WHERE id')) result = [{ data: JSON.stringify(record) }];
    else if (sql.startsWith('UPDATE appointments SET')) record = JSON.parse(params[5]);
    else if (sql.startsWith('SELECT id,name,title,initials FROM executives')) result = [];
    else if (sql.startsWith('SELECT data FROM appointments ORDER BY')) result = [{ data: JSON.stringify(record) }];
    else if (sql.startsWith('SELECT data FROM activity ORDER BY')) result = [];
    return [result, []];
  };
  const connection = { execute, query: async () => [[], []], beginTransaction: async () => {}, commit: async () => { commits++; }, rollback: async () => {}, release: () => {} };
  mysql.createConnection = async () => ({ query: async () => [[], []], end: async () => {} });
  mysql.createPool = () => ({ execute, getConnection: async () => connection, end: async () => {} });
  Date.now = () => now; process.env.NODE_ENV = 'development'; process.env.APP_ENV = 'unit';
  const complete = () => database.action(record.id, 'complete', { updatedAt: record.updatedAt }, 'Test assistant', { user: { id: 'test-assistant', role: 'assistant' } });
  try {
    database = await openDatabase({ initialize: false, database: 'appointment_completion_unit' });
    await assert.rejects(complete, /scheduled end time/);
    assert.equal(record.status, 'confirmed'); assert.equal(commits, 0);
    now = Date.parse(date + 'T17:30:00+08:00');
    await assert.rejects(complete, /scheduled end time/);
    now = Date.parse(date + 'T18:00:00+08:00') - 1;
    await assert.rejects(complete, /scheduled end time/);
    now++;
    assert.equal((await complete()).appointment.status, 'completed');
    assert.equal(commits, 1);
    await assert.rejects(complete, /already closed/);
    record = { ...original, status: 'cancelled' };
    await assert.rejects(complete, /already closed/);
    record = { ...original, status: 'pending' }; policy.requireApproval = true;
    await assert.rejects(complete, /Approve the appointment/);
  } finally {
    if (database) await database.close();
    mysql.createConnection = originals.createConnection; mysql.createPool = originals.createPool; Date.now = originals.now;
    if (originals.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originals.nodeEnv;
    if (originals.appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = originals.appEnv;
  }
});
