'use client';
import { useEffect, useState } from 'react';
import { useNow, useQuery, useRoom, fmtSec } from '../../src/game/client';
import { round, realElapsed, deadlineSec, tablesInUse, members, team, isOnline, rationale, finalScore, type HostCmd, type GameState } from '../../src/game/engine';
import { PACK, ROLE_NAMES } from '../../src/game/pack';
import { tableName } from '../../src/ui/common';
import { supa, isAdminEmail } from '../../src/game/supa';
import { ADMIN_EMAILS } from '../../src/game/config';
import { MARKET } from '../../src/game/pack';

export default function HostPage() {
  const qRoom = useQuery('room');
  const [room, setRoom] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [codeIn, setCodeIn] = useState(''); const [pinIn, setPinIn] = useState('');
  const [adminEmail, setAdminEmail] = useState<string | null>(null); const [jwt, setJwt] = useState<string | null>(null);
  const [mailSent, setMailSent] = useState(false); const [emailIn, setEmailIn] = useState(ADMIN_EMAILS[0]);
  // admin sign-in with email link (Supabase); the PIN stays as a backup
  useEffect(() => {
    let off = () => {};
    supa().then(async (sb) => {
      const apply = (session: any) => { const e = session?.user?.email; if (isAdminEmail(e)) { setAdminEmail(e); setJwt(session.access_token); } else { setAdminEmail(null); setJwt(null); } };
      const { data } = await sb.auth.getSession(); apply(data.session);
      const sub = sb.auth.onAuthStateChange((_ev: string, session: any) => apply(session)); off = () => sub.data.subscription.unsubscribe();
    }).catch(() => {});
    return () => off();
  }, []);
  useEffect(() => {
    if (qRoom) setRoom(qRoom.toUpperCase());
    const saved = sessionStorage.getItem('wwd:hostpin'); const savedRoom = sessionStorage.getItem('wwd:hostroom');
    if (saved && savedRoom && (!qRoom || qRoom.toUpperCase() === savedRoom)) { setRoom(savedRoom); setPin(saved); setAuthed(true); }
  }, [qRoom]);
  const { state, send, offset, connected } = useRoom(room);
  const now = useNow(offset, 500);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const flash = (text: string, good = false) => { setMsg({ text, good }); setTimeout(() => setMsg(null), 2600); };
  const usePin = jwt && !pin ? `jwt:${jwt}` : pin;
  const cmd = async (c: HostCmd) => { const r = await send({ t: 'host', pin: usePin, cmd: c }); if (!r.ok) flash(r.error ?? 'Failed'); return r.ok; };
  const signIn = async () => {
    const sb = await supa();
    const { error } = await sb.auth.signInWithOtp({ email: emailIn.trim().toLowerCase(), options: { emailRedirectTo: window.location.href.split('#')[0], shouldCreateUser: true } });
    if (error) flash(error.message); else setMailSent(true);
  };

  if (!authed && !(adminEmail && room)) {
    const login = async () => {
      const rc = (room ?? codeIn).trim().toUpperCase(); if (!rc) return;
      setRoom(rc);
      // verify the PIN with a harmless command
      setPin(pinIn);
      sessionStorage.setItem('wwd:hostroom', rc); sessionStorage.setItem('wwd:hostpin', pinIn);
      setAuthed(true);
    };
    return (
      <div className="phone" style={{ padding: 20, gap: 14, justifyContent: 'center' }}>
        <span className="tag" style={{ color: '#FFD36B' }}>HOST REMOTE</span>
        <h2 style={{ fontSize: 26 }}>Control the game</h2>
        {!qRoom && <input className="field" placeholder="Room code, e.g. RIVER-27" value={codeIn} onChange={(e) => setCodeIn(e.target.value)} autoCapitalize="characters" />}
        <input className="field" placeholder="Host PIN (shown on the big screen)" inputMode="numeric" value={pinIn} onChange={(e) => setPinIn(e.target.value)} />
        <button className="btn-gold" onClick={login}>Open remote with PIN</button>
        <div className="gline" style={{ margin: '6px 0' }} />
        {adminEmail ? (
          <p style={{ margin: 0 }}>Signed in as <b>{adminEmail}</b>. {room ? '' : 'Type the room code above, then press the button.'}</p>
        ) : (
          <>
            <span className="tag" style={{ color: 'var(--river-soft)' }}>OR SIGN IN AS ADMIN</span>
            <input className="field" type="email" placeholder="Admin email" value={emailIn} onChange={(e) => setEmailIn(e.target.value)} />
            <button className="btn-ghost" onClick={signIn}>{mailSent ? 'Link sent: open it on this phone' : 'Email me a sign-in link'}</button>
          </>
        )}
        {adminEmail && !room && codeIn && <button className="btn-gold" onClick={() => setRoom(codeIn.trim().toUpperCase())}>Open remote as admin</button>}
      </div>
    );
  }
  if (!state) return <div className="phone" style={{ padding: 20 }}><p className="muted">Connecting to {room}. Keep the big screen open.</p></div>;
  if (!jwt && state.pin !== pin) return (
    <div className="phone" style={{ padding: 20, gap: 12 }}>
      <p>That PIN does not match room {room}.</p>
      <button className="btn-ghost" onClick={() => { sessionStorage.removeItem('wwd:hostpin'); setAuthed(false); }}>Try again</button>
    </div>
  );
  return <Remote s={state} now={now} cmd={cmd} connected={connected} msg={msg} flash={flash} />;
}

function Remote({ s, now, cmd, connected, msg, flash }: { s: GameState; now: number; cmd: (c: HostCmd) => Promise<boolean>; connected: boolean; msg: { text: string; good?: boolean } | null; flash: (t: string, g?: boolean) => void }) {
  const r = round(s); const tbs = tablesInUse(s);
  const players = Object.values(s.players);
  const online = players.filter((p) => isOnline(p, now)).length;
  const sealed = tbs.filter((t) => team(s, t).sealed).length;
  const [confirm, setConfirm] = useState<null | { text: string; c: HostCmd }>(null);
  const [moveP, setMoveP] = useState<string | null>(null);

  const primary = (() => {
    if (s.phase === 'lobby') return { label: 'Explain the rules (voice)', c: { c: 'rules' } as HostCmd };
    if (s.phase === 'rules') return { label: 'Open Round 1 brief', c: { c: 'brief', round: 0 } as HostCmd };
    if (s.phase === 'brief') return { label: `Start round ${s.roundIdx + 1}`, c: { c: 'start' } as HostCmd };
    if (s.phase === 'play') return { label: 'End round now', c: { c: 'end_round' } as HostCmd, danger: true, confirm: 'End the round? Tables that have not sealed get the river (D).' };
    if (s.phase === 'review') return { label: 'Reveal results', c: { c: 'reveal' } as HostCmd };
    if (s.phase === 'reveal') return s.roundIdx + 1 < PACK.rounds.length ? { label: `Open Round ${s.roundIdx + 2} brief`, c: { c: 'brief', round: s.roundIdx + 1 } as HostCmd } : { label: 'Show final results', c: { c: 'final' } as HostCmd };
    return { label: 'Back to lobby', c: { c: 'lobby' } as HostCmd };
  })();

  const left = deadlineSec(s) - realElapsed(s, now);
  return (
    <div className="phone" style={{ background: '#040918' }}>
      <header style={{ background: 'linear-gradient(180deg,#0C1838,#040918)', borderBottom: '1px solid rgba(201,162,74,0.4)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="between"><span className="tag" style={{ color: '#FFD36B' }}>HOST · {s.room}</span><span className="tag" style={{ color: connected ? 'var(--emerald)' : '#FF6B6F' }}>{connected ? 'LINKED' : 'NO SIGNAL FROM BIG SCREEN'}</span></div>
        <div className="between">
          <span style={{ fontFamily: 'var(--f-title)', fontWeight: 700, fontSize: 18, color: 'var(--cream)' }}>{s.phase === 'lobby' ? 'Lobby' : `Round ${s.roundIdx + 1} · ${s.phase}`}</span>
          {s.phase === 'play' && <span style={{ fontFamily: 'var(--f-title)', fontWeight: 700, fontSize: 30, color: s.clock.pausedAt ? 'var(--muted)' : '#FFD36B' }}>{fmtSec(left)}</span>}
        </div>
        <div className="row" style={{ gap: 8, fontSize: 13, fontWeight: 700, flexWrap: 'wrap' }}>
          <span className="chip">{players.length} players</span><span className="chip" style={{ color: 'var(--emerald)' }}>{online} online</span><span className="chip">{tbs.length} tables</span>
          {s.phase === 'play' && <span className="chip" style={{ color: '#FFD36B' }}>{sealed} sealed</span>}
        </div>
      </header>

      <main style={{ paddingBottom: 190 }}>
        {s.phase === 'brief' && <div className="pcard"><span className="t">{r.title}</span><p style={{ fontSize: 14 }} className="muted">{r.brief}</p><p style={{ fontSize: 13 }} className="muted">Roles are dealt when you press Start. Tables need 3 to 6 people; smaller tables get combined roles.</p></div>}
        {tbs.map((tb) => {
          const tr = team(s, tb); const sd = tr.sealed; const ms = members(s, tb); const f = finalScore(tr);
          const status = s.phase === 'play' ? (sd ? (sd.river ? 'River' : 'Sealed') : `${tr.pins.length} pins · ${tr.calls.length} calls`) : '';
          return (
            <div key={tb} className="pcard" style={{ gap: 6, borderColor: sd && s.phase === 'play' ? 'var(--gold-hi)' : undefined }}>
              <div className="between"><span style={{ fontWeight: 800 }}>{tableName(tb)}</span><span className="tag" style={{ color: sd ? '#FFD36B' : 'var(--river-soft)' }}>{status}</span></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                {ms.map((m) => (
                  <button key={m.id} onClick={() => setMoveP(m.id)} style={{ background: 'none', border: 'none', color: 'var(--soft)', fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="dot" style={{ background: isOnline(m, now) ? '#4CC38A' : '#E5534B' }} />{m.name}{tr.leader === m.id ? ' ★' : ''}
                  </button>
                ))}
              </div>
              {(s.phase === 'review' || s.phase === 'reveal') && sd && (
                <>
                  <p style={{ fontSize: 14 }}>{sd.river ? 'No decision: the river chose D.' : rationale(s, tb, sd)}</p>
                  {!sd.river && (
                    <div className="between">
                      <span className="muted" style={{ fontSize: 13 }}>{f ? `S${f.S} × Q${f.Q} × T${f.T} = ${f.total}` : ''}</span>
                      <button className={tr.defended ? 'btn-gold' : 'btn-ghost'} style={{ minHeight: 36, fontSize: 13 }} onClick={() => cmd({ c: 'defend', table: tb, value: !tr.defended })}>{tr.defended ? '+1 defended ✓' : 'Give +1 defended'}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
        {tbs.length === 0 && <p className="muted">No players yet. Ask everyone to scan the code on the big screen.</p>}
        <div className="pcard" style={{ gap: 10 }}>
          <span className="tag" style={{ color: '#FFD36B' }}>SOUND ON THE BIG SCREEN</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className={s.settings.muteAmbience ? 'btn-ghost' : 'btn-gold'} style={{ minHeight: 40, fontSize: 13 }} onClick={() => cmd({ c: 'mute', what: 'ambience', value: !s.settings.muteAmbience })}>River {s.settings.muteAmbience ? 'off' : 'on'}</button>
            <button className={s.settings.muteVoice ? 'btn-ghost' : 'btn-gold'} style={{ minHeight: 40, fontSize: 13 }} onClick={() => cmd({ c: 'mute', what: 'voice', value: !s.settings.muteVoice })}>Voice {s.settings.muteVoice ? 'off' : 'on'}</button>
            <button className={s.settings.muteCalls ? 'btn-ghost' : 'btn-gold'} style={{ minHeight: 40, fontSize: 13 }} onClick={() => cmd({ c: 'mute', what: 'calls', value: !s.settings.muteCalls })}>Calls {s.settings.muteCalls ? 'off' : 'on'}</button>
            <button className={(s.settings.musicLevel ?? 2) === 0 ? 'btn-ghost' : 'btn-gold'} style={{ minHeight: 40, fontSize: 13 }} onClick={() => cmd({ c: 'music_level', value: ((s.settings.musicLevel ?? 2) + 1) % 4 })}>Music: {['off', 'low', 'medium', 'high'][s.settings.musicLevel ?? 2]}</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button className="btn-ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => cmd({ c: 'say', voice: 'host_welcome' })}>Play welcome</button>
            <button className="btn-ghost" style={{ minHeight: 40, fontSize: 13 }} onClick={() => cmd({ c: 'say', voice: 'host_rules' })}>Short rules recap</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Subtitles always show on the big screen, even with voice off.</p>
        </div>
      </main>

      <div className="footerbar"><div style={{ flexDirection: 'column' }}>
        <button className={primary.danger ? 'btn-ruby' : 'btn-gold'} style={{ minHeight: 56, fontSize: 18 }} onClick={() => (primary.confirm ? setConfirm({ text: primary.confirm, c: primary.c }) : cmd(primary.c))}>{primary.label}</button>
        {s.phase === 'lobby' && <button className="btn-ghost" onClick={() => cmd({ c: 'brief', round: 0 })}>Skip rules: open Round 1 brief</button>}
        {s.phase === 'play' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {MARKET[r.id] && (s.market?.open
              ? <><button className="btn-ghost" onClick={() => cmd({ c: 'market', action: 'extend' })}>Market +30 s</button><button className="btn-ghost" onClick={() => cmd({ c: 'market', action: 'close' })}>Close market</button></>
              : !s.market && <button className="btn-ghost" style={{ gridColumn: 'span 2' }} onClick={() => cmd({ c: 'market', action: 'open' })}>Open the market now</button>)}
            {s.rise ? <button className="btn-ghost" style={{ gridColumn: 'span 2' }} onClick={() => cmd({ c: 'rise', action: 'cancel' })}>Cancel the rising river</button>
              : <button className="btn-ghost" style={{ gridColumn: 'span 2' }} onClick={() => cmd({ c: 'rise', action: 'now' })}>Raise the river now (2 min left)</button>}
            <button className="btn-ghost" onClick={() => cmd({ c: 'add_minute' }).then((ok) => ok && flash('+1 minute for everyone', true))}>+1 min</button>
            <button className="btn-ghost" onClick={() => cmd(s.clock.pausedAt ? { c: 'resume' } : { c: 'pause' })}>{s.clock.pausedAt ? 'Resume' : 'Pause'}</button>
          </div>
        )}
      </div></div>

      {confirm && (
        <div className="sheet" onClick={() => setConfirm(null)}><div onClick={(e) => e.stopPropagation()}>
          <p style={{ margin: 0, fontSize: 17 }}>{confirm.text}</p>
          <button className="btn-ruby" onClick={() => { cmd(confirm.c); setConfirm(null); }}>Yes, do it</button>
          <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
        </div></div>
      )}
      {moveP && s.players[moveP] && (
        <div className="sheet" onClick={() => setMoveP(null)}><div onClick={(e) => e.stopPropagation()}>
          <span className="t" style={{ fontFamily: 'var(--f-title)', fontSize: 18, color: 'var(--cream)' }}>{s.players[moveP].name}</span>
          <span className="muted" style={{ fontSize: 13 }}>{s.players[moveP].roles.map((x) => ROLE_NAMES[x]).join(', ') || 'No role yet'}</span>
          <span className="tag" style={{ color: '#FFD36B' }}>MOVE TO TABLE</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((t) => <button key={t} className={s.players[moveP].table === t ? 'btn-gold' : 'btn-ghost'} onClick={() => { cmd({ c: 'move', playerId: moveP, table: t }); setMoveP(null); }}>{t}</button>)}
          </div>
          <button className="btn-ruby" onClick={() => { cmd({ c: 'kick', playerId: moveP }); setMoveP(null); }}>Remove from game</button>
        </div></div>
      )}
      {msg && <div className={`toast ${msg.good ? 'good' : ''}`}>{msg.text}</div>}
    </div>
  );
}
