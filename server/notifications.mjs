import { randomUUID } from 'node:crypto';
import { smtpStatus, mailTransport, mailError } from './mail.mjs';
import { parseDatabaseJson } from './db-json.mjs';
import { businessDate } from '../shared/appointment-rules.mjs';
export const notificationDefaults = { confirmations:true, rescheduling:true, cancellations:true, reminders:false, conflicts:true };
export const emailConfigured = () => smtpStatus().configured;
export function notificationStore(query, transaction, audit = { record: async () => {} }) {
  let ticking=false;
  // Apply the current assignment to old notifications as well as newly created ones.
  const assignmentScope = "(u.role<>'executive' OR a.executive_id=u.executive_id)";
  const visibleNotifications = ' FROM notifications n JOIN users u ON u.id=n.user_id JOIN appointments a ON a.id=n.appointment_id WHERE n.user_id=? AND '+assignmentScope;
  const preferences=async userId=>{const rows=await query('SELECT data FROM notification_preferences WHERE user_id=?',[userId]);return rows.length?{...notificationDefaults,...parseDatabaseJson(rows[0].data)}:{...notificationDefaults};};
  const list=async userId=>{
    const rows=await query('SELECT n.id,n.occurred_at,n.read_at,n.data'+visibleNotifications+' ORDER BY n.occurred_at DESC,n.id DESC LIMIT 50',[userId]);
    const count=await query('SELECT COUNT(*) AS count'+visibleNotifications+' AND n.read_at IS NULL',[userId]);
    return {entries:rows.map(r=>({id:r.id,timestamp:r.occurred_at,readAt:r.read_at,...parseDatabaseJson(r.data)})),unread:Number(count[0].count),emailConfigured:emailConfigured()};
  };
  async function event(appointment, action, onlyUserId = null) {
    const key={pending:'confirmations',confirmed:'confirmations',updated:'confirmations',rescheduled:'rescheduling',cancelled:'cancellations',reminder:'reminders',conflict:'conflicts'}[action];
    if(!key)return;
    const users=await query("SELECT id,name,email,role,executive_id FROM users WHERE active=1 AND (role IN ('assistant','admin') OR (role='executive' AND executive_id=?) OR (role='client' AND id=?))",[appointment.executiveId,appointment.clientUserId||null]);
    const eventKey=`${appointment.id}:${action}:${appointment.updatedAt}`;
    const title=action==='reminder'?'Upcoming appointment reminder':`Appointment ${action}`;
    const body=`${appointment.clientName}: ${appointment.purpose}. ${appointment.date} at ${appointment.startTime} (Asia/Manila), ${appointment.duration} minutes.`;
    for(const user of users){
      if(onlyUserId && user.id!==onlyUserId)continue;
      if(!(await preferences(user.id))[key])continue;
      const id='NTF-'+randomUUID();
      const inserted=await query('INSERT IGNORE INTO notifications (id,user_id,appointment_id,event_key,occurred_at,data) VALUES (?,?,?,?,?,?)',[id,user.id,appointment.id,eventKey,new Date().toISOString(),JSON.stringify({appointmentId:appointment.id,action,title,body,version:appointment.updatedAt})]);
      if(inserted.affectedRows)await query('INSERT INTO notification_outbox (id,recipient) VALUES (?,?)',[id,user.email]);
    }
  }
  async function reminders(){
    const now=Date.now(),horizon=now+Math.max(1,Math.min(1440,Number(process.env.REMINDER_MINUTES)||60))*60000;
    await transaction(async()=>{
      const rows=await query("SELECT data FROM appointments WHERE status IN ('confirmed','rescheduled') AND date BETWEEN ? AND ?",[businessDate(now),businessDate(horizon)]);
      for(const row of rows){const a=parseDatabaseJson(row.data);const start=Date.parse(`${a.date}T${a.startTime}:00+08:00`);if(start>now&&start<=horizon)await event(a,'reminder');}
    });
  }
  const recordDelivery=async(row,status,error=null)=>{
    try{await audit.record({actorName:'Email worker',action:'email.delivery_'+status,entityType:'notification',entityId:row.id,details:{attempt:Number(row.attempts)+1,status,error}});}
    catch{console.error('Unable to record email delivery outcome in audit log');}
  };
  async function skip(row,reason){
    await query("UPDATE notification_outbox SET status='skipped',lease_until=0,last_error=? WHERE id=?",[reason,row.id]);
    await recordDelivery(row,'skipped',reason);
  }
  async function flush(){
    if(!emailConfigured())return;
    const transport=mailTransport();
    try {
    const now=Date.now();
    // A crashed worker may have submitted DATA successfully. Never resend an ambiguous delivery automatically.
    await query("UPDATE notification_outbox SET status='uncertain',lease_until=0,last_error='DELIVERY_UNCERTAIN: check provider logs before any resend' WHERE status='sending' AND lease_until<?",[now]);
    const rows=await query("SELECT o.*,n.data,n.appointment_id,n.user_id FROM notification_outbox o JOIN notifications n ON n.id=o.id WHERE o.attempts<5*(o.retry_count+1) AND ((o.status IN ('pending','failed') AND o.next_attempt<=?)) LIMIT 20",[now]);
    for(const row of rows){
      const claimed=await query("UPDATE notification_outbox SET status='sending',lease_until=?,attempts=attempts+1 WHERE id=? AND attempts<5*(retry_count+1) AND status IN ('pending','failed') AND next_attempt<=?",[Date.now()+120000,row.id,Date.now()]);
      if(!claimed.affectedRows)continue;
      let accepted=false;
      try{
        const message=parseDatabaseJson(row.data);
        const preferenceKey={pending:'confirmations',confirmed:'confirmations',updated:'confirmations',rescheduled:'rescheduling',cancelled:'cancellations',reminder:'reminders',conflict:'conflicts'}[message.action];
        const users=await query('SELECT active,role,executive_id,email FROM users WHERE id=?',[row.user_id]);
        if(!users[0]?.active||!['assistant','admin','executive','client'].includes(users[0].role)||users[0].email!==row.recipient||!(await preferences(row.user_id))[preferenceKey]){await skip(row,'RECIPIENT_OR_EVENT_INELIGIBLE');continue;}
        if(users[0].role==='executive'){
          const assigned=await query('SELECT executive_id FROM appointments WHERE id=?',[row.appointment_id]);
          if(!users[0].executive_id||!assigned.length||assigned[0].executive_id!==users[0].executive_id){await skip(row,'RECIPIENT_OR_EVENT_INELIGIBLE');continue;}
        }
        if(users[0].role==='client' && !(await query('SELECT user_id FROM client_appointments WHERE appointment_id=? AND user_id=?',[row.appointment_id,row.user_id])).length){await skip(row,'RECIPIENT_INELIGIBLE');continue;}
        if(message.action==='reminder'){
          const a=await query('SELECT status,data FROM appointments WHERE id=?',[row.appointment_id]);
          if(!a.length||['completed','cancelled'].includes(a[0].status)||parseDatabaseJson(a[0].data).updatedAt!==message.version||Date.parse(`${parseDatabaseJson(a[0].data).date}T${parseDatabaseJson(a[0].data).startTime}:00+08:00`)<=Date.now()){await skip(row,'RECIPIENT_OR_EVENT_INELIGIBLE');continue;}
        }
        await transport.sendMail({from:process.env.SMTP_FROM,to:row.recipient,subject:message.title,text:message.body,messageId:`<${row.id}@appointment.local>`});
        accepted=true;
        await query("UPDATE notification_outbox SET status='sent',sent_at=?,last_error=NULL,lease_until=0 WHERE id=?",[new Date().toISOString(),row.id]);
        await recordDelivery(row,'sent');
      }catch(error){
        const uncertain=accepted||error.command==='DATA'&&!error.responseCode;
        await query("UPDATE notification_outbox SET status=?,last_error=?,next_attempt=?,lease_until=0 WHERE id=?",[uncertain?'uncertain':'failed',uncertain?'DELIVERY_UNCERTAIN: check provider logs before any resend':mailError(error),Date.now()+60000*2**(row.attempts%5),row.id]);
        await recordDelivery(row,uncertain?'uncertain':'failed',uncertain?'DELIVERY_UNCERTAIN':mailError(error));
      }
    }
    } finally { transport.close(); }
  }
  return {
    preferences,list,event,
    async deliveries(params = new URLSearchParams()) {
      const page=Math.max(1,Math.min(100000,Math.floor(Number(params.get('page')))||1));
      const status=params.get('status')||'';
      if(status&&!['pending','sending','sent','failed','skipped','uncertain'].includes(status))throw Object.assign(new Error('Invalid delivery status'),{status:400});
      const where=status?' WHERE o.status=?':'',args=status?[status]:[];
      const entries=await query('SELECT o.*,n.occurred_at,n.data FROM notification_outbox o JOIN notifications n ON n.id=o.id'+where+' ORDER BY n.occurred_at DESC,o.id DESC LIMIT 25 OFFSET '+((page-1)*25),args);
      const count=await query('SELECT COUNT(*) AS count FROM notification_outbox o'+where,args);
      return {smtp:smtpStatus(),page,total:Number(count[0].count),entries:entries.map(({data,...row})=>({...row,title:parseDatabaseJson(data).title,retryable:row.status==='failed'&&row.attempts>=5*(row.retry_count+1)}))};
    },
    async retry(id,user,meta={}) {
      if(user?.role!=='admin')throw Object.assign(new Error('Only administrators can retry email delivery'),{status:403});
      if(!emailConfigured())throw Object.assign(new Error(smtpStatus().issues.join('; ')),{status:503});
      return transaction(async()=>{
        const updated=await query("UPDATE notification_outbox SET status='pending',retry_count=retry_count+1,next_attempt=0,lease_until=0 WHERE id=? AND status='failed' AND attempts>=5*(retry_count+1)",[id]);
        if(!updated.affectedRows)throw Object.assign(new Error('Only exhausted failed messages can be retried. Sent, queued and uncertain messages cannot be resent.'),{status:409});
        await audit.record({...meta,user,action:'email.retry_queued',entityType:'notification',entityId:id});
        return {ok:true,message:'One additional delivery cycle queued (up to five attempts).'};
      });
    },
    async conflict(user,id){await transaction(async()=>{const rows=await query('SELECT data FROM appointments WHERE id=?',[id]);if(rows.length)await event(parseDatabaseJson(rows[0].data),'conflict',user.id);});},
    async savePreferences(user,input){
      if(!input||Object.keys(notificationDefaults).some(k=>typeof input[k]!=='boolean'))throw Object.assign(new Error('Provide all notification preferences as true or false'),{status:400});
      const data=Object.fromEntries(Object.keys(notificationDefaults).map(k=>[k,input[k]]));
      await query('INSERT INTO notification_preferences VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',[user.id,JSON.stringify(data)]);return data;
    },
    async read(userId,id){await query('UPDATE notifications n JOIN users u ON u.id=n.user_id JOIN appointments a ON a.id=n.appointment_id SET n.read_at=COALESCE(n.read_at,?) WHERE n.user_id=? AND '+assignmentScope+(id?' AND n.id=?':''),[new Date().toISOString(),userId,...(id?[id]:[])]);return list(userId);},
    async tick(){if(ticking)return;ticking=true;try{await reminders();await flush();}finally{ticking=false;}}
  };
}
