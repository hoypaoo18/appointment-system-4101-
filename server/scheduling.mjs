import { parseDatabaseJson } from './db-json.mjs';
import { scheduleDefaults, minute, checkSchedule } from '../shared/appointment-rules.mjs';
export { scheduleDefaults, minute, checkSchedule };
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const time=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export function validateSchedule(input){
 if(!input||!Array.isArray(input.workingDays)||input.workingDays.length>7||input.workingDays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(input.workingDays).size!==input.workingDays.length)fail('Choose valid working days');
 if(!time(input.startTime)||!time(input.endTime)||minute(input.startTime)<480||minute(input.endTime)>1080||input.startTime>=input.endTime)fail('Working hours must fit within 08:00–18:00');
 if(!Number.isInteger(input.bufferMinutes)||input.bufferMinutes<0||input.bufferMinutes>120||typeof input.requireApproval!=='boolean')fail('Invalid buffer or approval setting');
 if(!Array.isArray(input.breaks)||input.breaks.length>10||input.breaks.some(b=>!b||!time(b.startTime)||!time(b.endTime)||b.startTime>=b.endTime||b.startTime<input.startTime||b.endTime>input.endTime))fail('Breaks must fit within working hours');
 if(!Array.isArray(input.unavailableDates)||input.unavailableDates.length>366||input.unavailableDates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))fail('Choose valid unavailable dates');
 return Object.fromEntries(Object.keys(scheduleDefaults).map(k=>[k,input[k]]));
}
export function schedulingStore(query,transaction,audit){
 const get=async id=>{const rows=await query('SELECT data FROM executive_schedules WHERE executive_id=?',[id]);return rows.length?{...scheduleDefaults,...parseDatabaseJson(rows[0].data)}:structuredClone(scheduleDefaults);};
 return {get,
  async list(){const execs=await query('SELECT id,name FROM executives ORDER BY id');return Promise.all(execs.map(async e=>({...e,policy:await get(e.id)})));},
  async save(id,input,user,meta){return transaction(async()=>{
   if(user.role!=='admin'&&(user.role!=='executive'||user.executiveId!==id))fail('You cannot change this executive schedule',403);
   if(!(await query('SELECT id FROM executives WHERE id=?',[id])).length)fail('Executive not found',404);
   const policy=validateSchedule(input);
   const existing=await query("SELECT data FROM appointments WHERE executive_id=? AND date>=? AND status NOT IN ('completed','cancelled') ORDER BY date,start_min",[id,new Date(Date.now()+8*3600000).toISOString().slice(0,10)]);
   let previous=null;
   for(const row of existing){const a=parseDatabaseJson(row.data);try{checkSchedule(a,policy);}catch{fail('Schedule would invalidate appointment '+a.id+'. Reschedule or cancel it first.',409);}if(previous&&previous.date===a.date&&minute(a.startTime)<minute(previous.startTime)+previous.duration+policy.bufferMinutes)fail('Buffer would conflict with existing appointments. Reschedule them first.',409);previous=a;}
   await query('INSERT INTO executive_schedules (executive_id,data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',[id,JSON.stringify(policy)]);
   await audit.record({...meta,user,action:'executive.schedule_updated',entityType:'executive',entityId:id,details:{policy}});
   return policy;
  });}
 };
}
