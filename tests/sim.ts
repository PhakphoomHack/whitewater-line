// Bot playtest: many full games through the real engine (both rounds), different team styles.
import { newGame, apply, tick, roundResults, grandTotals, playerCards, team, killedOptions, GameError, type GameState, type Action } from '../src/game/engine';
import { PACK, SUPPORTS, type OptionKey } from '../src/game/pack';

type Style = 'balanced' | 'maverick' | 'nitpicker' | 'party' | 'lone' | 'idle' | 'copycat';
const STYLES: Style[] = ['balanced', 'maverick', 'nitpicker', 'party', 'lone', 'idle', 'copycat'];
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

const errors: string[] = []; const unexpected: string[] = [];
function act(s: GameState, a: Action, now: number, expectOk = true): GameState {
  try { return apply(s, a, now); }
  catch (e) { if (!(e instanceof GameError)) { unexpected.push(String((e as Error).stack)); } else if (expectOk) errors.push(`${a.t}: ${(e as Error).message}`); return s; }
}

function playRound(s: GameState, now: number, styles: Record<number, Style>, ridx: number): [GameState, number] {
  const host = (cmd: any) => (s = act(s, { t: 'host', pin: s.pin, cmd }, now));
  host({ c: 'brief', round: ridx });
  host({ c: 'start' });
  const r = PACK.rounds[ridx];
  const plan: Record<number, { sealAt: number; done: boolean }> = {};
  for (const tb of Object.keys(styles).map(Number)) {
    const st = styles[tb];
    const base = { balanced: 0.45, maverick: 0.12, nitpicker: 0.95, party: 0.6, lone: 0.2, idle: 2, copycat: ridx === 1 ? 0.48 : 0.45 }[st];
    plan[tb] = { sealAt: r.real_seconds * base * (0.8 + rnd() * 0.4), done: false };
  }
  for (let t = 0; t <= r.real_seconds + 5; t += 5) {
    const nowT = now + t * 1000;
    s = tick(s, nowT);
    if (s.phase !== 'play') break;
    for (const tb of Object.keys(styles).map(Number)) {
      const st = styles[tb]; const tr = team(s, tb); if (tr.sealed) continue;
      const ms = Object.values(s.players).filter((p) => p.table === tb);
      for (const m of ms) s = act(s, { t: 'heartbeat', playerId: m.id }, nowT);
      // trap and small call
      if (tr.trap?.state === 'pending') s = act(s, { t: 'trap', playerId: ms[0].id, choice: st === 'maverick' ? 'sign' : st === 'lone' ? 'decline' : st === 'party' ? 'ask_time' : 'escalate' }, nowT);
      if (team(s, tb).small?.state === 'pending') s = act(s, { t: 'small', playerId: ms[0].id, choice: st === 'nitpicker' || st === 'party' ? 'escalate' : 'approve' }, nowT);
      if (s.market?.open && (st === 'balanced' || st === 'lone')) {
        const others = Object.keys(styles).map(Number).filter((x) => x !== tb && !team(s, x).sealed);
        const refs = [team(s, tb).exclusive, ...team(s, tb).pins.map((p) => p.ref).filter((p) => !p.startsWith('call:'))].filter(Boolean) as string[];
        for (const ref of refs.slice(0, 3)) { const to = pick(others); if (to) s = act(s, { t: 'give', playerId: ms[0].id, ref, to }, nowT, false); }
      }
      if (t === 10) {
        for (const m of ms) {
          const cards = playerCards(s, m.id);
          for (const c of cards) {
            const wantOpen = c.kind !== 'note' && (st === 'nitpicker' || (st === 'balanced' && c.tier === 'critical') || (st === 'party' && rnd() < 0.3));
            if (wantOpen) s = act(s, { t: 'open', playerId: m.id, cardId: c.id }, nowT);
            const after = playerCards(s, m.id).find((x) => x.id === c.id)!;
            const pinP = { balanced: 0.85, maverick: 0.3, nitpicker: 0.8, party: 0.6, lone: 0.1, idle: 0, copycat: 0.15 }[st];
            if (after.state !== 'sealed' && rnd() < pinP) s = act(s, { t: 'pin', playerId: m.id, ref: c.id }, nowT);
          }
        }
        const calls = { balanced: r.stakeholders.filter((x) => x.key).slice(0, 1), maverick: [], nitpicker: r.stakeholders.slice(0, 2), party: r.stakeholders, lone: [], idle: [], copycat: [] }[st];
        for (const c of calls) { s = act(s, { t: 'call', playerId: ms[0].id, stakeholder: c.id }, nowT); s = act(s, { t: 'pin', playerId: ms[0].id, ref: `call:${c.id}` }, nowT); }
      }
      if (t >= plan[tb].sealAt && !plan[tb].done && st !== 'idle') {
        plan[tb].done = true;
        const killed = killedOptions(s);
        const sup = SUPPORTS[r.id];
        const wantGood = st === 'balanced' || st === 'nitpicker' || st === 'copycat';
        const opts = (['A', 'B', 'C', 'D'] as OptionKey[]).filter((o) => !killed.includes(o));
        const opt = st === 'maverick' && !killed.includes('A') ? 'A' : wantGood ? (opts.includes('B') ? (rnd() < 0.6 ? 'B' : 'C') : opts[0]) : pick(opts);
        const pins = team(s, tb).pins.map((p) => p.ref);
        const ev = wantGood ? pins.filter((p) => sup[opt].includes(p)).slice(0, 2) : pins.slice(0, 2);
        const measure = wantGood ? r.measures.right[0] : pick([...r.measures.right, ...r.measures.wrong]);
        const leader = team(s, tb).leader!;
        s = act(s, { t: 'draft', playerId: ms[1]?.id ?? leader, option: opt, evidence: ev, measure }, nowT);
        // a non-leader tries first: must be refused while the leader is online
        if (ms.length > 1) { const other = ms.find((m) => m.id !== leader)!; s = act(s, { t: 'seal', playerId: other.id }, nowT, false); }
        s = act(s, { t: 'seal', playerId: leader }, nowT);
      }
    }
  }
  if (s.phase === 'play') { s = act(s, { t: 'host', pin: s.pin, cmd: { c: 'end_round' } }, now + (r.real_seconds + 10) * 1000); }
  // host gives +1 defended to tables that cited 2 pieces of evidence
  for (const tb of Object.keys(styles).map(Number)) { const sd = team(s, tb).sealed; if (sd && !sd.river && sd.evidence.length === 2) s = act(s, { t: 'host', pin: s.pin, cmd: { c: 'defend', table: tb, value: true } }, now); }
  s = act(s, { t: 'host', pin: s.pin, cmd: { c: 'reveal' } }, now + (r.real_seconds + 20) * 1000);
  return [s, now + (r.real_seconds + 60) * 1000];
}

const agg: Record<Style, number[][]> = Object.fromEntries(STYLES.map((x) => [x, [[], []]])) as any;
const GAMES = 300;
for (let g = 0; g < GAMES; g++) {
  let now = 1_000_000;
  let s = newGame('TEST' + g, '1234', now);
  const nTables = 3 + Math.floor(rnd() * 6); // 3..8
  const styles: Record<number, Style> = {};
  for (let tb = 1; tb <= nTables; tb++) {
    styles[tb] = STYLES[(g + tb) % STYLES.length];
    const n = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) s = act(s, { t: 'join', playerId: `p${tb}-${i}`, name: `P${tb}${i}`, table: tb }, now + i);
  }
  for (let ri = 0; ri < PACK.rounds.length; ri++) {
    [s, now] = playRound(s, now, styles, ri);
    for (const res of roundResults(s, PACK.rounds[ri].id)) agg[styles[res.table]][ri].push(res.total);
    if (s.phase !== 'reveal') unexpected.push(`game ${g} round ${ri} ended in phase ${s.phase}`);
  }
  s = act(s, { t: 'host', pin: s.pin, cmd: { c: 'final' } }, now);
  if (grandTotals(s).length !== nTables) unexpected.push('grand totals table count mismatch');
}

const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
console.log(`Games: ${GAMES}`);
for (const st of STYLES) console.log(`${st.padEnd(10)} R1 ${mean(agg[st][0]).toFixed(1).padStart(5)}   R2 ${mean(agg[st][1]).toFixed(1).padStart(5)}   (n=${agg[st][0].length})`);
const errCounts = errors.reduce((m, e) => (m.set(e, (m.get(e) ?? 0) + 1), m), new Map<string, number>());
console.log('\nRefused actions the bots expected to work:');
for (const [e, n] of [...errCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}x ${e}`);
console.log(`\nUnexpected crashes: ${unexpected.length}`);
unexpected.slice(0, 5).forEach((u) => console.log(u));
if (unexpected.length) process.exit(1);
