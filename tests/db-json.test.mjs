import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDatabaseJson } from '../server/db-json.mjs';

test('parses JSON strings from MariaDB / LONGTEXT', () => {
  assert.deepEqual(parseDatabaseJson('{"id":"APT-001","status":"confirmed"}'), { id: 'APT-001', status: 'confirmed' });
  assert.deepEqual(parseDatabaseJson('[1,2]'), [1,2]);
});

test('accepts JSON objects already decoded by mysql2', () => {
  const appointment = { id: 'APT-001', clientName: 'Test' };
  assert.strictEqual(parseDatabaseJson(appointment), appointment);
  const history = [{ action: 'created' }];
  assert.strictEqual(parseDatabaseJson(history), history);
});

test('handles JSON returned as Buffer', () => {
  assert.deepEqual(parseDatabaseJson(Buffer.from('{"before":null,"after":{"status":"confirmed"}}')), { before: null, after: { status: 'confirmed' } });
});

test('invalid database JSON is not silently replaced by empty values', () => {
  assert.throws(() => parseDatabaseJson('{broken'), SyntaxError);
  assert.throws(() => parseDatabaseJson(null), TypeError);
});
