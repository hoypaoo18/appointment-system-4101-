# Appointment System — Hostinger Web App (fixed deployment)

## What was fixed

The October 13 deployment log ended with `sh: line 1: vite: command not found`. The original project declared `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, and `tailwindcss` as development-only dependencies. Hostinger's production-only install therefore may omit the Vite executable while still running `npm run build`.

In this package, the Vite build tools and React runtime are listed in regular `dependencies` and the lockfile is updated accordingly. The build command now compiles only the React frontend; the Node.js server automatically initializes the existing MySQL database and its first accounts when it starts, without resetting existing appointment records. No live Hostinger deployment has been performed on the user's account.

## 1 — Confirm your hosting type

Use **Deploy Web App → Node.js** in hPanel. Select framework **Other**. Use a plan that supports Node.js Web Apps (normally Business web hosting or Cloud; confirm with Hostinger for your specific plan). Do **not** upload `dist/` alone to `public_html`: this is a full-stack Node.js + MySQL app, not just a static React site.

Official guide: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/

## 2 — Prepare your EXISTING MySQL database

The database can be empty, but it must already exist in hPanel with a MySQL user who has permission to create tables and insert data. The app will create any missing tables and initial executive records at first startup. **Do not delete an existing database.** The application uses non-destructive `CREATE TABLE IF NOT EXISTS` statements and version markers.

You do not have to paste a SQL dump into phpMyAdmin for a fresh, empty database. The schema is included as `server/schema.sql` if you need it for reference.

## 3 — Set Environment Variables in hPanel BEFORE deployment

On the Review build settings step, choose **Environment variables → Edit** and enter the following values. You can also import the placeholder file `.env.production.example` after replacing values privately. Prefer hPanel settings instead of putting actual secrets in a ZIP.

| Variable | Set to |
|---|---|
| `NODE_ENV` | `production` |
| `APP_ENV` | `production` |
| `PUBLIC_ORIGIN` | The **exact HTTPS** site URL, e.g. `https://appointment.example.com` (no path or trailing slash) |
| `DB_HOST` | MySQL host displayed by hPanel; commonly `localhost` |
| `DB_PORT` | `3306` unless your MySQL panel says otherwise |
| `DB_NAME` | Full existing database name (including account prefix) |
| `DB_USER` | Full MySQL username (not `root`) |
| `DB_PASSWORD` | That user's MySQL password |
| `ADMIN_NAME` | Name for the first administrator account |
| `ADMIN_EMAIL` | Administrator's real email address |
| `ADMIN_PASSWORD` | Strong password of **12 or more characters** |
| `ASSISTANT_NAME` | Name for the first booking assistant (optional but recommended) |
| `ASSISTANT_EMAIL` | Assistant's different real email address (optional) |
| `ASSISTANT_PASSWORD` | Strong password, **12 or more characters** (optional) |
| `HOST` | `0.0.0.0` |
| `PORT` | `3000` (platform-supplied `PORT` takes priority) |

Do NOT prefix server-side secrets with `VITE_`. If password values contain `#` or spaces, enter the raw password in the hPanel editor; in a `.env` file, surround it in double quotes.

**Important:** The starter ZIP has placeholder values only; unless the real values are provided in hPanel, the server cannot start. If you previously added incorrect Hostinger Environment Variables, correct them before redeployment; hPanel values override the bundled placeholder file.

## 4 — Redeploy the corrected ZIP

Open **Websites → Your website → Deployments → Redeploy → Upload new files** and choose `Appointment-System-HOSTINGER-FIXED.zip`.

Confirm these settings:

| Setting | Required value |
|---|---|
| Framework | `Other` |
| Node.js | `22.x` (minimum 22.13.0; `24.x` can work if supported) |
| Project/root directory | `.` (ZIP root contains `package.json`) |
| Package manager | `npm` |
| Install command (if editable) | `npm ci` |
| **Build command** | **`npm run build`** |
| Output directory | `dist` |
| Entry file | `server/start.mjs` |
| Start command (if editable) | `npm start` |

**Do not use the old `npm run deploy:build` to initialize the database at build time.** On the new package `deploy:build` is an alias for `npm run build`. Database initialization happens at runtime when the server starts, so Hostinger's build stage does not need a database connection.

The ZIP includes existing compiled frontend files as a fallback/reference, but **Hostinger should rebuild** the app from source with `npm run build`.

## 5 — After deployment

1. Open `https://YOUR-DOMAIN/health`. A running server should return `{"status":"ready"}`. This confirms the Node process started, which requires the initial database connection to succeed.
2. Open the website and sign in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD` values.
3. Sign in with the assistant account, create an appointment, reload the page, and verify persistence and audit history.
4. After the first successful setup, remove `ADMIN_PASSWORD` and `ASSISTANT_PASSWORD` from hPanel and any private copy of `.env.production`. Existing password hashes are already stored in MySQL; deleting bootstrap variables does not disable created accounts. An administrator can change passwords within the system.
5. Existing database information is not deleted by subsequent deployment, but take a database backup before future schema upgrades.

The initial executive directory uses demonstration names/titles. Replace those with your real office details in MySQL (`executives`) before production use. Do not change IDs linked to saved appointments.

## 6 — Troubleshooting

| Message or behavior | What to check |
|---|---|
| `vite: command not found` | Upload the **new corrected ZIP**, ensure `vite` is in `dependencies`, and re-run `npm run build` |
| `Production requires DB_...` or `PUBLIC_ORIGIN` | Missing Hostinger Environment Variables |
| `Access denied for user` | Database username, password, permissions, and host |
| `Unknown database` | Full database name/prefix in `DB_NAME`, and database exists |
| `First deployment requires ADMIN...` | Fill `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` before startup |
| `PUBLIC_ORIGIN must be an HTTPS origin` | Enter exact full HTTPS origin; no trailing slash |
| `Login blocked` or invalid origin | Check `PUBLIC_ORIGIN`, HTTPS, and that the app is not accessed under a different domain |
| `Cannot find dist/index.html` | Build must output frontend files into `dist`; select `npm run build` |
| Blank page or API error | Check the browser developer console and **Runtime logs** in Hostinger |
| npm reports `1 high severity vulnerability` | This is an audit advisory, **not** the cause of `vite: command not found`; review separately; avoid automatic `npm audit fix --force` without testing |

Official Hostinger troubleshooting: https://www.hostinger.com/support/fix-failed-to-build-application-error-hostinger-node-js/

## Build/test scope

This corrected package has been checked for file structure, Node server syntax, lockfile contents, and presence of the previously built `dist/` assets. Because npm registry access and live Hostinger credentials are unavailable in this environment, a complete fresh `npm ci && npm run build` and MySQL-backed end-to-end test cannot be claimed. Hostinger's next deployment log will confirm the final production install and build.


## October 14 `/api/state` HTTP 500 fix

Hostinger runtime logs showing `SyntaxError: "[object Object]" is not valid JSON` at
`server/database.mjs:89` mean that `mysql2` is returning some JSON fields as
already-parsed JavaScript objects. The original code called `JSON.parse()` on
those objects. This build uses `server/db-json.mjs` in state reads, individual
appointment reads, activity-history migration and audit-log listing, accepting
both JSON strings and decoded objects without changing saved data.

**Deployment:** Upload this corrected ZIP using Redeploy / Upload new files.
Keep your existing Hostinger database and environment variables; verify
`PUBLIC_ORIGIN=https://appointment.servease-portal.com` (exactly) and do not
re-import an older SQL dump. Restart the app, refresh your login page, sign in,
and test `/api/state` while logged in. `/health` returning ready confirms
startup but not authenticated queries.

The new regression test is `node --test tests/db-json.test.mjs` and the
package still includes the original Node smoke tests. Live MySQL access is
necessary to confirm the fix end-to-end.
