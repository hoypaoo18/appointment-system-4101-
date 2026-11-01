import test from 'node:test';
import assert from 'node:assert/strict';
import { smtpStatus, mailError } from '../server/mail.mjs';
import { notificationStore } from '../server/notifications.mjs';
import nodemailer from 'nodemailer';

test('SMTP validation rejects templates, partial authentication, invalid ports and unsafe senders without exposing secrets',()=>{
  const valid={SMTP_HOST:'smtp.provider.test',SMTP_PORT:'587',SMTP_SECURE:'false',SMTP_USER:'sender',SMTP_PASSWORD:'secret-value',SMTP_FROM:'Meridian <office@provider.test>'};
  assert.equal(smtpStatus(valid).configured,true);
  for(const overrides of [{SMTP_HOST:'your-provider-smtp-host'},{SMTP_USER:'your-sending-email'},{SMTP_PASSWORD:'your-smtp-password'},{SMTP_FROM:'Meridian <your-sending-email>'},{SMTP_PORT:'0'},{SMTP_PORT:'Infinity'},{SMTP_SECURE:'yes'},{SMTP_PASSWORD:''},{SMTP_FROM:'office@provider.test\r\nBcc: other@provider.test'}]){
    const result=smtpStatus({...valid,...overrides});assert.equal(result.configured,false,JSON.stringify(overrides));assert.ok(result.issues.length);assert.ok(!JSON.stringify(result).includes('secret-value'));
  }
  assert.equal(smtpStatus({SMTP_HOST:'127.0.0.1',SMTP_PORT:'2525',SMTP_FROM:'qa@example.test'}).configured,true);
  assert.ok(!mailError({code:'EAUTH',message:'provider echoed secret-value'}).includes('secret-value'));
});

test('Notification retry service rejects non-administrators before touching SMTP or the database',async()=>{
  let queries=0;
  const store=notificationStore(async()=>{queries++;},async fn=>fn());
  for(const role of ['client','assistant','executive',undefined])await assert.rejects(store.retry('notification',{role}),error=>error.status===403);
  assert.equal(queries,0);
});

test('Lost SMTP acknowledgements and failed post-send persistence are held as uncertain instead of automatically resent',async()=>{
  const originalTransport=nodemailer.createTransport;
  const env=Object.fromEntries(['SMTP_HOST','SMTP_FROM','SMTP_USER','SMTP_PASSWORD','SMTP_PORT','SMTP_SECURE'].map(key=>[key,process.env[key]]));
  for(const key of Object.keys(env))delete process.env[key];
  process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_FROM='qa@example.test';
  try{
    for(const scenario of ['lost-ack','persistence-failed']){
      let state='pending',sends=0,closed=0;
      const row={id:'synthetic',recipient:'recipient@example.test',user_id:'admin',appointment_id:'appointment',attempts:0,data:JSON.stringify({action:'pending',title:'Synthetic',body:'Local test'})};
      nodemailer.createTransport=()=>({close:()=>closed++,sendMail:async()=>{sends++;if(scenario==='lost-ack')throw Object.assign(new Error('private provider response'),{command:'DATA',code:'ETIMEDOUT'});return {};}});
      const query=async(sql,params=[])=>{
        if(sql.startsWith('SELECT data FROM appointments WHERE status'))return [];
        if(sql.includes("SET status='uncertain'"))return {affectedRows:0};
        if(sql.startsWith('SELECT o.*,n.data'))return state==='pending'?[row]:[];
        if(sql.includes("SET status='sending'")){state='sending';return {affectedRows:1};}
        if(sql.startsWith('SELECT active,role,executive_id,email'))return [{active:1,role:'admin',email:row.recipient}];
        if(sql.startsWith('SELECT data FROM notification_preferences'))return [];
        if(sql.includes("SET status='sent'"))throw new Error('Database temporarily unavailable');
        if(sql.includes('SET status=?')){state=params[0];assert.ok(!params[1].includes('private'));return {affectedRows:1};}
        throw Error('Unexpected database operation: '+sql);
      };
      const store=notificationStore(query,async fn=>fn());await store.tick();await store.tick();
      assert.equal(state,'uncertain');assert.equal(sends,1);assert.equal(closed,2);
    }
  }finally{
    nodemailer.createTransport=originalTransport;
    for(const [key,value]of Object.entries(env))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});

test('A queued reminder is skipped after its appointment has started even when its version is unchanged',async()=>{
  const originalTransport=nodemailer.createTransport;
  const env=Object.fromEntries(['SMTP_HOST','SMTP_FROM','SMTP_USER','SMTP_PASSWORD','SMTP_PORT','SMTP_SECURE'].map(key=>[key,process.env[key]]));
  for(const key of Object.keys(env))delete process.env[key];
  process.env.SMTP_HOST='127.0.0.1';process.env.SMTP_FROM='qa@example.test';
  let sends=0,skipped=false;
  nodemailer.createTransport=()=>({close:()=>{},sendMail:async()=>{sends++;}});
  try{
    const appointment={date:'2020-01-01',startTime:'08:00',updatedAt:'unchanged'};
    const row={id:'expired-reminder',user_id:'admin',appointment_id:'past-appointment',recipient:'recipient@example.test',attempts:0,data:JSON.stringify({action:'reminder',version:'unchanged'})};
    const query=async sql=>{
      if(sql.startsWith('SELECT data FROM appointments WHERE status'))return [];
      if(sql.includes("SET status='uncertain'"))return {affectedRows:0};
      if(sql.startsWith('SELECT o.*,n.data'))return [row];
      if(sql.includes("SET status='sending'"))return {affectedRows:1};
      if(sql.startsWith('SELECT active,role,executive_id,email'))return [{active:1,role:'admin',email:row.recipient}];
      if(sql.startsWith('SELECT data FROM notification_preferences'))return [{data:JSON.stringify({reminders:true})}];
      if(sql.startsWith('SELECT status,data FROM appointments'))return [{status:'confirmed',data:JSON.stringify(appointment)}];
      if(sql.includes("SET status='skipped'")){skipped=true;return {affectedRows:1};}
      throw Error('Unexpected database operation: '+sql);
    };
    await notificationStore(query,async fn=>fn()).tick();assert.equal(sends,0);assert.equal(skipped,true);
  }finally{
    nodemailer.createTransport=originalTransport;
    for(const [key,value]of Object.entries(env))value===undefined?delete process.env[key]:process.env[key]=value;
  }
});
