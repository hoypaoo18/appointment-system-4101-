import { isProduction } from './config.mjs';
export function apiHandler(database, { environment = process.env.APP_ENV } = {}) {
  const attempts = new Map();
  const cookieName = environment === 'test' ? 'appointment_test_session' : 'appointment_session';
  return async (req, res, next) => {
    const path = (req.url || '').split('?')[0];
    if (!path.startsWith('/api/')) return next ? next() : send(404, { error: 'Not found' });
    function send(status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
    const cookieToken = new RegExp('(?:^|;\\s*)' + cookieName + '=([a-f0-9]{64})(?:;|$)').exec(req.headers.cookie || '')?.[1];
    const cookie = (token, age) => res.setHeader('Set-Cookie', cookieName+'='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+age+((isProduction() || req.socket.encrypted) ? '; Secure' : ''));
    const meta = { ip: req.socket.remoteAddress || null };
    let user = null;
    const denied = async (status, message) => {
      await database.audit.record({ ...meta, user, action: 'access.denied', outcome: 'denied', details: { path: path.slice(0,255), method: req.method, status } });
      return send(status, { error: message });
    };
    const readBody = async () => {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 32000) throw Object.assign(new Error('Request too large'), { status: 413 }); }
      let input;
      try { input = JSON.parse(body); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Invalid request'), { status: 400 });
      return input;
    };
    try {
      if (!['GET','HEAD'].includes(req.method)) {
        if (req.headers.origin && (isProduction() ? req.headers.origin !== process.env.PUBLIC_ORIGIN : new URL(req.headers.origin).host !== req.headers.host)) return send(403, { error: 'Invalid request origin' });
        if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(415, { error: 'Use application/json' });
      }
      if (req.method === 'GET' && path === '/api/auth/demo-accounts') return send(200, { users: isProduction() ? [] : await database.accounts.demos() });
      if (req.method === 'POST' && path === '/api/auth/login') {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
        const failures = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
        if (failures.count >= 10) {
          await database.audit.record({ ...meta, action: 'auth.login_blocked', outcome: 'denied' });
          return send(429, { error: 'Too many login attempts. Try again in 15 minutes.' });
        }
        const input = await readBody();
        try {
          const result = await database.accounts.login(input.email, input.password, meta);
          attempts.delete(ip); cookie(result.token, 8 * 60 * 60);
          return send(200, { user: result.user });
        } catch (error) { if (error.status === 401) {
          failures.count++; attempts.set(ip, failures);
          await database.audit.record({ ...meta, action: 'auth.login_failed', outcome: 'failure', actorName: typeof input.email === 'string' ? input.email.trim().slice(0,255) : 'Anonymous' });
        } throw error; }
      }
      user = await database.accounts.session(cookieToken);
      if (req.method === 'GET' && path === '/api/auth/me') return send(200, { user });
      if (req.method === 'POST' && path === '/api/auth/logout') {
        await database.accounts.logout(cookieToken, meta); cookie('', 0); return send(200, { ok: true });
      }
      if (!user) return await denied(401, 'Please sign in to continue');
      if (req.method === 'GET' && path === '/api/audit-logs') {
        if (user.role !== 'admin') return await denied(403, 'Only administrators can view system history');
        return send(200, await database.audit.list(new URL(req.url, 'http://localhost').searchParams));
      }
      if (req.method === 'GET' && path === '/api/state') return send(200, { ...await database.state(), preferences: await database.accounts.preferences(user.id), users: user.role === 'admin' ? await database.accounts.users() : [] });
      if (req.method === 'PUT' && path === '/api/preferences') return send(200, { preferences: await database.accounts.savePreferences(user, await readBody(), meta) });
      if (req.method === 'POST' && path === '/api/auth/password') {
        const input = await readBody();
        await database.accounts.changePassword(user.id, input.currentPassword, input.newPassword, meta);
        cookie('', 0); return send(200, { ok: true });
      }
      const userMatch = path.match(/^\/api\/users\/([^/]+)\/active$/);
      if (req.method === 'PUT' && userMatch) {
        if (user.role !== 'admin') return await denied(403, 'Only administrators can manage users');
        const input = await readBody();
        return send(200, { users: await database.accounts.setActive(userMatch[1], input.active, user.id, meta) });
      }
      const match = path.match(/^\/api\/appointments(?:\/([^/]+)(?:\/(cancel|complete|reschedule))?)?$/);
      if (!match || !['POST','PUT'].includes(req.method) || (req.method === 'PUT' && (!match[1] || match[2])) || (req.method === 'POST' && match[1] && !match[2])) return send(404, { error: 'Not found' });
      if (user.role !== 'assistant') return await denied(403, 'Only assistants can manage appointments');
      const input = await readBody();
      const result = match[2] ? await database.action(match[1], match[2], input, user.name, { ...meta, user }) : await database.save(input, match[1], user.name, { ...meta, user });
      return send(match[1] ? 200 : 201, result);
    } catch (error) {
      if (!error.status) console.error(error);
      if (path !== '/api/auth/login') {
        try { await database.audit.record({ ...meta, user, action: 'request.failed', outcome: 'failure', details: { path: path.slice(0,255), method: req.method, status: error.status || 500 } }); }
        catch { console.error('Unable to record failed request in audit log'); }
      }
      send(error.status || 500, { error: error.status ? error.message : 'Unable to process request' });
    }
  };
}
