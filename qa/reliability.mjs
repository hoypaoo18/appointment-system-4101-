import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import net from 'node:net';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { chromium,expect,request } from '@playwright/test';
import { openDatabase,today } from '../server/database.mjs';
import { webHandler } from '../server/web-handler.mjs';

// Never connect to the original database or contact a real SMTP server.
const originalName=process.env.DB_NAME,name='appointment_qa_'+randomUUID().replaceAll('-','');
assert.match(name,/^appointment_qa_[a-f0-9]{32}$/);assert.notEqual(name,originalName);
const config={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',connectTimeout:5000};
process.env.APP_ENV='test';process.env.NODE_ENV='development';process.env.DB_NAME=name;process.env.NOTIFICATION_INTERVAL_MS='3600000';process.env.REQUIRE_CLIENT_EMAIL_VERIFICATION='false';
for(const key of ['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'])delete process.env[key];
const output=new URL('./evidence-reliability/',import.meta.url),checks=[],apis=[],contexts=[],messages=[];
const pass=message=>{checks.push(message);console.log('PASS: '+message);};
let admin,database,server,browser,page,created=false,smtp,mode='accept';
const date=new Date(Date.parse(today()+'T00:00:00Z')+14*86400000).toISOString().slice(0,10);
const nextDate=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const thirdDate=new Date(Date.parse(date+'T00:00:00Z')+2*86400000).toISOString().slice(0,10);
const client={name:'Reliability Client',email:'reliability-client@example.test',password:'ReliabilityClient123!',organization:'Synthetic QA',phone:'09171234567'};
const status=async(response,expected)=>{const data=await response.json();assert.equal(response.status(),expected,JSON.stringify(data));return data;};
const input=(date,startTime)=>({clientName:client.name,clientEmail:client.email,clientOrg:client.organization,clientPhone:client.phone,purpose:'Reliability synthetic booking',notes:'Local QA only',executiveId:'exec-1',date,startTime,duration:30});
try{
  await mkdir(output,{recursive:true});admin=await mysql.createConnection(config);
  const [existing]=await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[name]);assert.equal(existing.length,0);created=true;
  const seed=JSON.parse(await readFile(new URL('../server/seed.json',import.meta.url),'utf8'));
  database=await openDatabase({database:name,seed:{...seed,INITIAL_APPOINTMENTS:[],INITIAL_ACTIVITY:[]}});await admin.query('USE '+mysql.escapeId(name));
  // Exercise upgrading an existing v7 outbox rather than only creating fresh tables.
  await database.close();database=null;await admin.query('DELETE FROM migrations WHERE version=8');await admin.query('ALTER TABLE notification_outbox DROP COLUMN retry_count');
  await admin.query("ALTER TABLE notification_outbox MODIFY status ENUM('pending','sending','sent','failed','skipped') NOT NULL DEFAULT 'pending'");
  database=await openDatabase({database:name});
  assert.equal((await admin.query('SELECT version FROM migrations WHERE version=8'))[0].length,1);
  server=createServer(webHandler(database,fileURLToPath(new URL('../dist/',import.meta.url))));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const baseURL='http://127.0.0.1:'+server.address().port;
  const api=async()=>{const result=await request.newContext({baseURL});apis.push(result);return result;};
  const clients=await api(),manager=await api(),staff=await api(),executive=await api(),guest=await api();
  const registered=await status(await clients.post('/api/auth/register',{data:client}),201);
  await status(await manager.post('/api/auth/login',{data:{email:'j.alderton@meridian.com',password:'MeridianDemo123!'}}),200);
  await status(await staff.post('/api/auth/login',{data:{email:'sarah.mitchell@meridian.com',password:'MeridianDemo123!'}}),200);
  await status(await executive.post('/api/auth/login',{data:{email:'margaret.chen@meridian.com',password:'MeridianDemo123!'}}),200);
  const records=[];for(const [day,time]of [[date,'09:00'],[nextDate,'10:00'],[nextDate,'11:00']])records.push((await status(await clients.post('/api/appointments',{data:input(day,time)}),201)).appointment);
  assert.ok(records.every(row=>row.status==='pending'));
  const pending=(await admin.query("SELECT * FROM notification_outbox WHERE status='pending'"))[0];assert.equal(pending.length,12);
  assert.equal((await status(await manager.get('/api/admin/email-delivery'),200)).smtp.configured,false);
  process.env.SMTP_HOST='your-provider-smtp-host';process.env.SMTP_FROM='Meridian <your-sending-email>';
  await status(await manager.post(`/api/admin/email-delivery/${pending[0].id}/retry`,{data:{}}),503);await database.notifications.tick();
  assert.ok((await admin.query('SELECT attempts FROM notification_outbox'))[0].every(row=>row.attempts===0));
  pass('Migration 8 upgrades an existing outbox; missing/template SMTP settings preserve queued mail without consuming attempts');
  smtp=net.createServer(socket=>{
    socket.setEncoding('utf8');socket.write('220 localhost QA SMTP\r\n');let buffer='',dataMode=false,to=[];
    socket.on('data',chunk=>{buffer+=chunk;while(buffer.length){
      if(dataMode){const end=buffer.indexOf('\r\n.\r\n');if(end<0)return;const raw=buffer.slice(0,end);buffer=buffer.slice(end+5);messages.push({to,raw});to=[];dataMode=false;socket.write('250 accepted\r\n');continue;}
      const end=buffer.indexOf('\r\n');if(end<0)return;const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
      if(/^(EHLO|HELO)/i.test(line))socket.write('250-localhost\r\n250 8BITMIME\r\n');
      else if(/^MAIL FROM:/i.test(line))socket.write(mode==='reject'?'450 Synthetic temporary failure\r\n':'250 OK\r\n');
      else if(/^RCPT TO:/i.test(line)){to.push(line.slice(8).trim());socket.write('250 OK\r\n');}
      else if(/^DATA$/i.test(line)){dataMode=true;socket.write('354 End with dot\r\n');}
      else if(/^QUIT$/i.test(line)){socket.end('221 Bye\r\n');return;}else socket.write('250 OK\r\n');
    }});socket.on('error',()=>{});
  });await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
  process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_PORT=String(smtp.address().port);process.env.SMTP_FROM='Meridian QA <office@example.test>';process.env.SMTP_SECURE='false';
  await status(await manager.post('/api/admin/email-delivery/test',{data:{}}),200);assert.equal(messages.length,0);
  for(const observer of [clients,staff,executive]){
    await status(await observer.get('/api/admin/email-delivery'),403);await status(await observer.post('/api/admin/email-delivery/test',{data:{}}),403);await status(await observer.post(`/api/admin/email-delivery/${pending[0].id}/retry`,{data:{}}),403);
  }
  await status(await guest.get('/api/admin/email-delivery'),401);
  await Promise.all([database.notifications.tick(),database.notifications.tick()]);assert.equal(messages.length,12);await database.notifications.tick();assert.equal(messages.length,12);
  assert.ok(!JSON.stringify(messages).includes('robert.hargrove@meridian.com'));assert.ok(!JSON.stringify(messages).includes('victoria.santos@meridian.com'));
  assert.ok((await admin.query('SELECT attempts,status,sent_at FROM notification_outbox'))[0].every(row=>row.attempts===1&&row.status==='sent'&&row.sent_at));
  pass('Local SMTP accepts exactly one copy per eligible recipient; connection tests send no email; all non-admin delivery controls are denied');
  mode='reject';const failedBooking=(await status(await clients.post('/api/appointments',{data:input(thirdDate,'12:00')}),201)).appointment;
  for(let attempt=0;attempt<5;attempt++){await admin.query("UPDATE notification_outbox SET next_attempt=0 WHERE status='failed'");await database.notifications.tick();}
  let exhausted=(await admin.query("SELECT o.* FROM notification_outbox o JOIN notifications n ON n.id=o.id WHERE n.appointment_id=?",[failedBooking.id]))[0];
  assert.equal(exhausted.length,4);assert.ok(exhausted.every(row=>row.status==='failed'&&row.attempts===5&&row.last_error));
  const id=exhausted[0].id;mode='accept';
  const concurrent=await Promise.all([manager.post(`/api/admin/email-delivery/${id}/retry`,{data:{}}),manager.post(`/api/admin/email-delivery/${id}/retry`,{data:{}})]);assert.deepEqual(concurrent.map(response=>response.status()).sort(),[200,409]);
  await database.notifications.tick();assert.equal(messages.length,13);await database.notifications.tick();assert.equal(messages.length,13);
  const delivered=(await admin.query('SELECT * FROM notification_outbox WHERE id=?',[id]))[0][0];assert.equal(delivered.status,'sent');assert.equal(delivered.attempts,6);assert.equal(delivered.retry_count,1);assert.equal(delivered.last_error,null);
  await status(await manager.post(`/api/admin/email-delivery/${id}/retry`,{data:{}}),409);
  const held=exhausted[1].id;await admin.query("UPDATE notification_outbox SET status='sending',lease_until=1 WHERE id=?",[held]);await database.notifications.tick();
  assert.equal((await admin.query('SELECT status FROM notification_outbox WHERE id=?',[held]))[0][0].status,'uncertain');await status(await manager.post(`/api/admin/email-delivery/${held}/retry`,{data:{}}),409);assert.equal(messages.length,13);
  const stale=exhausted[2].id;await admin.query("UPDATE notification_outbox SET status='pending',attempts=0,next_attempt=0,recipient='wrong@example.test' WHERE id=?",[stale]);await database.notifications.tick();assert.equal((await admin.query('SELECT status FROM notification_outbox WHERE id=?',[stale]))[0][0].status,'skipped');assert.equal(messages.length,13);
  pass('Rejected deliveries stop at five attempts; concurrent manual retries queue one cycle, preserve lifetime attempts, reject sent mail, hold uncertain delivery and skip stale recipients');
  for(const [actor,profile]of [[clients,{name:'Updated Client',organization:'Updated Organization',phone:'+63 917 987 6543'}],[staff,{name:'Updated Assistant'}],[executive,{name:'Updated Executive'}],[manager,{name:'Updated Admin'}]]){
    const before=(await status(await actor.get('/api/auth/me'),200)).user;
    for(const injected of [{id:registered.user.id},{role:'admin'},{email:'other@example.test'},{active:false},{executiveId:'exec-2'},{title:'New authority'}])await status(await actor.put('/api/auth/profile',{data:{...profile,...injected}}),400);
    await status(await actor.put('/api/auth/profile',{data:{...profile,name:''}}),400);
    const saved=(await status(await actor.put('/api/auth/profile',{data:profile}),200)).user;assert.equal(saved.id,before.id);assert.equal(saved.role,before.role);assert.equal(saved.email,before.email);assert.equal(saved.name,profile.name);
    assert.equal((await status(await actor.get('/api/auth/me'),200)).user.name,profile.name);
  }
  await status(await guest.put('/api/auth/profile',{data:{name:'Unauthenticated'}}),401);
  assert.equal((await admin.query('SELECT organization FROM client_profiles WHERE user_id=?',[registered.user.id]))[0][0].organization,'Updated Organization');
  const relog=await api();assert.equal((await status(await relog.post('/api/auth/login',{data:{email:client.email,password:client.password}}),200)).user.name,'Updated Client');
  assert.equal((await status(await executive.get('/api/state'),200)).executives[0].name,'Updated Executive');
  assert.equal((await admin.query("SELECT COUNT(*) AS count FROM audit_logs WHERE action='email.retry_queued'"))[0][0].count,1);
  pass('All four roles persist permitted profile edits, retain identity and authority, reject invalid/foreign fields, and preserve changes across new sessions');
  browser=await chromium.launch({headless:true,channel:'chrome'});let context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',timezoneId:'America/New_York'});contexts.push(context);page=await context.newPage();page.setDefaultTimeout(10000);const runtimeErrors=[];page.on('pageerror',error=>runtimeErrors.push(error.message));
  await page.clock.install({time:new Date(date+'T23:59:50+08:00')});await page.goto(baseURL);await page.clock.setSystemTime(new Date(date+'T23:59:50+08:00'));
  await page.getByLabel('Email',{exact:true}).fill(client.email);await page.getByLabel('Password',{exact:true}).fill(client.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page.locator('[data-metric="today"] .dashboard-stat-value')).toHaveText('1');await expect(page.locator('[data-metric="upcoming"] .dashboard-stat-value')).toHaveText('3');
  await page.clock.runFor(20000);await expect(page.locator('[data-metric="today"] .dashboard-stat-value')).toHaveText('2');await expect(page.locator('[data-metric="upcoming"] .dashboard-stat-value')).toHaveText('1');
  await expect(page.locator('.dashboard-date')).toContainText(new Date(nextDate+'T00:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}));
  let nav=page.getByRole('navigation',{name:'Main navigation',exact:true});await nav.getByRole('button',{name:'My Appointments',exact:true}).click();await page.getByRole('button',{name:/^Today\s*2$/}).click();await expect(page.locator('main tbody tr')).toHaveCount(2);
  pass('A browser in a different timezone updates dashboard counts, date heading and Today filters across Manila midnight without reloading');
  // Use a normal real-time context for network tests so clock jumps cannot expire genuine HTTP requests.
  await context.close();context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});contexts.push(context);page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>runtimeErrors.push(error.message));await page.goto(baseURL);
  await page.getByLabel('Email',{exact:true}).fill(client.email);await page.getByLabel('Password',{exact:true}).fill(client.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
  nav=page.getByRole('navigation',{name:'Main navigation',exact:true});await nav.getByRole('button',{name:'My Appointments',exact:true}).click();

  for(const width of [1280,768,390,320]){
    await page.setViewportSize({width,height:900});const cell=page.locator('main tbody tr').first().locator('td').first();
    assert.equal(await cell.locator('.appointment-reference').evaluate(button=>getComputedStyle(button).whiteSpace),'nowrap');
    assert.ok(await cell.evaluate(element=>element.parentElement.getBoundingClientRect().height)<150);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===1280||width===320)await page.screenshot({path:fileURLToPath(new URL('appointments-'+width+'.png',output)),fullPage:true});
  }
  await page.setViewportSize({width:1280,height:900});await context.grantPermissions(['clipboard-read','clipboard-write']);
  const reference=page.locator('main .appointment-reference').first(),fullId=await reference.getAttribute('title');assert.ok(fullId.length>30);await reference.click();await expect(page.getByLabel('Full appointment ID',{exact:true})).toHaveValue(fullId);await page.getByRole('button',{name:'Copy full ID',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),fullId);await page.keyboard.press('Escape');
  pass('Full UUIDs stay unchanged, render as compact references at desktop/tablet/mobile sizes, and can be viewed and copied');
  await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Display Name',{exact:true}).fill('Browser Client');
  await page.route('**/api/auth/profile',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic profile save failure'})}));await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.locator('main').getByRole('alert')).toContainText('Synthetic profile save failure');assert.equal((await status(await clients.get('/api/auth/me'),200)).user.name,'Updated Client');
  await page.unroute('**/api/auth/profile');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByText('Profile saved',{exact:true})).toBeVisible();await expect(nav.locator('button',{hasText:'Settings'})).toBeVisible();assert.equal((await status(await clients.get('/api/auth/me'),200)).user.name,'Browser Client');
  await page.getByLabel('Display Name',{exact:true}).fill('Unsaved local edit');
  let failures=0;await page.route('**/api/state',route=>{failures++;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic outage"}'});});await page.waitForTimeout(3500);
  await expect(page.locator('.workspace-sync')).toContainText('may be outdated');await expect(page.locator('.workspace-sync')).toContainText('Last successful update');await expect(page.getByLabel('Display Name',{exact:true})).toHaveValue('Unsaved local edit');
  await page.waitForTimeout(30000);assert.ok(failures<=4,'Failures use exponential backoff');
  await page.screenshot({path:fileURLToPath(new URL('sync-failure.png',output)),fullPage:true});
  await page.unroute('**/api/state');await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.workspace-sync')).not.toHaveClass(/is-stale/);await expect(page.getByLabel('Display Name',{exact:true})).toHaveValue('Unsaved local edit');
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await expect(page.locator('.workspace-sync')).toContainText('offline');await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.workspace-sync')).not.toHaveClass(/is-stale/);
  await page.route('**/api/notifications',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic notification outage"}'}));await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.workspace-sync')).toContainText('may be outdated');await page.unroute('**/api/notifications');await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.locator('.workspace-sync')).not.toHaveClass(/is-stale/);
  await page.route('**/api/state',route=>route.fulfill({status:401,contentType:'application/json',body:'{"error":"Sign in required"}'}));await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await page.getByRole('button',{name:'Retry sync',exact:true}).click();await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();await page.unroute('**/api/state');
  assert.deepEqual(runtimeErrors,[]);pass('Profile UI reports real success/failure; background sync shows stale timestamps, backs off, retries, preserves unsaved fields, reconnects and handles expired sessions');
  await context.close();
  const adminContext=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(adminContext);page=await adminContext.newPage();await page.goto(baseURL);await page.getByLabel('Email',{exact:true}).fill('j.alderton@meridian.com');await page.getByLabel('Password',{exact:true}).fill('MeridianDemo123!');await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Email Delivery',exact:true}).click();await expect(page.getByRole('heading',{name:'Email Delivery',exact:true,level:1})).toBeVisible();await expect(page.getByRole('button',{name:'Retry failed email'})).toHaveCount(1);await page.getByRole('button',{name:'Retry failed email'}).click();await page.getByRole('button',{name:'Confirm retry'}).click();await expect(page.getByRole('status').filter({hasText:'One additional delivery cycle queued'})).toBeVisible();await database.notifications.tick();await page.getByRole('button',{name:'Refresh delivery status'}).click();await expect(page.getByRole('button',{name:'Retry failed email'})).toHaveCount(0);
  await page.screenshot({path:fileURLToPath(new URL('admin-email-delivery.png',output)),fullPage:true});pass('Admin delivery screen displays errors and configuration, confirms one-message retry, and refreshes persisted outcomes');
  await writeFile(new URL('results.json',output),JSON.stringify({passed:true,checks,scope:'Disposable MySQL database + Chrome + in-process localhost SMTP only; original records and external recipients untouched'},null,2));
}catch(error){if(page)await page.screenshot({path:fileURLToPath(new URL('failure.png',output)),fullPage:true}).catch(()=>{});await writeFile(new URL('results.json',output),JSON.stringify({passed:false,checks,error:error.message},null,2)).catch(()=>{});throw error;}
finally{
  if(browser)await browser.close();for(const api of apis)await api.dispose();if(server)await new Promise(resolve=>server.close(resolve));if(database)await database.close();if(smtp)await new Promise(resolve=>smtp.close(resolve));
  if(admin){try{if(created&&/^appointment_qa_[a-f0-9]{32}$/.test(name)&&name!==originalName)await admin.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));}finally{await admin.end();}}
}
