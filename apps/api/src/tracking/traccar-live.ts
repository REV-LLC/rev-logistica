import { EventEmitter } from 'node:events';
const WebSocket = require('ws');

// One upstream connection per local process. Native credentials and cookies never
// cross into the browser; subscribers receive only an invalidation notification.
export class TraccarLive extends EventEmitter {
  private server: string; private email: string; private password: string;
  private onPositions: (positions: any[]) => void; private invalidate: () => void;
  private fetcher: typeof fetch; private Socket: any; private socket: any;
  connected = false; private stopped = false; private retryMs = 2000;
  private receivedAt: string | undefined; private lastPong = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | undefined;
  constructor({ server, email, password, onPositions, invalidate, fetcher = fetch, Socket = WebSocket }: { server: string; email: string; password: string; onPositions: (positions: any[]) => void; invalidate: () => void; fetcher?: typeof fetch; Socket?: any }) {
    super(); Object.assign(this, { server, email, password, onPositions, invalidate, fetcher, Socket });
    this.connected = false; this.stopped = false; this.retryMs = 2000;
  }
  status() { return { connected: this.connected, receivedAt: this.receivedAt || null }; }
  notify(data: Record<string, unknown> = {}) { this.emit('update', { ...this.status(), ...data }); }
  async start() {
    if (this.stopped) return;
    try {
      const login = await this.fetcher(`${this.server}/api/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ email: this.email, password: this.password }), signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      if (!login.ok) throw new Error('Native session unavailable');
      const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      if (!cookie) throw new Error('No native cookie');
      if (this.stopped) return;
      const socket = this.socket = new this.Socket(`${this.server.replace(/^http/, 'ws')}/api/socket`, { headers: { Cookie: cookie }, handshakeTimeout: 15_000, maxPayload: 2_000_000 });
      socket.on('open', () => { this.connected = true; this.retryMs = 2000; this.lastPong = Date.now(); this.notify(); });
      socket.on('pong', () => { this.lastPong = Date.now(); });
      socket.on('message', data => this.accept(data));
      socket.on('error', () => socket.terminate());
      socket.once('close', () => { clearInterval(this.ping); this.connected = false; this.notify(); this.retry(); });
      this.ping = setInterval(() => {
        if (this.connected && Date.now() - this.lastPong > 60_000) socket.terminate();
        else if (this.connected) socket.ping();
      }, 25_000);
    } catch { this.connected = false; this.notify(); this.retry(); }
  }
  accept(data: unknown) {
    try {
      const value = JSON.parse(String(data));
      const positions = Array.isArray(value.positions) ? value.positions.filter(p => Number.isSafeInteger(p.deviceId) && Number.isSafeInteger(p.id)) : [];
      const ids = [...new Set([...positions.map(p => p.deviceId), ...(Array.isArray(value.devices) ? value.devices.map(d => d.id).filter(Number.isSafeInteger) : [])])];
      if (!ids.length) return;
      this.receivedAt = new Date().toISOString();
      this.invalidate();
      this.onPositions(positions);
      this.notify({ deviceIds: ids });
    } catch { /* Malformed packets never become browser events or GPS evidence. */ }
  }
  retry() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.start(); }, this.retryMs);
    this.retryMs = Math.min(60_000, this.retryMs * 2);
  }
  stop() { this.stopped = true; if (this.retryTimer) clearTimeout(this.retryTimer); clearInterval(this.ping); this.socket?.terminate(); this.removeAllListeners(); }
}

