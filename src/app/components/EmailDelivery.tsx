import { useEffect, useState } from 'react';
import { STATIC_PREVIEW } from '../preview-data';

type Delivery = { id:string;recipient:string;status:string;attempts:number;retry_count:number;last_error:string|null;sent_at:string|null;occurred_at:string;title:string;retryable:boolean };
type Deliveries = {smtp:{configured:boolean;issues:string[]};entries:Delivery[];total:number;page:number};
export function EmailDelivery() {
  const [data,setData]=useState<Deliveries|null>(null),[status,setStatus]=useState('failed'),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[confirmId,setConfirmId]=useState<string|null>(null);
  useEffect(()=>{
    if(STATIC_PREVIEW){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);setError('');
    void fetch(`/api/admin/email-delivery?status=${status}&page=${page}`,{signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load email delivery');if(!controller.signal.aborted)setData(result);}).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Unable to load email delivery');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[status,page,revision]);
  const action=async(id?:string)=>{
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch(id?`/api/admin/email-delivery/${encodeURIComponent(id)}/retry`:'/api/admin/email-delivery/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(35000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Email operation failed');
      setMessage(result.message);setConfirmId(null);setRevision(value=>value+1);
    }catch(error){setError(error instanceof Error?error.message:'Email operation failed');}finally{setBusy(false);}
  };
  return <div className="p-4 md:p-6 space-y-5">
    <div className="settings-page-heading"><h1 className="text-xl font-semibold text-slate-900">Email Delivery</h1><p>Inspect delivery errors and retry exhausted messages individually.</p></div>
    <section className="ui-surface rounded-2xl p-5 space-y-3" aria-label="SMTP configuration">
      <h2 className="font-semibold">SMTP {data?.smtp.configured?'configured':'configuration required'}</h2>
      {data?.smtp.issues.map(issue=><p key={issue} className="text-sm text-amber-800">{issue}</p>)}
      <p className="text-sm text-slate-500">Configure server environment variables and restart the server. Connection testing checks authentication without sending email.</p>
      <button type="button" disabled={busy||!data?.smtp.configured||STATIC_PREVIEW} onClick={()=>void action()} className="ui-button-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50">{busy?'Working…':'Test SMTP connection'}</button>
    </section>
    {error&&<p role="alert" className="text-sm text-red-700">{error} Existing results may be outdated.</p>}
    {message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}
    <section className="ui-surface rounded-2xl overflow-hidden">
      <div className="p-4 flex items-center justify-between gap-3 flex-wrap border-b border-slate-100">
        <label className="text-sm text-slate-600">Delivery status <select aria-label="Delivery status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);setConfirmId(null);}} className="ui-input rounded-lg px-3 py-2 ml-2"><option value="">All</option>{['failed','pending','sending','sent','skipped','uncertain'].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" onClick={()=>setRevision(value=>value+1)} disabled={loading} className="ui-button-secondary px-3 py-2 rounded-lg text-sm">Refresh delivery status</button>
      </div>
      {loading&&<p role="status" className="p-4 text-sm text-slate-500">Loading delivery status…</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm delivery-table"><thead><tr>{['Notification / recipient','Status','Total attempts','Manual retries','Last error / sent time','Action'].map(label=><th key={label} className="text-left px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
        {data?.entries.map(row=><tr key={row.id}><td className="px-4 py-3"><span className="block font-medium">{row.title}</span><span className="block text-xs text-slate-500 mt-1">{row.recipient}</span></td><td className="px-4 py-3 capitalize">{row.status}</td><td className="px-4 py-3">{row.attempts}</td><td className="px-4 py-3">{row.retry_count}</td><td className="px-4 py-3 text-xs text-slate-500">{row.last_error||row.sent_at||'—'}</td><td className="px-4 py-3">
          {row.retryable&&(confirmId===row.id?<div className="space-y-2"><p className="text-xs">Queue up to five more attempts to this recipient?</p><button type="button" disabled={busy} onClick={()=>void action(row.id)} className="ui-button-primary px-3 py-2 rounded-lg text-xs">Confirm retry</button><button type="button" disabled={busy} onClick={()=>setConfirmId(null)} className="ui-button-secondary px-3 py-2 rounded-lg text-xs ml-2">Cancel</button></div>:<button type="button" disabled={busy||!data?.smtp.configured} onClick={()=>setConfirmId(row.id)} className="ui-button-secondary rounded-lg px-3 py-2 text-xs disabled:opacity-50">Retry failed email</button>)}
        </td></tr>)}
        {!loading&&!data?.entries.length&&<tr><td colSpan={6} className="p-6 text-center text-slate-500">No matching deliveries.</td></tr>}
      </tbody></table></div>
      <div className="p-4 border-t border-slate-100 flex items-center gap-3 text-sm"><button type="button" disabled={page===1||loading} onClick={()=>setPage(value=>value-1)} className="ui-button-secondary rounded-lg px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page} · {data?.total||0} messages</span><button type="button" disabled={!data||page*25>=data.total||loading} onClick={()=>setPage(value=>value+1)} className="ui-button-secondary rounded-lg px-3 py-2 disabled:opacity-40">Next</button></div>
    </section>
    <p className="text-xs text-slate-500">Sent means accepted by SMTP; inbox delivery depends on your provider. Uncertain messages are held to prevent duplicates—review provider logs before taking further action. Skipped messages no longer meet recipient or preference rules.</p>
  </div>;
}
