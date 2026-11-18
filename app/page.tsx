'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [rooms, setRooms] = useState<string[]>([]);
  useEffect(() => { try { setRooms(JSON.parse(localStorage.getItem('wwd:rooms') || '[]')); } catch {} }, []);
  return (
    <div className="stage">
      <img className="bg" src="/img/stage_river.webp" alt="" />
      <div className="veil" style={{ background: 'linear-gradient(90deg, rgba(5,11,28,0.92), rgba(5,11,28,0.45))' }} />
      <div className="content" style={{ justifyContent: 'center', maxWidth: 720 }}>
        <span className="kicker">WHITEWATER DESK</span>
        <h1>A decision game on the river</h1>
        <p className="muted" style={{ fontSize: 18, lineHeight: 1.5, margin: 0 }}>Open the big screen on the laptop that goes to the projector. Players join from their phones. The host controls the game from a phone.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/stage"><button className="btn-gold">Open the big screen</button></a>
          <a href="/play"><button className="btn-ghost">Join as a player</button></a>
          <a href="/host"><button className="btn-ghost">Host remote</button></a>
        </div>
        {rooms.length > 0 && <p className="muted">Recent rooms on this laptop: {rooms.map((r) => <a key={r} href={`/stage?room=${r}`} style={{ marginRight: 12 }}>{r}</a>)}</p>}
      </div>
      <img src="/img/pebble_wave.webp" alt="" className="bob" style={{ position: 'absolute', right: '8vw', bottom: '8vh', height: '38vh' }} />
    </div>
  );
}
