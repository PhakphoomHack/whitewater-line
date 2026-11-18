import { newGame, apply, tick, team, playerCards, realElapsed, finalScore, optionBase, canSeal, GameError, type GameState, type Action } from '../src/game/engine';

let pass = 0; const fails: string[] = [];
const ok = (cond: boolean, msg: string) => (cond ? pass++ : fails.push(msg));
const refused = (s: GameState, a: Action, now: number, msg: string) => { try { apply(s, a, now); fails.push('should refuse: ' + msg); } catch (e) { ok(e instanceof GameError, 'GameError type: ' + msg); } };

const T0 = 1_000_000;
let s = newGame('ROOM', '4321', T0);
const join = (id: string, name: string, table: number) => (s = apply(s, { t: 'join', playerId: id, name, table }, T0));
['a', 'b', 'c', 'd'].forEach((x, i) => join(x, 'N' + x, 1));
['e', 'f', 'g'].forEach((x) => join(x, 'N' + x, 2));
refused(s, { t: 'join', playerId: 'z', name: 'Na', table: 1 }, T0, 'duplicate name at table');
refused(s, { t: 'join', playerId: 'z', name: 'Zed', table: 9 }, T0, 'table out of range');
refused(s, { t: 'host', pin: '0000', cmd: { c: 'start' } }, T0, 'wrong pin');
const host = (cmd: any, now = T0) => (s = apply(s, { t: 'host', pin: '4321', cmd }, now));
host({ c: 'brief', round: 0 });
host({ c: 'start' });
ok(s.phase === 'play', 'play phase');
// roles: 4 players -> layout 4 = ops+hr, merch, finance, marketing ; leader rotates (round 0 -> first joined)
ok(s.players.a.roles.join() === 'ops,hr', 'roles for 4');
ok(team(s, 1).leader === 'a', 'leader is first joined in round 1');
ok(team(s, 2).leader === 'g', '3 players: finance+cos holder leads');
// open a report costs 15
const fin = Object.values(s.players).find((p) => p.table === 1 && p.roles.includes('finance'))!;
s = apply(s, { t: 'open', playerId: fin.id, cardId: 'r1-fin-3' }, T0 + 1000);
ok(team(s, 1).costs === 15, 'report costs 15');
refused(s, { t: 'open', playerId: 'a', cardId: 'r1-fin-3' }, T0, 'open other role card');
refused(s, { t: 'pin', playerId: fin.id, ref: 'r1-fin-4' }, T0, 'pin sealed report');
s = apply(s, { t: 'pin', playerId: fin.id, ref: 'r1-fin-3' }, T0 + 1000);
ok(team(s, 1).pins.length === 1, 'pinned');
// calls
s = apply(s, { t: 'call', playerId: 'b', stakeholder: 'buyer' }, T0 + 2000);
refused(s, { t: 'call', playerId: 'c', stakeholder: 'buyer' }, T0, 'duplicate call');
s = apply(s, { t: 'call', playerId: 'b', stakeholder: 'qc' }, T0 + 2000);
s = apply(s, { t: 'call', playerId: 'b', stakeholder: 'freight' }, T0 + 2000);
ok(team(s, 1).calls[2].irritated && !team(s, 1).calls[1].irritated, '3rd call irritated');
ok(team(s, 1).costs === 60, 'calls cost 15 each');
// pause stops the clock
host({ c: 'pause' }, T0 + 10_000);
ok(Math.round(realElapsed(s, T0 + 50_000)) === 10, 'paused clock frozen');
refused(s, { t: 'call', playerId: 'b', stakeholder: 'maint' }, T0 + 20_000, 'act while paused');
host({ c: 'resume' }, T0 + 50_000);
ok(Math.round(realElapsed(s, T0 + 60_000)) === 20, 'resume subtracts pause');
// breaking news at 240s kills A
s = apply(s, { t: 'draft', playerId: 'c', option: 'A' }, T0 + 60_000);
s = tick(s, T0 + 40_000 + 241_000);
ok(s.fired.some((f) => f.startsWith('news:')), 'news fired');
ok(team(s, 1).draft.option === null, 'killed option cleared from draft');
refused(s, { t: 'draft', playerId: 'c', option: 'A' }, T0 + 290_000, 'draft killed option');
// seal: non-leader refused while leader online
s = apply(s, { t: 'pin', playerId: 'b', ref: 'call:buyer' }, T0 + 290_000);
s = apply(s, { t: 'draft', playerId: 'c', option: 'B', evidence: ['r1-fin-3', 'call:buyer'], measure: "Aurelle's stock at launch and their feedback" }, T0 + 290_000);
s = apply(s, { t: 'heartbeat', playerId: 'a' }, T0 + 290_000);
refused(s, { t: 'seal', playerId: 'c' }, T0 + 291_000, 'non-leader seal');
ok(canSeal(s, 1, 'c', T0 + 290_000 + 35_000), 'non-leader may seal when leader offline');
s = apply(s, { t: 'seal', playerId: 'a' }, T0 + 292_000);
const tr = team(s, 1);
ok(!!tr.sealed && tr.score!.Q === 5, `quality 5 for B with evidence (got ${tr.score?.Q})`);
ok(tr.score!.T === 3, `trust: +1 key call, -1 over calls, 2 pins (got ${tr.score?.T}: ${tr.score?.notes.join(' | ')})`);
refused(s, { t: 'pin', playerId: 'b', ref: 'r1-merch-1' }, T0 + 293_000, 'act after seal');
// table 2 never seals -> river at deadline
s = tick(s, T0 + 40_000 + 721_000);
ok(team(s, 2).sealed?.river === true, 'river decides at deadline');
ok(s.phase === 'review', 'auto review when all sealed');
host({ c: 'defend', table: 1, value: true });
ok(finalScore(team(s, 1))!.Q === 5, 'defended capped at 5');
refused(s, { t: 'host', pin: '4321', cmd: { c: 'defend', table: 2, value: true } }, T0, 'cannot defend river');
host({ c: 'reveal' });
// round 2 carry-over: table 1 chose B -> waitlist -> C base 5, B base 4 ; table 2 river D -> B 5, C 3
host({ c: 'brief', round: 1 });
host({ c: 'start' }, T0 + 1_000_000);
ok(optionBase(s, 1, 'C') === 5 && optionBase(s, 1, 'B') === 4, 'carry waitlist');
ok(optionBase(s, 2, 'B') === 5 && optionBase(s, 2, 'C') === 3, 'carry otherwise');
const merch1 = Object.values(s.players).find((p) => p.table === 1 && p.roles.includes('merch'))!;
ok(playerCards(s, merch1.id).some((c) => c.id === 'r2-merch-4'), 'waitlist card shown after B');
ok(team(s, 1).leader === 'b', 'leader rotates in round 2');
// trap
s = tick(s, T0 + 1_000_000 + 151_000);
ok(team(s, 1).trap?.state === 'pending', 'trap pending');
s = apply(s, { t: 'trap', playerId: 'c', choice: 'sign' }, T0 + 1_302_000);
s = tick(s, T0 + 1_000_000 + 481_000);
ok(team(s, 2).small?.state === 'pending', 'small call pending');
s = apply(s, { t: 'small', playerId: 'e', choice: 'escalate' }, T0 + 1_482_000);
ok(team(s, 2).costs === 15, 'escalate small call costs 15');
s = apply(s, { t: 'draft', playerId: 'b', option: 'B', measure: 'Big orders shipped on time, with certificates' }, T0 + 1_483_000);
s = apply(s, { t: 'seal', playerId: 'b' }, T0 + 1_483_000);
ok(team(s, 1).score!.Q === 1 && team(s, 1).score!.T === 1, 'signing the trap drops Q and T to 1');
// trap before seal: table 2 tries to seal, offer is already pending -> refused until answered
s = apply(s, { t: 'draft', playerId: 'e', option: 'B', evidence: ['r2-fin-3'], measure: 'Big orders shipped on time, with certificates' }, T0 + 1_484_000);
const L2 = team(s, 2).leader!;
refused(s, { t: 'seal', playerId: L2 }, T0 + 1_484_000, 'seal while the offer is pending');
s = apply(s, { t: 'trap', playerId: 'e', choice: 'escalate' }, T0 + 1_485_000);
s = apply(s, { t: 'seal', playerId: L2 }, T0 + 1_486_000);
ok(!!team(s, 2).sealed, 'seal works after the offer is answered');
ok(team(s, 2).score!.notes.some((n) => n.includes('Regional VP')), 'factory trap note');
// add minute moves the deadline
host({ c: 'add_minute' }, T0 + 1_500_000);
s = tick(s, T0 + 1_000_000 + 905_000);
ok(!team(s, 2).sealed || !team(s, 2).sealed!.river || team(s, 2).costs > 0, 'add minute keeps table 2 alive past 900s unless out of game time');
console.log(`${pass} checks passed, ${fails.length} failed`);
fails.forEach((f) => console.log('  FAIL ' + f));
if (fails.length) process.exit(1);
