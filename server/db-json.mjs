/**
 * mysql2 returns JSON columns as JavaScript objects on some MySQL installations,
 * but as JSON strings on others (for example, LONGTEXT + JSON_VALID in MariaDB).
 * Both representations are valid; parsing an already-decoded object throws
 * SyntaxError: "[object Object]" is not valid JSON.
 */
export function parseDatabaseJson(value) {
  if (typeof value === 'string') return JSON.parse(value);
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'));
  if (value !== null && typeof value === 'object') return value;
  throw new TypeError('Database JSON field was empty or had an unexpected type');
}
