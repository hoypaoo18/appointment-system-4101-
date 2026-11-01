import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationForRole, canAccessView, activeNavigationView, mobileNavigationForRole } from '../shared/navigation.mjs';

test('Navigation denies management pages to clients and assistants and restricts executive and admin responsibilities', () => {
  for (const role of ['client','assistant']) for (const view of ['approvals','availability','users','system-history']) assert.equal(canAccessView(role,view),false,role+' cannot open '+view);
  for (const role of ['executive','admin']) {
    assert.equal(canAccessView(role,'approvals'),true);assert.equal(canAccessView(role,'availability'),true);
    assert.equal(canAccessView(role,'new-appointment'),false);
  }
  assert.equal(canAccessView('executive','users'),false);assert.equal(canAccessView('executive','system-history'),false);
  assert.equal(canAccessView('admin','users'),true);assert.equal(canAccessView('admin','system-history'),true);
  for (const role of ['client','assistant','executive','admin']) {
    assert.equal(canAccessView(role,'detail'),true);assert.equal(canAccessView(role,'history'),true);
    assert.equal(canAccessView(role,'unknown-page'),false);
  }
  for (const role of ['client','assistant']) assert.equal(canAccessView(role,'new-appointment'),true);
});

test('Unknown, missing and inherited role names fail closed', () => {
  for (const role of [undefined,null,'','owner','Admin','client ','constructor','__proto__','toString']) {
    assert.deepEqual(navigationForRole(role),[]);
    for (const view of ['dashboard','users','system-history','approvals','availability','new-appointment','detail']) assert.equal(canAccessView(role,view),false);
  }
});

test('Mobile primary and More menus preserve every authorized destination once without exposing another role’s pages', () => {
  for (const role of ['client','assistant','executive','admin']) {
    const desktop=navigationForRole(role).flatMap(group=>group.items).map(entry=>entry.id);
    const {primary,overflow}=mobileNavigationForRole(role);
    const mobile=[...primary,...overflow.flatMap(group=>group.items)].map(entry=>entry.id);
    assert.ok(primary.length<=4);assert.equal(new Set(mobile).size,mobile.length);
    assert.deepEqual([...mobile].sort(),[...desktop].sort());
    assert.ok(mobile.every(view=>canAccessView(role,view)));
  }
});

test('Detail and history links retain a valid selected navigation item and the approval return path', () => {
  assert.equal(activeNavigationView('executive','detail','approvals'),'approvals');
  assert.equal(activeNavigationView('admin','detail','approvals'),'approvals');
  assert.equal(activeNavigationView('client','detail','approvals'),'appointments');
  assert.equal(activeNavigationView('client','history'),'appointments');
  assert.equal(activeNavigationView('assistant','history'),'history');
  assert.equal(activeNavigationView('client','new-appointment'),'appointments');
});
