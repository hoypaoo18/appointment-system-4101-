import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { openDatabase } from './database.mjs';
import { bootstrapAccounts } from './deploy-accounts.mjs';
import { webHandler } from './web-handler.mjs';

// Use module-relative paths: hosts can launch Node with a different working directory.
const envPath = fileURLToPath(new URL('../.env.production', import.meta.url));
const distPath = fileURLToPath(new URL('../dist/', import.meta.url));
try {
  loadEnvFile(envPath);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
process.env.NODE_ENV ||= 'production';
await access(new URL('../dist/index.html', import.meta.url));

// Initial boot sets up tables/migration markers in the EXISTING Hostinger DB.
// Subsequent starts retain all appointments, audit entries, and account passwords.
const database = await openDatabase({ initialize: true });
try {
  if (process.env.NODE_ENV === 'production') {
    const created = await bootstrapAccounts(database);
    if (created.length) console.log('Initial production accounts created:', created.join(', '));
  }
} catch (error) {
  await database.close();
  throw error;
}

const server = createServer(webHandler(database, distPath));
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log('Appointment web server ready on port ' + server.address().port);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await database.close();
    process.exit(0);
  }));
}
