import { useEffect, useState } from 'react';
import { scheduleDefaults, type SchedulePolicy } from '../../../shared/appointment-rules.mjs';
import { STATIC_PREVIEW, previewData } from '../preview-data';

export interface ExecutiveSchedule { id: string; name: string; policy: SchedulePolicy; }

export function useExecutiveSchedules(enabled = true) {
  const [schedules, setSchedules] = useState<ExecutiveSchedule[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    if (STATIC_PREVIEW) {
      setSchedules(previewData.EXECUTIVES.map(executive => ({ ...executive, policy: structuredClone(scheduleDefaults) })));
      setLoading(false); return;
    }
    let active = true, sequence = 0;
    let controller: AbortController | undefined;
    const load = async (initial = false) => {
      const request = ++sequence;
      controller?.abort(); controller = new AbortController();
      if (initial) setLoading(true);
      try {
        const response = await fetch('/api/executive-schedules', { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load executive availability. Please retry.');
        const data = await response.json();
        if (!Array.isArray(data.schedules)) throw new Error('Unable to load executive availability. Please retry.');
        if (active && sequence === request) { setSchedules(data.schedules); setError(''); }
      } catch (failure) {
        if (active && sequence === request && !(failure instanceof DOMException && failure.name === 'AbortError')) setError('Unable to load executive availability. Please retry.');
      } finally { if (active && sequence === request) setLoading(false); }
    };
    const refresh = () => { if (!document.hidden) void load(); };
    void load(true);
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [enabled, revision]);
  return { schedules, loading, error, retry: () => setRevision(value => value + 1) };
}
