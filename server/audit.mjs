import { parseDatabaseJson } from './db-json.mjs';
export function auditStore(query) {
  return {
    async record({ user, actorName, action, outcome = 'success', entityType = 'system', entityId = null, ip = null, details = {}, timestamp }) {
      await query('INSERT INTO audit_logs (occurred_at,actor_id,actor_name,actor_role,action,outcome,entity_type,entity_id,ip_address,details) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [timestamp || new Date().toISOString(),user?.id || null,user?.name || actorName || 'Anonymous',user?.role || null,action,outcome,entityType,entityId,ip,JSON.stringify(details)]);
    },
    async list(params) {
      const page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1));
      if (!Number.isInteger(page)) throw Object.assign(new Error('Invalid page'), { status: 400 });
      const where = []; const values = [];
      const search = (params.get('search') || '').trim().slice(0, 255);
      if (search) { where.push('(actor_name LIKE ? OR action LIKE ? OR entity_id LIKE ?)'); const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%'; values.push(pattern, pattern, pattern); }
      const action = params.get('action');
      if (action) { where.push('action = ?'); values.push(action.slice(0,64)); }
      const outcome = params.get('outcome');
      if (outcome) { where.push('outcome = ?'); values.push(outcome); }
      for (const [key, operator, suffix] of [['from','>=','T00:00:00+08:00'],['to','<','T00:00:00+08:00']]) {
        const date = params.get(key); if (!date) continue;
        const instant = new Date(date + suffix);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant.getTime()) || new Date(instant.getTime() + 8 * 3600000).toISOString().slice(0,10) !== date) throw Object.assign(new Error('Invalid date filter'), { status: 400 });
        if (key === 'to') instant.setTime(instant.getTime() + 86400000);
        where.push(`occurred_at ${operator} ?`); values.push(instant.toISOString());
      }
      const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const rows = await query('SELECT * FROM audit_logs' + clause + ' ORDER BY occurred_at DESC, id DESC LIMIT 50 OFFSET ' + ((page - 1) * 50), values);
      const count = await query('SELECT COUNT(*) AS total FROM audit_logs' + clause, values);
      const actions = await query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
      return { entries: rows.map(row => ({ id: row.id, timestamp: row.occurred_at, actorId: row.actor_id, actorName: row.actor_name, actorRole: row.actor_role, action: row.action, outcome: row.outcome, entityType: row.entity_type, entityId: row.entity_id, ip: row.ip_address, details: parseDatabaseJson(row.details) })), total: Number(count[0].total), page, pageSize: 50, actions: actions.map(row => row.action) };
    },
  };
}
