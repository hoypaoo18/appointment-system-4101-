export async function bootstrapAccounts(database, env = process.env) {
  const users = await database.accounts.users();
  const planned = [];
  for (const role of ['admin', 'assistant']) {
    const prefix = role.toUpperCase();
    const name = env[`${prefix}_NAME`]?.trim();
    const email = env[`${prefix}_EMAIL`]?.trim().toLowerCase();
    const password = env[`${prefix}_PASSWORD`];
    if (!name && !email && !password) continue;
    const existing = users.find(user => user.email.toLowerCase() === email);
    if (existing) {
      if (existing.role !== role || !existing.active) throw new Error(`${prefix}_EMAIL belongs to an inactive account or a different role`);
      continue;
    }
    if (!name || name.length > 255 || !email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 1024 || password === 'MeridianDemo123!') {
      throw new Error(`Set valid ${prefix}_NAME, ${prefix}_EMAIL and ${prefix}_PASSWORD (12+ characters, not the demo password)`);
    }
    planned.push({ name, email, password, role });
  }
  if (!users.some(user => user.role === 'admin' && user.active) && !planned.some(user => user.role === 'admin')) {
    throw new Error('First deployment requires ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD');
  }
  if (new Set(planned.map(user => user.email)).size !== planned.length) throw new Error('Admin and assistant must have different emails');
  for (const account of planned) await database.accounts.provision(account);
  return planned.map(({ role }) => role);
}
