import { openDatabase } from './database.mjs';
import { apiHandler } from './api.mjs';
export default function appointmentApi() {
  return {
    name: 'appointment-api',
    async configureServer(server) {
      const database = await openDatabase();
      server.middlewares.use(apiHandler(database));
      server.httpServer?.once('close', () => database.close());
    },
    async configurePreviewServer(server) {
      const database = await openDatabase();
      server.middlewares.use(apiHandler(database));
      server.httpServer?.once('close', () => database.close());
    },
  };
}
