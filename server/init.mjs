import { openDatabase } from './database.mjs';
import { readFileSync } from 'node:fs';
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';
const importFile = process.argv.find(arg => arg.startsWith('--import='))?.slice(9);
const database = await openDatabase({ initialize: true, ...(importFile ? { seed: JSON.parse(readFileSync(importFile, 'utf8')) } : {}) });
console.log(`Database ${process.env.DB_NAME || 'appointment'} ready: ${(await database.state()).appointments.length} appointments`);
await database.close();
