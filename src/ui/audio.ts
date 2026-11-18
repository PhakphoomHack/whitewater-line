'use client';
// Audio + subtitles. Every voice line shows English subtitles while it plays.
// If an audio file is missing or blocked, the subtitle still shows for a reading-time estimate.
import { VOICE } from '../game/pack';

export interface SubtitleState { speaker: string; text: string; key: number }
type Listener = (s: SubtitleState | null) => void;

const VOL = { voice: 1, sfx: 0.7, ambience: 0.3, phone: 0.55, music: 0.5, musicSoft: 0.32 };

function sentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
  // join very short pieces so a subtitle never flashes for a single word
  const out: string[] = [];
  for (const p of parts) { if (out.length && (out[out.length - 1].length < 28 || p.length < 14)) out[out.length - 1] += ' ' + p; else out.push(p); }
  return out;
}

export class AudioDirector {
  private subs = new Set<Listener>();
  private queue: { id: string; volume: number; at: number; keep?: boolean }[] = [];
  private lineCbs = new Set<(id: string | null) => void>();
  /** fires when a voice line starts (id) and when the queue empties (null) */
  onLine(cb: (id: string | null) => void) { this.lineCbs.add(cb); return () => { this.lineCbs.delete(cb); }; }
  /** play a fixed sequence (rules): replaces anything queued, never dropped as stale */
  sayList(ids: string[], volume = VOL.voice) { this.stopVoice(); this.queue = ids.filter((id) => VOICE[id]).map((id) => ({ id, volume, at: Date.now(), keep: true })); this.next(); }
  private playing: HTMLAudioElement | null = null;
  private ambience: HTMLAudioElement | null = null;
  private music: HTMLAudioElement | null = null; private musicTarget = 0; private fadeT: any = null; private ducked = false;
  private subKey = 0; private estTimer: any = null;
  unlocked = false; muteVoice = false; muteSfx = false;
  constructor(private base = '/audio') {}

  onSubtitle(cb: Listener) { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  private emit(s: SubtitleState | null) { this.subs.forEach((cb) => cb(s)); }

  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const a = new Audio(`${this.base}/join.mp3`); a.volume = 0.01; a.play().catch(() => {});
  }

  sfx(id: string, volume = VOL.sfx) {
    if (this.muteSfx || !this.unlocked) return;
    const a = new Audio(`${this.base}/${id}.mp3`); a.volume = volume; a.play().catch(() => {});
  }

  /** queue a voice line (stage) */
  say(id: string, volume = VOL.voice) {
    if (!VOICE[id]) return;
    this.queue.push({ id, volume, at: Date.now() });
    if (this.queue.length > 3) this.queue = this.queue.slice(-3); // never let lines pile up
    if (!this.playing && !this.estTimer) this.next();
  }
  /** play now, interrupting (phone calls) */
  sayNow(id: string, volume = VOL.phone, textOverride?: string) {
    this.stopVoice(); this.queue = [];
    this.queue.push({ id, volume, at: Date.now() }); this.next(textOverride);
  }
  /** drop these lines from the queue and stop the current one if it is among them (rules narration when the host moves on) */
  cancelLines(ids: string[]) {
    this.queue = this.queue.filter((q) => !ids.includes(q.id));
    if (this.current && ids.includes(this.current)) { this.current = null; this.stopVoice(); this.next(); }
  }
  private current: string | null = null;
  stopVoice() {
    if (this.playing) { this.playing.pause(); this.playing = null; }
    if (this.estTimer) { clearTimeout(this.estTimer); this.estTimer = null; }
    this.emit(null); this.duck(false);
  }

  private next(textOverride?: string) {
    let item = this.queue.shift();
    while (item && !item.keep && Date.now() - item.at > 20000) item = this.queue.shift(); // stale: the moment has passed
    this.lineCbs.forEach((cb) => cb(item ? item.id : null));
    if (!item) { this.current = null; this.playing = null; this.emit(null); this.duck(false); return; }
    this.current = item.id;
    const line = VOICE[item.id];
    const text = textOverride ?? line.text;
    const chunks = sentences(text);
    const weights = chunks.map((c) => c.length); const total = weights.reduce((a, b) => a + b, 0);
    const key = ++this.subKey;
    const show = (i: number) => this.emit({ speaker: line.speaker, text: chunks[Math.min(i, chunks.length - 1)], key: key * 100 + i });
    show(0);
    const estimate = () => {
      // no audio: step through sentences at reading speed (15 chars per second, min 1.8 s each)
      let i = 0;
      const step = () => {
        if (i >= chunks.length) { this.estTimer = null; this.next(); return; }
        show(i); const d = Math.max(1800, (chunks[i].length / 15) * 1000); i++;
        this.estTimer = setTimeout(step, d);
      };
      step();
    };
    if (this.muteVoice || !this.unlocked) { estimate(); return; }
    const a = new Audio(`${this.base}/${item.id}.mp3`); a.volume = item.volume; this.playing = a; this.duck(true);
    let lastIdx = 0;
    a.ontimeupdate = () => {
      if (!a.duration) return;
      const r = a.currentTime / a.duration; let acc = 0; let idx = 0;
      for (let i = 0; i < weights.length; i++) { acc += weights[i] / total; if (r <= acc) { idx = i; break; } idx = i; }
      if (idx !== lastIdx) { lastIdx = idx; show(idx); }
    };
    a.onended = () => { if (this.playing === a) { this.playing = null; setTimeout(() => this.next(), 350); } };
    a.onerror = () => { if (this.playing === a) { this.playing = null; estimate(); } };
    a.play().catch(() => { if (this.playing === a) { this.playing = null; estimate(); } });
  }

  setAmbience(on: boolean) {
    if (on && this.unlocked) {
      if (!this.ambience) { this.ambience = new Audio(`${this.base}/ambience.mp3`); this.ambience.loop = true; this.ambience.volume = this.ambienceVol(); }
      if (this.ambience.paused) this.ambience.play().catch(() => {});
    } else if (this.ambience && !this.ambience.paused) this.ambience.pause();
  }
  private ambienceVol() { return this.musicTarget > 0 ? VOL.ambience * 0.55 : VOL.ambience; }
  private duck(on: boolean) {
    this.ducked = on;
    if (this.ambience) this.ambience.volume = on ? this.ambienceVol() * 0.4 : this.ambienceVol();
    this.fadeMusic();
  }
  /** background music bed: 'play' during rounds, 'soft' in the lobby, 'off' otherwise. Ducks under voice. */
  setMusic(mode: 'play' | 'soft' | 'off', level = 2) {
    const k = [0, 0.55, 1, 1.5][Math.max(0, Math.min(3, level))];
    this.musicTarget = !this.unlocked || mode === 'off' ? 0 : Math.min(1, (mode === 'play' ? VOL.music : VOL.musicSoft) * k);
    if (this.musicTarget > 0 && !this.music) {
      this.music = new Audio(`${this.base}/music_play.mp3`); this.music.loop = true; this.music.volume = 0;
    }
    if (this.music && this.musicTarget > 0 && this.music.paused) this.music.play().catch(() => {});
    if (this.ambience) this.ambience.volume = this.ambienceVol();
    this.fadeMusic();
  }
  private fadeMusic() {
    const m = this.music; if (!m) return;
    const goal = this.ducked ? this.musicTarget * 0.35 : this.musicTarget;
    clearInterval(this.fadeT);
    this.fadeT = setInterval(() => {
      const d = goal - m.volume;
      if (Math.abs(d) < 0.01) { m.volume = Math.max(0, Math.min(1, goal)); clearInterval(this.fadeT); if (goal === 0) m.pause(); return; }
      m.volume = Math.max(0, Math.min(1, m.volume + Math.sign(d) * Math.min(Math.abs(d), 0.02)));
    }, 50);
  }
}
