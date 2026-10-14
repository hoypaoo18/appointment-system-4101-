import {chromium,expect} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1217/chrome-win64/chrome.exe')});
await fs.mkdir('qa/evidence-upgrades',{recursive:true});
try{for(const role of ['admin','executive','assistant']){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.goto('http://127.0.0.1:5173/');await page.locator('input[type=email]').fill({admin:'j.alderton@meridian.com',executive:'margaret.chen@meridian.com',assistant:'sarah.mitchell@meridian.com'}[role]);await page.locator('input[type=password]').fill('MeridianDemo123!');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByRole('heading',{name:/Good morning/})).toBeVisible();
 await page.locator('nav.md\\:hidden').getByRole('button',{name:'Settings',exact:true}).click();
 if(role==='assistant')await expect(page.getByRole('heading',{name:'Executive availability',exact:true})).toHaveCount(0);
 else{await expect(page.getByRole('button',{name:'Save availability',exact:true})).toBeVisible();await expect(page.getByLabel('Executive',{exact:true}).locator('option')).toHaveCount(role==='admin'?3:1);}
 const widths=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}));if(widths.content>widths.viewport)throw Error('Settings overflow: '+role);
 await page.screenshot({path:`qa/evidence-upgrades/settings-${role}-mobile.png`,fullPage:true});await context.close();console.log('PASS: '+role+' mobile settings and role controls');
}}finally{await browser.close();}
