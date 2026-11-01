# Meridian Executive Appointment System

Appointment management for Clients, Assistants, Executives and Administrators, built with React, TypeScript, Vite, Node.js and MySQL. Appointment dates and times use **Asia/Manila (UTC+08:00)**.

## Requirements

- **Node.js 22.13.0 or newer**, with npm.
- **Git** to clone and update the repository.
- **MySQL**, such as the MySQL service in Laragon.
- **Google Chrome** if you want to run the browser integration tests.

Run commands from the project folder containing `package.json`. Examples below use Windows PowerShell and `npm.cmd`; on macOS/Linux, use `npm` instead.

## First-time local setup

### 1. Get the project

Replace `REPOSITORY_URL` with this project's GitHub clone URL:

```powershell
git clone REPOSITORY_URL appointment-system-4101-
cd appointment-system-4101-
```

If you already have the project, follow [Updating after a teammate pushes changes](#updating-after-a-teammate-pushes-changes) instead.

### 2. Install dependencies

```powershell
node --version
npm.cmd ci
```

`npm ci` installs the versions recorded in `package-lock.json`.

### 3. Start MySQL in Laragon

Open Laragon and start its MySQL service. Check the port and credentials on your machine. The examples use port `3306`, username `root` and an empty password for a local development database; change these values if your installation differs.

The application runs through Node/Vite. Apache and phpMyAdmin are not required to run it; phpMyAdmin is optional for inspecting the database.

### 4. Create `.env.local`

Create `.env.local` in the project root, beside `package.json`:

```ini
NODE_ENV=development
APP_ENV=development

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=appointment
DB_USER=root
DB_PASSWORD=""

REQUIRE_CLIENT_EMAIL_VERIFICATION=false
```

Use your own database connection details. If you already have appointment data, point `DB_NAME` to that existing project database. Database names may contain letters, numbers and underscores.

Keep `.env.local` private. It is excluded from Git, so each teammate must create their own copy. Keep server credentials unprefixed; variables beginning with `VITE_` can be exposed to the frontend.

### 5. Start the application

```powershell
npm.cmd run dev
```

Open the **Local** address printed in the terminal, usually `http://127.0.0.1:5173/`. If that port is occupied, Vite may choose another port. Keep this terminal running; press **Ctrl+C** to stop it.

On development startup, the backend automatically:

- Creates the configured database if it is missing.
- Creates missing project tables and applies versioned migrations, including migration 8 for email retry tracking.
- Seeds development staff accounts and sample records on a fresh project database.
- Preserves existing project accounts and appointments when applying updates.

The database user needs permission to create the development database and create/alter its tables. You do not need to manually import `server/schema.sql` for normal setup. Restart the server after changing environment variables or pulling backend updates.

### 6. Sign in or register a client

On a **fresh development database**, these seeded accounts share the development password `MeridianDemo123!`:

| Role | Email |
| --- | --- |
| Assistant | `sarah.mitchell@meridian.com` |
| Executive | `margaret.chen@meridian.com` |
| Executive | `robert.hargrove@meridian.com` |
| Executive | `victoria.santos@meridian.com` |
| Admin | `j.alderton@meridian.com` |

Enter the credentials manually; the login page does not display a Demo Accounts selector. Existing databases retain their saved passwords and account statuses. These seeded credentials are for local development; production rejects demo accounts.

Clients can select **Create client account**. With `REQUIRE_CLIENT_EMAIL_VERIFICATION=false`, successful registration signs the client in immediately. Client bookings start as **Pending** and require approval by the assigned Executive or an Admin before becoming **Confirmed**.

| Role | Main responsibilities |
| --- | --- |
| Client | Request appointments and manage permitted changes to their own bookings. |
| Assistant | Create and manage appointments, schedules and appointment history within existing permissions. |
| Executive | View assigned appointments, decide assigned requests and manage their own availability. |
| Admin | Oversee approvals, account access, executive availability, email delivery and system history. |

## Updating after a teammate pushes changes

1. Stop the development server with **Ctrl+C**.
2. Commit or stash your local work before switching branches. Resolve any Git conflicts before continuing.
3. Update your local `main` and install dependencies:

   ```powershell
   git switch main
   git pull --ff-only origin main
   npm.cmd ci
   ```

   If the fast-forward pull is refused, inspect the branch differences and coordinate with your teammate instead of discarding local commits.

4. Keep your existing `.env.local` and check the README for any added configuration. Start MySQL, then restart:

   ```powershell
   npm.cmd run dev
   ```

   Development startup applies pending database migrations. Back up an existing database before a schema upgrade if it contains data you need to retain.

Git transfers code, migrations and committed seed data. It does **not** transfer another teammate's `.env.local`, installed `node_modules`, registered clients or current database records. A fresh database receives the bundled development seed data; sharing additional records requires a separate, agreed database export/import.

When preparing a commit, include new source files as well as modified files. Do not commit credentials, database backups or `node_modules`.

## Optional email delivery

SMTP is not required for client registration while verification is disabled, or for in-app notifications. Without valid SMTP configuration, emails remain queued rather than being delivered externally.

Add these server-side settings to `.env.local` and fill them with your provider's actual values:

```ini
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=""
SMTP_FROM=
```

`SMTP_FROM` must be an authorized sender address, optionally formatted as `"Meridian <sender@your-domain>"`. Use the port/security settings supplied by your provider; port 465 uses implicit TLS (`SMTP_SECURE=true`). Remote SMTP connections require TLS. Placeholder credentials are rejected.

Restart the server, sign in as **Admin**, and open **Email Delivery → Test SMTP connection**. This checks connectivity/authentication without sending email. Once configured, the worker processes eligible queued mail. Exhausted failed messages require an individual, confirmed Admin retry; sent or uncertain messages cannot be resent through this control. SMTP acceptance does not guarantee inbox placement.

Email verification remains optional. To require it, set `REQUIRE_CLIENT_EMAIL_VERIFICATION=true` and restart; clients without verified email addresses will then need to verify before signing in. See [client booking and verification](docs/CLIENT-BOOKING.md) for the complete flow.

## Build and checks

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

The build writes frontend assets to `dist/`. These commands are separate from starting the development server. There is currently no configured lint script.

For database/API/browser integration checks, keep MySQL running and build first. These scripts load database credentials from `.env.local`, use random disposable QA databases and require permission to create/drop those databases:

```powershell
npm.cmd run test:priority
npm.cmd run test:clients
npm.cmd run test:navigation
npm.cmd run test:executives
npm.cmd run test:reliability
```

The suites use Google Chrome by default. `test:reliability` tests mail using a localhost SMTP capture server, without sending to external recipients. Local test evidence is written under ignored `qa/evidence*/` directories.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `node` is not recognized or the environment-file option is unsupported | Install/use Node.js 22.13.0 or newer, then reopen the terminal. |
| PowerShell blocks `npm.ps1` | Use the `npm.cmd` commands shown above. |
| MySQL connection refused / `ECONNREFUSED` | Start MySQL in Laragon and confirm `DB_HOST` and `DB_PORT`. |
| MySQL `Access denied` | Check `DB_USER`, `DB_PASSWORD`, host access and database permissions. |
| Table creation or migration fails | Check the selected database and the user's create/alter permissions. Stop duplicate app instances, correct the reported issue, then restart. |
| `Production requires ...` during local setup | Confirm `.env.local` contains `NODE_ENV=development` and the terminal is not overriding it with production settings. |
| Port 5173 is occupied | Use the actual Local URL printed by Vite. |
| Sign-in fails | Use credentials from your own database; saved passwords/statuses may differ from fresh development defaults. |
| No email arrives | Check real SMTP settings, restart, and inspect Admin → Email Delivery. In-app delivery does not prove SMTP delivery. |
| UI says data may be outdated | Check the server/MySQL connection and use **Retry sync**; the last successful update time remains visible. |
| Changes do not appear after pulling | Confirm the intended branch/commit, run `npm.cmd ci`, restart the development server and reload the browser. |

## Production and further documentation

Local Laragon settings above are for development. Production uses `.env.production` or hosting environment variables, an existing database, a dedicated database user, HTTPS and real staff accounts. Use [.env.production.example](.env.production.example) and the [Hostinger deployment guide](HOSTINGER-SETUP.md) for deployment details. A `dist/` upload alone does not provide this application's backend or database.

- [Client registration, booking and approval](docs/CLIENT-BOOKING.md)
- [Role navigation and executive isolation](docs/ROLE-NAVIGATION.md)
- [Reliability fixes, APIs, migrations and email configuration](docs/RELIABILITY-IMPLEMENTATION.md)
