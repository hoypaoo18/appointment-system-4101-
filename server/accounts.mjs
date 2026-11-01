import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { isProduction, clientVerificationRequired } from './config.mjs';
const derive = promisify(scrypt);
export const DEMO_PASSWORD = 'MeridianDemo123!';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const publicUser = row => ({ id: row.id, name: row.name, email: row.email, role: row.role, title: row.title, initials: row.initials, active: Boolean(row.active), executiveId: row.executive_id });
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, hash) {
  const [algorithm, salt, key] = hash.split(':');
  if (algorithm !== 'scrypt' || !salt || !key) return false;
  const actual = await derive(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const clientInput = input => {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 255
    || typeof input.email !== 'string' || input.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
    || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 1024 || input.password === DEMO_PASSWORD
    || typeof input.organization !== 'string' || !input.organization.trim() || input.organization.trim().length > 255
    || typeof input.phone !== 'string' || input.phone.length > 64 || !/^[+\d\s().-]+$/.test(input.phone) || input.phone.replace(/\D/g, '').length < 7) {
    fail('Provide a name, valid email and phone, organization, and a password of 12–1024 characters.');
  }
  if (input.role !== undefined || input.executiveId !== undefined || input.active !== undefined || input.verified !== undefined) fail('Public registration only accepts client contact details and password');
  return { name: input.name.trim(), email: input.email.trim().toLowerCase(), password: input.password, organization: input.organization.trim(), phone: input.phone.trim() };
};
export function accountStore(query, transaction, audit) {
  const startSession = async (user, profile, meta) => {
    const token = randomBytes(32).toString('hex');
    await query('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
    await query('INSERT INTO sessions VALUES (?, ?, ?)', [tokenHash(token), user.id, Date.now() + 8 * 60 * 60 * 1000]);
    await audit.record({ ...meta, user: publicUser(user), action: 'auth.login', entityType: 'user', entityId: user.id });
    return { token, user: { ...publicUser(user), ...(profile || {}) } };
  };
  return {
    async registerClient(input, meta = {}) {
      const data = clientInput(input);
      const hash = await hashPassword(data.password);
      return transaction(async () => {
        if ((await query('SELECT id FROM users WHERE email = ?', [data.email])).length) fail('An account already uses this email. Sign in to continue.', 409);
        const id = 'user-' + randomBytes(16).toString('hex');
        await query('INSERT INTO users (id,name,email,password_hash,role,title,initials,active,is_demo,executive_id) VALUES (?,?,?,?,?,?,?,1,0,NULL)',
          [id, data.name, data.email, hash, 'client', 'Client', data.name.split(/\s+/).map(word => word[0]).slice(0,2).join('').toUpperCase()]);
        await query('INSERT INTO client_profiles (user_id,organization,phone) VALUES (?,?,?)', [id, data.organization, data.phone]);
        await audit.record({ ...meta, user: { id, name: data.name, role: 'client' }, action: 'user.client_registered', entityType: 'user', entityId: id });
        if (clientVerificationRequired()) {
          const token = randomBytes(32).toString('hex');
          await query('INSERT INTO account_verifications VALUES (?,?,?)', [tokenHash(token), id, Date.now() + 86400000]);
          return { email: data.email, token };
        }
        const user = (await query('SELECT * FROM users WHERE id = ?', [id]))[0];
        return startSession(user, await this.clientProfile(id), meta);
      });
    },
    async resendVerification(email) {
      if (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fail('Provide a valid email');
      return transaction(async () => {
        const rows = await query("SELECT u.id,u.email FROM users u JOIN client_profiles c ON c.user_id=u.id WHERE u.email=? AND u.role='client' AND u.active=1 AND c.verified_at IS NULL", [email.trim().toLowerCase()]);
        if (!rows.length) return null;
        const token = randomBytes(32).toString('hex');
        await query('INSERT INTO account_verifications VALUES (?,?,?) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at)', [tokenHash(token), rows[0].id, Date.now() + 86400000]);
        return { email: rows[0].email, token };
      });
    },
    async verifyClient(token, meta = {}) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('Invalid or expired verification link. Request a new one.');
      return transaction(async () => {
        const rows = await query("SELECT v.user_id FROM account_verifications v JOIN users u ON u.id=v.user_id WHERE v.token_hash=? AND v.expires_at>? AND u.role='client' AND u.active=1", [tokenHash(token), Date.now()]);
        if (!rows.length) fail('Invalid or expired verification link. Request a new one.');
        await query('UPDATE client_profiles SET verified_at=? WHERE user_id=?', [new Date().toISOString(), rows[0].user_id]);
        await query('DELETE FROM account_verifications WHERE user_id=?', [rows[0].user_id]);
        await audit.record({ ...meta, actorName: 'Client email verification', action: 'user.email_verified', entityType: 'user', entityId: rows[0].user_id });
      });
    },
    async clientProfile(id) {
      const rows = await query('SELECT organization,phone,verified_at FROM client_profiles WHERE user_id=?', [id]);
      return rows[0] ? { organization: rows[0].organization, phone: rows[0].phone, emailVerified: Boolean(rows[0].verified_at), emailVerificationRequired: clientVerificationRequired() } : null;
    },
    async seed(users) {
      await transaction(async () => {
        if ((await query('SELECT version FROM migrations WHERE version = 2')).length) return;
        for (const u of users) {
          const executiveId = u.role === 'executive' ? { 'user-2': 'exec-1', 'user-3': 'exec-2', 'user-4': 'exec-3' }[u.id] : null;
          await query('INSERT INTO users (id,name,email,password_hash,role,title,initials,active,is_demo,executive_id) VALUES (?,?,?,?,?,?,?,?,?,?)', [u.id,u.name,u.email.toLowerCase(),await hashPassword(DEMO_PASSWORD),u.role,u.title,u.initials,u.active,1,executiveId || null]);
        }
        await query('INSERT INTO migrations VALUES (2)');
      });
    },
    async demos() { return (await query('SELECT * FROM users WHERE is_demo = 1 AND active = 1 ORDER BY id')).map(publicUser); },
    async users() { return (await query('SELECT * FROM users ORDER BY id')).map(publicUser); },
    async login(email, password, meta = {}) {
      if (typeof email !== 'string' || email.length > 255 || typeof password !== 'string' || password.length > 1024) fail('Invalid email or password', 401);
      return transaction(async () => {
      const rows = await query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
      const user = rows[0];
      // Always perform password work, even if the email does not exist.
      const hash = user?.password_hash || await hashPassword('unavailable-account');
      if (!await verifyPassword(password, hash) || !user?.active || (isProduction() && (user.is_demo || password === DEMO_PASSWORD))) fail('Invalid email or password', 401);
      const profile = user.role === 'client' ? await this.clientProfile(user.id) : null;
      if (user.role === 'client' && !profile) fail('Client profile unavailable. Please contact the office.', 403);
      if (user.role === 'client' && clientVerificationRequired() && !profile.emailVerified) fail('Verify your email before signing in. Use Resend verification if needed.', 403);
      return startSession(user, profile, meta);
      });
    },
    async session(token) {
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
      const rows = await query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1', [tokenHash(token),Date.now()]);
      if (!rows[0] || isProduction() && rows[0].is_demo) return null;
      const profile = rows[0].role === 'client' ? await this.clientProfile(rows[0].id) : null;
      if (rows[0].role === 'client' && (!profile || clientVerificationRequired() && !profile.emailVerified)) return null;
      return { ...publicUser(rows[0]), ...(profile || {}) };
    },
    async logout(token, meta = {}) {
      if (typeof token !== 'string') return;
      return transaction(async () => {
        const rows = await query('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', [tokenHash(token)]);
        await query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash(token)]);
        if (rows[0]) await audit.record({ ...meta, user: publicUser(rows[0]), action: 'auth.logout', entityType: 'user', entityId: rows[0].id });
      });
    },
    async updateProfile(userId, input, meta = {}) {
      return transaction(async () => {
        const row=(await query('SELECT * FROM users WHERE id = ?',[userId]))[0];
        if(!row?.active)fail('Your session has expired. Sign in again.',401);
        const allowed=row.role==='client'?['name','organization','phone']:['name'];
        if(!input||Object.keys(input).some(key=>!allowed.includes(key)))fail('Only your display name and permitted contact fields can be changed');
        if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>255||/[\x00-\x1f\x7f]/.test(input.name))fail('Display name must contain 1?255 characters');
        if(row.role==='client'&&(typeof input.organization!=='string'||!input.organization.trim()||input.organization.trim().length>255||typeof input.phone!=='string'||input.phone.length>64||!/^[+\d\s().-]+$/.test(input.phone)||input.phone.replace(/\D/g,'').length<7))fail('Provide a valid organization and phone number (at least seven digits)');
        const name=input.name.trim(),initials=name.split(/\s+/).map(word=>word[0]).slice(0,2).join('').toUpperCase();
        const before={name:row.name,...(row.role==='client'?await this.clientProfile(userId):{})};
        await query('UPDATE users SET name=?,initials=? WHERE id=?',[name,initials,userId]);
        if(row.role==='client')await query('UPDATE client_profiles SET organization=?,phone=? WHERE user_id=?',[input.organization.trim(),input.phone.trim(),userId]);
        if(row.role==='executive'&&row.executive_id)await query('UPDATE executives SET name=?,initials=? WHERE id=?',[name,initials,row.executive_id]);
        const after={...publicUser({...row,name,initials}),...(row.role==='client'?await this.clientProfile(userId):{})};
        await audit.record({...meta,user:after,action:'user.profile_updated',entityType:'user',entityId:userId,details:{before,after:{name:after.name,...(row.role==='client'?{organization:after.organization,phone:after.phone}:{})}}});
        return after;
      });
    },
    async changePassword(userId, currentPassword, newPassword, meta = {}) {
      if (typeof currentPassword !== 'string' || currentPassword.length > 1024 || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 1024) fail('New password must contain 8–1024 characters');
      return transaction(async () => {
        const rows = await query('SELECT * FROM users WHERE id = ?', [userId]);
        if (!rows[0]?.active || !await verifyPassword(currentPassword, rows[0].password_hash)) fail('Current password is incorrect', 400);
        if (rows[0].role === 'client' && (newPassword.length < 12 || newPassword === DEMO_PASSWORD)) fail('Use a unique client password of at least 12 characters');
        await query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(newPassword),userId]);
        await query('DELETE FROM sessions WHERE user_id = ?', [userId]);
        await audit.record({ ...meta, user: publicUser(rows[0]), action: 'user.password_changed', entityType: 'user', entityId: userId });
      });
    },
    async setActive(id, active, actorId, meta = {}) {
      if (typeof active !== 'boolean') fail('Invalid account status');
      if (id === actorId) fail('You cannot deactivate your own account');
      return transaction(async () => {
        const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
        if (!rows.length) fail('User not found', 404);
        await query('UPDATE users SET active = ? WHERE id = ?', [active,id]);
        if (!active) await query('DELETE FROM sessions WHERE user_id = ?', [id]);
        const actor = (await query('SELECT * FROM users WHERE id = ?', [actorId]))[0];
        await audit.record({ ...meta, user: actor ? publicUser(actor) : undefined, action: active ? 'user.activated' : 'user.deactivated', entityType: 'user', entityId: id, details: { before: { active: Boolean(rows[0].active) }, after: { active } } });
        return (await query('SELECT * FROM users ORDER BY id')).map(publicUser);
      });
    },
    async preferences(id) {
      const rows = await query('SELECT calendar_view,duration FROM user_preferences WHERE user_id = ?', [id]);
      return rows[0] ? { calendarView: rows[0].calendar_view, duration: rows[0].duration } : { calendarView: 'week', duration: 60 };
    },
    async savePreferences(user, input, meta = {}) {
      if (!['day','week'].includes(input.calendarView) || ![15,30,45,60,90,120].includes(input.duration)) fail('Invalid preferences');
      return transaction(async () => {
        const before = await this.preferences(user.id);
        await query('INSERT INTO user_preferences VALUES (?,?,?) ON DUPLICATE KEY UPDATE calendar_view=VALUES(calendar_view),duration=VALUES(duration)', [user.id,input.calendarView,input.duration]);
        const after = { calendarView: input.calendarView, duration: input.duration };
        await audit.record({ ...meta, user, action: 'user.preferences_updated', entityType: 'user', entityId: user.id, details: { before, after } });
        return after;
      });
    },
    async provision({ name, email, password, role, executiveId = null }) {
      if (typeof name !== 'string' || !name.trim() || name.length > 255 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || typeof password !== 'string' || password.length < 12 || password.length > 1024 || password === DEMO_PASSWORD || !['admin','assistant','executive'].includes(role)) fail('Provide a valid name/email/role and a unique password of at least 12 characters');
      if (role === 'executive' && !executiveId) fail('Executive account requires executiveId');
      return transaction(async () => {
        if ((await query('SELECT id FROM users WHERE email = ?', [email])).length) fail('Account already exists');
        const id = 'user-' + randomBytes(16).toString('hex');
        await query('INSERT INTO users (id,name,email,password_hash,role,title,initials,active,is_demo,executive_id) VALUES (?,?,?,?,?,?,?,1,0,?)', [id,name.trim(),email.trim().toLowerCase(),await hashPassword(password),role,role === 'admin' ? 'System Administrator' : role,name.trim().split(/\s+/).map(word=>word[0]).slice(0,2).join('').toUpperCase(),executiveId]);
        await audit.record({ actorName: 'Deployment administrator', action: 'user.created', entityType: 'user', entityId: id, details: { role } });
        return id;
      });
    },
  };
}
