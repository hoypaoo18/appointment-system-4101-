# Meridian reliability fixes

This report covers the five issues in the supplied request. Existing client registration, mandatory approval of client bookings, assigned-executive isolation and role permissions are preserved. Password recovery was outside this change.

## Implemented behavior

| Issue | Result |
| --- | --- |
| Email configuration and failed delivery | Server-side SMTP validation rejects missing values, template credentials, invalid ports/security flags and invalid sender addresses. Errors identify setting names without returning credentials or raw provider responses. The Admin sidebar has an **Email Delivery** screen with status filters, pagination, delivery errors, lifetime attempt counts, manual retry counts and a connection test. |
| Midnight dates | A shared `useBusinessDate` hook schedules the next Asia/Manila midnight, with focus/visibility recovery for suspended tabs. Dashboard counts, Today/Upcoming filters, booking date minimums, rescheduling and calendar Today highlighting use the current business date. Backend validation and reminder date ranges use the same shared `businessDate` function. |
| Profile saving | Every role can edit its display name. Clients can also edit organization and phone. The authenticated API validates and persists these changes, updates initials and the executive directory where relevant, and records an audit event. The browser shows success only after a successful response. Email, title and role are explicitly read-only. |
| Background synchronization | Appointment state and notification data refresh through one coordinator and are applied together. Failures retain the last successful snapshot and show a stale-data banner, timestamp and **Retry sync** button. Failed refreshes back off from 6 to 60 seconds; normal refreshes retain the existing three-second cadence. Offline/online, focus and tab visibility are handled. Expired sessions clear private data and return to sign-in. |
| Long appointment IDs | Appointment and history tables display compact references. Clicking a reference opens a dialog with the full selectable ID and a copy button. References do not wrap; tables retain horizontal scrolling with keyboard focus and a scroll hint. Database identifiers, API IDs, full-ID searches and record links are unchanged. |

## Email delivery and retry safeguards

New notification events are queued even while SMTP is unavailable; invalid configuration does not consume delivery attempts. In-app notifications continue working. Once SMTP is configured, the existing worker handles queued messages.

Each failed message gets at most five attempts per delivery cycle. An administrator can inspect an exhausted failed message and explicitly queue one more cycle. The retry uses an atomic, conditional update in the existing serialized transaction. Simultaneous retry requests cannot create two cycles. Retry history is audited, and lifetime attempts are not reset. Sent, queued, sending, skipped and uncertain messages cannot be manually retried.

The worker claims each message atomically and uses the existing unique notification/event keys and stable SMTP Message-ID. Before sending, it checks account activity, notification preferences, the current recipient address, client ownership, executive assignment and reminder relevance (including skipping reminders after the appointment has started). Error logs store sanitized outcomes rather than provider responses. Delivery outcome audit events retain individual attempt numbers even after the outbox's last error is cleared by success.

SMTP cannot provide an application-level exactly-once guarantee when a server accepts a message but its acknowledgement is lost. Such failures, post-send database failures and expired worker leases are held as **uncertain**, with automatic/manual resend blocked. Administrators must inspect provider logs before any further operator action. A **sent** status means SMTP accepted the message; it does not prove inbox delivery.

## API additions

| Method and endpoint | Access and behavior |
| --- | --- |
| `PUT /api/auth/profile` | Authenticated self only. Staff: `{name}`. Client: `{name, organization, phone}`. Returns the saved public user. Rejects other fields, including IDs, email, role, active status, title and executive assignment. |
| `GET /api/admin/email-delivery?status=failed&page=1` | Admin only. Returns safe SMTP configuration issues and 25 delivery records per page. |
| `POST /api/admin/email-delivery/test` | Admin only, JSON `{}`. Checks SMTP connectivity/authentication without sending email. Limited to three tests per administrator per 15 minutes. |
| `POST /api/admin/email-delivery/:id/retry` | Admin only, JSON `{}`. Queues one additional cycle for an exhausted failed message; invalid configuration returns 503, ineligible or already-queued messages return 409. |

Existing authentication, same-origin checks, JSON request requirements and audit handling apply to these endpoints. The sidebar hides delivery administration from Client, Assistant and Executive accounts, and the API independently enforces that restriction.

## Database changes

Migration **8** adds `notification_outbox.retry_count INT UNSIGNED NOT NULL DEFAULT 0` and extends the existing status enum with `uncertain`. Existing IDs, recipients, statuses, attempt counts and appointment data are retained. Delivery errors remain in `last_error`; individual outcomes and manual retry requests use the existing `audit_logs` table. No profile schema changes or new dependencies are needed.

Development initialization applies the migration on server restart. For production, run the existing `npm.cmd run db:deploy` with the production environment configured before starting the new server. Initialization remains repeatable, and production startup checks that migration 8 exists.

The test suites use random, disposable databases. This work did not reset application records, change the real database's existing failed messages, or replay those messages to real recipients.

## SMTP configuration still required

Real provider credentials were unavailable. The existing `.env.local` contains template SMTP values; no credentials were invented or exposed, and the local database settings were preserved.

Configure these **server-only** variables in `.env.local` for development, or `.env.production` / hosting environment variables for production:

```ini
SMTP_HOST=<provider SMTP hostname>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<provider SMTP username>
SMTP_PASSWORD="<provider SMTP password>"
SMTP_FROM="Meridian <authorized sender address>"
```

Use your provider's actual port and security requirements; port 465 uses implicit TLS. Remote servers require TLS. Do not prefix these variables with `VITE_`. Restart the server after editing its environment.

Then sign in as Admin, open **Email Delivery**, and choose **Test SMTP connection**. This sends no message. Once the connection succeeds, inspect the failed messages and retry the intended records individually. Existing exhausted failures do not replay automatically. A real-provider/inbox delivery test remains dependent on valid credentials and an explicitly chosen test recipient.

## Changed files for this request

- Mail service: `server/mail.mjs`, `server/notifications.mjs`, `server/verification-mail.mjs` (shared SMTP transport), `.env.production.example`.
- Persistence/API: `server/accounts.mjs`, `server/api.mjs`, `server/database.mjs`, `server/schema.sql`.
- Main UI: `src/app/App.tsx`, `src/app/components/NotificationBell.tsx`, `src/app/components/ScheduleView.tsx`, `src/styles/appointment-ui.css`.
- Added UI: `src/app/hooks/useBusinessDate.ts`, `src/app/components/ProfileEditor.tsx`, `src/app/components/EmailDelivery.tsx`, `src/app/components/AppointmentReference.tsx`.
- Admin navigation: `shared/navigation.mjs`, `shared/navigation.d.mts`, `src/app/components/RoleNavigation.tsx`.
- Verification: `tests/reliability.test.mjs`, `tests/notification-routing.test.mjs`, `tests/completion.test.mjs`, `qa/reliability.mjs`, `package.json` (`test:reliability`), this report.

Other uncommitted files from earlier work were retained. No Git commit, merge or push was performed for this request.

## Verification

The regression suite uses actual API requests, a disposable MySQL database, Chrome, and an in-process localhost SMTP server. It checks successful and rejected SMTP deliveries, exhausted retries, concurrent retry attempts, sent-message protection, uncertain outcomes, stale-recipient rejection, configuration validation, authorization for all four roles, profile persistence and validation, midnight rollover in a browser in another timezone, table sizes at 1280/768/390/320 pixels, clipboard copying, profile-save failure feedback, synchronization backoff, stale timestamps, reconnect, preservation of unsaved fields, session expiry and the Admin delivery UI.

All of the following checks passed:

| Command | Result |
| --- | --- |
| `npm.cmd run build` | Production build passed. |
| `npm.cmd run typecheck` | No TypeScript errors. |
| `npm.cmd test` | 38 unit and deployment smoke tests passed. Includes SMTP validation, role routing, lost SMTP acknowledgement and post-send database-failure and expired-reminder regressions. |
| `npm.cmd run test:reliability` | 8 regression groups passed: real database/API/profile, local SMTP success/failure/retry and browser date/sync/ID/Admin UI checks. |
| `npm.cmd run test:priority` | 10 existing scheduling/booking/availability/completion integration groups passed. |
| `npm.cmd run test:clients` | 8 client registration/privacy/approval/workflow integration groups passed. |
| `npm.cmd run test:navigation` | 5 API authorization and desktop/mobile role-navigation groups passed. |
| `npm.cmd run test:executives` | 4 selected-executive privacy, notification and live-badge groups passed. |
| `git diff --check` | Passed. |

There is no configured lint command in this project; no lint success is claimed. Chrome regression checks reported no JavaScript page errors. Screenshots were inspected for compact tables, profile/synchronization feedback and email administration. Evidence is saved under the ignored `qa/evidence-reliability/` folder, with the other suites' existing evidence directories.

## Remaining operational steps and limitations

1. Restart the development server (`npm.cmd run dev`) to load the updated backend and apply development migration 8. Production requires the existing deployment migration command first.
2. Replace local SMTP templates with real provider values, restart again, and use Admin ? Email Delivery ? Test SMTP connection.
3. Review and retry exhausted messages individually once configured. The previously observed 19 exhausted real messages were not resent by this implementation or its tests.
4. Real-provider acceptance, mailbox placement, SPF/DKIM/DMARC and spam filtering were not verified because no provider credentials or authorized external test recipient were supplied. Successful local SMTP tests verify the application delivery path, not a real inbox.
5. Uncertain SMTP deliveries are deliberately held rather than automatically resent. Provider logs are required to resolve these ambiguous outcomes safely.
6. Existing appointments retain their captured client details when a profile changes; future bookings use the updated profile. Email and role changes are outside the self-service profile endpoint.
7. Periodic state refresh is intentionally paused while editing a booking or using appointment mutation dialogs. The last-success timestamp remains visible; a retry refresh does not reset local form fields.
