import { useEffect, useId, useState } from 'react';
import { LayoutDashboard, ClipboardList, CalendarDays, History, Settings, CheckCheck, CalendarClock, Users, Activity, Calendar, LogOut, MoreHorizontal, X, Mail } from 'lucide-react';
import { navigationForRole, mobileNavigationForRole, type AppView, type Role, type NavigationGroup, type NavigationItem } from '../../../shared/navigation.mjs';
import { AccessibleDialog } from './AccessibleDialog';

const icons = { dashboard: LayoutDashboard, appointments: ClipboardList, schedule: CalendarDays, history: History, settings: Settings, approvals: CheckCheck, availability: CalendarClock, users: Users, audit: Activity, mail: Mail };
type User = { id: string; name: string; initials: string; role: Role };
type Props = { activeView: AppView; currentUser: User; pendingRequestCount?: number; onNav: (view: AppView) => void; onLogout: () => void };

function NavigationGroups({ groups, activeView, onNav, pendingRequests, countDescriptionId }: { groups: NavigationGroup[]; activeView: AppView; onNav: Props['onNav']; pendingRequests: number; countDescriptionId: string }) {
  return <>{groups.map(group => <section className="role-nav-group" key={group.label} aria-label={group.label}>
    <p className="nav-section-label px-3 mb-2">{group.label}</p>
    <div className="space-y-1">{group.items.map(entry => {
      const Icon = icons[entry.icon], active = activeView === entry.id;
      const showCount = entry.id === 'approvals' && pendingRequests > 0;
      return <button key={entry.id} type="button" aria-current={active ? 'page' : undefined} aria-describedby={showCount ? countDescriptionId : undefined} onClick={() => onNav(entry.id)} className={`sidebar-link w-full flex items-center gap-3 px-3 py-2.5 text-left ${active ? 'is-active' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
        <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /><span className="flex-1 min-w-0">{entry.label}</span>{showCount ? <span className="nav-request-badge" data-request-count={pendingRequests} aria-hidden="true">{pendingRequests}</span> : active && <i className="nav-active-dot" aria-hidden="true" />}
      </button>;
    })}</div>
  </section>)}</>;
}

export function RoleNavigation({ activeView, currentUser, pendingRequestCount = 0, onNav, onLogout }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const countDescriptionId = useId();
  const pendingRequests = currentUser.role === 'executive' ? pendingRequestCount : 0;
  const groups = navigationForRole(currentUser.role);
  const { primary, overflow } = mobileNavigationForRole(currentUser.role);
  const overflowActive = overflow.some(group => group.items.some(entry => entry.id === activeView));
  const navigate = (view: AppView) => { setMoreOpen(false); onNav(view); };
  useEffect(() => {
    const desktop = matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) setMoreOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => setMoreOpen(false), [currentUser.id]);
  const mobileButton = (entry: NavigationItem) => {
    const Icon = icons[entry.icon], active = activeView === entry.id;
    const showCount = entry.id === 'approvals' && pendingRequests > 0;
    return <button key={entry.id} type="button" aria-label={entry.label} aria-current={active ? 'page' : undefined} aria-describedby={showCount ? countDescriptionId : undefined} onClick={() => navigate(entry.id)} className={`mobile-nav-link ${active ? 'is-active' : ''}`}>
      <span className="mobile-nav-icon"><Icon className="w-[18px] h-[18px]" aria-hidden="true" />{showCount && <span className="nav-request-badge" data-request-count={pendingRequests} aria-hidden="true">{pendingRequests}</span>}</span><span>{entry.mobileLabel}</span>
    </button>;
  };
  return <>
    {currentUser.role === 'executive' && <span id={countDescriptionId} className="sr-only" aria-live="polite" aria-atomic="true">{pendingRequests} pending appointment {pendingRequests === 1 ? 'request' : 'requests'} awaiting your approval</span>}
    <aside className="app-sidebar fixed left-0 top-0 bottom-0 z-40 w-60 hidden md:flex flex-col" aria-label={`${currentUser.role} sidebar`}>
      <div className="sidebar-brand px-6 py-6 border-b border-slate-100 flex items-center gap-2.5">
        <div className="brand-mark w-10 h-10 rounded-xl flex items-center justify-center shrink-0"><Calendar className="w-5 h-5 text-white" aria-hidden="true" /></div>
        <div><div className="text-base font-bold tracking-tight text-slate-900">Meridian<span className="text-blue-600">.</span></div><p className="text-[11px] text-slate-500 mt-1">Appointment management</p></div>
      </div>
      <nav aria-label="Main navigation" className="role-navigation flex-1 min-h-0 overflow-y-auto px-4 py-5"><NavigationGroups groups={groups} activeView={activeView} onNav={navigate} pendingRequests={pendingRequests} countDescriptionId={countDescriptionId} /></nav>
      <div className="sidebar-account border-t border-slate-100 px-4 py-4">
        <div className="flex items-center gap-3 px-2 mb-3"><span className="nav-avatar">{currentUser.initials}</span><div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{currentUser.name}</p><p className="text-xs text-slate-500 capitalize mt-0.5">{currentUser.role}</p></div></div>
        <button type="button" onClick={onLogout} className="sidebar-signout w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900"><LogOut className="w-[18px] h-[18px]" aria-hidden="true" />Sign Out</button>
      </div>
    </aside>
    <nav aria-label="Mobile navigation" className="mobile-navigation fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div className="mobile-nav-items">{primary.map(mobileButton)}{overflow.length > 0 && <button type="button" aria-label="More navigation" aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={overflowActive ? 'page' : undefined} onClick={() => setMoreOpen(true)} className={`mobile-nav-link ${overflowActive ? 'is-active' : ''}`}><MoreHorizontal className="w-[18px] h-[18px]" aria-hidden="true" /><span>More</span></button>}</div>
    </nav>
    {moreOpen && <AccessibleDialog title="More navigation" onClose={() => setMoreOpen(false)}>
      <div className="absolute inset-0 bg-slate-900/35" onClick={() => setMoreOpen(false)} />
      <div className="mobile-more-panel ui-surface relative w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-5"><div><h2 className="font-semibold text-slate-900">More</h2><p className="text-xs text-slate-500 capitalize mt-1">{currentUser.role} workspace</p></div><button type="button" aria-label="Close navigation" onClick={() => setMoreOpen(false)} className="ui-icon-button rounded-lg p-2"><X className="w-5 h-5" /></button></div>
        <nav aria-label="More navigation items"><NavigationGroups groups={overflow} activeView={activeView} onNav={navigate} pendingRequests={pendingRequests} countDescriptionId={countDescriptionId} /></nav>
        <button type="button" onClick={() => { setMoreOpen(false); onLogout(); }} className="sidebar-signout flex items-center gap-3 text-sm text-slate-600 mt-5 px-3 py-3 w-full rounded-lg border-t border-slate-100"><LogOut className="w-[18px] h-[18px]" />Sign Out</button>
      </div>
    </AccessibleDialog>}
  </>;
}
