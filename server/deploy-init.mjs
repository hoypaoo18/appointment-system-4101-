import { openDatabase } from './database.mjs';
import { bootstrapAccounts } from './deploy-accounts.mjs';
process.env.NODE_ENV = 'production';
const database = await openDatabase({ initialize: true });
try {
  const roles = await bootstrapAccounts(database);
  console.log(`Production database ready. Created ${roles.length} account(s)${roles.length ? ': ' + roles.join(', ') : ''}. Clear bootstrap passwords after first deployment.`);
} finally { await database.close(); }
