// Transport between the big screen (authority) and phones.
// Two directions so the free Supabase tier (100 messages/second) is enough for 30+ players:
//   up   : phones -> big screen only (actions, hello)          1 delivery per message
//   down : big screen -> everyone (state, with acks inside it) throttled to about 1 per second
// Local mode (no Supabase keys): BroadcastChannel between tabs of one browser, for demos and tests.
import type { Action, GameState } from './engine';
import { SUPABASE_URL, SUPABASE_KEY, wantsLocal } from './config';

export interface Ack { id: string; to: string; ok: boolean; error?: string }
export type UpMsg = { k: 'hello'; from: string } | { k: 'action'; id: string; from: string; a: Action };
export type DownMsg = { k: 'state'; s: GameState; acks: Ack[] };

export interface Transport {
  kind: 'local' | 'online';
  sendUp(m: UpMsg): void; sendDown(m: DownMsg): void;
  onUp(cb: (m: UpMsg) => void): () => void; onDown(cb: (m: DownMsg) => void): () => void;
  close(): void;
}

class LocalTransport implements Transport {
  kind = 'local' as const;
  private up: BroadcastChannel; private down: BroadcastChannel;
  constructor(room: string) { this.up = new BroadcastChannel(`wwd:${room}:up`); this.down = new BroadcastChannel(`wwd:${room}:down`); }
  sendUp(m: UpMsg) { this.up.postMessage(m); }
  sendDown(m: DownMsg) { this.down.postMessage(m); }
  onUp(cb: (m: UpMsg) => void) { const h = (e: MessageEvent) => cb(e.data); this.up.addEventListener('message', h); return () => this.up.removeEventListener('message', h); }
  onDown(cb: (m: DownMsg) => void) { const h = (e: MessageEvent) => cb(e.data); this.down.addEventListener('message', h); return () => this.down.removeEventListener('message', h); }
  close() { this.up.close(); this.down.close(); }
}

class SupabaseTransport implements Transport {
  kind = 'online' as const;
  private upCbs = new Set<(m: UpMsg) => void>(); private downCbs = new Set<(m: DownMsg) => void>();
  private sb: any = null; private chans: Record<string, any> = {}; private ready: Record<string, boolean> = {}; private q: Record<string, any[]> = {};
  constructor(private room: string, url: string, key: string, private role: 'stage' | 'client') {
    import('@supabase/supabase-js').then(({ createClient }) => {
      this.sb = createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } });
      // listen only on the direction this side needs; the other side is send-only
      this.join(role === 'stage' ? 'up' : 'down', true);
      this.join(role === 'stage' ? 'down' : 'up', false);
    });
  }
  private join(dir: 'up' | 'down', listen: boolean) {
    const ch = this.sb.channel(`wwl-${this.room}-${dir}`, { config: { broadcast: { self: false, ack: false } } });
    this.chans[dir] = ch;
    if (listen) ch.on('broadcast', { event: 'm' }, (p: any) => (dir === 'up' ? this.upCbs : this.downCbs).forEach((cb: any) => cb(p.payload)));
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') { this.ready[dir] = true; (this.q[dir] ?? []).splice(0).forEach((m) => ch.send({ type: 'broadcast', event: 'm', payload: m })); }
    });
  }
  private send(dir: 'up' | 'down', m: any) {
    if (!this.ready[dir]) { (this.q[dir] = this.q[dir] ?? []).push(m); if (this.q[dir].length > 50) this.q[dir].shift(); return; }
    this.chans[dir].send({ type: 'broadcast', event: 'm', payload: m });
  }
  sendUp(m: UpMsg) { this.send('up', m); }
  sendDown(m: DownMsg) { this.send('down', m); }
  onUp(cb: (m: UpMsg) => void) { this.upCbs.add(cb); return () => { this.upCbs.delete(cb); }; }
  onDown(cb: (m: DownMsg) => void) { this.downCbs.add(cb); return () => { this.downCbs.delete(cb); }; }
  close() { Object.values(this.chans).forEach((c) => c.unsubscribe()); }
}

export function makeTransport(room: string, role: 'stage' | 'client'): Transport {
  if (!wantsLocal() && SUPABASE_URL && SUPABASE_KEY) return new SupabaseTransport(room, SUPABASE_URL, SUPABASE_KEY, role);
  return new LocalTransport(room);
}
export const isOnlineMode = () => !wantsLocal() && !!(SUPABASE_URL && SUPABASE_KEY);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
