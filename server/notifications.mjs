import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { parseDatabaseJson } from './db-json.mjs';
export const notificationDefaults = { confirmations:true, rescheduling:true, cancellations:true, reminders:false, conflicts:true };
export const emailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
export function notificationStore(query, transaction) {
  let ticking=false;
  const preferences=async userId=>{const rows=await query('SELECT data FROM notification_preferences WHERE user_id=?',[userId]);return rows.length?{...notificationDefaults,...parseDatabaseJson(rows[0].data)}:{...notificationDefaults};};
  const list=async userId=>{
    const rows=await query('SELECT id,occurred_at,read_at,data FROM notifications WHERE user_id=? ORDER BY occurred_at DESC,id DESC LIMIT 50',[userId]);
    const count=await query('SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL',[userId]);
    return {entries:rows.map(r=>({id:r.id,timestamp:r.occurred_at,readAt:r.read_at,...parseDatabaseJson(r.data)})),unread:Number(count[0].count),emailConfigured:emailConfigured()};
  };
  async function event(appointment, action, onlyUserId = null) {
    const key={pending:'confirmations',confirmed:'confirmations',updated:'confirmations',rescheduled:'rescheduling',cancelled:'cancellations',reminder:'reminders',conflict:'conflicts'}[action];
    if(!key)return;
    const users=await query("SELECT id,name,email,role,executive_id FROM users WHERE active=1 AND (role IN ('assistant','admin') OR executive_id=?)",[appointment.executiveId]);
    const eventKey=`${appointment.id}:${action}:${appointment.updatedAt}`;
    const title=action==='reminder'?'Upcoming appointment reminder':`Appointment ${action}`;
    const body=`${appointment.clientName}: ${appointment.purpose}. ${appointment.date} at ${appointment.startTime} (Asia/Manila), ${appointment.duration} minutes.`;
    for(const user of users){
      if(onlyUserId && user.id!==onlyUserId)continue;
      if(!(await preferences(user.id))[key])continue;
      const id='NTF-'+randomUUID();
      const inserted=await query('INSERT IGNORE INTO notifications (id,user_id,appointment_id,event_key,occurred_at,data) VALUES (?,?,?,?,?,?)',[id,user.id,appointment.id,eventKey,new Date().toISOString(),JSON.stringify({appointmentId:appointment.id,action,title,body,version:appointment.updatedAt})]);
      if(inserted.affectedRows&&emailConfigured())await query('INSERT INTO notification_outbox (id,recipient) VALUES (?,?)',[id,user.email]);
    }
  }
  async function reminders(){
    const now=Date.now(),horizon=now+Math.max(1,Math.min(1440,Number(process.env.REMINDER_MINUTES)||60))*60000;
    await transaction(async()=>{
      const rows=await query("SELECT data FROM appointments WHERE status IN ('confirmed','rescheduled') AND date BETWEEN ? AND ?",[new Date(now+8*3600000).toISOString().slice(0,10),new Date(horizon+8*3600000).toISOString().slice(0,10)]);
      for(const row of rows){const a=parseDatabaseJson(row.data);const start=Date.parse(`${a.date}T${a.startTime}:00+08:00`);if(start>now&&start<=horizon)await event(a,'reminder');}
    });
  }
  async function flush(){
    if(!emailConfigured())return;
    const host=process.env.SMTP_HOST,local=['127.0.0.1','localhost','::1'].includes(host),port=Number(process.env.SMTP_PORT)||587;
    const transport=nodemailer.createTransport({host,port,secure:port===465||process.env.SMTP_SECURE==='true',requireTLS:!local,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
    const now=Date.now();
    const rows=await query("SELECT o.*,n.data,n.appointment_id,n.user_id FROM notification_outbox o JOIN notifications n ON n.id=o.id WHERE o.attempts<5 AND ((o.status IN ('pending','failed') AND o.next_attempt<=?) OR (o.status='sending' AND o.lease_until<?)) LIMIT 20",[now,now]);
    for(const row of rows){
      const claimed=await query("UPDATE notification_outbox SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND ((status IN ('pending','failed') AND next_attempt<=?) OR (status='sending' AND lease_until<?))",[now+60000,row.id,now,now]);
      if(!claimed.affectedRows)continue;
      try{
        const message=parseDatabaseJson(row.data);
        const preferenceKey={pending:'confirmations',confirmed:'confirmations',updated:'confirmations',rescheduled:'rescheduling',cancelled:'cancellations',reminder:'reminders',conflict:'conflicts'}[message.action];
        const users=await query('SELECT active FROM users WHERE id=?',[row.user_id]);
        if(!users[0]?.active||!(await preferences(row.user_id))[preferenceKey]){await query("UPDATE notification_outbox SET status='skipped' WHERE id=?",[row.id]);continue;}
        if(message.action==='reminder'){
          const a=await query('SELECT status,data FROM appointments WHERE id=?',[row.appointment_id]);
          if(!a.length||['completed','cancelled'].includes(a[0].status)||parseDatabaseJson(a[0].data).updatedAt!==message.version){await query("UPDATE notification_outbox SET status='skipped' WHERE id=?",[row.id]);continue;}
        }
        await transport.sendMail({from:process.env.SMTP_FROM,to:row.recipient,subject:message.title,text:message.body,messageId:`<${row.id}@appointment.local>`});
        await query("UPDATE notification_outbox SET status='sent',sent_at=?,last_error=NULL WHERE id=?",[new Date().toISOString(),row.id]);
      }catch(error){await query("UPDATE notification_outbox SET status='failed',last_error=?,next_attempt=? WHERE id=?",[String(error.code||'SMTP_ERROR').slice(0,100),Date.now()+60000*2**row.attempts,row.id]);}
    }
    transport.close();
  }
  return {
    preferences,list,event,
    async conflict(user,id){await transaction(async()=>{const rows=await query('SELECT data FROM appointments WHERE id=?',[id]);if(rows.length)await event(parseDatabaseJson(rows[0].data),'conflict',user.id);});},
    async savePreferences(user,input){
      if(!input||Object.keys(notificationDefaults).some(k=>typeof input[k]!=='boolean'))throw Object.assign(new Error('Provide all notification preferences as true or false'),{status:400});
      const data=Object.fromEntries(Object.keys(notificationDefaults).map(k=>[k,input[k]]));
      await query('INSERT INTO notification_preferences VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',[user.id,JSON.stringify(data)]);return data;
    },
    async read(userId,id){await query('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE user_id=?'+(id?' AND id=?':''),[new Date().toISOString(),userId,...(id?[id]:[])]);return list(userId);},
    async tick(){if(ticking)return;ticking=true;try{await reminders();await flush();}finally{ticking=false;}}
  };
}
