import { newGame, apply, tick, team, playerCards, deadlineSec, GameError, type GameState, type Action } from '../src/game/engine';

let pass = 0; const fails: string[] = [];
const ok = (c: boolean, m: string) => (c ? pass++ : fails.push(m));
const refused = (s: GameState, a: Action, now: number, m: string) => { try { apply(s, a, now); fails.push('should refuse: ' + m); } catch (e) { ok(e instanceof GameError, m); } };
const T0 = 5_000_000;
let s = newGame('MKT', '1111', T0);
const H = (cmd: any, now = T0) => (s = apply(s, { t: 'host', pin: '1111', cmd }, now));
for (let t = 1; t <= 4; t++) for (let i = 0; i < 4; i++) s = apply(s, { t: 'join', playerId: `t${t}p${i}`, name: `N${t}${i}`, table: t }, T0);
H({ c: 'rules' }); ok(s.phase === 'rules', 'rules phase');
// round 1 quickly: tables 1-3 seal, 4 does not -> rising river after half time
H({ c: 'brief', round: 0 }); H({ c: 'start' });
ok(!s.cues.some((c) => c.voice === 'rules_market'), 'no market rules in round 1');
for (const tb of [1, 2, 3]) {
  const L = team(s, tb).leader!;
  s = apply(s, { t: 'draft', playerId: L, option: 'B', measure: "Mrs. Arora's purchase and feedback" }, T0 + 1000);
  s = apply(s, { t: 'seal', playerId: L }, T0 + 1000);
}
s = tick(s, T0 + 300_000); ok(!s.rise, 'no rise before half the round');
s = tick(s, T0 + 361_000); ok(!!s.rise && Math.round(s.rise.until) === 481, `river rises at half time with 3/4 sealed (until ${s.rise?.until})`);
ok(Math.round(deadlineSec(s)) === 481, 'deadline moved to rise + 120 s');
s = tick(s, T0 + 482_000); ok(team(s, 4).sealed?.river === true, 'unsealed table gets the river at the new deadline');
ok(s.phase === 'review', 'review after rise deadline');
H({ c: 'reveal' });
// round 2: market
H({ c: 'brief', round: 1 }); ok(s.cues.some((c) => c.voice === 'rules_market'), 'market rules voice in round 2 brief');
H({ c: 'start' }, T0 + 1_000_000);
const R2 = T0 + 1_000_000;
refused(s, { t: 'give', playerId: 't1p0', ref: 'x', to: 2 }, R2 + 10_000, 'give before market');
s = tick(s, R2 + 391_000);
ok(!!s.market?.open, 'market opens at 390 s');
const ex1 = team(s, 1).exclusive!; const ex2 = team(s, 2).exclusive!;
ok(!!ex1 && ex1 !== ex2, 'each table gets a different exclusive card');
ok(playerCards(s, 't1p1').some((c) => c.id === ex1 && c.state === 'free'), 'exclusive visible to every member, already open');
// scouts: max half the table
s = apply(s, { t: 'scout', playerId: 't1p0', table: 2 }, R2 + 392_000);
s = apply(s, { t: 'scout', playerId: 't1p1', table: 3 }, R2 + 392_000);
refused(s, { t: 'scout', playerId: 't1p2', table: 4 }, R2 + 392_000, 'more than half away');
// closed table
s = apply(s, { t: 'stance', playerId: 't3p0', stance: 'closed' }, R2 + 393_000);
ok(s.players['t1p1'].scoutAt == null, 'closing a table sends its visitors home');
refused(s, { t: 'scout', playerId: 't1p1', table: 3 }, R2 + 393_000, 'visit a closed table');
refused(s, { t: 'give', playerId: 't1p0', ref: ex1, to: 3 }, R2 + 393_000, 'give to a closed table');
// give
const before = team(s, 2).costs;
s = apply(s, { t: 'give', playerId: 't1p0', ref: ex1, to: 2 }, R2 + 394_000);
ok(team(s, 2).pins.some((p) => p.ref === ex1), 'gift lands on receiver board');
ok(team(s, 2).costs === before + 10, 'receiver pays 10 game minutes');
refused(s, { t: 'give', playerId: 't2p0', ref: ex1, to: 4 }, R2 + 394_000, 're-gifting a received card');
refused(s, { t: 'give', playerId: 't1p0', ref: ex1, to: 2 }, R2 + 394_000, 'same gift twice');
// close
s = tick(s, R2 + 481_000); ok(!!s.market && !s.market.open, 'market closes after 90 s');
ok(Object.values(s.players).every((p) => !p.scoutAt), 'scouts sent home');
refused(s, { t: 'give', playerId: 't1p0', ref: ex1, to: 4 }, R2 + 482_000, 'give after close');
// trust for sharing a fact
const L1 = team(s, 1).leader!;
s = apply(s, { t: 'draft', playerId: L1, option: 'B', measure: 'Sell-through by Dec 31' }, R2 + 483_000);
s = apply(s, { t: 'seal', playerId: L1 }, R2 + 483_000);
const factGift = ['x2-overnight', 'x2-deposit', 'x2-renovation', 'x2-penalty', 'x2-mobile'].includes(ex1);
ok(team(s, 1).score!.notes.some((n) => n.includes('shared a confirmed fact')) === factGift, `sharing trust bonus only for facts (exclusive ${ex1})`);
console.log(`${pass} market checks passed, ${fails.length} failed`);
fails.forEach((f) => console.log('  FAIL ' + f));
if (fails.length) process.exit(1);
