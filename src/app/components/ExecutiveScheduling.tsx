import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Trash2 } from 'lucide-react';
type Policy={workingDays:number[];startTime:string;endTime:string;bufferMinutes:number;requireApproval:boolean;breaks:{startTime:string;endTime:string}[];unavailableDates:string[]};
type Schedule={id:string;name:string;policy:Policy};
export function ExecutiveScheduling({user}:{user:{role:string;executiveId?:string|null}}){
 const [rows,setRows]=useState<Schedule[]>([]),[selected,setSelected]=useState(''),[policy,setPolicy]=useState<Policy|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{const r=await fetch('/api/executive-schedules');const d=await r.json();if(!r.ok)throw Error(d.error);const rows:Schedule[]=d.schedules.filter((s:Schedule)=>user.role==='admin'||s.id===user.executiveId);setRows(rows);if(rows[0]){setSelected(rows[0].id);setPolicy(rows[0].policy);}setError('');}catch{setError('Unable to load schedules.');}}
 useEffect(()=>{void load();},[user.role,user.executiveId]);
 if(!['executive','admin'].includes(user.role))return null;
 const field='ui-input border border-slate-200 rounded-lg px-3 py-2 text-sm w-full';
 async function save(){setBusy(true);try{const r=await fetch('/api/executive-schedules/'+selected,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(policy)});const d=await r.json();if(!r.ok)throw Error(d.error);setRows(rows.map(s=>s.id===selected?{...s,policy:d.policy}:s));setPolicy(d.policy);toast.success('Executive schedule saved');}catch(e){toast.error(e instanceof Error?e.message:'Unable to save');}finally{setBusy(false);}}
 return <section className="availability-panel ui-surface">
  <div className="section-card-header"><CalendarDays className="w-4 h-4 text-blue-600"/><div><h2>Executive availability</h2><p>Manage working hours, breaks and unavailable dates.</p></div></div>
  {error&&<p role="alert" className="panel-message">{error} <button className="underline" onClick={()=>void load()}>Retry</button></p>}
  {!error&&!policy&&<p role="status" className="panel-message">Loading schedules…</p>}
  {policy&&<fieldset disabled={busy} className="availability-form">
   <div className="availability-basics">
    <label className="availability-executive">Executive<select aria-label="Executive" className={field} value={selected} onChange={e=>{setSelected(e.target.value);setPolicy(rows.find(s=>s.id===e.target.value)!.policy);}}>{rows.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <p className="availability-timezone">All times use Asia/Manila.</p>
   </div>
   <div className="availability-section">
    <p className="field-group-title">Working days</p>
    <div className="availability-days">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><label key={d}><input type="checkbox" checked={policy.workingDays.includes(i)} onChange={e=>setPolicy({...policy,workingDays:e.target.checked?[...policy.workingDays,i]:policy.workingDays.filter(v=>v!==i)})}/><span>{d}</span></label>)}</div>
   </div>
   <div className="availability-hours">
    <label>Start time<input className={field} type="time" value={policy.startTime} onChange={e=>setPolicy({...policy,startTime:e.target.value})}/></label>
    <label>End time<input className={field} type="time" value={policy.endTime} onChange={e=>setPolicy({...policy,endTime:e.target.value})}/></label>
    <label>Buffer (minutes)<input className={field} type="number" min={0} max={120} value={policy.bufferMinutes} onChange={e=>setPolicy({...policy,bufferMinutes:Number(e.target.value)})}/></label>
   </div>
   <label className="approval-option"><input type="checkbox" checked={policy.requireApproval} onChange={e=>setPolicy({...policy,requireApproval:e.target.checked})}/><span><strong>Require executive approval</strong><span>New and rescheduled appointments remain pending until approved.</span></span></label>
   <div className="availability-exceptions">
    <section className="availability-exception">
     <div className="exception-heading"><h3>Daily breaks</h3><span>{policy.breaks.length}</span></div>
     {!policy.breaks.length&&<p className="exception-empty">No daily breaks added.</p>}
     <div className="exception-rows">{policy.breaks.map((b,i)=><div key={i} className="break-row">
      <label>Start<input aria-label={'Break '+(i+1)+' start'} className={field} type="time" value={b.startTime} onChange={e=>setPolicy({...policy,breaks:policy.breaks.map((v,n)=>n===i?{...v,startTime:e.target.value}:v)})}/></label>
      <label>End<input aria-label={'Break '+(i+1)+' end'} className={field} type="time" value={b.endTime} onChange={e=>setPolicy({...policy,breaks:policy.breaks.map((v,n)=>n===i?{...v,endTime:e.target.value}:v)})}/></label>
      <button className="exception-remove" type="button" aria-label={'Remove break '+(i+1)} onClick={()=>setPolicy({...policy,breaks:policy.breaks.filter((_,n)=>n!==i)})}><Trash2 className="w-4 h-4"/></button>
     </div>)}</div>
     <button className="exception-add" type="button" disabled={policy.breaks.length>=10} onClick={()=>setPolicy({...policy,breaks:[...policy.breaks,{startTime:'12:00',endTime:'13:00'}]})}>+ Add break</button>
    </section>
    <section className="availability-exception">
     <div className="exception-heading"><h3>Unavailable dates</h3><span>{policy.unavailableDates.length}</span></div>
     {!policy.unavailableDates.length&&<p className="exception-empty">Add leave dates or holidays.</p>}
     <div className="exception-rows">{policy.unavailableDates.map((d,i)=><div className="date-row" key={i}>
      <label>Date<input className={field} aria-label={'Unavailable date '+(i+1)} type="date" value={d} onChange={e=>setPolicy({...policy,unavailableDates:policy.unavailableDates.map((v,n)=>n===i?e.target.value:v)})}/></label>
      <button className="exception-remove" type="button" aria-label={'Remove unavailable date '+(i+1)} onClick={()=>setPolicy({...policy,unavailableDates:policy.unavailableDates.filter((_,n)=>n!==i)})}><Trash2 className="w-4 h-4"/></button>
     </div>)}</div>
     <button className="exception-add" type="button" disabled={policy.unavailableDates.length>=366} onClick={()=>setPolicy({...policy,unavailableDates:[...policy.unavailableDates,'']})}>+ Add date</button>
    </section>
   </div>
   <div className="availability-footer"><p>Existing bookings must still fit the new schedule.</p><button onClick={()=>void save()} className="ui-button-primary px-4 py-2.5 rounded-lg text-sm font-medium">{busy?'Saving…':'Save availability'}</button></div>
  </fieldset>}
 </section>;
}
export function ApprovalControls({appointment,user,onDone}:{appointment:{id:string;status:string;executiveId:string;updatedAt:string};user:{role:string;executiveId?:string|null};onDone:()=>void}){
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false);
 if(appointment.status!=='pending'||!(user.role==='admin'||user.role==='executive'&&user.executiveId===appointment.executiveId))return null;
 async function decide(action:string){setBusy(true);try{const r=await fetch(`/api/appointments/${appointment.id}/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({updatedAt:appointment.updatedAt,reason})});const d=await r.json();if(!r.ok)throw Error(d.error);toast.success(action==='approve'?'Appointment approved':'Appointment declined');onDone();}catch(e){toast.error(e instanceof Error?e.message:'Unable to decide');}finally{setBusy(false);}}
 return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3"><h2 className="font-semibold">Approval required</h2><label className="block text-sm">Reason for declining<input maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} className="ui-input block w-full rounded-lg border p-2"/></label><div className="flex gap-3"><button disabled={busy} onClick={()=>void decide('approve')} className="rounded-xl bg-emerald-600 text-white px-4 py-2">Approve</button><button disabled={busy||!reason.trim()} onClick={()=>void decide('decline')} className="rounded-xl bg-red-600 text-white px-4 py-2">Decline</button></div></section>;
}
