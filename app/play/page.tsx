'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNow, useQuery, useRoom, fmtSec } from '../../src/game/client';
import { uid } from '../../src/game/net';
import {
  round, team, members, playerCards, refLabel, realElapsed, tablesInUse, findCard, killedOptions, gameClockLabel, teamLeft, budget, canSeal, rationale,
  finalScore, roundResults, grandTotals, deadlineLabel, type GameState, type Action,
} from '../../src/game/engine';
import { ROLE_NAMES, PACK, RULE_SLIDES, MARKET, COPY, type OptionKey, type RoleId } from '../../src/game/pack';
import { AudioDirector } from '../../src/ui/audio';
import { CallSubtitle } from '../../src/ui/Subtitle';
import { tableName, GEM, RoleTag } from '../../src/ui/common';

type Tab = 'desk' | 'calls' | 'board' | 'decide';

export default function PlayPage() {
  const qRoom = useQuery('room'); const qPid = useQuery('pid');
  const [room, setRoom] = useState<string | null>(null);
  const [pid, setPid] = useState<string>('');
  useEffect(() => {
    // ?pid= lets automated tests run many phones in one browser; real phones use their own storage
    let id = qPid || localStorage.getItem('wwd:pid'); if (!id) { id = uid(); localStorage.setItem('wwd:pid', id); }
    setPid(id);
    const r = qRoom?.toUpperCase() ?? localStorage.getItem('wwd:lastroom');
    if (r) setRoom(r);
  }, [qRoom, qPid]);
  const { state, send, offset, connected } = useRoom(room);
  const audio = useMemo(() => new AudioDirector(), []);
  const [toast, setToast] = useState<{ text: string; good?: boolean } | null>(null);
  const flash = (text: string, good = false) => { setToast({ text, good }); setTimeout(() => setToast(null), 2800); };
  const act = async (a: Action) => { const r = await send(a); if (!r.ok) flash(r.error ?? 'Something went wrong.'); return r.ok; };

  // heartbeat
  useEffect(() => {
    if (!state || !pid || !state.players[pid]) return;
    const iv = setInterval(() => send({ t: 'heartbeat', playerId: pid }), 10000);
    return () => clearInterval(iv);
  }, [!!state?.players[pid], pid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!room) return <EnterRoom onRoom={(r) => { localStorage.setItem('wwd:lastroom', r); setRoom(r); }} />;
  if (!state) return <div className="phone" style={{ padding: 20, gap: 12 }}><span className="tag" style={{ color: '#FFD36B' }}>ROOM {room}</span><p className="muted">Looking for the big screen… If this takes long, check the room code.</p><button className="btn-ghost" onClick={() => { localStorage.removeItem('wwd:lastroom'); setRoom(null); }}>Change room</button></div>;
  const me = state.players[pid];
  return (
    <>
      {!me ? <Join s={state} pid={pid} act={act} audio={audio} /> : <Game s={state} pid={pid} act={act} audio={audio} offset={offset} connected={connected} flash={flash} />}
      {toast && <div className={`toast ${toast.good ? 'good' : ''}`}>{toast.text}</div>}
    </>
  );
}

function EnterRoom({ onRoom }: { onRoom: (r: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="phone" style={{ padding: 22, gap: 14, justifyContent: 'center' }}>
      <img src="/img/pebble_wave.webp" alt="" style={{ height: 150, alignSelf: 'center' }} className="bob" />
      <h2 style={{ fontSize: 26, textAlign: 'center' }}>{COPY.gameName}</h2>
      <input className="field" placeholder="Room code on the big screen" value={v} onChange={(e) => setV(e.target.value.toUpperCase())} autoCapitalize="characters" />
      <button className="btn-gold" onClick={() => v.trim() && onRoom(v.trim())}>Continue</button>
    </div>
  );
}

function Join({ s, pid, act, audio }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean>; audio: AudioDirector }) {
  const [name, setName] = useState(''); const [table, setTable] = useState<number | null>(null);
  useEffect(() => { setName(localStorage.getItem('wwd:name') ?? ''); }, []);
  const go = async () => {
    if (!table) return;
    audio.unlock();
    localStorage.setItem('wwd:name', name.trim());
    await act({ t: 'join', playerId: pid, name, table });
  };
  return (
    <div className="phone" style={{ padding: 20, gap: 16 }}>
      <header style={{ padding: 0 }}><span className="tag" style={{ color: 'var(--river-soft)' }}>ROOM {s.room}</span><h2 style={{ fontSize: 26, marginTop: 6 }}>Join your table</h2></header>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="tag" style={{ color: '#FFD36B' }}>YOUR NICKNAME</span>
        <input className="field" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Linh" /></label>
      <span className="tag" style={{ color: '#FFD36B' }}>YOUR TABLE NUMBER</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {Array.from({ length: 8 }, (_, i) => i + 1).map((t) => {
          const n = members(s, t).length;
          return <button key={t} className={table === t ? 'btn-gold' : 'btn-ghost'} style={{ minHeight: 60, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }} onClick={() => setTable(t)}><span style={{ fontSize: 22, fontWeight: 800 }}>{t}</span><span style={{ fontSize: 11, opacity: 0.8 }}>{n ? `${n} here` : 'empty'}</span></button>;
        })}
      </div>
      <button className="btn-gold" disabled={!name.trim() || !table} onClick={go} style={{ minHeight: 56, fontSize: 18 }}>Join {table ? tableName(table) : ''}</button>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>We only keep your nickname, and only for this session. Sound for calls plays on your phone, so keep the volume low.</p>
    </div>
  );
}

function Game({ s, pid, act, audio, offset, connected, flash }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean>; audio: AudioDirector; offset: number; connected: boolean; flash: (t: string, g?: boolean) => void }) {
  const me = s.players[pid]; const tb = me.table; const tr = team(s, tb); const r = round(s);
  const now = useNow(offset, 500);
  const [tab, setTab] = useState<Tab>('desk');
  const [activeCall, setActiveCall] = useState<{ title: string; text: string } | null>(null);
  const isLeader = tr.leader === pid;
  const unlock = () => audio.unlock();

  // play replies to my own actions (calls, trap, small call) on this phone only, with subtitles
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys: [string, string | null, string, string][] = [];
    tr.calls.forEach((c) => keys.push([`call:${r.id}:${c.id}`, c.voice, c.name, c.text]));
    if (tr.trap?.reply) keys.push([`trap:${r.id}:${tr.trap.state}`, tr.trap.reply.voice, tr.trap.reply.who, tr.trap.reply.text]);
    if (tr.small?.reply) keys.push([`small:${r.id}:${tr.small.state}`, tr.small.reply.voice, tr.small.reply.who, tr.small.reply.text]);
    if (seen.current === null) { seen.current = new Set(keys.map((k) => k[0])); return; }
    for (const [k, voice, who, text] of keys) {
      if (seen.current.has(k)) continue; seen.current.add(k);
      const mine = k.startsWith('call:') ? tr.calls.find((c) => `call:${r.id}:${c.id}` === k)?.by === pid : k.startsWith('trap:') ? tr.trap?.by === pid : tr.small?.by === pid;
      if (!mine) continue;
      setActiveCall({ title: who, text });
      audio.muteVoice = s.settings.muteCalls;
      if (voice) { if (k.startsWith('call:')) { audio.sfx('ring', 0.4); setTimeout(() => audio.sayNow(voice, 0.55, text), 1500); } else audio.sayNow(voice, 0.55, text); }
    }
  }, [tr.calls.length, tr.trap?.state, tr.small?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // the trap and small call ring on the leader's phone
  const rang = useRef<Set<string>>(new Set());
  const live = useRef({ trap: tr.trap?.state, small: tr.small?.state }); live.current = { trap: tr.trap?.state, small: tr.small?.state };
  useEffect(() => {
    if (!isLeader) return;
    if (tr.trap?.state === 'pending' && !rang.current.has('trap' + r.id)) { rang.current.add('trap' + r.id); audio.muteVoice = s.settings.muteCalls; audio.sfx('ring', 0.4); setTimeout(() => { if (live.current.trap === 'pending') audio.sayNow('call_trap', 0.55); }, 1500); }
    if (tr.small?.state === 'pending' && !rang.current.has('small' + r.id)) { rang.current.add('small' + r.id); audio.muteVoice = s.settings.muteCalls; audio.sfx('ring', 0.4); setTimeout(() => { if (live.current.small === 'pending') audio.sayNow('call_small', 0.55); }, 1500); }
  }, [tr.trap?.state, tr.small?.state, isLeader]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (killedOptions(s).length && 'vibrate' in navigator) navigator.vibrate?.(200); }, [killedOptions(s).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const ms = members(s, tb);
  const header = (
    <header>
      <img src="/img/stage_river.webp" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 70%', opacity: 0.4 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(7,15,38,0.35), #070F26)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="between">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="tag" style={{ color: 'var(--river-soft)' }}>{s.phase === 'lobby' ? 'LOBBY' : `ROUND ${s.roundIdx + 1} · ${r.title.toUpperCase()}`}</span>
            <span style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name} · {tableName(tb)}{isLeader && s.phase !== 'lobby' ? ' · ★ leader' : ''}</span>
          </div>
          {s.phase === 'play' && <div style={{ textAlign: 'right' }}><div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)' }}>GAME CLOCK · DUE {deadlineLabel(s)}</div><div style={{ fontFamily: 'var(--f-title)', fontWeight: 700, fontSize: 26, color: s.clock.pausedAt ? 'var(--muted)' : '#FFD36B' }}>{gameClockLabel(s, tb, now)}</div></div>}
        </div>
        {s.phase === 'play' && <div className="bar"><div style={{ width: `${(teamLeft(s, tb, now) / budget(s)) * 100}%` }} /></div>}
        {s.phase !== 'lobby' && me.roles.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{me.roles.map((x) => <RoleTag key={x} role={x} />)}</div>}
        {!connected && <span className="tag" style={{ color: '#FF6B6F' }}>RECONNECTING TO THE BIG SCREEN…</span>}
      </div>
    </header>
  );

  if (s.phase === 'rules') return (
    <div className="phone" onClick={unlock}>{header}<main>
      <div className="pcard"><span className="tag" style={{ color: '#FFD36B' }}>HOW TO PLAY · LISTEN TO THE BIG SCREEN</span>
        {RULE_SLIDES.map((x, i) => <p key={i} style={{ fontSize: 15 }}><b style={{ color: '#FFD36B' }}>{i + 1}.</b> <b>{x.big}</b><br /><span className="muted">{x.small}</span></p>)}
      </div>
      <img src="/img/pebble_point.webp" alt="" style={{ height: 140, alignSelf: 'center' }} className="bob" />
    </main></div>
  );

  if (s.phase === 'lobby' || s.phase === 'brief') return (
    <div className="phone" onClick={unlock}>{header}<main>
      {s.phase === 'lobby' ? (
        <div className="pcard"><span className="t">You are in!</span><p>Wait for the host. At your table: {ms.map((m) => m.name).join(', ')}.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><img src="/img/sunluna_emblem.webp" alt="" style={{ height: 44 }} /><span className="muted" style={{ fontSize: 14 }}>Today your table leads <b style={{ color: '#FFD36B' }}>{COPY.companyLine}</b>.</span></div>
          <p className="muted" style={{ fontSize: 14 }}>Tables play best with 3 to 6 people.</p></div>
      ) : (
        <>
          <div className="pcard"><span className="tag" style={{ color: '#FFD36B', display: 'flex', alignItems: 'center', gap: 8 }}><img src="/img/sunluna_emblem.webp" alt="" style={{ height: 26 }} />THE BRIEF · SUN &amp; LUNA</span><p>{r.brief}</p></div>
          {(['A', 'B', 'C', 'D'] as OptionKey[]).map((k) => <div key={k} className="pcard"><span className="t">{k}. {r.options[k].label}</span><p className="muted" style={{ fontSize: 15 }}>{r.options[k].text}</p></div>)}
          <p className="muted" style={{ fontSize: 14 }}>Your role and your cards appear when the host starts the round.</p>
        </>
      )}
      <img src="/img/pebble_think.webp" alt="" style={{ height: 140, alignSelf: 'center' }} className="bob" />
    </main></div>
  );

  if (s.phase === 'review' || s.phase === 'reveal' || s.phase === 'final' || tr.sealed) return <After s={s} pid={pid} now={now} header={header} market={s.market?.open && s.phase === 'play' ? <MarketPanel s={s} pid={pid} act={act} now={now} /> : null} />;

  // ---------- play ----------
  const killed = killedOptions(s);
  const cards = playerCards(s, pid);
  const callsMade = tr.calls.length;
  return (
    <div className="phone" onClick={unlock}>
      {header}
      {killed.length > 0 && <div style={{ margin: '0 10px', borderRadius: 10, background: 'linear-gradient(90deg,#B3171D,#D2353A)', padding: '8px 12px', fontWeight: 700, fontSize: 14 }}><span style={{ background: '#fff', color: '#B3171D', padding: '1px 7px', borderRadius: 5, fontSize: 11, fontWeight: 800, marginRight: 8 }}>BREAKING</span>{r.breaking_news?.[0].text} Option {killed.join(', ')} is out.</div>}
      {s.rise && <div style={{ margin: '8px 10px 0', borderRadius: 10, background: 'linear-gradient(90deg,#0B6E9C,#1597D1)', padding: '8px 12px', fontWeight: 700, fontSize: 14, display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>THE RIVER IS RISING. Seal before it reaches you.</span><span style={{ fontFamily: 'var(--f-title)', fontSize: 18 }}>{fmtSec(Math.max(0, s.rise.until - realElapsed(s, now)))}</span></div>}
      {s.market?.open && <MarketPanel s={s} pid={pid} act={act} now={now} />}
      <nav className="tabs">
        {(['desk', 'calls', 'board', 'decide'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'desk' ? 'My desk' : t === 'calls' ? `Calls · ${callsMade}` : t === 'board' ? `Board · ${tr.pins.length}` : 'Decide'}</button>)}
      </nav>
      <main>
        {tab === 'desk' && <Desk s={s} pid={pid} cards={cards} act={act} />}
        {tab === 'calls' && <Calls s={s} pid={pid} act={act} />}
        {tab === 'board' && <Board s={s} pid={pid} act={act} />}
        {tab === 'decide' && <Decide s={s} pid={pid} act={act} now={now} flash={flash} />}
      </main>
      {tr.trap?.state === 'pending' && <TrapSheet s={s} pid={pid} act={act} />}
      {tr.trap?.state !== 'pending' && tr.small?.state === 'pending' && <SmallSheet s={s} pid={pid} act={act} />}
      {activeCall && (
        <div className="sheet" onClick={() => { audio.stopVoice(); setActiveCall(null); }}><div onClick={(e) => e.stopPropagation()}>
          <div className="row"><img src={GEM.call} className="gem" alt="" /><span className="tag" style={{ color: 'var(--emerald)' }}>ON THE LINE</span></div>
          <span className="t" style={{ fontFamily: 'var(--f-title)', fontSize: 19, color: 'var(--cream)' }}>{activeCall.title}</span>
          <CallSubtitle audio={audio} fallback={activeCall.text} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>The full answer stays on your team board under Calls.</p>
          <button className="btn-ghost" onClick={() => { audio.stopVoice(); setActiveCall(null); }}>Hang up</button>
        </div></div>
      )}
    </div>
  );
}

function Desk({ s, pid, cards, act }: { s: GameState; pid: string; cards: ReturnType<typeof playerCards>; act: (a: Action) => Promise<boolean> }) {
  const [arm, setArm] = useState<string | null>(null);
  if (!cards.length) return <div className="pcard"><span className="t">Chief of Staff</span><p>You hold no data. You run the clock, push the table to decide, and help the leader write the rationale on the Decide tab.</p></div>;
  return (
    <>
      {cards.map((c) => (
        <article key={c.id} className={`pcard ${c.kind === 'rumor' || c.kind === 'buzz' ? 'rumor' : ''}`} style={c.exclusive ? { borderColor: 'var(--gold-hi)', boxShadow: '0 0 0 1px var(--gold-hi) inset' } : undefined}>
          <div className="row">
            <img className="gem" src={GEM[c.kind]} alt="" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tag" style={{ color: c.kind === 'rumor' || c.kind === 'buzz' ? 'var(--amber)' : c.exclusive ? '#FFD36B' : 'var(--muted)' }}>{c.exclusive ? (c.kind === 'buzz' ? 'EXCLUSIVE · UNCONFIRMED BUZZ' : 'EXCLUSIVE · CONFIRMED') : `${ROLE_NAMES[c.role]} · ${c.kind === 'note' ? 'note' : c.kind}${c.state === 'sealed' ? ' · sealed' : ''}`}</div>
              {c.title && <span className="t">{c.title}</span>}
            </div>
            {c.pinned && <span className="tag" style={{ color: 'var(--emerald)' }}>PINNED</span>}
          </div>
          {c.state === 'sealed' ? (
            <button className={arm === c.id ? 'btn-ruby' : 'btn-ghost'} style={{ borderColor: 'rgba(255,184,119,0.75)', color: arm === c.id ? '#fff' : 'var(--amber)' }} onClick={async () => { if (arm !== c.id) { setArm(c.id); setTimeout(() => setArm(null), 3500); return; } setArm(null); await act({ t: 'open', playerId: pid, cardId: c.id }); }}>
              {arm === c.id ? `Tap again: spend ${c.cost} game minutes` : `Open · ${c.cost} min`}
            </button>
          ) : (
            <>
              <p style={c.kind === 'rumor' || c.kind === 'buzz' ? { fontStyle: 'italic' } : {}}>{c.kind === 'rumor' || c.kind === 'buzz' ? `"${c.text}"` : c.text}</p>
              {c.kind === 'rumor' && <span className="muted" style={{ fontSize: 13 }}>Source: {c.source}. Not checked.</span>}
              {c.kind === 'buzz' && <span className="muted" style={{ fontSize: 13 }}>Word going around. Nobody has confirmed it. Your call.</span>}
              {c.exclusive && <span className="muted" style={{ fontSize: 13 }}>Only your table has this card. You can share it while the market is open.</span>}
              <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => act(c.pinned ? { t: 'unpin', playerId: pid, ref: c.id } : { t: 'pin', playerId: pid, ref: c.id })}>{c.pinned ? 'Unpin' : 'Pin to team board'}</button>
            </>
          )}
        </article>
      ))}
    </>
  );
}

function Calls({ s, pid, act }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean> }) {
  const tr = team(s, s.players[pid].table); const r = round(s);
  const [arm, setArm] = useState<string | null>(null);
  return (
    <>
      <div className="pcard" style={{ background: 'transparent' }}><p style={{ fontSize: 14 }} className="muted">Each call costs 15 game minutes. Your table has made {tr.calls.length}. Ask the right people, not everyone: calls after the 2nd cost trust.</p></div>
      {r.stakeholders.map((st) => {
        const done = tr.calls.find((c) => c.stakeholder === st.id);
        return (
          <article key={st.id} className="pcard call">
            <div className="row"><img className="gem" src={GEM.call} alt="" /><span className="t" style={{ flex: 1 }}>{st.name}</span>{done && <span className="tag" style={{ color: 'var(--emerald)' }}>CALLED</span>}</div>
            {done ? <p>{done.text}</p> : (
              <button className={arm === st.id ? 'btn-ruby' : 'btn-ghost'} onClick={async () => { if (arm !== st.id) { setArm(st.id); setTimeout(() => setArm(null), 3500); return; } setArm(null); await act({ t: 'call', playerId: pid, stakeholder: st.id }); }}>
                {arm === st.id ? 'Tap again to call · 15 min' : 'Call · 15 min'}
              </button>
            )}
          </article>
        );
      })}
    </>
  );
}

function Board({ s, pid, act }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean> }) {
  const tb = s.players[pid].table; const tr = team(s, tb);
  return (
    <>
      <span className="tag" style={{ color: '#FFD36B', padding: '0 4px' }}>PINNED EVIDENCE · {tr.pins.length}</span>
      {tr.pins.length === 0 && <p className="muted" style={{ padding: '0 4px' }}>Nothing pinned yet. Pin the facts that matter from your desk and from calls.</p>}
      {tr.pins.map((p) => {
        const L = refLabel(s, tb, p.ref); if (!L) return null;
        return (
          <article key={p.ref} className={`pcard ${L.kind === 'rumor' ? 'rumor' : L.kind === 'call' ? 'call' : ''}`}>
            <div className="row"><img className="gem" src={GEM[L.kind]} alt="" /><span className="t" style={{ flex: 1 }}>{L.title}</span>{L.role && <RoleTag role={L.role as RoleId} />}{L.from && <span className="tag" style={{ color: '#FFD36B' }}>FROM TABLE {L.from}</span>}</div>
            <p style={{ fontSize: 15 }}>{L.kind === 'rumor' ? `Rumor: "${L.text}"` : L.kind === 'buzz' ? `Unconfirmed: "${L.text}"` : L.text}</p>
            <div className="between"><span className="muted" style={{ fontSize: 12 }}>{p.by.startsWith('table:') ? `Shared by Table ${p.by.slice(6)}` : `Pinned by ${s.players[p.by]?.name ?? 'someone'}`}</span><button className="btn-ghost" style={{ minHeight: 34, fontSize: 12 }} onClick={() => act({ t: 'unpin', playerId: pid, ref: p.ref })}>Unpin</button></div>
          </article>
        );
      })}
      {tr.calls.filter((c) => !tr.pins.some((p) => p.ref === `call:${c.stakeholder}`)).length > 0 && <span className="tag" style={{ color: 'var(--emerald)', padding: '0 4px' }}>CALLS NOT PINNED</span>}
      {tr.calls.filter((c) => !tr.pins.some((p) => p.ref === `call:${c.stakeholder}`)).map((c) => (
        <article key={c.id} className="pcard call"><span className="t">{c.name}</span><p style={{ fontSize: 15 }}>{c.text}</p>
          <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => act({ t: 'pin', playerId: pid, ref: `call:${c.stakeholder}` })}>Pin to team board</button></article>
      ))}
    </>
  );
}

function Decide({ s, pid, act, now, flash }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean>; now: number; flash: (t: string, g?: boolean) => void }) {
  const tb = s.players[pid].table; const tr = team(s, tb); const r = round(s); const killed = killedOptions(s);
  const d = tr.draft; const [arm, setArm] = useState(false);
  const measures = useMemo(() => { const all = [...r.measures.right, ...r.measures.wrong]; return [all[2], all[0], all[3], all[1]]; }, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = canSeal(s, tb, pid, now);
  const leader = tr.leader ? s.players[tr.leader] : null;
  const toggleEv = (ref: string) => {
    const has = d.evidence.includes(ref);
    if (!has && d.evidence.length >= 2) { flash('Pick at most 2 pieces of evidence. Remove one first.'); return; }
    act({ t: 'draft', playerId: pid, evidence: has ? d.evidence.filter((e) => e !== ref) : [...d.evidence, ref] });
  };
  return (
    <>
      <span className="tag" style={{ color: '#FFD36B', padding: '0 4px' }}>1 · OUR DECISION</span>
      {(['A', 'B', 'C', 'D'] as OptionKey[]).map((k) => (
        <button key={k} className={`choice ${d.option === k ? 'on' : ''}`} disabled={killed.includes(k)} onClick={() => act({ t: 'draft', playerId: pid, option: d.option === k ? null : k })}>
          <b style={{ color: '#FFD36B' }}>{k}.</b> {r.options[k].label}<div className="muted" style={{ fontSize: 13, fontWeight: 400, marginTop: 2 }}>{killed.includes(k) ? 'Ruled out by breaking news.' : r.options[k].text}</div>
        </button>
      ))}
      <span className="tag" style={{ color: '#FFD36B', padding: '8px 4px 0' }}>2 · BECAUSE (PICK UP TO 2 PINS)</span>
      {tr.pins.length === 0 && <p className="muted" style={{ padding: '0 4px', margin: 0 }}>Pin evidence first. A decision with no evidence loses quality.</p>}
      {tr.pins.map((p) => { const L = refLabel(s, tb, p.ref)!; return (
        <button key={p.ref} className={`choice ${d.evidence.includes(p.ref) ? 'on' : ''}`} onClick={() => toggleEv(p.ref)}>
          <span className="tag" style={{ color: L.kind === 'rumor' || L.kind === 'buzz' ? 'var(--amber)' : L.kind === 'call' ? 'var(--emerald)' : 'var(--river-soft)' }}>{L.kind === 'buzz' ? 'unconfirmed' : L.kind}{L.from ? ` · from table ${L.from}` : ''}</span><div style={{ fontSize: 14, fontWeight: 500 }}>{L.text}</div>
        </button>); })}
      <span className="tag" style={{ color: '#FFD36B', padding: '8px 4px 0' }}>3 · WE WILL KNOW IT WORKED IF…</span>
      {measures.map((m) => <button key={m} className={`choice ${d.measure === m ? 'on' : ''}`} onClick={() => act({ t: 'draft', playerId: pid, measure: d.measure === m ? null : m })}>{m}</button>)}
      <div className="pcard" style={{ borderColor: 'var(--gold-hi)' }}>
        <span className="tag" style={{ color: '#FFD36B' }}>OUR RATIONALE</span>
        <p style={{ fontSize: 15 }}>{rationale(s, tb, d) || 'Choose an option to build your sentence.'}</p>
      </div>
      {allowed ? (
        <button className={arm ? 'btn-ruby' : 'btn-gold'} style={{ minHeight: 58, fontSize: 18 }} disabled={!d.option || !d.measure}
          onClick={async () => { if (!arm) { setArm(true); setTimeout(() => setArm(false), 4000); return; } setArm(false); const offerFirst = !!r.trap && !tr.trap; const ok = await act({ t: 'seal', playerId: pid }); if (ok) flash(offerFirst ? 'Not sealed yet: answer the supplier offer first.' : 'Sealed! No way back.', !offerFirst); }}>
          {arm ? 'Tap again to seal for the whole table' : 'Seal the decision'}
        </button>
      ) : <p className="muted" style={{ padding: '0 4px' }}>★ {leader?.name ?? 'Your leader'} seals for the table. Everyone can edit the draft. If the leader is offline for 30 seconds, anyone can seal.</p>}
    </>
  );
}

function TrapSheet({ s, pid, act }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean> }) {
  const r = round(s); const [pick, setPick] = useState<null | 'sign' | 'decline' | 'escalate' | 'ask_time'>(null);
  const labels = COPY.trapLabels;
  return (
    <div className="sheet"><div>
      <div className="row"><img className="gem" src={GEM.offer} alt="" /><span className="tag" style={{ color: 'var(--amber)' }}>INCOMING OFFER · {r.trap!.label}</span></div>
      <span style={{ fontFamily: 'var(--f-title)', fontSize: 20, color: 'var(--cream)', fontWeight: 700 }}>{COPY.trapCaller}</span>
      {team(s, s.players[pid].table).trap?.early && <p style={{ margin: 0, fontSize: 14, color: 'var(--amber)' }}>{COPY.trapNeedAnswer}</p>}
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{r.trap!.text}</p>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Talk as a table. One answer counts for everyone.</p>
      {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => <button key={k} className={`choice ${pick === k ? 'on' : ''}`} onClick={() => setPick(k)}>{labels[k]}</button>)}
      <button className="btn-gold" disabled={!pick} onClick={() => pick && act({ t: 'trap', playerId: pid, choice: pick })}>Confirm for the table</button>
    </div></div>
  );
}

function SmallSheet({ s, pid, act }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean> }) {
  const r = round(s); const [pick, setPick] = useState<null | 'approve' | 'decline' | 'escalate'>(null);
  const labels = COPY.smallLabels;
  return (
    <div className="sheet"><div>
      <div className="row"><img className="gem" src={GEM.call} alt="" /><span className="tag" style={{ color: 'var(--emerald)' }}>QUICK CALL · {r.small_call!.from.toUpperCase()}</span></div>
      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5 }}>{r.small_call!.text}</p>
      {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => <button key={k} className={`choice ${pick === k ? 'on' : ''}`} onClick={() => setPick(k)}>{labels[k]}</button>)}
      <button className="btn-gold" disabled={!pick} onClick={() => pick && act({ t: 'small', playerId: pid, choice: pick })}>Confirm for the table</button>
    </div></div>
  );
}

function After({ s, pid, now, header, market }: { s: GameState; pid: string; now: number; header: React.ReactNode; market?: React.ReactNode }) {
  const tb = s.players[pid].table; const tr = team(s, tb); const sd = tr.sealed; const r = round(s);
  const f = finalScore(tr);
  return (
    <div className="phone">{header}{market}<main>
      {sd && (
        <div className="pcard" style={{ borderColor: 'var(--gold-hi)' }}>
          <span className="tag" style={{ color: '#FFD36B' }}>{sd.river ? 'THE RIVER DECIDED' : 'SEALED'}</span>
          <p>{sd.river ? 'No decision in time. The river chose D for your table.' : rationale(s, tb, sd)}</p>
        </div>
      )}
      {s.phase === 'play' && <><p className="muted" style={{ padding: '0 4px' }}>Waiting for the other tables. Get ready to defend your call in one sentence.</p><img src="/img/pebble_stamp.webp" alt="" style={{ height: 160, alignSelf: 'center' }} className="bob" /></>}
      {s.phase === 'review' && <p className="muted" style={{ padding: '0 4px' }}>The host may ask your table to defend this decision. A fair case earns +1 quality.</p>}
      {(s.phase === 'reveal' || s.phase === 'final') && f && tr.score && (
        <>
          <div className="pcard" style={{ alignItems: 'center', gap: 6 }}>
            <span className="tag" style={{ color: 'var(--river-soft)' }}>ROUND {s.roundIdx + 1} · RANK {roundResults(s).findIndex((x) => x.table === tb) + 1} OF {roundResults(s).length}</span>
            <div className="sqt" style={{ fontSize: 20 }}><span>Speed {f.S}</span><span>Quality {f.Q}</span><span>Trust {f.T}</span></div>
            <span className="score" style={{ fontSize: 40 }}>{f.total}</span>
          </div>
          <div className="pcard"><span className="tag" style={{ color: '#FFD36B' }}>WHY</span>
            {tr.score.notes.map((n, i) => <p key={i} style={{ fontSize: 14 }}>{n}</p>)}
            {tr.defended && <p style={{ fontSize: 14 }}>+1 quality: you defended your call well.</p>}
          </div>
          {tr.outcome && <div className="pcard"><span className="tag" style={{ color: tr.outcome.kind === 'good' ? 'var(--emerald)' : 'var(--amber)' }}>WHAT HAPPENED NEXT (LUCK, NOT SCORE)</span><p style={{ fontSize: 15 }}>{tr.outcome.text}</p></div>}
          {s.phase === 'final' && <div className="pcard"><span className="tag" style={{ color: '#FFD36B' }}>BOTH ROUNDS</span><p>{tableName(tb)}: {grandTotals(s).find((g) => g.table === tb)?.total} points, rank {grandTotals(s).findIndex((g) => g.table === tb) + 1} of {grandTotals(s).length}.</p></div>}
        </>
      )}
      {r && PACK && null}
    </main></div>
  );
}

function MarketPanel({ s, pid, act, now }: { s: GameState; pid: string; act: (a: Action) => Promise<boolean>; now: number }) {
  const me = s.players[pid]; const tb = me.table; const tr = team(s, tb); const r = round(s); const mk = MARKET[r.id];
  const [open, setOpen] = useState(true); const [give, setGive] = useState<string | null>(null);
  const left = Math.max(0, (s.market?.until ?? 0) - realElapsed(s, now));
  const others = tablesInUse(s).filter((t) => t !== tb);
  const away = members(s, tb).filter((m) => m.scoutAt).length; const maxAway = Math.floor(members(s, tb).length / 2);
  const mine = [tr.exclusive, ...tr.pins.map((p) => p.ref).filter((x) => !x.startsWith('call:') && !tr.received.some((rc) => rc.ref === x))].filter(Boolean) as string[];
  return (
    <div style={{ margin: '8px 10px 0', borderRadius: 14, border: '1.5px solid var(--gold-hi)', background: 'linear-gradient(180deg, rgba(64,42,8,0.95), rgba(12,24,56,0.95))', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--f-fun)', fontSize: 22, color: '#FFD36B' }}>MARKET OPEN</span>
        <span style={{ fontFamily: 'var(--f-title)', fontWeight: 700, fontSize: 22, color: '#FFD36B' }}>{Math.floor(left / 60)}:{String(Math.ceil(left % 60) % 60).padStart(2, '0')} {open ? '▴' : '▾'}</span>
      </button>
      {open && <>
        <div className="between">
          <span style={{ fontSize: 14 }}>Our table is <b style={{ color: tr.stance === 'open' ? 'var(--emerald)' : '#FF9A9D' }}>{tr.stance === 'open' ? 'OPEN' : 'CLOSED'}</b> to visitors</span>
          <button className="btn-ghost" style={{ minHeight: 34, fontSize: 12 }} onClick={() => act({ t: 'stance', playerId: pid, stance: tr.stance === 'open' ? 'closed' : 'open' })}>{tr.stance === 'open' ? 'Close it' : 'Open it'}</button>
        </div>
        {tr.stance === 'open' && (
          <>
            <span className="tag" style={{ color: 'var(--river-soft)' }}>{me.scoutAt ? `YOU ARE VISITING TABLE ${me.scoutAt}` : `GO VISIT · ${away} OF ${maxAway} AWAY`}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {me.scoutAt ? <button className="btn-gold" style={{ minHeight: 36, fontSize: 13 }} onClick={() => act({ t: 'scout', playerId: pid, table: null })}>I am back at my table</button>
                : others.map((t) => <button key={t} className="btn-ghost" disabled={team(s, t).stance === 'closed'} style={{ minHeight: 36, fontSize: 13 }} onClick={() => act({ t: 'scout', playerId: pid, table: t })}>Table {t}{team(s, t).stance === 'closed' ? ' (closed)' : ''}</button>)}
            </div>
            <span className="tag" style={{ color: '#FFD36B' }}>SHARE A CARD · {tr.gifts.length} OF {mk?.maxGifts ?? 3} USED</span>
            {give ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>Send this card to:</span>
                {others.filter((t) => team(s, t).stance === 'open' && !team(s, t).sealed).map((t) => <button key={t} className="btn-gold" style={{ minHeight: 36, fontSize: 13 }} onClick={async () => { if (await act({ t: 'give', playerId: pid, ref: give, to: t })) setGive(null); }}>Send to Table {t}</button>)}
                <button className="btn-ghost" style={{ minHeight: 36, fontSize: 13 }} onClick={() => setGive(null)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mine.slice(0, 6).map((ref) => { const c = findCard(r, ref); if (!c) return null; return (
                  <button key={ref} className="choice" style={{ minHeight: 44, fontSize: 13, padding: '6px 10px' }} onClick={() => setGive(ref)}>
                    <span className="tag" style={{ color: c.kind === 'buzz' || c.kind === 'rumor' ? 'var(--amber)' : 'var(--river-soft)' }}>{c.exclusive ? 'exclusive · ' : ''}{c.kind === 'buzz' ? 'unconfirmed' : c.exclusive ? 'confirmed' : c.kind}</span> {c.title ?? (c.text.length > 52 ? c.text.slice(0, c.text.lastIndexOf(' ', 50)) + '…' : c.text)}
                  </button>); })}
                {!mine.length && <span className="muted" style={{ fontSize: 13 }}>Pin cards first to have something to share.</span>}
              </div>
            )}
            <span className="muted" style={{ fontSize: 12 }}>The receiving table spends {mk?.giftCost ?? 10} game minutes to check it. Sharing a confirmed fact earns your table +1 trust.</span>
          </>
        )}
      </>}
    </div>
  );
}
