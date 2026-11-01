const item = (id, label, icon, mobileLabel = label) => ({ id, label, icon, mobileLabel });
const dashboard = item('dashboard', 'Dashboard', 'dashboard', 'Home');
const appointments = item('appointments', 'Appointments', 'appointments');
const schedule = item('schedule', 'Schedule', 'schedule');
const approvals = item('approvals', 'Approval Requests', 'approvals', 'Approvals');
const settings = { label: 'Account', items: [item('settings', 'Settings', 'settings')] };
const menus = {
  client: [
    { label: 'My workspace', items: [dashboard, item('appointments', 'My Appointments', 'appointments', 'Bookings'), item('schedule', 'Available Times', 'schedule', 'Times')] },
    settings,
  ],
  assistant: [
    { label: 'Appointment management', items: [dashboard, appointments, schedule, item('history', 'Appointment History', 'history', 'History')] },
    settings,
  ],
  executive: [
    { label: 'Executive workspace', items: [dashboard, appointments, approvals, schedule] },
    { label: 'Management', items: [item('availability', 'My Availability', 'availability', 'Availability')] },
    settings,
  ],
  admin: [
    { label: 'Workspace oversight', items: [dashboard, appointments, approvals, schedule] },
    { label: 'Administration', items: [item('availability', 'Executive Availability', 'availability', 'Availability'), item('users', 'User Management', 'users', 'Users'), item('system-history', 'System History', 'audit', 'Audit'), item('email-delivery', 'Email Delivery', 'mail', 'Email')] },
    settings,
  ],
};
// Unknown roles receive no navigation or page access.
export const navigationForRole = role => Object.hasOwn(menus, role) ? menus[role] : [];
export function canAccessView(role, view) {
  const allowed = navigationForRole(role).flatMap(group => group.items).map(entry => entry.id);
  if (view === 'new-appointment') return role === 'client' || role === 'assistant';
  if (view === 'detail' || view === 'history') return allowed.includes('appointments');
  return allowed.includes(view);
}
export function activeNavigationView(role, view, parent = 'appointments') {
  if (view === 'detail') return parent === 'approvals' && canAccessView(role, parent) ? parent : 'appointments';
  if (view === 'new-appointment' || view === 'history' && role !== 'assistant') return 'appointments';
  return view;
}
export function pageTitle(role, view) {
  const entry = navigationForRole(role).flatMap(group => group.items).find(entry => entry.id === view);
  return entry?.label || ({ detail: 'Appointment Details', 'new-appointment': 'New Appointment', history: 'Appointment History' })[view] || 'Dashboard';
}
export function mobileNavigationForRole(role) {
  const groups = navigationForRole(role);
  const all = groups.flatMap(group => group.items);
  if (all.length <= 4) return { primary: all, overflow: [] };
  const priority = role === 'executive' || role === 'admin' ? ['dashboard', 'approvals', 'schedule'] : ['dashboard', 'appointments', 'schedule'];
  return {
    primary: priority.map(id => all.find(entry => entry.id === id)).filter(Boolean),
    overflow: groups.map(group => ({ ...group, items: group.items.filter(entry => !priority.includes(entry.id)) })).filter(group => group.items.length),
  };
}
