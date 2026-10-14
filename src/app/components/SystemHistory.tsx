import { useEffect, useState } from 'react';
import { RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { STATIC_PREVIEW, previewAudit } from '../preview-data';

interface Entry {
  id: number; timestamp: string; actorName: string; actorRole: string | null;
  action: string; outcome: 'success' | 'failure' | 'denied';
  entityType: string; entityId: string | null; ip: string | null;
  details: Record<string, unknown>;
}
const field = 'px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white/70';
const actionLabel = (action: string) => action.replaceAll('.', ' · ').replaceAll('_', ' ');
const labels: Record<string, string> = { date: 'Date', startTime: 'Start time', duration: 'Duration (minutes)', executiveId: 'Executive', status: 'Status', active: 'Account active' };
function Changes({ details }: { details: Record<string, unknown> }) {
  const changes = ['before', 'after'].filter(key => details[key] && typeof details[key] === 'object');
  if (!changes.length) return <span className="text-xs text-slate-500">{details.source === 'existing_appointment_history' ? 'Imported appointment history' : details.path ? `${details.method} ${details.path} (${details.status})` : '—'}</span>;
  return <details className="text-xs"><summary className="cursor-pointer text-blue-700">View changes</summary>
    {changes.map(key => <div key={key} className="mt-2"><strong className="capitalize">{key}</strong>
      {Object.entries(details[key] as Record<string, unknown>).map(([name, value]) => <p key={name}>{labels[name] || name}: {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</p>)}
    </div>)}
  </details>;
}
export function SystemHistory() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [search, setSearch] = useState(''); const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (STATIC_PREVIEW) {
      const filtered = previewAudit.filter(entry => (!search || `${entry.actorName} ${entry.action} ${entry.entityId}`.toLowerCase().includes(search.toLowerCase())) && (!action || entry.action === action) && (!outcome || entry.outcome === outcome) && (!from || entry.timestamp.slice(0,10) >= from) && (!to || entry.timestamp.slice(0,10) <= to));
      setEntries(filtered.slice((page-1)*50,page*50)); setTotal(filtered.length); setActions([...new Set(previewAudit.map(entry=>entry.action))].sort()); setLoading(false); return;
    }
    const controller = new AbortController(); setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), search, action, outcome, from, to });
    void fetch('/api/audit-logs?' + params, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load system history');
      if (controller.signal.aborted) return;
      setEntries(data.entries); setActions(data.actions); setTotal(data.total);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, search, action, outcome, from, to, refresh]);
  const pages = Math.max(1, Math.ceil(total / 50));
  return <div className="p-4 md:p-6 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold text-slate-900">System History</h1><p className="text-sm text-slate-500">Sign-ins, account changes, and appointment activity. Times shown in Manila time.</p></div>
      <button className={field + ' flex gap-2 items-center'} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="w-4 h-4" />Refresh</button>
    </div>
    <div className="bg-white/70 border border-white/60 rounded-2xl p-4 flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-500">Search<div className="relative mt-1"><Search className="absolute left-3 top-2.5 w-4 h-4" /><input aria-label="Search system history" className={field + ' pl-9'} placeholder="User, action, or record ID" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div></label>
      <label className="text-xs text-slate-500">Action<select aria-label="Audit action" className={field + ' block mt-1'} value={action} onChange={e => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{actions.map(value => <option key={value} value={value}>{actionLabel(value)}</option>)}</select></label>
      <label className="text-xs text-slate-500">Result<select aria-label="Audit result" className={field + ' block mt-1'} value={outcome} onChange={e => { setOutcome(e.target.value); setPage(1); }}><option value="">All results</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option></select></label>
      <label className="text-xs text-slate-500">From<input aria-label="Audit start date" type="date" className={field + ' block mt-1'} value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
      <label className="text-xs text-slate-500">To<input aria-label="Audit end date" type="date" className={field + ' block mt-1'} value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
    </div>
    {error ? <div role="alert" className="text-red-700 bg-red-50 p-4 rounded-xl">{error}<button className="ml-3 underline" onClick={() => setRefresh(value => value + 1)}>Retry</button></div> : loading ? <p role="status">Loading system history…</p> : <>
      <div className="bg-white/70 border border-white/60 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm"><thead className="text-xs text-slate-500 bg-white/40"><tr>{['Time (Manila)','User','Action','Result','Record','IP address','Changes'].map(label => <th key={label} className="p-3 text-left whitespace-nowrap">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{entries.map(entry => <tr key={entry.id}>
            <td className="p-3 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
            <td className="p-3">{entry.actorName}<p className="text-xs text-slate-500 capitalize">{entry.actorRole}</p></td>
            <td className="p-3 capitalize whitespace-nowrap">{actionLabel(entry.action)}</td>
            <td className="p-3"><span className={'text-xs px-2 py-1 rounded-full capitalize ' + (entry.outcome === 'success' ? 'bg-emerald-50 text-emerald-700' : entry.outcome === 'denied' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>{entry.outcome}</span></td>
            <td className="p-3 text-xs break-all">{entry.entityId || entry.entityType}</td><td className="p-3 text-xs">{entry.ip || '—'}</td><td className="p-3 min-w-36"><Changes details={entry.details} /></td>
          </tr>)}{entries.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-500">No events match your filters.</td></tr>}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600"><span>{total} events · Page {page} of {pages}</span><div className="flex gap-2">
        <button aria-label="Previous audit page" disabled={page <= 1} className={field + ' disabled:opacity-40'} onClick={() => setPage(value => value - 1)}><ChevronLeft className="w-4 h-4" /></button>
        <button aria-label="Next audit page" disabled={page >= pages} className={field + ' disabled:opacity-40'} onClick={() => setPage(value => value + 1)}><ChevronRight className="w-4 h-4" /></button>
      </div></div>
    </>}
  </div>;
}
