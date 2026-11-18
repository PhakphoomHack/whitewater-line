'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Authority } from '../../src/game/authority';
import {
  type GameState, round, realElapsed, deadlineSec, tablesInUse, members, team, isOnline, gameClockLabel, teamLeft, budget,
  killedOptions, roundResults, grandTotals, magnets, rationale, deadlineLabel,
} from '../../src/game/engine';
import { PACK, RULE_SLIDES, MARKET_SLIDE, type OptionKey } from '../../src/game/pack';
import { AudioDirector } from '../../src/ui/audio';
import { Subtitle } from '../../src/ui/Subtitle';
import { tableName, tableColor, makeRoomCode, makePin } from '../../src/ui/common';
import { fmtSec, useNow, useQuery } from '../../src/game/client';

type Overlay = null | { kind: 'news'; text: string; title: string } | { kind: 'seal'; table: number; option: OptionKey; label: string };

export default function StagePage() {
  const room = useQuery('room');
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  if (!ready) return null;
  if (!room) return <Setup />;
  return <Stage room={room} />;
}

function Setup() {
  const create = () => {
    const code = makeRoomCode(); const pin = makePin();
    localStorage.setItem(`wwd:pin:${code}`, pin);
    const rooms = JSON.parse(localStorage.getItem('wwd:rooms') || '[]');
    localStorage.setItem('wwd:rooms', JSON.stringify([code, ...rooms.filter((r: string) => r !== code)].slice(0, 5)));
    window.location.href = `/stage?room=${code}`;
  };
  return (
    <div className="stage">
      <img className="bg" src="/img/stage_river.webp" alt="" />
      <div className="veil" style={{ background: 'rgba(5,11,28,0.7)' }} />
      <div className="content" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <span className="kicker">WHITEWATER DESK · BIG SCREEN</span>
        <h1>Start a new game room</h1>
        <p className="muted" style={{ fontSize: 18, maxWidth: 640 }}>Run this on the laptop connected to the projector. Keep this tab open for the whole game: it is the game&apos;s brain.</p>
        <button className="btn-gold" onClick={create} style={{ fontSize: 20, minHeight: 58, padding: '0 34px' }}>Create room</button>
      </div>
    </div>
  );
}

function Stage({ room }: { room: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const auth = useRef<Authority | null>(null);
  const audio = useMemo(() => new AudioDirector(), []);
  const [soundOn, setSoundOn] = useState(false);
  const [overlay, setOverlayState] = useState<Overlay>(null);
  // overlays play one at a time: news first, then seal moments in order
  const oq = useRef<{ o: Overlay; ms: number }[]>([]); const busy = useRef(false);
  const pump = () => {
    if (busy.current) return;
    const next = oq.current.shift(); if (!next) { setOverlayState(null); return; }
    busy.current = true; setOverlayState(next.o);
    setTimeout(() => { busy.current = false; pump(); }, next.ms);
  };
  const pushOverlay = (o: Overlay, ms: number, urgent = false) => {
    if (urgent) oq.current.unshift({ o, ms }); else oq.current.push({ o, ms });
    if (oq.current.length > 4) oq.current = oq.current.slice(0, 4); // never back up the room
    pump();
  };
  const [showPin, setShowPin] = useState(false);
  const lastCue = useRef<number | null>(null);
  const tickNow = useNow(0, 250);
  const now = auth.current ? auth.current.now() : tickNow;

  useEffect(() => {
    let pin = localStorage.getItem(`wwd:pin:${room}`);
    if (!pin) { pin = makePin(); localStorage.setItem(`wwd:pin:${room}`, pin); }
    const speed = Number(new URLSearchParams(window.location.search).get('speed') || '1');
    const a = new Authority(room, pin, speed > 0 && speed <= 20 ? speed : 1); auth.current = a;
    const off = a.subscribe(setState);
    return () => { off(); a.close(); };
  }, [room]);

  // play cues (voice, sfx, overlays) once each
  useEffect(() => {
    if (!state) return;
    if (lastCue.current === null) { lastCue.current = state.cueN; return; }
    const fresh = state.cues.filter((c) => c.n > lastCue.current!);
    lastCue.current = state.cueN;
    audio.muteVoice = state.settings.muteVoice;
    for (const c of fresh) {
      if (c.sfx) audio.sfx(c.sfx);
      if (c.voice) { audio.say(c.voice); if (c.voice === 'host_reveal') audio.say('host_champion'); }
      const r = round(state);
      if (c.sfx === 'news' && c.voice !== 'market_open') { // the market has its own banner, not a news flash
        const isTrap = c.voice === 'news_r2';
        const n = r.breaking_news?.[0];
        pushOverlay({ kind: 'news', title: isTrap ? 'Incoming offer' : 'Breaking news', text: isTrap ? r.trap!.text : n?.text ?? '' }, 9000, true);
      }
      if (c.sfx === 'stamp' && c.table) {
        const sd = team(state, c.table).sealed;
        if (sd) pushOverlay({ kind: 'seal', table: c.table, option: sd.option, label: r.options[sd.option].label }, 3800);
      }
    }
  }, [state, audio]);

  useEffect(() => { if (state) audio.setAmbience(soundOn && state.phase === 'play' && !state.settings.muteAmbience && !state.clock.pausedAt); }, [state, soundOn, audio]);
  useEffect(() => {
    if (!state) return;
    const playing = state.phase === 'play' && !state.clock.pausedAt;
    // soft bed under the host voice (lobby, rules, brief, results); full during rounds; silent in review so the facilitator can talk
    const soft = ['lobby', 'rules', 'brief', 'reveal', 'final'].includes(state.phase) || (state.phase === 'play' && !playing);
    const level = state.settings.musicLevel ?? 2;
    audio.setMusic(!soundOn || state.settings.muteMusic || level === 0 ? 'off' : playing ? 'play' : soft ? 'soft' : 'off', level);
  }, [state, soundOn, audio]);

  if (!state) return null;
  const s = state;
  const pin = auth.current ? s.pin : '';
  const enableSound = () => { audio.unlock(); setSoundOn(true); try { sessionStorage.setItem('wwd:sound', '1'); } catch {} if (s.phase === 'lobby' && !s.fired.includes('welcome')) audio.say('host_welcome'); };
  // after a reload the browser needs one click before it may play sound again
  const wantedSound = (() => { try { return sessionStorage.getItem('wwd:sound') === '1'; } catch { return false; } })();

  return (
    <div className="stage">
      <img className="bg" src="/img/stage_river.webp" alt="" />
      <div className="veil" style={{ background: s.phase === 'lobby' ? 'linear-gradient(90deg, rgba(5,11,28,0.92) 0%, rgba(5,11,28,0.55) 38%, rgba(5,11,28,0.4) 60%, rgba(5,11,28,0.8) 100%)' : 'linear-gradient(180deg, rgba(5,11,28,0.82), rgba(5,11,28,0.62) 45%, rgba(5,11,28,0.92))' }} />
      {s.phase === 'lobby' && <Lobby s={s} now={now} pin={pin} showPin={showPin} setShowPin={setShowPin} />}
      {s.phase === 'rules' && <Rules audio={audio} soundOn={soundOn} />}
      {s.phase === 'brief' && <Brief s={s} audio={audio} />}
      {s.phase === 'play' && <Play s={s} now={now} />}
      {s.phase === 'play' && <RiverBanners s={s} now={now} />}
      {s.phase === 'review' && <Review s={s} />}
      {s.phase === 'reveal' && <Reveal s={s} />}
      {s.phase === 'final' && <Final s={s} />}
      {overlay?.kind === 'news' && (
        <div className="overlay" style={{ background: 'rgba(30,4,10,0.82)' }}>
          <div style={{ maxWidth: '72vw', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3vh', textAlign: 'center' }}>
            <span className="breaking" style={{ fontSize: 'clamp(40px, 5vw, 96px)' }}>{overlay.title.toUpperCase()}</span>
            <h1 style={{ fontSize: 'clamp(28px, 3.2vw, 60px)', color: '#fff' }}>{overlay.text}</h1>
            <span className="muted" style={{ fontSize: 'clamp(16px, 1.4vw, 26px)' }}>Check your phones.</span>
          </div>
          <img src="/img/pebble_phone.webp" alt="" style={{ position: 'absolute', right: '5vw', bottom: '6vh', height: '34vh', animation: 'pop 500ms ease-out' }} />
        </div>
      )}
      {overlay?.kind === 'seal' && (
        <div className="overlay" style={{ background: '#050B1C' }}>
          <img src="/img/sealed_moment.webp" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'pop 520ms ease-out' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '34vh', background: 'linear-gradient(0deg, rgba(5,11,28,0.95) 10%, transparent)' }} />
          <div style={{ position: 'absolute', top: '42vh', left: '3vw', display: 'flex', alignItems: 'center', gap: '1.4vw', whiteSpace: 'nowrap', padding: '1.6vh 1.6vw', borderRadius: 18, background: 'rgba(5,11,28,0.82)', border: '1px solid rgba(242,198,109,0.6)', animation: 'pop 520ms ease-out' }}>
            <div style={{ textAlign: 'left' }}>
              <div className="kicker">{tableName(overlay.table).toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--f-title)', fontWeight: 700, color: 'var(--cream)', fontSize: 'clamp(20px, 2vw, 38px)' }}>sealed their decision</div>
            </div>
            <span style={{ fontFamily: 'var(--f-fun)', fontSize: 'clamp(44px, 4.4vw, 84px)', width: '1.5em', height: '1.5em', borderRadius: '0.35em', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A1A04', background: 'linear-gradient(180deg,#FFE3A0,#E2AE4E 55%,#B07D24)', boxShadow: '0 6px 0 #7A5410', order: -1 }} title="Choice stays secret until the reveal">?</span>
          </div>
        </div>
      )}
      <Subtitle audio={audio} />
      {!soundOn && wantedSound && s.phase !== 'lobby' && (
        <button onClick={enableSound} style={{ position: 'absolute', inset: 0, zIndex: 96, background: 'rgba(5,11,28,0.55)', border: 'none', color: '#FFD36B', fontFamily: 'var(--f-fun)', fontSize: 'clamp(28px, 3vw, 56px)', cursor: 'pointer' }}>Click anywhere to bring the sound back</button>
      )}
      {!soundOn && (
        <button className="btn-gold" onClick={enableSound} style={{ position: 'absolute', right: 24, top: 20, zIndex: 95 }}>Click to turn on sound</button>
      )}
      {soundOn && (
        <button className="btn-ghost" onClick={() => { try { sessionStorage.removeItem('wwd:sound'); } catch {} audio.stopVoice(); setSoundOn(false); audio.setAmbience(false); audio.setMusic('off'); audio.unlocked = false; }} style={{ position: 'absolute', right: 24, top: 20, zIndex: 95, fontSize: 13, minHeight: 36 }}>Sound is on · click to mute</button>
      )}
    </div>
  );
}

function Lobby({ s, now, pin, showPin, setShowPin }: { s: GameState; now: number; pin: string; showPin: boolean; setShowPin: (b: boolean) => void }) {
  const [qr, setQr] = useState('');
  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/play?room=${s.room}` : '';
  useEffect(() => { QRCode.toDataURL(joinUrl, { margin: 1, width: 520, color: { dark: '#0A1530', light: '#FFFFFF' } }).then(setQr); }, [joinUrl]);
  const tbs = tablesInUse(s); const total = Object.keys(s.players).length;
  const online = Object.values(s.players).filter((p) => isOnline(p, now)).length;
  return (
    <div className="content" style={{ flexDirection: 'row', gap: '4vw' }}>
      <div style={{ width: '28vw', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2.2vh' }}>
        <span className="kicker">WHITEWATER DESK</span>
        <h1>Grab your phone. Take your seat.</h1>
        <div style={{ width: '19vw', aspectRatio: '1', padding: '1.1vw', borderRadius: 20, background: 'linear-gradient(160deg,#FFE3A0,#B07D24)', boxShadow: '0 0 40px rgba(242,198,109,0.35)' }}>
          {qr && <img src={qr} alt="QR code to join" style={{ width: '100%', height: '100%', borderRadius: 10, display: 'block' }} />}
        </div>
        <div>
          <div className="muted" style={{ fontSize: 'clamp(13px, 1.1vw, 20px)' }}>Or open <b style={{ color: 'var(--text)' }}>{joinUrl.replace(/^https?:\/\//, '').replace(/\/play.*/, '')}/play</b> and type</div>
          <div className="code">{s.room}</div>
        </div>
        <div className="panel" style={{ padding: '10px 14px', fontSize: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted">Host remote: /host · PIN</span>
          <b style={{ letterSpacing: '0.2em', color: '#FFD36B' }}>{showPin ? pin : '••••'}</b>
          <button className="btn-ghost" style={{ minHeight: 30, fontSize: 12 }} onClick={() => setShowPin(!showPin)}>{showPin ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      <img src="/img/pebble_wave.webp" alt="" className="bob" style={{ position: 'absolute', left: '24vw', top: '40vh', height: '26vh' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2vh', paddingLeft: '4vw' }}>
        <div className="between">
          <h2 style={{ fontSize: 'clamp(22px, 2vw, 38px)' }}>Who is on board</h2>
          <span style={{ fontWeight: 800, color: 'var(--river-soft)', fontSize: 'clamp(16px, 1.4vw, 26px)' }}>{online} online · {total} joined</span>
        </div>
        {tbs.length === 0 && <p className="muted" style={{ fontSize: 'clamp(16px, 1.3vw, 24px)' }}>Waiting for the first player. Scan the code, type a nickname, pick the number on your table.</p>}
        <div className="tables-grid">
          {tbs.map((tb) => {
            const ms = members(s, tb);
            return (
              <div className="tcard" key={tb}>
                <div className="between">
                  <span className="name"><span className="diamond" style={{ background: tableColor(tb), boxShadow: `0 0 10px ${tableColor(tb)}` }} />{tableName(tb)}</span>
                  <span style={{ fontWeight: 800, color: ms.length >= 3 && ms.length <= 6 ? 'var(--emerald)' : 'var(--amber)', fontSize: 'clamp(13px, 1.05vw, 19px)' }}>{ms.length} {ms.length < 3 ? '· needs 3+' : ms.length > 6 ? '· over 6' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ms.map((m) => <span key={m.id} className={`chip ${isOnline(m, now) ? '' : 'off'}`}>{m.name}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OptionCards({ s, killed = [] as OptionKey[] }: { s: GameState; killed?: OptionKey[] }) {
  const r = round(s);
  return (
    <div className="opt-grid">
      {(['A', 'B', 'C', 'D'] as OptionKey[]).map((k) => (
        <div key={k} className={`optcard ${killed.includes(k) ? 'killed' : ''}`}>
          <img src="/img/frame_sapphire.webp" alt="" />
          <div className="in">
            <span className="letter">{k}</span>
            <span className="lbl">{r.options[k].label}</span>
            <span className="txt">{r.options[k].text}</span>
          </div>
          {killed.includes(k) && <span className="x">RULED OUT</span>}
        </div>
      ))}
    </div>
  );
}

function Brief({ s, audio }: { s: GameState; audio: AudioDirector }) {
  const r = round(s);
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => audio.onLine(setLine), [audio]);
  if (line === MARKET_SLIDE.voice) return <RuleSlide slide={MARKET_SLIDE} index={null} />;
  return (
    <div className="content">
      <div className="between" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src="/img/sunluna_emblem.webp" alt="" style={{ height: '5.5vh' }} />ROUND {s.roundIdx + 1} OF {PACK.rounds.length} · {PACK.company.name.toUpperCase()}</span>
          <h1>{r.title}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 'clamp(13px,1vw,18px)' }}>Game time {r.clock_start} to {deadlineLabel(s)}</div>
          <div className="bigclock">{Math.round(r.real_seconds / 60)} min</div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 'clamp(18px, 1.7vw, 32px)', lineHeight: 1.45, maxWidth: '62vw', color: 'var(--text)' }}>{r.brief}</p>
      <div style={{ width: '72vw' }}><OptionCards s={s} /></div>
      <img src="/img/pebble_think.webp" alt="" className="bob" style={{ position: 'absolute', right: '4vw', top: '18vh', height: '30vh' }} />
    </div>
  );
}

function Play({ s, now }: { s: GameState; now: number }) {
  const r = round(s); const left = deadlineSec(s) - realElapsed(s, now);
  const killed = killedOptions(s);
  const tbs = tablesInUse(s);
  return (
    <div className="content">
      <div className="between">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="kicker">ROUND {s.roundIdx + 1} · DECIDE BY {deadlineLabel(s)} GAME TIME</span>
          <h1 style={{ fontSize: 'clamp(26px, 2.6vw, 50px)' }}>{r.title}</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted" style={{ fontSize: 'clamp(12px, 1vw, 18px)', fontWeight: 700 }}>{s.clock.pausedAt ? 'PAUSED' : 'REAL TIME LEFT'}</div>
          <div className="bigclock" style={{ color: left < 60 ? '#FF6B6F' : '#FFD36B' }}>{fmtSec(left)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(['A', 'B', 'C', 'D'] as OptionKey[]).map((k) => (
          <span key={k} className="chip" style={{ fontSize: 'clamp(13px, 1.05vw, 19px)', textDecoration: killed.includes(k) ? 'line-through' : 'none', opacity: killed.includes(k) ? 0.5 : 1 }}><b style={{ color: '#FFD36B' }}>{k}</b> {r.options[k].label}</span>
        ))}
      </div>
      <div className="tables-grid" style={{ gridTemplateColumns: `repeat(${tbs.length > 4 ? 4 : Math.max(2, tbs.length)}, minmax(0, 1fr))` }}>
        {tbs.map((tb) => {
          const tr = team(s, tb); const sd = tr.sealed;
          const pct = (teamLeft(s, tb, now) / budget(s)) * 100;
          return (
            <div key={tb} className="tcard" style={sd ? { borderColor: sd.river ? 'var(--ruby)' : 'var(--gold-hi)' } : {}}>
              <span className="name"><span className="diamond" style={{ background: tableColor(tb) }} />{tableName(tb)}</span>
              <div className="between">
                <span style={{ fontFamily: 'var(--f-title)', fontWeight: 700, fontSize: 'clamp(20px, 1.8vw, 34px)', color: 'var(--cream)' }}>{gameClockLabel(s, tb, now)}</span>
                {sd ? <span style={{ fontFamily: 'var(--f-fun)', fontSize: 'clamp(16px,1.4vw,26px)', color: sd.river ? '#FF6B6F' : '#FFD36B' }}>{sd.river ? 'RIVER DECIDED' : 'SEALED'}</span>
                  : <span className="muted" style={{ fontWeight: 700, fontSize: 'clamp(12px,1vw,18px)' }}>thinking</span>}
              </div>
              <div className="bar"><div style={{ width: `${sd ? 0 : pct}%` }} /></div>
              <div className="muted" style={{ fontSize: 'clamp(12px, 0.95vw, 17px)', fontWeight: 700 }}>{tr.pins.length} pins · {tr.opened.length} reports · {tr.calls.length} calls</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Review({ s }: { s: GameState }) {
  const tbs = tablesInUse(s);
  return (
    <div className="content">
      <span className="kicker">ROUND {s.roundIdx + 1} · WHAT EACH TABLE DECIDED</span>
      <h1 style={{ fontSize: 'clamp(26px, 2.6vw, 50px)' }}>Defend your call</h1>
      <div className="tables-grid">
        {tbs.map((tb) => {
          const sd = team(s, tb).sealed;
          return (
            <div key={tb} className="tcard">
              <div className="between"><span className="name"><span className="diamond" style={{ background: tableColor(tb) }} />{tableName(tb)}</span>{team(s, tb).defended && <span className="chip" style={{ color: '#FFD36B' }}>+1 defended</span>}</div>
              <p style={{ margin: 0, fontSize: 'clamp(14px, 1.2vw, 22px)', lineHeight: 1.45 }}>{!sd ? '...' : sd.river ? 'No decision in time. The river chose D.' : rationale(s, tb, sd)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Reveal({ s }: { s: GameState }) {
  const rs = roundResults(s); const mg = magnets(rs); const r = round(s);
  const champ = rs[0];
  return (
    <div className="content">
      <div className="between">
        <div><span className="kicker">ROUND {s.roundIdx + 1} RESULTS · SPEED × QUALITY × TRUST</span><h1 style={{ fontSize: 'clamp(26px, 2.6vw, 50px)' }}>What the river says</h1></div>
        <div className="muted" style={{ fontSize: 'clamp(13px, 1vw, 18px)', textAlign: 'right' }}>Luck shows in the story,<br />never in the score.</div>
      </div>
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        {rs.map((x, i) => (
          <div key={x.table} className="rank-row" style={{ borderTop: i ? '1px solid rgba(201,162,74,0.2)' : 'none', background: i === 0 ? 'rgba(226,174,78,0.12)' : 'transparent' }}>
            <span style={{ fontFamily: 'var(--f-fun)', fontSize: 'clamp(22px,2vw,38px)', color: i === 0 ? '#FFD36B' : 'var(--soft)' }}>{i + 1}</span>
            <span style={{ fontWeight: 800, fontSize: 'clamp(14px,1.2vw,22px)' }}>{tableName(x.table)}</span>
            <span style={{ fontSize: 'clamp(13px,1.05vw,19px)' }}>{x.sealed ? <><b style={{ color: '#FFD36B' }}>{x.sealed.option}</b> {r.options[x.sealed.option].label}{x.sealed.river ? ' (river)' : ''}</> : '-'}</span>
            <span className="muted" style={{ fontSize: 'clamp(12px,0.95vw,17px)', lineHeight: 1.35 }}>{x.outcome?.text}</span>
            <span className="sqt"><span>S{x.S}</span><span>Q{x.Q}</span><span>T{x.T}</span><span className="score" style={{ background: 'none', fontSize: 'clamp(18px,1.6vw,30px)' }}>{x.total}</span></span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1.2vw' }}>
        {(['S', 'Q', 'T'] as const).map((ax) => (
          <div key={ax} className="panel" style={{ padding: '1vh 1vw', flex: 1 }}>
            <div className="tag" style={{ color: '#FFD36B' }}>{ax === 'S' ? 'Fastest' : ax === 'Q' ? 'Best evidence' : 'Most trusted'}</div>
            <div style={{ fontWeight: 700, fontSize: 'clamp(13px,1.05vw,19px)' }}>{mg[ax].map((t) => tableName(t).split(' · ')[1]).join(', ') || '-'}</div>
          </div>
        ))}
      </div>
      {champ && <img src="/img/pebble_cheer.webp" alt="" className="bob" style={{ position: 'absolute', right: '1.5vw', bottom: '2vh', height: '22vh' }} />}
    </div>
  );
}

function Final({ s }: { s: GameState }) {
  const g = grandTotals(s);
  return (
    <div className="content" style={{ alignItems: 'center' }}>
      <span className="kicker">FINAL RESULTS · BOTH ROUNDS</span>
      <h1>The river&apos;s best desks</h1>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2vw', marginTop: '3vh' }}>
        {[1, 0, 2].map((i) => g[i] && (
          <div key={g[i].table} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 'clamp(15px,1.3vw,24px)' }}>{tableName(g[i].table)}</span>
            <span className="score" style={{ fontSize: 'clamp(24px,2.4vw,44px)' }}>{g[i].total}</span>
            <div className="panel" style={{ width: '16vw', height: ['30vh', '22vh', '15vh'][i], display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '1.5vh', background: i === 0 ? 'linear-gradient(180deg, rgba(226,174,78,0.4), rgba(8,17,40,0.85))' : undefined }}>
              <span style={{ fontFamily: 'var(--f-fun)', fontSize: 'clamp(40px,4vw,76px)', color: '#FFD36B' }}>{i + 1}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 'clamp(13px,1vw,18px)' }}>{g.slice(3).map((x, i) => `${i + 4}. ${tableName(x.table)} ${x.total}`).join('   ·   ')}</div>
      <img src="/img/pebble_cheer.webp" alt="" className="bob" style={{ position: 'absolute', right: '6vw', bottom: '6vh', height: '30vh' }} />
      <img src="/img/sunluna_logo.webp" alt="Sun & Luna" style={{ position: 'absolute', left: '5vw', bottom: '6vh', height: '18vh', opacity: 0.95 }} />
    </div>
  );
}

function RuleSlide({ slide, index }: { slide: { big: string; small: string; pebble: string }; index: number | null }) {
  return (
    <div className="content" style={{ justifyContent: 'center', paddingLeft: '7vw' }}>
      {index === 0 && <img src="/img/sunluna_logo.webp" alt="Sun & Luna, fine jewelry" style={{ height: '24vh', alignSelf: 'flex-start', animation: 'pop 600ms ease-out', marginBottom: '1vh' }} />}
      <span className="kicker">{index === null ? 'NEW IN ROUND 2' : `HOW TO PLAY · ${index + 1} OF ${RULE_SLIDES.length}`}</span>
      <h1 key={slide.big} style={{ fontSize: 'clamp(40px, 5vw, 96px)', maxWidth: '62vw', animation: 'pop 420ms ease-out' }}>{slide.big}</h1>
      <p key={slide.small} style={{ margin: 0, fontSize: 'clamp(20px, 2vw, 38px)', color: 'var(--soft)', maxWidth: '58vw', lineHeight: 1.4, animation: 'fadeIn 500ms ease-out' }}>{slide.small}</p>
      {index !== null && (
        <div style={{ display: 'flex', gap: 10, marginTop: '2vh' }}>
          {RULE_SLIDES.map((_, i) => <span key={i} style={{ width: i === index ? 46 : 14, height: 14, borderRadius: 7, background: i <= index ? 'var(--gold)' : 'rgba(255,255,255,0.2)', transition: 'width 300ms' }} />)}
        </div>
      )}
      <img key={slide.pebble} src={`/img/pebble_${slide.pebble}.webp`} alt="" className="bob" style={{ position: 'absolute', right: '7vw', bottom: '14vh', height: '44vh', animation: 'pop 500ms ease-out' }} />
    </div>
  );
}

function Rules({ audio, soundOn }: { audio: AudioDirector; soundOn: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const off = audio.onLine((id) => { const i = RULE_SLIDES.findIndex((x) => x.voice === id); if (i >= 0) setIdx(i); });
    audio.sayList(RULE_SLIDES.map((x) => x.voice));
    // leaving the rules screen (host opened the brief early) cuts the rest of the rules narration
    return () => { off(); audio.cancelLines(RULE_SLIDES.map((x) => x.voice)); };
  }, [audio]);
  return (
    <>
      <RuleSlide slide={RULE_SLIDES[idx]} index={idx} />
      {!soundOn && <div className="muted" style={{ position: 'absolute', left: '7vw', bottom: '22vh', fontSize: 16 }}>Sound is off: subtitles run at reading speed.</div>}
    </>
  );
}

function RiverBanners({ s, now }: { s: GameState; now: number }) {
  const t = realElapsed(s, now);
  const tbs = tablesInUse(s); const sealed = tbs.filter((tb) => team(s, tb).sealed).length;
  if (s.market?.open) {
    const left = s.market.until - t;
    return (
      <div style={{ position: 'absolute', left: '4vw', right: '4vw', bottom: '17vh', zIndex: 40, display: 'flex', flexDirection: 'column', gap: '1.2vh', animation: 'fadeIn 300ms' }}>
        <div className="panel" style={{ padding: '1.4vh 1.6vw', display: 'flex', alignItems: 'center', gap: '1.6vw', borderColor: 'var(--gold-hi)', background: 'rgba(40,26,4,0.88)' }}>
          <span style={{ fontFamily: 'var(--f-fun)', fontSize: 'clamp(28px, 2.8vw, 54px)', color: '#FFD36B' }}>MARKET OPEN</span>
          <span className="bigclock" style={{ fontSize: 'clamp(28px, 2.8vw, 54px)' }}>{fmtSec(left)}</span>
          <span style={{ fontSize: 'clamp(14px, 1.15vw, 22px)', color: 'var(--cream)', flex: 1 }}>Visit, listen, trade. Keep half your table at home. Check the source before you trust it.</span>
        </div>
        <div style={{ display: 'flex', gap: '0.8vw', flexWrap: 'wrap' }}>
          {tbs.map((tb) => {
            const tr = team(s, tb); const visitors = Object.values(s.players).filter((p) => p.scoutAt === tb).length;
            return <span key={tb} className="chip" style={{ fontSize: 'clamp(13px,1.05vw,19px)', borderColor: tr.stance === 'closed' ? 'var(--ruby)' : 'var(--emerald)', color: tr.stance === 'closed' ? '#FF9A9D' : 'var(--emerald)' }}>{tableName(tb).split(' · ')[1]} · {tr.stance === 'closed' ? 'CLOSED' : `open · ${visitors} visiting`}</span>;
          })}
        </div>
      </div>
    );
  }
  if (s.rise) {
    const left = s.rise.until - t;
    return (
      <div style={{ position: 'absolute', left: '50%', top: '3vh', transform: 'translateX(-50%)', zIndex: 40, padding: '1.2vh 2vw', borderRadius: 16, background: 'linear-gradient(90deg,#0B3B66,#1565A8)', border: '2px solid var(--river)', boxShadow: '0 0 40px rgba(95,212,255,0.5)', display: 'flex', alignItems: 'center', gap: '1.4vw', animation: 'pop 500ms ease-out' }}>
        <span style={{ fontFamily: 'var(--f-fun)', fontSize: 'clamp(24px, 2.4vw, 46px)', color: '#fff' }}>THE RIVER IS RISING</span>
        <span className="bigclock" style={{ color: '#fff', fontSize: 'clamp(26px, 2.6vw, 50px)' }}>{fmtSec(left)}</span>
      </div>
    );
  }
  if (tbs.length >= 3 && sealed >= Math.ceil(tbs.length / 2) && sealed < tbs.length) {
    return (
      <div style={{ position: 'absolute', left: '50%', top: '3vh', transform: 'translateX(-50%)', zIndex: 40, padding: '0.8vh 1.4vw', borderRadius: 14, background: 'rgba(11,59,102,0.85)', border: '1px solid var(--river)', fontWeight: 800, fontSize: 'clamp(14px, 1.2vw, 22px)', color: 'var(--river-soft)' }}>
        Water rising: {sealed} of {tbs.length} tables have sealed. When two thirds seal, the rest get 2 minutes.
      </div>
    );
  }
  return null;
}
