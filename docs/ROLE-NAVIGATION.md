# Role-based navigation

The desktop sidebar and mobile navigation use the same role configuration in
`shared/navigation.mjs`. Page selection is checked against that configuration
before rendering. Unknown roles have no page permissions. The server continues
to enforce authentication, appointment ownership and all mutation permissions;
changing a menu or issuing a direct API request cannot grant additional authority.

| Role | Workspace | Management | Account |
| --- | --- | --- | --- |
| Client | Dashboard, My Appointments, Available Times | None | Settings |
| Assistant | Dashboard, Appointments, Schedule, Appointment History | None | Settings |
| Executive | Dashboard, Appointments, Approval Requests, Schedule | My Availability | Settings |
| Admin | Dashboard, Appointments, Approval Requests, Schedule | Executive Availability, User Management, System History | Settings |

Clients retain access only to their own records and anonymous occupied times.
Assistants and Admins retain shared office appointment visibility. Executives
receive only their assigned appointments, activity, calendar and notifications
from the server. Requests for another executive's appointment ID return 404, and
another executive's availability cannot be queried. The executive
approval queue shows only pending requests assigned to that executive; Admins
can review all pending requests. Only the assigned executive or an Admin can
approve or decline. Executive availability editing is limited to their own
schedule; Admins can manage all executive schedules. User Management retains
existing account activation/deactivation and prevents deactivating oneself.

Executives have a numbered badge beside Approval Requests on desktop and mobile.
It counts assigned appointments with Pending status, independently of whether a
notification was read or notification delivery was disabled in preferences. It
refreshes with the normal three-second state polling and after approval actions,
and decreases when requests are approved, declined, cancelled or reassigned.
The badge is hidden when no requests are pending. Assistants, Admins and the
booking client retain their existing notification preferences; other executives
are never added as recipients. Old notifications and queued emails are also
checked against the current executive assignment before display or delivery.

Availability and User Management have their own destinations instead of appearing
inside personal Settings. Settings now contains Profile, Account (password),
Notifications and Preferences for every role. Nonfunctional Add/Edit User
placeholder controls were removed; existing activation/deactivation remains.

Clients, executives and Admins can find completed/cancelled records through the
Appointments filters. Their existing History screen is still accessible from
dashboard activity links, with Appointments highlighted. Assistants keep a direct
Appointment History link for daily record management. The existing New Appointment
CTA remains restricted to Clients and Assistants.

On mobile, clients see all four destinations. Other roles see three priority
destinations and a More button containing their remaining authorized destinations
and Sign Out. The menu supports Escape, keyboard focus containment and focus
restoration; it closes after navigation or switching to desktop size.

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`, and
`npm.cmd run test:navigation`. The navigation browser/API suite uses a random
disposable MySQL database and an installed Chrome. It never opens the database
named in the original `.env.local`. Existing client and staff workflow checks
remain available through `test:clients` and `test:priority`.

Run `npm.cmd run test:executives` to check all three executive accounts together:
recipient selection, server-side record isolation, desktop/mobile badges,
reassignment, approval, decline, cancellation and legacy notification isolation.
`tests/notification-routing.test.mjs` also verifies that queued executive email is
skipped when the recipient is no longer assigned. It uses a transport stub and
does not send email to an external inbox.
