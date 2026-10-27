# High-priority scheduling checks

Run from the project directory with Node.js 22.13 or later:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run test:priority
```

`npm test` runs the deployment, database JSON, scheduling, completion, and shared-rule regression tests. The completion unit test uses in-memory database adapters.

`test:priority` uses the MySQL connection settings from `.env.local` and an installed Google Chrome browser. Set `BROWSER_EXECUTABLE` to use another compatible Chromium executable. MySQL must be running, and the configured user must be able to create and drop a test database.

The integration runner creates a new random `appointment_qa_<32 hexadecimal characters>` database and refuses to reuse an existing name. Every application connection points to that database. It disables SMTP for the test process, uses synthetic records, and removes its QA database in `finally`. It does not modify the database originally named in `.env.local`.

Coverage includes end-time completion boundaries, pending approval protection, breaks, working hours, unavailable dates, buffers, concurrent booking, rescheduling, cancelled-slot reuse, calendar selection, mobile overflow, asynchronous availability checks, policy changes before confirmation, and persistence through reload.

Screenshots and the latest result report are written to the ignored `qa/evidence-high-priority/` directory.
