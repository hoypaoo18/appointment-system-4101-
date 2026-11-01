import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { chromium, expect, request } from '@playwright/test';
import { openDatabase, today } from '../server/database.mjs';
import { webHandler } from '../server/web-handler.mjs';

const originalName=process.env.DB_NAME,name='appointment_qa_'+randomUUID().replaceAll('-','');
assert.match(name,/^appointment_qa_[a-f0-9]{32}$/);assert.notEqual(name,originalName);
const config={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',connectTimeout:5000};
process.env.APP_ENV='test';process.env.NODE_ENV='development';process.env.DB_NAME=name;process.env.REQUIRE_CLIENT_EMAIL_VERIFICATION='false';process.env.NOTIFICATION_INTERVAL_MS='3600000';
for(const key of ['SMTP_HOST','SMTP_FROM','SMTP_USER','SMTP_PASSWORD'])delete process.env[key];
const output=new URL('./evidence-executives/',import.meta.url),checks=[],apis=[],pages=[];
const pass=value=>{checks.push(value);console.log('PASS: '+value);};
const executives=[{id:'exec-1',userId:'user-2',email:'margaret.chen@meridian.com'},{id:'exec-2',userId:'user-3',email:'robert.hargrove@meridian.com'},{id:'exec-3',userId:'user-4',email:'victoria.santos@meridian.com'}];
const future=new Date(Date.parse(today()+'T00:00:00Z')+14*86400000).toISOString().slice(0,10);
const input=(id,time='10:00')=>({clientName:'Routing Client',clientOrg:'Synthetic QA',clientEmail:'routing-client@example.test',clientPhone:'09171234567',purpose:'Private routing '+id,notes:'Synthetic appointment',executiveId:id,date:future,startTime:time,duration:30});
const status=async(response,expected)=>{const body=await response.json();assert.equal(response.status(),expected,JSON.stringify(body));return body;};
let admin,database,server,browser,created=false,currentPage;
try{
  await mkdir(output,{recursive:true});admin=await mysql.createConnection(config);
  const [existing]=await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[name]);assert.equal(existing.length,0);
  created=true;database=await openDatabase({database:name});await admin.query('USE '+mysql.escapeId(name));
  server=createServer(webHandler(database,fileURLToPath(new URL('../dist/',import.meta.url))));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const baseURL='http://127.0.0.1:'+server.address().port;
  const api=async(email,password='MeridianDemo123!')=>{const context=await request.newContext({baseURL});apis.push(context);if(email)await status(await context.post('/api/auth/login',{data:{email,password}}),200);return context;};
  const client=await api();await status(await client.post('/api/auth/register',{data:{name:'Routing Client',email:'routing-client@example.test',password:'RoutingClientPassword123!',organization:'Synthetic QA',phone:'09171234567'}}),201);
  const staff=await api('sarah.mitchell@meridian.com'),manager=await api('j.alderton@meridian.com');
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chrome'})});
  const errors=[];
  for(const executive of executives){
    executive.api=await api(executive.email);
    const state=await status(await executive.api.get('/api/state'),200);
    assert.ok(state.appointments.every(record=>record.executiveId===executive.id));assert.deepEqual(state.executives.map(record=>record.id),[executive.id]);
    executive.baseline=state.appointments.filter(record=>record.status==='pending').length;
    const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});executive.context=context;
    const page=await context.newPage();executive.page=page;pages.push(page);page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
    await page.goto(baseURL);await page.getByLabel('Email',{exact:true}).fill(executive.email);await page.getByLabel('Password',{exact:true}).fill('MeridianDemo123!');await page.getByRole('button',{name:'Sign In',exact:true}).click();
    await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
  }
  const badge=async(executive,count,mobile=false)=>{
    currentPage=executive.page;await executive.page.bringToFront();
    const nav=executive.page.getByRole('navigation',{name:mobile?'Mobile navigation':'Main navigation',exact:true});
    const number=nav.getByRole('button',{name:'Approval Requests',exact:true}).locator('[data-request-count]');
    if(count)await expect(number).toHaveText(String(count),{timeout:10000});else await expect(number).toHaveCount(0,{timeout:10000});
  };
  const requests=[];
  for(const [index,executive]of executives.entries()){
    const saved=(await status(await client.post('/api/appointments',{data:input(executive.id)}),201)).appointment;requests.push(saved);assert.equal(saved.status,'pending');
    const [recipients]=await admin.query("SELECT u.executive_id FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.appointment_id=? AND n.event_key=? AND u.role='executive'",[saved.id,`${saved.id}:pending:${saved.updatedAt}`]);assert.deepEqual(recipients.map(row=>row.executive_id),[executive.id]);
    for(const [otherIndex,other]of executives.entries()){
      const state=await status(await other.api.get('/api/state'),200);assert.ok(state.appointments.every(record=>record.executiveId===other.id));
      assert.equal(state.appointments.some(record=>record.id===saved.id),other.id===executive.id);
      const notifications=await status(await other.api.get('/api/notifications'),200);assert.equal(notifications.entries.some(entry=>entry.appointmentId===saved.id),other.id===executive.id);
      if(other.id!==executive.id){
        await status(await other.api.post('/api/availability',{data:saved}),404);
        await status(await other.api.post(`/api/appointments/${saved.id}/approve`,{data:{updatedAt:saved.updatedAt}}),404);
        assert.ok(!JSON.stringify(state.activityLog).includes(saved.id));
      }
      const schedules=await status(await other.api.get('/api/executive-schedules'),200);assert.deepEqual(schedules.schedules.map(row=>row.id),[other.id]);
      await badge(other,other.baseline+(otherIndex<=index?1:0));
    }
  }
  for(const observer of [staff,manager]){
    const state=await status(await observer.get('/api/state'),200);assert.ok(requests.every(record=>state.appointments.some(row=>row.id===record.id)));
    const notices=await status(await observer.get('/api/notifications'),200);assert.ok(requests.every(record=>notices.entries.some(entry=>entry.appointmentId===record.id)));
  }
  pass('Each of the three selected executives alone receives its request and notification; other executives cannot read or approve it; staff oversight is preserved');
  for(const executive of executives){
    currentPage=executive.page;await executive.page.bringToFront();
    await executive.page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Appointments',exact:true}).click();
    for(const foreign of requests.filter(record=>record.executiveId!==executive.id))await expect(executive.page.locator('main')).not.toContainText(foreign.id);
    const before=executive.baseline+1;await status(await executive.api.post('/api/notifications/read-all',{data:{}}),200);await badge(executive,before);
    await executive.page.screenshot({path:fileURLToPath(new URL(executive.id+'-desktop.png',output)),fullPage:true});
    await executive.page.setViewportSize({width:320,height:800});await badge(executive,before,true);
    await expect.poll(()=>executive.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await executive.page.screenshot({path:fileURLToPath(new URL(executive.id+'-mobile.png',output)),fullPage:true});await executive.page.setViewportSize({width:1280,height:900});
  }
  pass('Desktop and mobile sidebar badges count only assigned pending requests and remain visible after notifications are marked read');
  const reassigned=(await status(await client.put('/api/appointments/'+requests[0].id,{data:{...requests[0],executiveId:'exec-2',startTime:'11:00'}}),200)).appointment;
  await badge(executives[0],executives[0].baseline);await badge(executives[1],executives[1].baseline+2);
  for(const route of ['/api/state','/api/notifications'])assert.ok(!JSON.stringify(await status(await executives[0].api.get(route),200)).includes(reassigned.id));
  await status(await executives[0].api.post(`/api/appointments/${reassigned.id}/approve`,{data:{updatedAt:reassigned.updatedAt}}),404);
  currentPage=executives[1].page;await currentPage.bringToFront();await currentPage.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Approval Requests',exact:true}).click();
  await currentPage.getByLabel('Search appointments',{exact:true}).fill(reassigned.id);await currentPage.getByRole('button',{name:'View',exact:true}).click();await currentPage.getByRole('button',{name:'Approve',exact:true}).click();await badge(executives[1],executives[1].baseline+1);
  currentPage=executives[2].page;await currentPage.bringToFront();await currentPage.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Approval Requests',exact:true}).click();
  await currentPage.getByLabel('Search appointments',{exact:true}).fill(requests[2].id);await currentPage.getByRole('button',{name:'View',exact:true}).click();await currentPage.getByLabel('Reason for declining').fill('Executive unavailable');await currentPage.getByRole('button',{name:'Decline',exact:true}).click();await badge(executives[2],executives[2].baseline);
  await status(await client.post(`/api/appointments/${requests[1].id}/cancel`,{data:{updatedAt:requests[1].updatedAt,reason:'Client cancellation'}}),200);await badge(executives[1],executives[1].baseline);
  pass('Reassignment removes the request and old notifications from the former executive; approval, decline and cancellation update the appropriate badge live');
  const legacyId='NTF-'+randomUUID();await admin.query('INSERT INTO notifications (id,user_id,appointment_id,event_key,occurred_at,data) VALUES (?,?,?,?,?,?)',[legacyId,'user-4',reassigned.id,'legacy-incorrect-recipient',new Date().toISOString(),JSON.stringify({appointmentId:reassigned.id,title:'Private legacy record',body:'Must remain hidden',action:'pending'})]);
  const notices=await status(await executives[2].api.get('/api/notifications'),200);assert.ok(!notices.entries.some(entry=>entry.id===legacyId));
  await status(await executives[2].api.put(`/api/notifications/${legacyId}/read`,{data:{}}),200);
  const [unread]=await admin.query('SELECT read_at FROM notifications WHERE id=?',[legacyId]);assert.equal(unread[0].read_at,null);
  await admin.query('UPDATE users SET executive_id=NULL WHERE id=?',['user-4']);
  try{
    const state=await status(await executives[2].api.get('/api/state'),200);assert.deepEqual(state.appointments,[]);assert.deepEqual(state.executives,[]);assert.deepEqual(state.activityLog,[]);
    assert.deepEqual((await status(await executives[2].api.get('/api/notifications'),200)).entries,[]);
    await status(await executives[2].api.post('/api/availability',{data:input('exec-3','13:00')}),403);
  }finally{await admin.query('UPDATE users SET executive_id=? WHERE id=?',['exec-3','user-4']);}
  assert.deepEqual(errors,[]);pass('Legacy notifications for another executive remain hidden and unread; a missing executive assignment fails closed');
  await writeFile(new URL('results.json',output),JSON.stringify({passed:true,checks,scope:'Three real executive browser sessions and API requests; disposable database; no external email'},null,2));
}catch(error){if(currentPage)await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',output)),fullPage:true}).catch(()=>{});await writeFile(new URL('results.json',output),JSON.stringify({passed:false,checks,error:error.message},null,2)).catch(()=>{});throw error;
}finally{
  if(browser)await browser.close();for(const api of apis)await api.dispose();if(server)await new Promise(resolve=>server.close(resolve));if(database)await database.close();
  if(admin){try{if(created&&/^appointment_qa_[a-f0-9]{32}$/.test(name)&&name!==originalName)await admin.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));}finally{await admin.end();}}
}
