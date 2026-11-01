# Client accounts and online booking

## Implementation plan

1. Extend the existing account model with a Client role, a client contact profile,
   and optional expiring, single-use email verification tokens. Public registration always
   creates a client; it cannot create staff accounts.
2. Link new client bookings to their authenticated user ID. Filter every client
   state and mutation response by that ID. Share only anonymous occupied times
   for other bookings so the availability calendar never exposes their details.
3. Reuse the existing dashboard, calendar, booking wizard and history. Prefill the
   client's account name/email and contact information. Preserve staff booking,
   approval, conflict, schedule, buffer and end-time completion rules.
4. Allow clients to edit, reschedule or cancel their own future active bookings.
   Staff alone can complete bookings; only assigned executives/admins can decide
   approval requests. Changes to time/executive/duration follow approval policy.
5. Include clients in their own booking notifications and provide mobile sign-out.
6. Run unit, database/API, browser, migration and existing-workflow checks using
   synthetic records in a disposable database, never the current application DB.

## How the process works

1. From the login page choose **Create client account**, enter your contact
   details and a password of at least 12 characters, then submit.
2. Registration creates a normal eight-hour login session and opens your dashboard
   immediately. Email verification is currently disabled; SMTP is not needed to
   register. Existing unverified clients can also sign in with their password.
   Existing staff accounts retain their current login.
3. Choose **New Appointment**, or an available calendar slot. Your account name
   and email are prefilled and cannot be used to book as someone else.
4. Enter the meeting purpose, choose an executive, date, time and duration, then
   check availability and review. The server checks again when saving and prevents
   two concurrent requests from claiming the same slot.
5. Every client-created request starts as **Pending**, regardless of the executive's
   approval setting for staff bookings. Only the assigned executive or an admin can
   approve it to become **Confirmed**, or decline it with a reason (recorded as
   **Cancelled**). Pending requests reserve their time and generate pending-request
   notifications; confirmation notifications are sent only after approval.
6. Track the result in your dashboard, appointment details and notifications.
   Before the appointment starts you can edit, cancel or reschedule it. Changing
   the executive, date, time or duration sends a client booking back to **Pending**,
   even when staff make the change. Editing contact details or notes preserves the
   current status. A pending client request cannot be completed, even after its
   scheduled end. Closed records stay read-only; assistants record completion of
   approved appointments after their scheduled end.

The executive approval checkbox controls staff-created bookings; client-created
bookings always need approval. Existing confirmed appointments retain their status.

Clients see only records explicitly linked to their account. Existing appointments
are not claimed by matching an email address. Staff continue seeing the shared
office schedule as Assistants or Admins. Executives receive only appointments and
notifications assigned to their own executive profile.

## Setup and deployment

The normal database initialization adds migration 7 without deleting existing
accounts or appointments. It extends the users role enum, adds an indexed client
owner link table for appointments, and creates profile and verification tables.
Deploy the backend and frontend together. Use the existing database initialization
command/startup process before serving the updated application.

`REQUIRE_CLIENT_EMAIL_VERIFICATION=false` disables verification (also the default
when this setting is absent). It is set explicitly in `.env.local`. Registration
and login still validate passwords, account status and client permissions. No
verification token or email is generated during registration, and the email is
not falsely marked verified. The session cookie remains HttpOnly and SameSite;
production cookies also use Secure. Registration and session creation commit
together, so a session failure does not leave a partially registered account.

To enable verification later, set `REQUIRE_CLIENT_EMAIL_VERIFICATION=true` in the
server environment and restart. New clients then receive a single-use link that
expires after 24 hours and sign in after verification. Existing unverified clients
must use **Resend verification** before signing in; their old sessions stop working
until verified. Production requires SMTP_HOST and SMTP_FROM, plus the provider's
SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_SECURE settings. Links use PUBLIC_ORIGIN.
Locally without SMTP, the UI displays a **Development verification link** instead;
production never exposes this preview. Verification tokens are stored hashed;
passwords retain scrypt hashing. Keep credentials in private environment settings.

Booking notifications retain the existing outbox and preferences. In-app delivery
works without SMTP; email delivery requires a configured provider. Disabling
registration verification does not disable booking notifications.

Clients receive in-app booking updates automatically. Appointment reminders use
the existing preference (off by default) and can be enabled in Settings.

## Verification

Run `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd test` first.
`npm.cmd run test:clients` exercises immediate sign-in, optional email verification, ownership,
conflicts, approval, notifications and the complete client browser workflow using
a random disposable database. It uses the connection settings in `.env.local`,
requires permission to create/drop its QA database and an installed Chrome, and
never opens the original database. `npm.cmd run test:priority` checks the staff
booking workflows. Evidence is saved under ignored `qa/evidence-*/` folders.

Public password recovery, third-party calendar sync and guest bookings are outside
this feature. Do not share staff credentials with clients.
