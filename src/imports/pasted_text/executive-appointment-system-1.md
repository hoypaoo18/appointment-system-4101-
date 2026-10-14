REFINE AND COMPLETE THE EXISTING DESIGN INTO A MODERN, PRODUCTION-READY EXECUTIVE APPOINTMENT SYSTEM

System Name:
Meridian EAS
Executive Appointment System

IMPORTANT:
Keep the existing visual direction and improve it rather than completely redesigning it.

The design should feel like a premium modern executive/business SaaS application. Use a clean glassmorphism interface with floating navigation, floating cards, soft shadows, subtle gradients, rounded corners, modern typography, and professional blue accents.

VISUAL DESIGN

Use:
- Glassmorphism
- Floating sidebar navigation
- Floating top navigation/header
- Semi-transparent white cards
- Soft background gradients
- Large rounded corners
- Subtle shadows and depth
- Clean spacing
- Modern outline icons
- Blue primary actions
- Green for Confirmed
- Orange for Pending
- Blue for Rescheduled
- Neutral gray for Completed
- Red for Cancelled
- Smooth hover and focus states
- Subtle micro-interactions
- Modern icon buttons with tooltips
- Floating action buttons where appropriate
- Modern dropdowns, popovers, modals, and confirmation dialogs

Do not make the interface look like a generic calendar application.

The product should look like a professional executive scheduling and appointment management platform.

MAIN NAVIGATION

Use a floating dark sidebar containing:

Meridian EAS
Executive Appointment System

Dashboard
Appointments
Schedule
History
Settings

At the bottom:

User avatar
User name
Role
Sign Out

The sidebar should remain visually consistent throughout all pages.

Use modern icons for every navigation item.

The active navigation item should have:
- Floating/highlighted background
- Blue accent indicator
- Bright icon
- Clear text

TOP NAVIGATION

Create a floating glass top navigation bar.

Include:
- Current page title
- Global search
- Notification bell
- User avatar
- Quick "+ New Appointment" button where appropriate

Use rounded icon buttons and subtle hover animations.

LOGIN

Create a modern login screen for:

Meridian EAS
Executive Appointment System

Fields:

Email
Password

Buttons:

Sign In
Forgot Password?

Authentication should determine the user's role and permissions.

Do not make selecting another user's account appear to be the real authentication method.

For prototype purposes, demo roles may be represented separately:

Executive Assistant
Executive
Administrator

DASHBOARD

Create a polished executive dashboard.

Header:

Good morning, [User Name]
[Current Date]

Summary cards:

Total Appointments
Today
Pending
Upcoming
Completed
Cancelled

Each card should have:
- Large number
- Label
- Modern icon
- Subtle trend or status indicator where appropriate

Main dashboard sections:

TODAY'S SCHEDULE

Show today's appointments with:

Time
Duration
Client / Visitor
Purpose
Executive
Status
View button

STATUS SUMMARY

Show:

Confirmed
Pending
Rescheduled
Completed
Cancelled

Use clean progress indicators.

UPCOMING APPOINTMENTS

Show a table/list containing:

Client / Visitor
Organization
Purpose
Executive
Date
Time
Status
View

Include:

View All

RECENT ACTIVITY

Show:

Appointment Created
Appointment Confirmed
Appointment Rescheduled
Appointment Cancelled
Appointment Completed

Each activity should show:
Action
Appointment
User
Timestamp

APPOINTMENTS PAGE

Create a complete appointment management page.

At the top:

Appointments
+ New Appointment

Add modern status tabs:

All
Today
Upcoming
Pending
Confirmed
Rescheduled
Completed
Cancelled

Add:

Search appointments...
Date filter
Executive filter
Status filter
Clear Filters

Use a modern glass table.

Columns:

ID
Client / Visitor
Organization
Purpose
Executive
Date
Time
Duration
Status
Actions

Actions should use modern icon buttons:

View
Edit
Reschedule
Complete
Cancel

Use tooltips for icon-only buttons.

Only show actions allowed by the appointment status and user's role.

NEW APPOINTMENT WORKFLOW

Create a complete step-by-step appointment creation workflow.

Steps:

1. Client Information
2. Meeting Information
3. Executive
4. Date & Time
5. Availability
6. Review
7. Confirmation

CLIENT INFORMATION

Fields:

Client / Visitor Name *
Organization
Email
Phone

MEETING INFORMATION

Fields:

Meeting Purpose *
Notes

EXECUTIVE

Field:

Executive *

Show available executives using modern selectable cards/dropdowns.

DATE & TIME

Fields:

Appointment Date *
Start Time *
Duration *

Automatically calculate:

End Time

Do not allow past dates.

AVAILABILITY CHECK

After selecting executive, date, start time, and duration, automatically check availability.

Display:

✓ Available

or

⚠ Schedule Conflict

or

× Unavailable

Example:

09:00 AM — Available
09:30 AM — Available
10:00 AM — Conflict
10:30 AM — Available
11:00 AM — Available

Occupied appointment periods should be clearly visible.

Prevent confirmation when a conflict exists.

Back-to-back appointments must be allowed when one appointment ends exactly when another begins.

REVIEW

Before confirmation, display a clean floating review card:

Client
Organization
Purpose
Executive
Date
Start Time
End Time
Duration
Notes

Buttons:

Back
Edit
Confirm Appointment

Perform a final availability check before saving.

CONFIRMATION

After successful creation:

✓ Appointment Confirmed

Show:

Appointment ID
Client
Executive
Date
Time
Duration
Status: Confirmed

Buttons:

View Appointment
Back to Dashboard

APPOINTMENT DETAILS

Create a floating glass Appointment Details modal/page.

Show:

Appointment ID
Status
Client / Visitor
Organization
Email
Phone
Purpose
Executive
Date
Start Time
End Time
Duration
Notes
Created Date
Last Updated

Add:

Appointment Activity Timeline

Example:

Appointment Created
Date and Time
User

Appointment Confirmed
Date and Time
User

Appointment Rescheduled
Date and Time
User

Appointment Completed
Date and Time
User

Actions:

Edit
Reschedule
Cancel
Mark Completed

Actions must change according to user role and appointment status.

RESCHEDULE

Create a dedicated Reschedule Appointment modal.

Show current appointment:

Client
Current Date
Current Time
Executive
Duration

Allow:

New Date
New Start Time
Duration

Automatically calculate the new end time.

Check executive availability again.

Display:

✓ Available

or

⚠ Schedule Conflict

After selecting a valid slot:

Show New Schedule Summary

Buttons:

Keep Current Schedule
Confirm Reschedule

Keep the same Appointment ID.

Preserve the previous appointment information in history/activity.

CANCEL APPOINTMENT

Create a modern confirmation dialog.

Title:

Cancel Appointment?

Show:

Appointment ID
Client
Date
Time
Executive

Optional field:

Cancellation Reason

Options:

Client requested cancellation
Executive unavailable
Schedule conflict
Meeting no longer needed
Other

Buttons:

Keep Appointment
Cancel Appointment

After confirmation:

Status becomes Cancelled.

The appointment must remain available in History.

COMPLETION

Create a Mark as Completed confirmation dialog.

Show:

Client
Date
Time
Executive
Current Status

Message:

This appointment will be moved to appointment history.

Buttons:

Cancel
Mark as Completed

Rules:

- Confirmed appointments can be completed.
- Rescheduled appointments can be completed.
- Cancelled appointments cannot be completed.
- Already completed appointments cannot be completed again.
- Future appointments cannot be completed.

After completion:

Status = Completed

Keep the record in History.

SCHEDULE PAGE

Create a modern calendar interface.

Controls:

Today
Previous
Next
Day
Week

Display:

Current date
Date range
Appointments
Occupied periods
Available periods

Appointment cards should display:

Client
Purpose
Time
Executive
Status

Clicking an appointment opens Appointment Details.

Clicking an available time slot opens New Appointment with the selected date and time pre-filled.

Do not allow creation when the selected slot conflicts with an existing appointment.

HISTORY PAGE

Create a clean historical appointment page.

Show:

Client
Organization
Purpose
Date
Time
Executive
Status
Appointment ID

Support:

Search
Status filter
Date filter
View Details

Include Completed and Cancelled appointments.

Allow users to open the full Appointment Details and activity timeline.

SETTINGS PAGE

Create:

Profile
Account
Password
Notifications
Preferences

PROFILE:

Name
Email
Role

ACCOUNT:

Change Password

NOTIFICATIONS:

Appointment Confirmations
Appointment Rescheduling
Appointment Cancellations
Appointment Reminders
Schedule Conflict Alerts

PREFERENCES:

Default Calendar View
Default Appointment Duration

ADMINISTRATOR SETTINGS

For Administrator users, include:

User Management

Columns:

Name
Email
Role
Account Status
Actions

Actions:

Edit
Activate
Deactivate

Do not display administrator controls to Executive Assistant or Executive users.

ROLE-BASED ACCESS

EXECUTIVE ASSISTANT:

Full appointment management.

Can:

Create
View
Edit
Reschedule
Cancel
Complete
Search
Filter
Check Availability

EXECUTIVE:

View-only.

Can:

View Dashboard
View Appointments
View Schedule
View Appointment Details
View History where permitted

Do not show:

Create
Edit
Reschedule
Cancel
Complete

ADMINISTRATOR:

Can manage:

Users
Roles
Account Status
Basic Configuration

Do not add unrelated modules.

ERROR AND VALIDATION STATES

Create prototype states for:

Invalid Login

"Invalid email or password."

Required field:

"Client / Visitor Name is required."

Invalid date:

"Appointment date cannot be in the past."

Schedule conflict:

"Schedule conflict detected. Please choose another available time."

Save error:

"Appointment could not be saved. No changes were applied."

No results:

"No appointments found."

Unauthorized:

"You do not have permission to perform this action."

Appointment not found:

"Appointment not found."

MODERN INTERACTION DESIGN

Use modern interaction patterns throughout:

- Hover effects
- Floating tooltips
- Smooth dropdowns
- Glass popovers
- Confirmation dialogs
- Toast notifications
- Success animations
- Loading states
- Skeleton loading
- Empty states
- Inline validation
- Keyboard focus states
- Subtle page transitions

Use icon + text for important statuses instead of relying only on color.

RESPONSIVE DESIGN

Desktop:
Floating sidebar + floating top navigation.

Tablet:
Compact sidebar.

Mobile:
Floating bottom navigation.

Convert wide appointment tables into appointment cards on mobile.

FINAL DESIGN DIRECTION

The entire application should feel consistent across all screens.

Use the existing Meridian EAS visual identity.

Prioritize:

1. Appointment Management
2. Executive Availability
3. Conflict Prevention
4. Client Information
5. Schedule Management
6. Appointment Lifecycle
7. Appointment History
8. Role-Based Access
9. Modern Glass/Floating UI

Do not add unrelated features such as:
Sales
Inventory
Payroll
CRM
Accounting
Marketing

Keep the system focused specifically on:

MERIDIAN EAS
EXECUTIVE APPOINTMENT SYSTEM

Make every screen visually polished, modern, consistent, functional, and suitable for a capstone/project presentation.