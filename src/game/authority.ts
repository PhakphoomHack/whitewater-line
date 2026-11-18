// Runs inside the big-screen tab. Owns the game state, applies actions, broadcasts state.
import { apply, newGame, tick, GameError, type GameState } from './engine';
import { makeTransport, isOnlineMode, type Ack, type UpMsg, type Transport } from './net';
import { verifyAdminToken } from './supa';

const KEY = (room: string) => `wwd:state:${room}`;
// Online: at most ~1 state message per second (fits Supabase free tier). Local: snappier.
const MIN_GAP = () => (isOnlineMode() ? 900 : 150);
const KEEPALIVE = () => (isOnlineMode() ? 5000 : 2000);

export class Authority {
  state: GameState; t: Transport;
  private listeners = new Set<(s: GameState) => void>();
  private timer: { stop: () => void }; private lastSent = 0; private pending = false;
  private acks: (Ack & { at: number })[] = [];
  private t0 = Date.now();
  /** speed > 1 only for automated tests */
  constructor(room: string, pin: string, private speed = 1) {
    let saved: GameState | null = null;
    try { const raw = localStorage.getItem(KEY(room)); if (raw) saved = JSON.parse(raw); } catch {}
    this.state = saved && saved.room === room ? saved : newGame(room, pin, this.now());
    this.t = makeTransport(room, 'stage');
    this.t.onUp((m) => this.onMsg(m));
    this.timer = startTicker(() => this.loop(), 200);
    this.pending = true;
  }
  subscribe(cb: (s: GameState) => void) { this.listeners.add(cb); cb(this.state); return () => { this.listeners.delete(cb); }; }
  private set(s: GameState) {
    if (s === this.state) return;
    const vChanged = s.v !== this.state.v;
    this.state = s;
    this.listeners.forEach((cb) => cb(s));
    if (vChanged) { try { localStorage.setItem(KEY(s.room), JSON.stringify(s)); } catch {} this.pending = true; }
  }
  private onMsg(m: UpMsg) {
    if (m.k === 'hello') { this.pending = true; if (Date.now() - this.lastSent >= MIN_GAP()) this.flush(); return; }
    if (m.k !== 'action') return;
    // host signed in with the admin email: check the token, then act with the room PIN
    if (m.a.t === 'host' && m.a.pin.startsWith('jwt:')) {
      const a = m.a; const token = a.pin.slice(4);
      verifyAdminToken(token).then((okAdmin) => this.onMsg({ ...m, a: { ...a, pin: okAdmin ? this.state.pin : 'denied' } }));
      return;
    }
    let ack: Ack;
    try {
      this.set(apply(this.state, m.a, this.now()));
      ack = { id: m.id, to: m.from, ok: true };
    } catch (e) {
      const msg = e instanceof GameError ? e.message : 'Something went wrong. Please try again.';
      if (!(e instanceof GameError)) console.error(e);
      ack = { id: m.id, to: m.from, ok: false, error: msg };
    }
    if (m.a.t !== 'heartbeat') { this.acks.push({ ...ack, at: Date.now() }); this.pending = true; }
    // answer right away when allowed, so a throttled background tab still feels live
    if (Date.now() - this.lastSent >= MIN_GAP()) this.flush();
  }
  private loop() {
    this.set(tick(this.state, this.now()));
    const gap = Date.now() - this.lastSent;
    if ((this.pending && gap >= MIN_GAP()) || gap >= KEEPALIVE()) this.flush();
  }
  private flush() {
    this.pending = false; this.lastSent = Date.now();
    this.acks = this.acks.filter((a) => Date.now() - a.at < 4000).slice(-120);
    this.t.sendDown({ k: 'state', s: { ...this.state, serverNow: this.now() }, acks: this.acks.map(({ at, ...a }) => a) });
  }
  reset(pin: string) { this.set(newGame(this.state.room, pin, this.now())); }
  now() { return this.t0 + (Date.now() - this.t0) * this.speed; }
  close() { this.timer.stop(); this.t.close(); }
}

/** A clock that keeps ticking when the big-screen tab is in the background.
 *  Chrome slows timers in hidden tabs (down to once a minute); a Web Worker timer is not slowed the same way. */
function startTicker(fn: () => void, ms: number): { stop: () => void } {
  try {
    const src = `let t=setInterval(()=>postMessage(0),${ms});onmessage=()=>{clearInterval(t);close();}`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = () => fn();
    return { stop: () => { try { w.postMessage('stop'); w.terminate(); } catch {} URL.revokeObjectURL(url); } };
  } catch {
    const t = setInterval(fn, ms);
    return { stop: () => clearInterval(t) };
  }
}
