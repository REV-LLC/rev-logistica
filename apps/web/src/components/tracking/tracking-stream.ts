import { getToken } from '@/lib/auth';

type Update = { connected?: boolean; deviceIds?: number[]; denied?: boolean };
export function subscribeTracking(local: boolean, onUpdate: (update: Update) => void) {
  const controller = new AbortController();
  const signal = controller.signal;
  const base = local ? '' : process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  const wait = () => new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, 3000); signal.addEventListener('abort', finish, { once: true });
  });
  void (async () => {
    while (!signal.aborted) {
      try {
        const token = local ? null : getToken();
        if (!local && !token) { onUpdate({ denied:true }); return; }
        const headers: Record<string,string> = { Accept:'text/event-stream' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${base}/tracking/events`, { headers, signal, cache:'no-store', credentials:'omit' });
        if (response.status === 401 || response.status === 403) { onUpdate({denied:true}); return; }
        if (!response.ok || !response.body) throw new Error('Stream unavailable');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!signal.aborted) {
            const {value,done} = await reader.read(); if (done) break;
            buffer += decoder.decode(value,{stream:true}).replace(/\r/g,'');
            if (buffer.length > 64_000) throw new Error('Unexpected stream');
            let end;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0,end); buffer = buffer.slice(end+2);
              const data = frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
              if (data) onUpdate(JSON.parse(data));
            }
          }
        } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
      } catch { if (signal.aborted) return; }
      if (!signal.aborted) { onUpdate({connected:false}); await wait(); }
    }
  })();
  return () => controller.abort();
}
