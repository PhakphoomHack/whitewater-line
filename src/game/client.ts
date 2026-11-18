'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameState } from './engine';
import { makeTransport, uid, type Transport } from './net';

export function useRoom(room: string | null) {
  const [state, setState] = useState<GameState | null>(null);
  const [offset, setOffset] = useState(0);
  const [lastMsg, setLastMsg] = useState(0);
  const tRef = useRef<Transport | null>(null);
  const me = useMemo(() => uid(), []);
  const waiters = useRef(new Map<string, (r: { ok: boolean; error?: string }) => void>());
  useEffect(() => {
    if (!room) return;
    const t = makeTransport(room, 'client'); tRef.current = t;
    const off = t.onDown((m) => {
      if (m.k !== 'state') return;
      setState((prev) => (prev && prev.v > m.s.v && prev.serverNow > m.s.serverNow ? prev : m.s));
      setOffset(m.s.serverNow - Date.now()); setLastMsg(Date.now());
      for (const a of m.acks ?? []) if (a.to === me && waiters.current.has(a.id)) { waiters.current.get(a.id)!(a); waiters.current.delete(a.id); }
    });
    t.sendUp({ k: 'hello', from: me });
    const iv = setInterval(() => { if (Date.now() - lastMsgRef.current > 8000) t.sendUp({ k: 'hello', from: me }); }, 4000);
    return () => { off(); clearInterval(iv); t.close(); };
  }, [room, me]);
  const lastMsgRef = useRef(0); lastMsgRef.current = lastMsg;
  const send = (a: Action) => new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const id = uid();
    const timer = setTimeout(() => { waiters.current.delete(id); resolve({ ok: false, error: 'The big screen did not answer. Check that it is open and online.' }); }, 9000);
    waiters.current.set(id, (r) => { clearTimeout(timer); resolve(r); });
    tRef.current?.sendUp({ k: 'action', id, from: me, a });
  });
  return { state, send, offset, connected: Date.now() - lastMsg < 12000, transport: tRef.current?.kind };
}

export function useNow(offset = 0, ms = 250) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now() + offset), ms); return () => clearInterval(iv); }, [offset, ms]);
  return now;
}

export function useQuery(name: string): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => { setV(new URLSearchParams(window.location.search).get(name)); }, [name]);
  return v;
}

export function fmtSec(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
