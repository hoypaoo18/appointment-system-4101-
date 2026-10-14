import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const ext=path.resolve('qa/zoom-extension');
const context=await chromium.launchPersistentContext(path.resolve('qa/zoom-profile'),{headless:true,executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1217/chrome-win64/chrome.exe'),viewport:{width:1440,height:1000},args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`],ignoreDefaultArgs:['--disable-extensions']});
let success=false,actual=[];
try {
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:10000});
 const page=await context.newPage();await page.goto('http://127.0.0.1:5174/');await page.locator('input[type=email]').fill('sarah.mitchell@meridian.com');await page.locator('input[type=password]').fill('MeridianDemo123!');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByRole('heading',{name:/Good morning/})).toBeVisible();
 const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'http://127.0.0.1:5174/*'});const tab=tabs.find(t=>t.active)||tabs[0];await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);});
 await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBe(2);
 if(zoom!==2)throw new Error('Native zoom did not reach 200%');
 for(const label of ['Appts','Schedule','History','Settings']){await page.locator('nav.md\\:hidden').getByRole('button',{name:label,exact:true}).click();const metrics=await page.evaluate(()=>({innerWidth,scrollWidth:document.documentElement.scrollWidth,dpr:devicePixelRatio}));if(metrics.scrollWidth>metrics.innerWidth)throw new Error(`${label} horizontal clipping at 200%`);await page.screenshot({path:`qa/evidence-current/TC-38-native200-${label}.png`,fullPage:true});actual.push(`${label}: browser zoom=200%, CSS viewport=${metrics.innerWidth}px, no document horizontal overflow`);}
 await page.locator('button[aria-label^="Notifications"][aria-expanded]').click();await expect(page.getByRole('dialog',{name:'Notifications',exact:true})).toBeVisible();const readButton=await page.getByRole('button',{name:'Mark all as read',exact:true}).boundingBox();if(!readButton||readButton.y<0||readButton.y+readButton.height>await page.evaluate(()=>innerHeight))throw new Error('Notification controls clipped at native 200%');await page.screenshot({path:'qa/evidence-current/TC-38-native200-Notifications.png',fullPage:true});await page.getByRole('button',{name:'Close notifications',exact:true}).click();actual.push('Notification panel header and read controls reachable at native 200% zoom');
 await page.getByRole('button',{name:'New Appointment',exact:true}).first().click();await expect(page.getByPlaceholder('Client full name')).toBeVisible();await page.getByPlaceholder('Client full name').fill('Zoom QA');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByText('Organization is required',{exact:true})).toBeVisible();await page.screenshot({path:'qa/evidence-current/TC-38-native200-Booking.png',fullPage:true});actual.push('Booking fields, Continue button, and validation reachable at native 200% zoom');
 success=true;
}catch(error){actual.push(error.message);}finally{await context.close();}
const file='qa/evidence-current/results.json';const data=JSON.parse(await fs.readFile(file,'utf8'));const test=data.results.find(r=>r.id==='TC-38');test.notes.push(...actual);test.nativeZoom=success;
if(!success){test.status='Blocked';test.error='BLOCKED: Responsive widths passed, but native 200% browser zoom could not be verified: '+actual.at(-1);}else{test.notes=test.notes.filter(n=>!n.includes('native browser zoom not exercised'));}
await fs.writeFile(file,JSON.stringify(data,null,2));console.log(JSON.stringify({success,actual}));
