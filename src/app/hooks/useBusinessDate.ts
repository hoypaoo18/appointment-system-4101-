import { useEffect, useState } from 'react';
import { businessDate } from '../../../shared/appointment-rules.mjs';

// Asia/Manila has a fixed UTC+08 offset. One timer per midnight, no API polling.
export function useBusinessDate() {
  const [date, setDate] = useState(() => businessDate());
  useEffect(() => {
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setDate(businessDate(now));
      const next = Date.parse(`${businessDate(now)}T00:00:00+08:00`) + 86400000;
      timer = window.setTimeout(refresh, next - now + 20);
    };
    const visible = () => { if (!document.hidden) refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return date;
}
