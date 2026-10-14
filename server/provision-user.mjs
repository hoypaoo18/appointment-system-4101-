import { openDatabase } from './database.mjs';
process.env.NODE_ENV ||= 'production';
const database = await openDatabase();
try {
  const id = await database.accounts.provision({ name: process.env.USER_NAME, email: process.env.USER_EMAIL, password: process.env.USER_PASSWORD, role: process.env.USER_ROLE, executiveId: process.env.USER_EXECUTIVE_ID || null });
  console.log(`Created ${process.env.USER_ROLE} account ${id}. Remove USER_PASSWORD from the deployment environment after provisioning.`);
} finally { await database.close(); }
