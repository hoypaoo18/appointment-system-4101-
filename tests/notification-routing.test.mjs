import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { notificationStore } from '../server/notifications.mjs';

test('Queued executive email is skipped after reassignment or a missing assignment; authorized recipients still receive it',async()=>{
  const originalTransport=nodemailer.createTransport;
  const originalEnv={SMTP_HOST:process.env.SMTP_HOST,SMTP_FROM:process.env.SMTP_FROM};
  const sent=[];
  nodemailer.createTransport=()=>({sendMail:async message=>sent.push(message),close:()=>{}});
  process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_FROM='office@example.test';
  try{
    for(const scenario of [
      {role:'executive',executiveId:'exec-1',assigned:'exec-2',expected:'skipped'},
      {role:'executive',executiveId:null,assigned:'exec-1',expected:'skipped'},
      {role:'executive',executiveId:'exec-1',assigned:'exec-1',expected:'sent'},
      {role:'admin',executiveId:null,assigned:'exec-1',expected:'sent'},
    ]){
      const statuses=[],before=sent.length;
      const row={id:'notification',user_id:'recipient',appointment_id:'appointment',recipient:'recipient@example.test',attempts:0,data:JSON.stringify({action:'pending',title:'Appointment pending',body:'Synthetic request'})};
      const query=async(sql)=>{
        if(sql.startsWith('SELECT data FROM appointments WHERE status'))return [];
        if(sql.startsWith('SELECT o.*,n.data'))return [row];
        if(sql.startsWith("UPDATE notification_outbox SET status='sending'"))return {affectedRows:1};
        if(sql.startsWith('SELECT active,role,executive_id,email FROM users'))return [{active:1,email:row.recipient,role:scenario.role,executive_id:scenario.executiveId}];
        if(sql.startsWith('SELECT data FROM notification_preferences'))return [];
        if(sql.startsWith('SELECT executive_id FROM appointments'))return [{executive_id:scenario.assigned}];
        if(sql.includes("SET status='uncertain'"))return {affectedRows:0};
        if(sql.startsWith('UPDATE notification_outbox SET status=')){statuses.push(/status='(\w+)'/.exec(sql)[1]);return {affectedRows:1};}
        throw Error('Unexpected database operation');
      };
      await notificationStore(query,async fn=>fn()).tick();
      assert.deepEqual(statuses,[scenario.expected]);
      assert.equal(sent.length-before,scenario.expected==='sent'?1:0);
    }
  }finally{
    nodemailer.createTransport=originalTransport;
    for(const [key,value]of Object.entries(originalEnv))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});
