let loading: Promise<void> | null = null;
declare global { interface Window { __revTrackingMapReady?: () => void } }
export function loadTrackingMap(key: string) {
  if (typeof google !== 'undefined' && google.maps?.Map) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true; clearTimeout(timeout);
      delete window.__revTrackingMapReady;
      if (error) { script.remove(); loading = null; reject(error); } else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('No fue posible cargar el mapa.')), 25_000);
    window.__revTrackingMapReady = () => finish();
    const params = new URLSearchParams({ key, callback: '__revTrackingMapReady', loading: 'async', v: 'weekly', language: 'es', region: 'CO' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.onerror = () => finish(new Error('No fue posible cargar el mapa.'));
    document.head.appendChild(script);
  });
  return loading;
}
