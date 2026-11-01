export type Role = 'client' | 'assistant' | 'executive' | 'admin';
export type AppView = 'dashboard' | 'appointments' | 'new-appointment' | 'detail' | 'schedule' | 'history' | 'settings' | 'system-history' | 'approvals' | 'availability' | 'users' | 'email-delivery';
export interface NavigationItem { id: AppView; label: string; mobileLabel: string; icon: 'dashboard' | 'appointments' | 'schedule' | 'history' | 'settings' | 'approvals' | 'availability' | 'users' | 'audit' | 'mail'; }
export interface NavigationGroup { label: string; items: NavigationItem[]; }
export function navigationForRole(role: string): NavigationGroup[];
export function canAccessView(role: string | undefined, view: string): boolean;
export function activeNavigationView(role: Role, view: AppView, parent?: AppView): AppView;
export function pageTitle(role: Role, view: AppView): string;
export function mobileNavigationForRole(role: Role): { primary: NavigationItem[]; overflow: NavigationGroup[] };
