import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { AccessibleDialog } from './AccessibleDialog';
export type Entry={id:string;title:string;body:string;readAt:string|null;appointmentId:string;timestamp:string};
export type NotificationData = {entries:Entry[];unread:number};
export type NotificationBellProps = {data:NotificationData;onData:(data:NotificationData)=>void;onSessionExpired:()=>void;onOpenAppointment:(id:string)=>void};
export function NotificationBell({data,onData,onSessionExpired,onOpenAppointment}:NotificationBellProps) {
 const [open,setOpen]=useState(false),[error,setError]=useState('');
 const {entries,unread}=data;
 const apply=onData;
 const read=async(id?:string)=>{try{const response=await fetch(id?`/api/notifications/${id}/read`:'/api/notifications/read-all',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(response.status===401){onSessionExpired();return;}if(!response.ok)throw new Error();apply(await response.json());setError('');}catch{setError('Unable to mark notifications as read.');}};
 return <>
  <button aria-label={`Notifications${unread?`, ${unread} unread`:''}`} aria-expanded={open} onClick={()=>setOpen(true)} className="ui-icon-button relative p-2.5 text-slate-500 rounded-lg border border-slate-200 hover:bg-slate-50"><Bell className="w-4 h-4"/>{unread>0&&<span className="absolute -top-1 -right-1 bg-blue-600 text-white rounded-full text-[10px] px-1 min-w-4">{unread>99?'99+':unread}</span>}</button>
  {open&&<AccessibleDialog title="Notifications" onClose={()=>setOpen(false)}><div className="absolute inset-0 bg-slate-900/40" onClick={()=>setOpen(false)}/><div className="ui-surface relative rounded-2xl w-full max-w-lg p-6"><div className="flex justify-between items-center mb-4"><h2 className="font-semibold">Notifications</h2><button className="ui-icon-button rounded-lg text-slate-500 hover:bg-slate-50" aria-label="Close notifications" onClick={()=>setOpen(false)}><X className="w-5 h-5"/></button></div>{error&&<p role="alert" className="text-red-600 text-sm">{error}</p>}<button className="text-sm text-blue-600 mb-3" disabled={!unread} onClick={()=>void read()}>Mark all as read</button><div className="max-h-[65vh] overflow-y-auto space-y-2">{!entries.length&&!error&&<p className="text-sm text-slate-500 py-6">No notifications yet.</p>}{entries.map(entry=><button key={entry.id} onClick={()=>{void read(entry.id);onOpenAppointment(entry.appointmentId);setOpen(false);}} className={`block w-full p-3 rounded-xl text-left border ${entry.readAt?'bg-white':'bg-blue-50 border-blue-100'}`}><span className="block text-sm font-medium">{entry.title}</span><span className="block text-xs text-slate-600 mt-1">{entry.body}</span><span className="block text-xs text-slate-400 mt-1">{new Date(entry.timestamp).toLocaleString('en-US',{timeZone:'Asia/Manila'})}</span></button>)}</div></div></AccessibleDialog>}
 </>;
}
