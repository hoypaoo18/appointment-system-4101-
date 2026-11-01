import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { chromium, expect, request } from '@playwright/test';
import { openDatabase, today } from '../server/database.mjs';
import { webHandler } from '../server/web-handler.mjs';
import { navigationForRole, mobileNavigationForRole, pageTitle } from '../shared/navigation.mjs';
import { scheduleDefaults } from '../shared/appointment-rules.mjs';

const originalName=process.env.DB_NAME, name='appointment_qa_'+randomUUID().replaceAll('-','');
assert.match(name,/^appointment_qa_[a-f0-9]{32}$/);assert.notEqual(name,originalName);
const config={host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT)||3306,user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',connectTimeout:5000};
process.env.APP_ENV='test';process.env.NODE_ENV='development';process.env.DB_NAME=name;
process.env.REQUIRE_CLIENT_EMAIL_VERIFICATION='false';process.env.NOTIFICATION_INTERVAL_MS='3600000';
for(const key of ['SMTP_HOST','SMTP_FROM','SMTP_USER','SMTP_PASSWORD'])delete process.env[key];
const output=new URL('./evidence-navigation/',import.meta.url),checks=[],apis=[];
const pass=message=>{checks.push(message);console.log('PASS: '+message);};
const client={name:'Navigation Client',email:'navigation-client@example.test',password:'NavigationClientPass123!',organization:'Synthetic QA',phone:'09171234567'};
const accounts=[{role:'client',email:client.email,password:client.password},{role:'assistant',email:'sarah.mitchell@meridian.com',password:'MeridianDemo123!'},{role:'executive',email:'margaret.chen@meridian.com',password:'MeridianDemo123!'},{role:'admin',email:'j.alderton@meridian.com',password:'MeridianDemo123!'}];
const future=new Date(Date.parse(today()+'T00:00:00Z')+14*86400000).toISOString().slice(0,10);
let admin,database,server,browser,currentPage,created=false;
const status=async(response,expected)=>{const data=await response.json();assert.equal(response.status(),expected,JSON.stringify(data));return data;};
try{
  await mkdir(output,{recursive:true});admin=await mysql.createConnection(config);
  const [existing]=await admin.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[name]);assert.equal(existing.length,0);
  created=true;database=await openDatabase({database:name});
  server=createServer(webHandler(database,fileURLToPath(new URL('../dist/',import.meta.url))));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const baseURL='http://127.0.0.1:'+server.address().port;
  const roleApis={};let clientId;
  for(const account of accounts){
    const api=await request.newContext({baseURL});apis.push(api);roleApis[account.role]=api;
    const data=await status(await api.post(account.role==='client'?'/api/auth/register':'/api/auth/login',{data:account.role==='client'?client:{email:account.email,password:account.password}}),account.role==='client'?201:200);
    if(account.role==='client')clientId=data.user.id;
  }
  const input=(executiveId,purpose)=>({clientName:client.name,clientEmail:client.email,clientOrg:client.organization,clientPhone:client.phone,executiveId,date:future,startTime:'10:00',duration:30,purpose,notes:'Navigation QA fixture'});
  const own=(await status(await roleApis.client.post('/api/appointments',{data:input('exec-1','Navigation own approval')}),201)).appointment;
  const foreign=(await status(await roleApis.client.post('/api/appointments',{data:input('exec-2','Navigation other approval')}),201)).appointment;
  for(const account of accounts){
    const api=roleApis[account.role],isAdmin=account.role==='admin';
    await status(await api.get('/api/audit-logs'),isAdmin?200:403);
    await status(await api.put('/api/users/'+clientId+'/active',{data:{active:'invalid'}}),isAdmin?400:403);
    await status(await api.put('/api/executive-schedules/exec-2',{data:structuredClone(scheduleDefaults)}),isAdmin?200:403);
    if(['admin','executive'].includes(account.role))await status(await api.post('/api/appointments',{data:input('exec-3','Forbidden creation')}),403);
    if(['client','assistant'].includes(account.role))await status(await api.post(`/api/appointments/${own.id}/approve`,{data:{updatedAt:own.updatedAt}}),403);
    if(account.role==='client')await status(await api.post(`/api/appointments/${own.id}/complete`,{data:{updatedAt:own.updatedAt}}),403);
    if(account.role==='executive')await status(await api.post(`/api/appointments/${foreign.id}/approve`,{data:{updatedAt:foreign.updatedAt}}),404);
    const state=await status(await api.get('/api/state'),200);assert.equal(state.users.length>0,isAdmin);
  }
  pass('Direct API requests retain role restrictions for user management, audit, availability, booking creation, completion and approval');
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'chrome'})});
  for(const account of accounts){
    const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];
    const page=await context.newPage();currentPage=page;page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
    await page.goto(baseURL);await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign In',exact:true}).click();
    const nav=page.getByRole('navigation',{name:'Main navigation',exact:true}),groups=navigationForRole(account.role),items=groups.flatMap(group=>group.items);
    await expect(nav).toBeVisible();
    assert.deepEqual(await nav.getByRole('button').evaluateAll(buttons=>buttons.map(button=>button.querySelector('span')?.textContent)),items.map(entry=>entry.label));
    for(const restricted of account.role==='client'||account.role==='assistant'?['Approval Requests','Executive Availability','My Availability','User Management','System History']:account.role==='executive'?['User Management','System History','Executive Availability']:['My Availability'])await expect(nav.getByRole('button',{name:restricted,exact:true})).toHaveCount(0);
    await expect(page.locator('header').getByRole('button',{name:'New Appointment',exact:true})).toHaveCount(['client','assistant'].includes(account.role)?1:0);
    await page.screenshot({path:fileURLToPath(new URL(account.role+'-desktop.png',output)),fullPage:true});
    for(const entry of items){
      await nav.getByRole('button',{name:entry.label,exact:true}).click();await expect(page.locator('main h1')).toHaveText(entry.id==='dashboard'?/Good morning/:pageTitle(account.role,entry.id));
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);await expect(nav.getByRole('button',{name:entry.label,exact:true})).toHaveAttribute('aria-current','page');
      if(entry.id==='settings'){
        await expect(page.getByRole('navigation',{name:'Settings sections'}).getByRole('button',{name:'Availability',exact:true})).toHaveCount(0);
        await expect(page.locator('main').getByRole('heading',{name:'User Management',exact:true})).toHaveCount(0);
      }
      if(entry.id==='availability')await expect(page.getByLabel('Executive',{exact:true}).locator('option')).toHaveCount(account.role==='admin'?3:1);
      if(entry.id==='approvals'){
        await expect(page.locator('main')).toContainText(account.role==='executive'?'Navigation own approval':'Navigation other approval');
        if(account.role==='executive')await expect(page.locator('main')).not.toContainText('Navigation other approval');
        const id=account.role==='executive'?own.id:foreign.id;
        await page.getByLabel('Search appointments',{exact:true}).fill(id);await page.getByRole('button',{name:'View',exact:true}).click();
        await expect(nav.getByRole('button',{name:entry.label,exact:true})).toHaveAttribute('aria-current','page');
        await page.getByRole('button',{name:'Approve',exact:true}).click();await expect(page.getByRole('heading',{name:'Approval required',exact:true})).toHaveCount(0);
        await page.getByRole('button',{name:'Go back',exact:true}).click();await expect(page.locator('main h1')).toHaveText('Approval Requests');
        await expect(page.locator('main table')).not.toContainText(id);
      }
      if(entry.id==='users'){
        const row=page.getByRole('row').filter({hasText:client.name});
        await row.getByRole('button',{name:'Deactivate',exact:true}).click();await expect(row.getByRole('button',{name:'Activate',exact:true})).toBeVisible();
        await row.getByRole('button',{name:'Activate',exact:true}).click();await expect(row.getByRole('button',{name:'Deactivate',exact:true})).toBeVisible();
        const self=page.getByRole('row').filter({hasText:'James Alderton'});await expect(self.getByRole('button',{name:'Deactivate',exact:true})).toBeDisabled();
      }
    }
    await nav.getByRole('button',{name:'Dashboard',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('main h1')).toContainText('Good morning');
    const mobile=mobileNavigationForRole(account.role);
    for(const width of [390,320]){
      await page.setViewportSize({width,height:800});const bar=page.getByRole('navigation',{name:'Mobile navigation',exact:true});await expect(bar).toBeVisible();await expect(nav).not.toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const entry of mobile.primary){await bar.getByRole('button',{name:entry.label,exact:true}).click();await expect(page.locator('main h1')).toHaveText(entry.id==='dashboard'?/Good morning/:pageTitle(account.role,entry.id));}
      if(mobile.overflow.length){
        const more=bar.getByRole('button',{name:'More navigation',exact:true});await more.click();await expect(page.getByRole('dialog',{name:'More navigation',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(more).toBeFocused();
        for(const entry of mobile.overflow.flatMap(group=>group.items)){
          await more.click();const menu=page.getByRole('navigation',{name:'More navigation items',exact:true});
          assert.deepEqual(await menu.getByRole('button').allTextContents(),mobile.overflow.flatMap(group=>group.items).map(item=>item.label));
          await menu.getByRole('button',{name:entry.label,exact:true}).click();await expect(page.getByRole('dialog',{name:'More navigation',exact:true})).toHaveCount(0);
          await expect(page.locator('main h1')).toHaveText(pageTitle(account.role,entry.id));await expect(more).toHaveAttribute('aria-current','page');
        }
        await more.click();await page.screenshot({path:fileURLToPath(new URL(account.role+'-mobile-'+width+'.png',output)),fullPage:true});
        await page.setViewportSize({width:1440,height:960});await expect(page.getByRole('dialog',{name:'More navigation',exact:true})).toHaveCount(0);await page.setViewportSize({width,height:800});
      }else await page.screenshot({path:fileURLToPath(new URL(account.role+'-mobile-'+width+'.png',output)),fullPage:true});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    if(mobile.overflow.length){await page.getByRole('button',{name:'More navigation',exact:true}).click();await page.getByRole('dialog',{name:'More navigation',exact:true}).getByRole('button',{name:'Sign Out',exact:true}).click();}
    else{await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('button',{name:'Settings',exact:true}).click();await page.locator('main').getByRole('button',{name:'Sign Out',exact:true}).click();}
    await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();assert.deepEqual(errors,[]);
    await context.close();currentPage=null;pass(account.role+': all desktop/mobile destinations, selected states, keyboard navigation, page scope and sign-out work');
  }
  await writeFile(new URL('results.json',output),JSON.stringify({passed:true,checks,scope:'Four real role logins, browser navigation and API authorization; disposable database only'},null,2));
}catch(error){
  if(currentPage){
    const layout=await currentPage.evaluate(()=>({
      width:innerWidth,content:document.documentElement.scrollWidth,
      overflow:[...document.querySelectorAll('body *')].filter(element=>{
        const box=element.getBoundingClientRect();
        return box.width&&box.right>innerWidth+1&&!element.closest('.app-sidebar');
      }).slice(0,12).map(element=>({tag:element.tagName,class:element.className,right:element.getBoundingClientRect().right,text:element.textContent?.slice(0,60)})),
    })).catch(()=>({}));
    console.log(JSON.stringify(layout));
  }
  if(currentPage)await currentPage.screenshot({path:fileURLToPath(new URL('failure.png',output)),fullPage:true}).catch(()=>{});
  await writeFile(new URL('results.json',output),JSON.stringify({passed:false,checks,error:error.message},null,2)).catch(()=>{});throw error;
}finally{
  if(browser)await browser.close();for(const api of apis)await api.dispose();if(server)await new Promise(resolve=>server.close(resolve));if(database)await database.close();
  if(admin){try{if(created&&/^appointment_qa_[a-f0-9]{32}$/.test(name)&&name!==originalName)await admin.query('DROP DATABASE IF EXISTS '+mysql.escapeId(name));}finally{await admin.end();}}
}
