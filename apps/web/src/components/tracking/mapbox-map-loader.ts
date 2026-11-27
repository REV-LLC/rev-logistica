export type MapInstance = {
 getZoom(): number;
 on(event: string, callback: () => void): void; remove(): void;
 addSource(id: string, source: unknown): void; addLayer(layer: unknown): void;
 getSource(id: string): { setData(data: unknown): void } | undefined;
 fitBounds(bounds: number[][], options: unknown): void; easeTo(options: unknown): void;
 getStyle(): { layers?: { id: string }[] }; setLayoutProperty(id: string, name: string, value: string): void;
 setPaintProperty(id: string, name: string, value: unknown): void;
 addControl(control: unknown, position?: string): void;
};
export type MarkerInstance = { setLngLat(coords: number[]): MarkerInstance; addTo(map: MapInstance): MarkerInstance; remove(): void };
export type MapboxLibrary = {
 Map: new(options: Record<string, unknown>) => MapInstance;
 Marker: new(options: Record<string, unknown>) => MarkerInstance;
 NavigationControl: new(options?: Record<string, unknown>) => unknown;
 FullscreenControl: new() => unknown;
};
let pending: Promise<MapboxLibrary> | null = null;
export function loadMapbox(): Promise<MapboxLibrary> {
 if (pending) return pending;
 pending = new Promise<MapboxLibrary>((resolve, reject) => {
  const read = () => (window as unknown as { mapboxgl?: MapboxLibrary }).mapboxgl;
  const existing = read(); if (existing) { resolve(existing); return; }
  const css = document.createElement('link'); css.rel = 'stylesheet';
  css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.35.0/mapbox-gl.css'; document.head.append(css);
  const script = document.createElement('script'); script.async = true;
  script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.35.0/mapbox-gl.js';
  script.onload = () => { const library = read(); if (library) resolve(library); else reject(new Error('Mapbox no disponible')); };
  script.onerror = () => { script.remove(); css.remove(); reject(new Error('No se pudo cargar Mapbox')); };
  document.head.append(script);
 }).catch(error => { pending = null; throw error; });
 return pending;
}
