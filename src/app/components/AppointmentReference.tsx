import { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { AccessibleDialog } from './AccessibleDialog';

export function AppointmentReference({ id }: { id: string }) {
  const [open,setOpen]=useState(false);
  const short=id.length>18?`${id.slice(0,12)}…${id.slice(-4)}`:id;
  const copy=async()=>{try{await navigator.clipboard.writeText(id);toast.success('Appointment ID copied');}catch{toast.error('Unable to access clipboard. Select and copy the full ID below.');}};
  return <>
    <button type="button" title={id} aria-label={`View full appointment ID ${id}`} onClick={()=>setOpen(true)} className="appointment-reference font-mono text-blue-700 hover:underline">{short}</button>
    {open&&<AccessibleDialog title="Appointment reference" onClose={()=>setOpen(false)}><div className="absolute inset-0 bg-slate-900/35" onClick={()=>setOpen(false)}/><div className="ui-surface relative w-full max-w-md rounded-2xl p-5"><div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-semibold">Appointment reference</h2><button type="button" aria-label="Close appointment reference" onClick={()=>setOpen(false)} className="ui-icon-button rounded-lg"><X className="w-4 h-4"/></button></div><label className="text-sm text-slate-600">Full appointment ID<input readOnly value={id} onFocus={event=>event.target.select()} className="ui-input font-mono w-full text-xs mt-2 px-3 py-3 rounded-lg"/></label><button type="button" onClick={()=>void copy()} className="ui-button-primary flex items-center gap-2 rounded-lg px-3 py-2 mt-4 text-sm"><Copy className="w-4 h-4"/>Copy full ID</button></div></AccessibleDialog>}
  </>;
}
