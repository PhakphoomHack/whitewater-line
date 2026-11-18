// Whitewater Line game engine (factory version of Whitewater Desk). Pure functions: (state, action, now) -> state.
// The big-screen tab is the single authority that runs this; phones only send actions.
import { PACK, SUPPORTS, SCORING, TRAP_REPLIES, COPY, IRRITATED_PREFIX, MARKET, EXCLUSIVES, callVoiceId, type Card, type OptionKey, type RoleId, type RoundDef } from './pack';

export type Phase = 'lobby' | 'rules' | 'brief' | 'play' | 'review' | 'reveal' | 'final';

export interface Player { id: string; name: string; table: number; joinedAt: number; lastSeen: number; roles: RoleId[]; scoutAt?: number | null }
export interface CallLog { id: string; stakeholder: string; name: string; text: string; irritated: boolean; by: string; at: number; voice: string | null; key: boolean }
export interface Sealed { option: OptionKey; evidence: string[]; measure: string | null; by: string | null; atReal: number; pctLeft: number; river: boolean }
export interface Score { S: number; Q: number; T: number; notes: string[] }
export interface TeamRound {
  costs: number;
  opened: string[];
  pins: { ref: string; by: string }[];
  calls: CallLog[];
  trap: null | { state: 'pending' | 'sign' | 'decline' | 'escalate' | 'ask_time'; early?: boolean; by?: string; reply?: { who: string; text: string; voice: string | null } };
  small: null | { state: 'pending' | 'approve' | 'decline' | 'escalate'; by?: string; reply?: { who: string; text: string; voice: string | null } };
  draft: { option: OptionKey | null; evidence: string[]; measure: string | null };
  sealed: Sealed | null;
  score: Score | null;
  defended: boolean;
  outcome: { kind: 'good' | 'bad'; text: string } | null;
  leader: string | null;
  stance: 'open' | 'closed';
  exclusive: string | null;
  gifts: { ref: string; to: number }[];
  received: { ref: string; from: number }[];
}
export interface Cue { n: number; voice?: string; sfx?: string; table?: number }
export interface GameState {
  v: number; room: string; pin: string; createdAt: number;
  phase: Phase; roundIdx: number;
  players: Record<string, Player>;
  clock: { startedAt: number | null; pausedAt: number | null; pausedMs: number; extraSec: number };
  fired: string[];
  teams: Record<string, Record<string, TeamRound>>; // table -> roundId -> data
  settings: { muteAmbience: boolean; muteCalls: boolean; muteVoice: boolean; muteMusic?: boolean; musicLevel?: number };
  cues: Cue[];
  cueN: number;
  serverNow: number;
  market: null | { open: boolean; until: number };
  rise: null | { at: number; until: number };
  rulesStep: number;
}

export type Action =
  | { t: 'join'; playerId: string; name: string; table: number }
  | { t: 'heartbeat'; playerId: string }
  | { t: 'leave'; playerId: string }
  | { t: 'open'; playerId: string; cardId: string }
  | { t: 'pin'; playerId: string; ref: string }
  | { t: 'unpin'; playerId: string; ref: string }
  | { t: 'call'; playerId: string; stakeholder: string }
  | { t: 'draft'; playerId: string; option?: OptionKey | null; evidence?: string[]; measure?: string | null }
  | { t: 'seal'; playerId: string }
  | { t: 'trap'; playerId: string; choice: 'sign' | 'decline' | 'escalate' | 'ask_time' }
  | { t: 'small'; playerId: string; choice: 'approve' | 'decline' | 'escalate' }
  | { t: 'stance'; playerId: string; stance: 'open' | 'closed' }
  | { t: 'scout'; playerId: string; table: number | null }
  | { t: 'give'; playerId: string; ref: string; to: number }
  | { t: 'host'; pin: string; cmd: HostCmd };

export type HostCmd =
  | { c: 'brief'; round: number }
  | { c: 'start' } | { c: 'pause' } | { c: 'resume' } | { c: 'add_minute' } | { c: 'end_round' }
  | { c: 'defend'; table: number; value: boolean }
  | { c: 'reveal' } | { c: 'final' } | { c: 'lobby' }
  | { c: 'kick'; playerId: string } | { c: 'move'; playerId: string; table: number }
  | { c: 'mute'; what: 'ambience' | 'calls' | 'voice' | 'music'; value: boolean }
  | { c: 'music_level'; value: number }
  | { c: 'say'; voice: string }
  | { c: 'rules' } | { c: 'rules_step'; step: number }
  | { c: 'market'; action: 'open' | 'close' | 'extend' }
  | { c: 'rise'; action: 'now' | 'cancel' };

export class GameError extends Error {}
const fail = (m: string): never => { throw new GameError(m); };

export const MAX_TABLES = 8;
export const LEADER_GRACE_MS = 30000;
export const ONLINE_MS = 25000;

export function newGame(room: string, pin: string, now: number): GameState {
  return {
    v: 0, room, pin, createdAt: now, phase: 'lobby', roundIdx: 0, players: {},
    clock: { startedAt: null, pausedAt: null, pausedMs: 0, extraSec: 0 }, fired: [], teams: {},
    settings: { muteAmbience: false, muteCalls: false, muteVoice: false, muteMusic: false, musicLevel: 2 }, cues: [], cueN: 0, serverNow: now, market: null, rise: null, rulesStep: 0,
  };
}

// ---------- helpers ----------
export const round = (s: GameState): RoundDef => PACK.rounds[s.roundIdx];
export const rate = (r: RoundDef) => r.game_minutes / r.real_seconds; // game minutes per real second

export function realElapsed(s: GameState, now: number): number {
  const c = s.clock;
  if (!c.startedAt) return 0;
  const end = c.pausedAt ?? now;
  return Math.max(0, (end - c.startedAt - c.pausedMs) / 1000);
}
export const deadlineSec = (s: GameState) => Math.min(round(s).real_seconds + s.clock.extraSec, s.rise ? s.rise.until : Infinity);
export const budget = (s: GameState) => round(s).game_minutes + s.clock.extraSec * rate(round(s));

export function teamUsed(s: GameState, table: number, now: number): number {
  const tr = team(s, table);
  const t = tr.sealed ? tr.sealed.atReal : realElapsed(s, now);
  return t * rate(round(s)) + tr.costs;
}
export function teamLeft(s: GameState, table: number, now: number) {
  return Math.max(0, budget(s) - teamUsed(s, table, now));
}
export function gameClockLabel(s: GameState, table: number, now: number) {
  const [h, m] = round(s).clock_start.split(':').map(Number);
  const mins = h * 60 + m + Math.min(budget(s), teamUsed(s, table, now));
  const hh = Math.floor(mins / 60), mm = Math.floor(mins % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
export function deadlineLabel(s: GameState) {
  const [h, m] = round(s).clock_start.split(':').map(Number);
  const mins = h * 60 + m + round(s).game_minutes;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export function tablesInUse(s: GameState): number[] {
  const set = new Set(Object.values(s.players).map((p) => p.table));
  return [...set].sort((a, b) => a - b);
}
export function members(s: GameState, table: number): Player[] {
  return Object.values(s.players).filter((p) => p.table === table).sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}
export const isOnline = (p: Player, now: number) => now - p.lastSeen < ONLINE_MS;

function emptyTeam(): TeamRound {
  return { costs: 0, opened: [], pins: [], calls: [], trap: null, small: null, draft: { option: null, evidence: [], measure: null }, sealed: null, score: null, defended: false, outcome: null, leader: null, stance: 'open', exclusive: null, gifts: [], received: [] };
}
export function team(s: GameState, table: number, roundId = round(s).id): TeamRound {
  return s.teams[String(table)]?.[roundId] ?? emptyTeam();
}
function teamMut(s: GameState, table: number): TeamRound {
  const k = String(table); const rid = round(s).id;
  s.teams[k] = s.teams[k] ?? {};
  s.teams[k][rid] = s.teams[k][rid] ?? emptyTeam();
  return s.teams[k][rid];
}

export const allCards = (r: RoundDef): Card[] => [...r.cards, ...(EXCLUSIVES[r.id] ?? [])];
export const findCard = (r: RoundDef, id: string) => allCards(r).find((c) => c.id === id);

export function r1Choice(s: GameState, table: number): OptionKey | null {
  return s.teams[String(table)]?.['r1']?.sealed?.option ?? null;
}
function cardAllowed(s: GameState, table: number, c: Card): boolean {
  if (!c.only_if) return true;
  const ch = r1Choice(s, table);
  if (c.only_if === 'r1_choice_in_BC') return ch === 'B' || ch === 'C';
  if (c.only_if === 'r1_choice_A') return ch === 'A';
  if (c.only_if === 'r1_choice_D') return ch === 'D';
  return false;
}
export function optionBase(s: GameState, table: number, opt: OptionKey): number {
  const r = round(s);
  let base = r.options[opt].base;
  if (r.carry) {
    const ch = r1Choice(s, table);
    const wait = ch === 'B' || ch === 'C';
    const over = wait ? r.carry.base_if_waitlist : r.carry.base_otherwise;
    if (over[opt] != null) base = over[opt]!;
  }
  return base;
}
export function killedOptions(s: GameState): OptionKey[] {
  const r = round(s); const out: OptionKey[] = [];
  for (const n of r.breaking_news ?? []) if (s.fired.includes(`news:${r.id}:${n.at_real_seconds}`)) out.push(...n.kills);
  return out;
}

// What a player can see
export interface CardView extends Card { state: 'free' | 'sealed' | 'open'; pinned: boolean }
export function playerCards(s: GameState, pid: string): CardView[] {
  const p = s.players[pid]; if (!p) return [];
  const tr = team(s, p.table);
  const own = round(s).cards.filter((c) => p.roles.includes(c.role) && cardAllowed(s, p.table, c));
  // the market exclusive is shared by the whole table, already open
  const ex = tr.exclusive ? findCard(round(s), tr.exclusive) : undefined;
  const list = ex ? [ex, ...own] : own;
  return list.map((c) => ({ ...c, state: c.kind === 'note' || c.exclusive ? 'free' : tr.opened.includes(c.id) ? 'open' : 'sealed', pinned: tr.pins.some((x) => x.ref === c.id) }));
}
export function refLabel(s: GameState, table: number, ref: string): { title: string; text: string; kind: string; role?: RoleId; from?: number } | null {
  if (ref.startsWith('call:')) {
    const c = team(s, table).calls.find((x) => `call:${x.stakeholder}` === ref);
    return c ? { title: c.name, text: c.text, kind: 'call' } : null;
  }
  const c = findCard(round(s), ref);
  if (!c) return null;
  const from = team(s, table).received.find((x) => x.ref === ref)?.from;
  return { title: c.title ?? shortTitle(c.text), text: c.text, kind: c.kind, role: c.exclusive ? undefined : c.role, from };
}
export function shortTitle(t: string) { const w = t.split(' ').slice(0, 5).join(' '); return w.length < t.length ? w + '…' : w; }

export function leaderOf(s: GameState, table: number): string | null {
  const tr = team(s, table);
  return tr.leader;
}
export function canSeal(s: GameState, table: number, pid: string, now: number): boolean {
  const tr = team(s, table);
  if (!tr.leader || tr.leader === pid) return true;
  const L = s.players[tr.leader];
  return !L || now - L.lastSeen > LEADER_GRACE_MS || L.table !== table;
}

// ---------- role assignment ----------
export function assignRoles(s: GameState) {
  const layouts = PACK.table_layouts;
  for (const tb of tablesInUse(s)) {
    const ms = members(s, tb);
    const n = ms.length;
    const lay = layouts[String(Math.min(6, Math.max(3, n)))];
    ms.forEach((m) => (m.roles = []));
    if (n <= lay.length) {
      lay.forEach((roles, i) => ms[i % n].roles.push(...roles));
    } else {
      ms.forEach((m, i) => (m.roles = [...lay[i % lay.length]]));
    }
    ms.forEach((m) => (m.roles = [...new Set(m.roles)]));
    const tr = teamMut(s, tb);
    const cos = ms.find((m) => m.roles.includes('cos'));
    tr.leader = cos ? cos.id : ms.length ? ms[s.roundIdx % ms.length].id : null;
  }
}
function lateJoinRoles(s: GameState, p: Player) {
  const ms = members(s, p.table).filter((m) => m.id !== p.id);
  if (!ms.length) { p.roles = [...PACK.roles]; teamMut(s, p.table).leader = p.id; return; }
  const counts = new Map<RoleId, number>();
  for (const r of PACK.roles) counts.set(r, 0);
  ms.forEach((m) => m.roles.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1)));
  const lay = PACK.table_layouts[String(Math.min(6, Math.max(3, ms.length + 1)))];
  const group = lay.find((g) => g.every((r) => r !== 'cos')) ?? lay[0];
  // join the least-covered data role (never a second Chief of Staff)
  const best = [...counts.entries()].filter(([r]) => r !== 'cos').sort((a, b) => a[1] - b[1])[0];
  p.roles = best ? [best[0]] : [...group];
}

// ---------- scoring ----------
export function speedFromPct(pct: number) { return SCORING.speedBands.find(([th]) => pct >= th)![1]; }
const clamp = (x: number) => Math.max(1, Math.min(5, x));

export function computeScore(s: GameState, table: number, tr: TeamRound): Score {
  const r = round(s);
  const sd = tr.sealed!;
  const notes: string[] = [];
  if (sd.river) return { S: SCORING.river.S, Q: SCORING.river.Q, T: SCORING.river.T, notes: ['The river decided: no decision in time.'] };
  const S = speedFromPct(sd.pctLeft);
  notes.push(`Speed ${S}: ${Math.round(sd.pctLeft)}% of the time left.`);
  let Q = optionBase(s, table, sd.option);
  notes.push(`Option ${sd.option} starts at ${Q}.`);
  const sup = SUPPORTS[r.id][sd.option];
  const ev = sd.evidence;
  const matching = ev.filter((e) => sup.includes(e));
  if (!matching.length) { Q -= 1; notes.push('-1 quality: no evidence supports this option.'); }
  const isRumor = (e: string) => { const k = findCard(r, e)?.kind; return k === 'rumor' || k === 'buzz'; };
  if (ev.length && ev.every(isRumor)) { Q -= 1; notes.push('-1 quality: unconfirmed talk is the only evidence.'); }
  if (sd.measure && r.measures.wrong.includes(sd.measure)) { Q -= 1; notes.push('-1 quality: the measure does not show success.'); }
  if (!sd.measure) { Q -= 1; notes.push('-1 quality: no measure of success.'); }
  let T = 3;
  const roles = new Set(tr.pins.map((p) => r.cards.find((c) => c.id === p.ref)?.role).filter((x) => x && x !== 'cos'));
  if (roles.size >= 4) { T += 1; notes.push('+1 trust: pins from 4 or more roles.'); }
  if (tr.calls.some((c) => c.key)) { T += 1; notes.push('+1 trust: you asked a key person.'); }
  const over = Math.max(0, tr.calls.length - SCORING.freeCalls);
  if (over) { T -= over; notes.push(`-${over} trust: more than ${SCORING.freeCalls} calls.`); }
  if (tr.pins.length < 2) { T -= 1; notes.push('-1 trust: sealed with fewer than 2 pins.'); }
  if (tr.small?.state === 'escalate') { T -= 1; notes.push('-1 trust: escalated a call you could make yourself.'); }
  if (tr.trap?.state === 'decline') { T -= 1; notes.push(COPY.trapNotes.decline); }
  if (tr.trap?.state === 'escalate') notes.push(COPY.trapNotes.escalate);
  const gaveFact = tr.gifts.some((g) => findCard(r, g.ref)?.kind === 'note' || findCard(r, g.ref)?.kind === 'report');
  if (gaveFact) { T += 1; notes.push('+1 trust: you shared a confirmed fact with another table.'); }
  if (tr.trap?.state === 'sign') { Q = 1; T = 1; notes.push(COPY.trapNotes.sign); }
  return { S, Q: clamp(Q), T: clamp(T), notes };
}
export function finalScore(tr: TeamRound) {
  if (!tr.score) return null;
  const Q = tr.sealed && !tr.sealed.river && tr.defended && tr.trap?.state !== 'sign' ? Math.min(5, tr.score.Q + 1) : tr.score.Q;
  return { S: tr.score.S, Q, T: tr.score.T, total: tr.score.S * Q * tr.score.T };
}

function hash(str: string) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  // avalanche (murmur3 finalizer) so similar room/table strings spread over [0,1)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function pickOutcome(s: GameState, table: number, opt: OptionKey) {
  const list = round(s).outcomes[opt];
  let x = hash(`${s.room}:${round(s).id}:${table}`);
  for (const [p, kind, text] of list) { if (x < p) return { kind, text }; x -= p; }
  const last = list[list.length - 1];
  return { kind: last[1], text: last[2] };
}

function doSeal(s: GameState, table: number, now: number, by: string | null, river: boolean) {
  const tr = teamMut(s, table);
  if (tr.sealed) return;
  const real = Math.min(realElapsed(s, now), deadlineSec(s));
  const pctLeft = Math.max(0, (budget(s) - (real * rate(round(s)) + tr.costs)) / budget(s) * 100);
  tr.sealed = river
    ? { option: SCORING.river.option, evidence: [], measure: null, by: null, atReal: real, pctLeft: 0, river: true }
    : { option: tr.draft.option!, evidence: [...tr.draft.evidence], measure: tr.draft.measure, by, atReal: real, pctLeft, river: false };
  tr.score = computeScore(s, table, tr);
  tr.outcome = pickOutcome(s, table, tr.sealed.option);
  if (!river) {
    const first = tablesInUse(s).filter((t) => team(s, t).sealed && !team(s, t).sealed!.river).length === 1;
    cue(s, { sfx: 'stamp', table, voice: first && !s.fired.includes(`first:${round(s).id}`) ? 'host_first_seal' : undefined });
    if (first) s.fired.push(`first:${round(s).id}`);
  }
}

function openMarket(s: GameState, t: number) {
  const r = round(s); const mk = MARKET[r.id]; const ex = EXCLUSIVES[r.id] ?? [];
  if (!mk) return;
  s.market = { open: true, until: t + mk.duration };
  const off = Math.floor(hash(`${s.room}:${r.id}:ex`) * ex.length);
  tablesInUse(s).forEach((tb, i) => { const tr = teamMut(s, tb); if (!tr.exclusive && ex.length) tr.exclusive = ex[(i + off) % ex.length].id; tr.stance = 'open'; });
  cue(s, { sfx: 'news', voice: 'market_open' });
}
function closeMarket(s: GameState) {
  if (!s.market) return;
  s.market = { ...s.market, open: false };
  for (const p of Object.values(s.players)) p.scoutAt = null;
  cue(s, { sfx: 'river', voice: 'market_close' });
}

function cue(s: GameState, c: Omit<Cue, 'n'>) {
  s.cueN += 1;
  s.cues = [...s.cues.slice(-11), { n: s.cueN, ...c }];
}

// ---------- tick: time-driven events ----------
export function tick(prev: GameState, now: number): GameState {
  if (prev.phase !== 'play' || prev.clock.pausedAt) return prev;
  const s: GameState = structuredClone(prev);
  const r = round(s); const t = realElapsed(s, now);
  let changed = false;
  const once = (key: string, fn: () => void) => { if (!s.fired.includes(key)) { s.fired.push(key); fn(); changed = true; } };
  for (const n of r.breaking_news ?? []) if (t >= n.at_real_seconds) once(`news:${r.id}:${n.at_real_seconds}`, () => {
    cue(s, { sfx: 'news', voice: r.id === 'r1' ? 'news_r1' : undefined });
    // a draft that picked a killed option is cleared
    for (const tb of tablesInUse(s)) { const tr = teamMut(s, tb); if (!tr.sealed && tr.draft.option && n.kills.includes(tr.draft.option)) tr.draft.option = null; }
  });
  if (r.trap && t >= r.trap.at_real_seconds) once(`trap:${r.id}`, () => {
    cue(s, { sfx: 'news', voice: 'news_r2' });
    for (const tb of tablesInUse(s)) { const tr = teamMut(s, tb); if (!tr.sealed && !tr.trap) tr.trap = { state: 'pending' }; }
  });
  if (r.small_call && t >= r.small_call.at_real_seconds) once(`small:${r.id}`, () => {
    for (const tb of tablesInUse(s)) { const tr = teamMut(s, tb); if (!tr.sealed) tr.small = { state: 'pending' }; }
  });
  const mk = MARKET[r.id];
  if (mk && t >= mk.at) once(`market:${r.id}`, () => openMarket(s, t));
  if (s.market?.open && t >= s.market.until) { closeMarket(s); changed = true; }
  // the river rises: when 2/3 of the room has sealed (after half the round), the rest get 2 minutes
  const tbAll = tablesInUse(s); const sealedN = tbAll.filter((tb) => team(s, tb).sealed).length;
  if (!s.rise && tbAll.length >= 3 && sealedN < tbAll.length && sealedN >= Math.ceil((tbAll.length * 2) / 3) && t >= deadlineSec(s) * 0.5 && !s.fired.includes(`riseoff:${r.id}`))
    once(`rise:${r.id}`, () => { s.rise = { at: t, until: Math.min(t + 120, deadlineSec(s)) }; cue(s, { sfx: 'river', voice: 'river_rise' }); });
  const dl = deadlineSec(s);
  if (t >= dl - 60 && t < dl) once(`1min:${r.id}:${s.clock.extraSec}`, () => cue(s, { sfx: 'tick', voice: 'host_1min' }));
  // teams whose own game clock ran out
  for (const tb of tablesInUse(s)) {
    const tr = team(s, tb);
    if (!tr.sealed && (teamLeft(s, tb, now) <= 0 || t >= dl)) { doSeal(s, tb, now, null, true); changed = true; }
  }
  const tbs = tablesInUse(s);
  if (tbs.length && tbs.every((tb) => team(s, tb).sealed)) {
    const anyRiver = tbs.some((tb) => team(s, tb).sealed!.river);
    if (anyRiver) cue(s, { sfx: 'river', voice: 'host_timeup' });
    if (s.market?.open) closeMarket(s);
    s.phase = 'review'; s.clock.pausedAt = now; changed = true;
  }
  if (!changed) return prev;
  s.v += 1;
  return s;
}

// ---------- reducer ----------
export function apply(prev: GameState, a: Action, now: number): GameState {
  const s: GameState = structuredClone(prev);
  s.serverNow = now;
  const P = (id: string) => s.players[id] ?? fail('Please join a table first.');
  const inPlay = () => { if (s.phase !== 'play') fail('The round is not running.'); if (s.clock.pausedAt) fail('The game is paused.'); };
  const notSealed = (tb: number) => { if (team(s, tb).sealed) fail('Your table has already sealed.'); };

  switch (a.t) {
    case 'join': {
      const name = a.name.trim().slice(0, 18);
      if (!name) fail('Please type a nickname.');
      if (!(a.table >= 1 && a.table <= MAX_TABLES)) fail(`Pick a table from 1 to ${MAX_TABLES}.`);
      const existing = s.players[a.playerId];
      const taken = Object.values(s.players).find((p) => p.id !== a.playerId && p.table === a.table && p.name.toLowerCase() === name.toLowerCase());
      if (taken) fail('Someone at this table already uses that name.');
      if (!existing && members(s, a.table).length >= 8) fail('This table is full. Please pick another table.');
      if (existing) {
        const moved = existing.table !== a.table;
        existing.name = name; existing.lastSeen = now;
        if (moved) { existing.table = a.table; existing.roles = []; if (s.phase !== 'lobby') lateJoinRoles(s, existing); }
      } else {
        const p: Player = { id: a.playerId, name, table: a.table, joinedAt: now, lastSeen: now, roles: [] };
        s.players[a.playerId] = p;
        if (s.phase !== 'lobby') { teamMut(s, a.table); lateJoinRoles(s, p); }
        cue(s, { sfx: 'join' });
      }
      break;
    }
    case 'heartbeat': { const p = s.players[a.playerId]; if (!p) return prev; p.lastSeen = now; return { ...prev, players: { ...prev.players, [p.id]: { ...prev.players[p.id], lastSeen: now } }, serverNow: now }; }
    case 'leave': { delete s.players[a.playerId]; break; }
    case 'open': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const c = round(s).cards.find((x) => x.id === a.cardId) ?? fail('Unknown card.');
      if (!p.roles.includes(c.role) || !cardAllowed(s, p.table, c)) fail('This card is not on your desk.');
      if (c.kind === 'note') fail('Notes are already open.');
      const tr = teamMut(s, p.table);
      if (tr.opened.includes(c.id)) break;
      tr.opened.push(c.id); tr.costs += c.cost;
      break;
    }
    case 'pin': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const tr = teamMut(s, p.table);
      if (tr.pins.some((x) => x.ref === a.ref)) break;
      if (a.ref.startsWith('call:')) { if (!tr.calls.some((c) => `call:${c.stakeholder}` === a.ref)) fail('Make the call first.'); }
      else {
        const v = playerCards(s, p.id).find((c) => c.id === a.ref);
        if (!v && !tr.received.some((x) => x.ref === a.ref)) fail('This card is not on your desk.');
        if (v && v.state === 'sealed') fail('Open it first.');
      }
      tr.pins.push({ ref: a.ref, by: p.id });
      break;
    }
    case 'unpin': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const tr = teamMut(s, p.table);
      tr.pins = tr.pins.filter((x) => x.ref !== a.ref);
      tr.draft.evidence = tr.draft.evidence.filter((e) => e !== a.ref);
      break;
    }
    case 'call': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const st = round(s).stakeholders.find((x) => x.id === a.stakeholder) ?? fail('Unknown contact.');
      const tr = teamMut(s, p.table);
      if (tr.calls.some((c) => c.stakeholder === st.id)) fail('Your table already called this person. Check the team board.');
      const irritated = tr.calls.length >= SCORING.freeCalls;
      tr.costs += st.cost;
      tr.calls.push({ id: `${st.id}-${tr.calls.length}`, stakeholder: st.id, name: st.name, text: (irritated ? IRRITATED_PREFIX : '') + st.text, irritated, by: p.id, at: realElapsed(s, now), voice: callVoiceId(round(s).id, st.id), key: st.key });
      break;
    }
    case 'draft': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const tr = teamMut(s, p.table);
      if (a.option !== undefined) {
        if (a.option && killedOptions(s).includes(a.option)) fail('Breaking news ruled this option out.');
        tr.draft.option = a.option;
      }
      if (a.evidence !== undefined) {
        const ev = [...new Set(a.evidence)].filter((e) => tr.pins.some((x) => x.ref === e)).slice(0, 2);
        tr.draft.evidence = ev;
      }
      if (a.measure !== undefined) {
        const r = round(s);
        if (a.measure && ![...r.measures.right, ...r.measures.wrong].includes(a.measure)) fail('Unknown measure.');
        tr.draft.measure = a.measure;
      }
      break;
    }
    case 'seal': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const tr = teamMut(s, p.table);
      if (!canSeal(s, p.table, p.id, now)) fail('Only your table leader can seal. If the leader is offline for 30 seconds, anyone can.');
      if (!tr.draft.option) fail('Choose an option first.');
      if (killedOptions(s).includes(tr.draft.option!)) fail('Breaking news ruled this option out.');
      if (!tr.draft.measure) fail('Choose how you will know it worked.');
      // every table meets the supplier offer: a table that tries to seal before it arrives gets it now
      if (round(s).trap) {
        if (!tr.trap) { tr.trap = { state: 'pending', early: true }; break; }
        if (tr.trap.state === 'pending') fail(COPY.trapNeedAnswer);
      }
      doSeal(s, p.table, now, p.id, false);
      break;
    }
    case 'trap': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const tr = teamMut(s, p.table);
      if (!tr.trap || tr.trap.state !== 'pending') fail('There is no open offer.');
      const rep = TRAP_REPLIES[a.choice];
      tr.costs += rep.cost;
      tr.trap = { state: a.choice, by: p.id, reply: { who: rep.who, text: rep.text, voice: rep.audio } };
      break;
    }
    case 'small': {
      inPlay(); const p = P(a.playerId); notSealed(p.table);
      const tr = teamMut(s, p.table);
      if (!tr.small || tr.small.state !== 'pending') fail('There is no open question.');
      if (a.choice === 'escalate') {
        const e = round(s).small_call!.choices.escalate;
        tr.costs += e.cost;
        tr.small = { state: 'escalate', by: p.id, reply: { ...COPY.smallReplies.escalate, voice: 'call_small_esc' } };
      } else tr.small = { state: a.choice, by: p.id, reply: { ...COPY.smallReplies[a.choice], voice: null } };
      break;
    }
    case 'stance': {
      const p = P(a.playerId); if (!s.market?.open) fail('The market is closed.');
      teamMut(s, p.table).stance = a.stance;
      if (a.stance === 'closed') for (const m of Object.values(s.players)) if (m.scoutAt === p.table) m.scoutAt = null;
      break;
    }
    case 'scout': {
      const p = P(a.playerId); if (!s.market?.open) fail('The market is closed.');
      if (a.table === null) { p.scoutAt = null; break; }
      if (a.table === p.table) fail('That is your own table.');
      if (team(s, p.table).stance === 'closed') fail('Your table is closed. Open it to send visitors.');
      if (!tablesInUse(s).includes(a.table)) fail('No such table.');
      if (team(s, a.table).stance === 'closed') fail('That table is closed to visitors.');
      const ms = members(s, p.table);
      const out = ms.filter((m) => m.scoutAt && m.id !== p.id).length;
      if (out + 1 > Math.floor(ms.length / 2)) fail('Keep at least half your table at home.');
      p.scoutAt = a.table;
      break;
    }
    case 'give': {
      const p = P(a.playerId); const mk = MARKET[round(s).id];
      if (!s.market?.open || !mk) fail('Trading only works while the market is open.');
      const tr = teamMut(s, p.table);
      if (tr.stance === 'closed') fail('Your table is closed. Open it to trade.');
      if (a.to === p.table || !tablesInUse(s).includes(a.to)) fail('Pick another table.');
      const to = teamMut(s, a.to);
      if (to.stance === 'closed') fail('That table is closed to trading.');
      if (to.sealed) fail('That table has already sealed.');
      const mine = tr.pins.some((x) => x.ref === a.ref) || tr.exclusive === a.ref;
      if (!mine || tr.received.some((x) => x.ref === a.ref)) fail('You can only share your own pinned cards or your exclusive card.');
      if (tr.gifts.length >= mk.maxGifts) fail(`Each table can share up to ${mk.maxGifts} cards.`);
      if (tr.gifts.some((g) => g.ref === a.ref && g.to === a.to)) fail('You already shared this card with that table.');
      if (to.pins.some((x) => x.ref === a.ref)) fail('That table already has this card.');
      tr.gifts.push({ ref: a.ref, to: a.to });
      to.received.push({ ref: a.ref, from: p.table });
      to.pins.push({ ref: a.ref, by: `table:${p.table}` });
      to.costs += mk.giftCost;
      break;
    }
    case 'host': {
      if (a.pin !== s.pin) fail('Wrong host PIN.');
      hostCmd(s, a.cmd, now);
      break;
    }
  }
  s.v += 1;
  return s;
}

function hostCmd(s: GameState, c: HostCmd, now: number) {
  switch (c.c) {
    case 'brief': {
      if (c.round < 0 || c.round >= PACK.rounds.length) fail('No such round.');
      s.roundIdx = c.round; s.phase = 'brief';
      s.clock = { startedAt: null, pausedAt: null, pausedMs: 0, extraSec: 0 };
      s.market = null; s.rise = null;
      if (MARKET[PACK.rounds[c.round].id] && !s.fired.includes(`mrules:${c.round}`)) { s.fired.push(`mrules:${c.round}`); cue(s, { voice: 'rules_market' }); }
      break;
    }
    case 'start': {
      if (s.phase !== 'brief') fail('Open the round brief first.');
      if (!tablesInUse(s).length) fail('Nobody has joined yet.');
      for (const tb of tablesInUse(s)) teamMut(s, tb);
      assignRoles(s);
      s.phase = 'play'; s.clock = { startedAt: now, pausedAt: null, pausedMs: 0, extraSec: 0 }; s.market = null; s.rise = null;
      for (const p of Object.values(s.players)) p.scoutAt = null;
      cue(s, { voice: round(s).id === 'r1' ? 'host_r1' : 'host_r2' });
      break;
    }
    case 'pause': if (s.phase === 'play' && !s.clock.pausedAt) s.clock.pausedAt = now; break;
    case 'resume': if (s.phase === 'play' && s.clock.pausedAt) { s.clock.pausedMs += now - s.clock.pausedAt; s.clock.pausedAt = null; } break;
    case 'add_minute': if (s.phase === 'play') s.clock.extraSec += 60; break;
    case 'end_round': {
      if (s.phase !== 'play') fail('The round is not running.');
      for (const tb of tablesInUse(s)) if (!team(s, tb).sealed) doSeal(s, tb, now, null, true);
      if (s.market?.open) closeMarket(s);
      cue(s, { sfx: 'river', voice: 'host_timeup' });
      s.phase = 'review'; s.clock.pausedAt = s.clock.pausedAt ?? now;
      break;
    }
    case 'defend': {
      if (s.phase !== 'review' && s.phase !== 'reveal') fail('You can award this after the round.');
      const tr = teamMut(s, c.table); if (!tr.sealed || tr.sealed.river) fail('This table has no rationale to defend.');
      tr.defended = c.value; break;
    }
    case 'reveal': {
      if (s.phase !== 'review') fail('Finish the round first.');
      s.phase = 'reveal'; cue(s, { sfx: 'fanfare', voice: 'host_reveal' }); break;
    }
    case 'final': s.phase = 'final'; cue(s, { sfx: 'fanfare', voice: 'host_end' }); break;
    case 'lobby': s.phase = 'lobby'; break;
    case 'kick': delete s.players[c.playerId]; break;
    case 'move': { const p = s.players[c.playerId] ?? fail('No such player.'); p.table = c.table; p.roles = []; if (s.phase !== 'lobby') { teamMut(s, c.table); lateJoinRoles(s, p); } break; }
    case 'mute': {
      if (c.what === 'ambience') s.settings.muteAmbience = c.value;
      if (c.what === 'calls') s.settings.muteCalls = c.value;
      if (c.what === 'voice') s.settings.muteVoice = c.value;
      if (c.what === 'music') s.settings.muteMusic = c.value;
      break;
    }
    case 'music_level': {
      s.settings.musicLevel = Math.max(0, Math.min(3, Math.round(c.value)));
      s.settings.muteMusic = s.settings.musicLevel === 0;
      break;
    }
    case 'say': cue(s, { voice: c.voice }); break;
    case 'rules': s.phase = 'rules'; s.rulesStep = 0; break;
    case 'rules_step': s.rulesStep = c.step; break;
    case 'market': {
      if (s.phase !== 'play' || !MARKET[round(s).id]) fail('The market only runs during round 2.');
      const t = realElapsed(s, now);
      if (c.action === 'open') { if (!s.fired.includes(`market:${round(s).id}`)) s.fired.push(`market:${round(s).id}`); openMarket(s, t); }
      if (c.action === 'extend' && s.market?.open) s.market.until += 30;
      if (c.action === 'close' && s.market?.open) closeMarket(s);
      break;
    }
    case 'rise': {
      if (s.phase !== 'play') fail('The round is not running.');
      const t = realElapsed(s, now);
      if (c.action === 'now') { s.rise = { at: t, until: Math.min(t + 120, round(s).real_seconds + s.clock.extraSec) }; cue(s, { sfx: 'river', voice: 'river_rise' }); }
      if (c.action === 'cancel') { s.rise = null; if (!s.fired.includes(`riseoff:${round(s).id}`)) s.fired.push(`riseoff:${round(s).id}`); }
      break;
    }
  }
}

// ---------- results ----------
export interface TableResult { table: number; names: string[]; sealed: Sealed | null; S: number; Q: number; T: number; total: number; outcome: TeamRound['outcome']; defended: boolean }
export function roundResults(s: GameState, roundId = round(s).id): TableResult[] {
  return tablesInUse(s).map((tb) => {
    const tr = team(s, tb, roundId);
    const f = finalScore(tr) ?? { S: 0, Q: 0, T: 0, total: 0 };
    return { table: tb, names: members(s, tb).map((m) => m.name), sealed: tr.sealed, ...f, outcome: tr.outcome, defended: tr.defended };
  }).sort((a, b) => b.total - a.total || a.table - b.table);
}
export function grandTotals(s: GameState) {
  return tablesInUse(s).map((tb) => {
    let total = 0;
    for (const r of PACK.rounds) { const f = finalScore(team(s, tb, r.id)); if (f) total += f.total; }
    return { table: tb, names: members(s, tb).map((m) => m.name), total };
  }).sort((a, b) => b.total - a.total || a.table - b.table);
}
export function magnets(rs: TableResult[]) {
  const out: Record<'S' | 'Q' | 'T', number[]> = { S: [], Q: [], T: [] };
  for (const ax of ['S', 'Q', 'T'] as const) {
    const sorted = [...rs].filter((r) => r.sealed).sort((a, b) => b[ax] - a[ax] || b.total - a.total);
    out[ax] = sorted.slice(0, 3).map((r) => r.table);
  }
  return out;
}

export function rationale(s: GameState, table: number, sd: { option: OptionKey | null; evidence: string[]; measure: string | null }): string {
  if (!sd.option) return '';
  const opt = round(s).options[sd.option];
  const ev = sd.evidence.map((e) => refLabel(s, table, e)?.text).filter(Boolean).map((x) => `"${x!.replace(/\.$/, '')}"`);
  const because = ev.length ? ` Evidence: ${ev.join(' and ')}.` : ' Evidence: none yet.';
  const measure = sd.measure ? ` We will know it worked if: ${sd.measure}.` : '';
  return `We chose ${sd.option}: ${opt.label}.${because}${measure}`;
}
