import { isProduction, clientVerificationRequired } from './config.mjs';
import { verifySmtp } from './mail.mjs';
import { emailConfigured } from './notifications.mjs';
import { deliverVerification, verificationOrigin } from './verification-mail.mjs';
export function apiHandler(database, { environment = process.env.APP_ENV } = {}) {
  const attempts = new Map();
  const publicAttempts = new Map();
  const limitPublic = (key, maximum) => {
    const now = Date.now();
    for (const [key, entry] of publicAttempts) if (entry.until <= now) publicAttempts.delete(key);
    const entry = publicAttempts.get(key) || { count: 0, until: now + 15 * 60000 };
    if (entry.count >= maximum) throw Object.assign(new Error('Too many requests. Try again in 15 minutes.'), { status: 429 });
    entry.count++; publicAttempts.set(key, entry);
  };
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
      if (req.method === 'GET' && path === '/api/auth/config') return send(200, { verificationRequired: clientVerificationRequired() });
      if (req.method === 'POST' && ['/api/auth/register', '/api/auth/resend-verification', '/api/auth/verify-email'].includes(path)) {
        limitPublic(`${path}:${meta.ip}`, path === '/api/auth/verify-email' ? 30 : 5);
        const input = await readBody();
        if (path === '/api/auth/verify-email') {
          await database.accounts.verifyClient(input.token, meta);
          return send(200, { ok: true, message: 'Email verified. You can now sign in.' });
        }
        if (!clientVerificationRequired()) {
          if (path === '/api/auth/resend-verification') return send(200, { verificationRequired: false, message: 'Email verification is not required. You can sign in with your email and password.' });
          const result = await database.accounts.registerClient(input, meta);
          cookie(result.token, 8 * 60 * 60);
          return send(201, { verificationRequired: false, user: result.user });
        }
        if (isProduction() && !emailConfigured()) return send(503, { error: 'Client registration requires email delivery. Please contact the office.' });
        const origin = verificationOrigin(req);
        if (path === '/api/auth/resend-verification' && typeof input.email === 'string') limitPublic(`verify-email:${input.email.trim().toLowerCase()}`, 3);
        const result = path === '/api/auth/register'
          ? await database.accounts.registerClient(input, meta)
          : await database.accounts.resendVerification(input.email);
        const delivery = result ? await deliverVerification(result.email, result.token, origin) : {};
        return send(path === '/api/auth/register' ? 201 : 200, { verificationRequired: true,
          message: 'If this email needs verification, a link has been sent. Check your inbox or request a new link.', ...delivery });
      }
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
      if(req.method==='GET'&&path==='/api/executive-schedules')return send(200,{schedules:await database.scheduling.list(user)});
      const scheduleMatch=path.match(/^\/api\/executive-schedules\/([^/]+)$/);
      if(req.method==='PUT'&&scheduleMatch)return send(200,{policy:await database.scheduling.save(scheduleMatch[1],await readBody(),user,meta)});
      if(req.method==='POST'&&path==='/api/availability')return send(200,await database.availability(await readBody(),user));
      if(path.startsWith('/api/admin/email-delivery')) {
        if(user.role!=='admin')return await denied(403,'Only administrators can manage email delivery');
        if(req.method==='GET'&&path==='/api/admin/email-delivery')return send(200,await database.notifications.deliveries(new URL(req.url,'http://localhost').searchParams));
        if(req.method==='POST'&&path==='/api/admin/email-delivery/test'){
          limitPublic('smtp-test:'+user.id,3);
          await readBody();
          return send(200,await verifySmtp());
        }
        const retry=path.match(/^\/api\/admin\/email-delivery\/([^/]+)\/retry$/);
        if(req.method==='POST'&&retry){await readBody();return send(200,await database.notifications.retry(retry[1],user,meta));}
        return send(404,{error:'Not found'});
      }
      if(req.method==='GET'&&path==='/api/notifications')return send(200,await database.notifications.list(user.id));
      if(req.method==='GET'&&path==='/api/notification-preferences')return send(200,{preferences:await database.notifications.preferences(user.id)});
      if(req.method==='PUT'&&path==='/api/notification-preferences'){
        const preferences=await database.notifications.savePreferences(user,await readBody());
        await database.audit.record({...meta,user,action:'user.notification_preferences_updated',entityType:'user',entityId:user.id,details:{preferences}});
        return send(200,{preferences});
      }
      const notificationMatch=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
      if(req.method==='PUT'&&notificationMatch)return send(200,await database.notifications.read(user.id,notificationMatch[1]));
      if(req.method==='POST'&&path==='/api/notifications/read-all')return send(200,await database.notifications.read(user.id));
      if (req.method === 'GET' && path === '/api/audit-logs') {
        if (user.role !== 'admin') return await denied(403, 'Only administrators can view system history');
        return send(200, await database.audit.list(new URL(req.url, 'http://localhost').searchParams));
      }
      if (req.method === 'GET' && path === '/api/state') return send(200, { ...await database.state(user), preferences: await database.accounts.preferences(user.id), users: user.role === 'admin' ? await database.accounts.users() : [] });
      if (req.method === 'PUT' && path === '/api/preferences') return send(200, { preferences: await database.accounts.savePreferences(user, await readBody(), meta) });
      if (req.method === 'PUT' && path === '/api/auth/profile') return send(200,{user:await database.accounts.updateProfile(user.id,await readBody(),meta)});
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
      const match = path.match(/^\/api\/appointments(?:\/([^/]+)(?:\/(cancel|complete|reschedule|approve|decline))?)?$/);
      if (!match || !['POST','PUT'].includes(req.method) || (req.method === 'PUT' && (!match[1] || match[2])) || (req.method === 'POST' && match[1] && !match[2])) return send(404, { error: 'Not found' });
      if(['approve','decline'].includes(match[2])){
        if(!['executive','admin'].includes(user.role))return await denied(403,'Only executives or administrators can decide requests');
      } else if (!['assistant','client'].includes(user.role) || user.role === 'client' && match[2] === 'complete') return await denied(403, 'You cannot perform this appointment action');
      const input = await readBody();
      const result = match[2] ? await database.action(match[1], match[2], input, user.name, { ...meta, user }) : await database.save(input, match[1], user.name, { ...meta, user });
      return send(match[1] ? 200 : 201, result);
    } catch (error) {
      const conflictId=error.status===409 && /^Schedule conflict with ([\w-]+)\./.exec(error.message)?.[1];
      if(conflictId&&user){try{await database.notifications.conflict(user,conflictId);}catch{console.error('Unable to record conflict notification');}}
      if (!error.status) console.error(error);
      if (path !== '/api/auth/login') {
        try { await database.audit.record({ ...meta, user, action: 'request.failed', outcome: 'failure', details: { path: path.slice(0,255), method: req.method, status: error.status || 500 } }); }
        catch { console.error('Unable to record failed request in audit log'); }
      }
      send(error.status || 500, { error: error.status ? error.message : 'Unable to process request' });
    }
  };
}
