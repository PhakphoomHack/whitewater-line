// End-to-end playtest: big screen + host phone + ~30 player phones in one browser (BroadcastChannel).
// Time runs 10x faster (stage ?speed=10). Usage: node tests/e2e.js [baseUrl] [outDir]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = process.argv[3] || './e2e-shots';
const fs = require('fs'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const problems = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const watch = (page, label) => {
    page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) problems.push(`${label} console: ${m.text().slice(0, 200)}`); });
  };
  // ---- big screen ----
  const stage = await ctx.newPage(); await stage.setViewportSize({ width: 1920, height: 1080 }); watch(stage, 'stage');
  await stage.goto(`${BASE}/stage?net=local`); await stage.getByText('Create room').click();
  await stage.waitForURL(/room=/);
  const room = new URL(stage.url()).searchParams.get('room');
  await stage.goto(`${BASE}/stage?room=${room}&speed=10&net=local`);
  const pin = await stage.evaluate((r) => localStorage.getItem(`wwd:pin:${r}`), room);
  log('room', room, 'pin', pin);
  await stage.getByText('Click to turn on sound').click();
  await stage.evaluate(() => localStorage.removeItem('wwd:name'));

  // ---- host ----
  const host = await ctx.newPage(); await host.setViewportSize({ width: 390, height: 844 }); watch(host, 'host');
  await host.goto(`${BASE}/host?room=${room}&net=local`);
  await host.getByPlaceholder(/Host PIN/).fill(pin); await host.getByText('Open remote').click();
  await host.getByText(/players/).first().waitFor();

  // ---- players ----
  const sizes = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 6, 6: 2 };
  const players = []; // {page, name, table}
  const NAMES = ['Linh', 'Minh', 'Trang', 'Huy', 'Ngoc', 'Bao', 'Phuong', 'Khoa', 'Thao', 'Duc', 'An', 'Vy', 'Tuan', 'Hanh', 'Quang', 'Long', 'Nhi', 'Son', 'Hoa', 'Thinh', 'Yen', 'Phat', 'Kim', 'Dat', 'Uyen', 'Sang', 'Mai', 'Lan', 'Binh', 'Chau'];
  let ni = 0;
  async function joinPlayer(table) {
    const page = await ctx.newPage(); await page.setViewportSize({ width: 390, height: 844 });
    const name = NAMES[ni++]; watch(page, `P:${name}`);
    await page.goto(`${BASE}/play?room=${room}&pid=bot${ni}&net=local`);
    try { await page.getByPlaceholder('e.g. Linh').fill(name, { timeout: 8000 }); } catch (e) { console.log('JOIN PAGE TEXT:', (await page.innerText('body')).slice(0, 400)); throw e; }
    await page.getByRole('button', { name: new RegExp(`^${table}\\b`) }).first().click();
    await page.getByRole('button', { name: /^Join Table/ }).click();
    await page.getByText(/You are in!|THE BRIEF|My desk/).first().waitFor({ timeout: 8000 });
    players.push({ page, name, table });
    return page;
  }
  for (const [t, n] of Object.entries(sizes)) for (let i = 0; i < n; i++) await joinPlayer(Number(t));
  log('joined', players.length);
  await sleep(1500);
  await stage.screenshot({ path: `${OUT}/01_stage_lobby.png` });
  await players[0].page.screenshot({ path: `${OUT}/02_phone_lobby.png` });
  await host.screenshot({ path: `${OUT}/03_host_lobby.png` });
  const lobbyText = await stage.textContent('body');
  if (!lobbyText.includes(`${players.length} joined`)) problems.push(`lobby count wrong: expected ${players.length} joined`);
  // duplicate name check through UI
  {
    const page = await ctx.newPage(); await page.setViewportSize({ width: 390, height: 844 }); watch(page, 'dup');
    await page.goto(`${BASE}/play?room=${room}&pid=dupe-test&net=local`); await page.getByPlaceholder('e.g. Linh').fill('Linh');
    await page.getByRole('button', { name: /^1\b/ }).first().click(); await page.getByRole('button', { name: /^Join Table/ }).click();
    const t = await page.getByText('already uses that name').count().catch(() => 0);
    await sleep(800);
    if (!(await page.textContent('body')).includes('already uses that name')) problems.push('duplicate name was not refused on the phone');
    await page.close();
  }

  const hostClick = async (re) => { await host.getByRole('button', { name: re }).first().click(); await sleep(600); };
  // ---- RULES (voice + slides) ----
  await hostClick(/Explain the rules/);
  await sleep(2500);
  if (!/Each table|leadership team/i.test(await stage.textContent('body'))) problems.push('rules slide 1 not on the big screen');
  await stage.screenshot({ path: `${OUT}/03a_stage_rules.png` });
  await players[0].page.screenshot({ path: `${OUT}/03b_phone_rules.png` });
  await sleep(6000);
  await stage.screenshot({ path: `${OUT}/03c_stage_rules_later.png` });
  // ---- ROUND 1 ----
  await hostClick(/Open Round 1 brief/);
  await stage.screenshot({ path: `${OUT}/04_stage_brief.png` });
  await hostClick(/Start round 1/);
  await sleep(1500);
  await stage.screenshot({ path: `${OUT}/05_stage_play.png` });
  // late joiners while the round runs (to reach 30)
  for (const t of [6, 6, 3, 2]) await joinPlayer(t);
  log('players now', players.length);

  const byTable = (t) => players.filter((p) => p.table === t);
  async function leaderOf(t) { for (const p of byTable(t)) { if ((await p.page.textContent('header')).includes('★ leader')) return p; } return null; }
  async function tab(page, re) { await page.getByRole('button', { name: re }).first().click(); await sleep(250); }
  async function doubleTap(page, re) { const b = page.getByRole('button', { name: re }).first(); await b.click(); await sleep(200); await page.getByRole('button', { name: /Tap again/ }).first().click(); await sleep(500); }

  async function pinAllNotes(p) {
    await tab(p.page, /My desk/);
    for (let k = 0; k < 6; k++) { const b = p.page.getByRole('button', { name: 'Pin to team board' }); if (!(await b.count())) break; await b.first().click(); await sleep(250); }
  }
  async function playTable(t, plan) {
    const ps = byTable(t);
    for (const p of ps) await pinAllNotes(p);
    if (plan.report) { // finance opens insurance
      for (const p of ps) { await tab(p.page, /My desk/); if (await p.page.getByText('Insurance limits').count()) { await doubleTap(p.page, /Open · 15 min/); await p.page.getByRole('button', { name: 'Pin to team board' }).first().click().catch(() => {}); break; } }
    }
    for (const who of plan.calls || []) {
      const p = ps[0]; await tab(p.page, /^Calls/);
      const card = p.page.locator('article', { hasText: who });
      await card.getByRole('button', { name: /Call · 15 min/ }).click(); await sleep(200);
      await card.getByRole('button', { name: /Tap again/ }).click();
      await p.page.getByText('ON THE LINE').waitFor({ timeout: 5000 });
      if (t === 1) await p.page.screenshot({ path: `${OUT}/06_phone_call.png` });
      await sleep(900);
      await p.page.getByRole('button', { name: 'Hang up' }).click();
      await tab(p.page, /^Board/);
      await p.page.getByRole('button', { name: 'Pin to team board' }).first().click().catch(() => {}); await sleep(300);
    }
    if (plan.seal) {
      const L = (await leaderOf(t)) ?? ps[0];
      await tab(L.page, /Decide/);
      await L.page.getByRole('button', { name: new RegExp(`^${plan.option}\\.`) }).click(); await sleep(300);
      for (const ev of plan.evidence) { const b = L.page.getByRole('button', { name: new RegExp(ev) }).first(); if (await b.count()) { await b.click(); await sleep(300); } }
      await L.page.getByRole('button', { name: plan.measure }).click(); await sleep(300);
      if (t === 1) await L.page.screenshot({ path: `${OUT}/07_phone_decide.png`, fullPage: true });
      await doubleTap(L.page, /Seal the decision/);
      await sleep(600);
      if (t === 1) await stage.screenshot({ path: `${OUT}/08_stage_sealed_moment.png` });
    }
  }
  await playTable(1, { report: true, calls: ["Mrs. Arora's assistant"], seal: true, option: 'B', evidence: ['flagship vault\\. Value', 'wedding'], measure: "Mrs. Arora's purchase and feedback" });
  await playTable(2, { calls: ['Flagship store manager', 'PR agency', 'Regional Director'], seal: true, option: 'C', evidence: ['Press embargo'], measure: 'Instagram likes this week' });
  await sleep(2000);
  // wait for breaking news (240 s game = 24 s real)
  log('waiting for breaking news');
  await byTable(3)[0].page.getByText(/Option A is out/).first().waitFor({ timeout: 40000 }).catch(() => problems.push('phones never showed the breaking news strip'));
  log('news on phones');
  await stage.screenshot({ path: `${OUT}/09_stage_news.png` });
  await sleep(1200);
  await byTable(3)[0].page.screenshot({ path: `${OUT}/10_phone_news_strip.png` });
  const aDisabled = await (async () => { const L = byTable(3)[0]; await tab(L.page, /Decide/); return L.page.getByRole('button', { name: /^A\./ }).isDisabled(); })();
  if (!aDisabled) problems.push('option A still clickable after breaking news');
  await playTable(3, { seal: true, option: 'D', evidence: [], measure: 'Store footfall on Saturday' });
  await playTable(5, { calls: ['Insurance broker'], seal: true, option: 'B', evidence: ['flagship vault\\. Value', 'cap is'], measure: 'No photos online before launch' });
  await playTable(6, { seal: false });
  // 4 of 6 tables sealed -> after half the round the river rises for tables 4 and 6
  await stage.getByText('THE RIVER IS RISING').waitFor({ timeout: 60000 }).then(() => log('river rising')).catch(() => problems.push('river never rose in round 1'));
  await stage.screenshot({ path: `${OUT}/10b_stage_river_rising.png` });
  await sleep(1200); await byTable(4)[0].page.screenshot({ path: `${OUT}/10c_phone_river_rising.png` });
  if (!(await byTable(4)[0].page.textContent('body')).includes('THE RIVER IS RISING')) problems.push('phone does not show the rising river');
  await host.getByText(/review/).first().waitFor({ timeout: 90000 }).catch(() => problems.push('round 1 never reached review'));
  await stage.screenshot({ path: `${OUT}/11_stage_review.png` });
  await host.screenshot({ path: `${OUT}/12_host_review.png`, fullPage: true });
  await host.getByRole('button', { name: 'Give +1 defended' }).first().click(); await sleep(400);
  await hostClick(/Reveal results/);
  await sleep(1500);
  await stage.screenshot({ path: `${OUT}/13_stage_reveal.png` });
  await byTable(1)[0].page.screenshot({ path: `${OUT}/14_phone_score.png`, fullPage: true });
  const revealText = await stage.textContent('body');
  if (!/RIVER|river/.test(revealText)) problems.push('reveal does not mention the river for table 4');

  // ---- ROUND 2 ----
  await hostClick(/Open Round 2 brief/);
  await hostClick(/Start round 2/);
  await sleep(1000);
  await playTable(1, { seal: false });
  // trap at 300 s = 30 s real
  await byTable(1)[0].page.getByText('INCOMING OFFER').waitFor({ timeout: 45000 }).catch(() => problems.push('trap offer never appeared on phones'));
  await stage.screenshot({ path: `${OUT}/15_stage_trap_news.png` });
  await byTable(1)[0].page.screenshot({ path: `${OUT}/16_phone_trap.png` });
  for (const [t, choice] of [[1, /CEO and Legal/], [2, /Sign now/], [3, /more time/], [5, /^Decline$/]]) {
    const pg = byTable(t)[0].page; if (!(await pg.getByText('INCOMING OFFER').count())) { problems.push(`table ${t} missing trap`); continue; }
    await pg.getByRole('button', { name: choice }).click(); await pg.getByRole('button', { name: 'Confirm for the table' }).click(); await sleep(500);
    if (await pg.getByText('ON THE LINE').count()) await pg.getByRole('button', { name: 'Hang up' }).click();
  }
  // ---- MARKET (round 2 only) ----
  const readState = () => stage.evaluate((r) => JSON.parse(localStorage.getItem(`wwd:state:${r}`)), room);
  if ((await readState()).market) problems.push('market opened before the host or 390 s');
  await hostClick(/Open the market now/);
  for (let k = 0; k < 4; k++) await hostClick(/Market \+30 s/);
  await byTable(1)[1].page.getByText('MARKET OPEN').first().waitFor({ timeout: 8000 }).catch(() => problems.push('market panel missing on phone'));
  await stage.screenshot({ path: `${OUT}/16b_stage_market.png` });
  {
    const st = await readState();
    const ex = [1, 2, 3, 5].map((t) => st.teams?.[t]?.r2?.exclusive);
    log('exclusives', JSON.stringify(ex));
  }
  // scout: table 1 player 2 visits table 3; table 3 then closes, visitor goes home
  const v = byTable(1)[1].page;
  await v.getByRole('button', { name: /^Table 3$/ }).first().click(); await sleep(900);
  if (!(await v.textContent('body')).includes('YOU ARE VISITING TABLE 3')) problems.push('scout visit not shown on phone');
  await v.screenshot({ path: `${OUT}/16c_phone_scouting.png` });
  await byTable(3)[0].page.getByRole('button', { name: 'Close it' }).click(); await sleep(1200);
  if ((await v.textContent('body')).includes('YOU ARE VISITING TABLE 3')) problems.push('visitor not sent home when table 3 closed');
  // give: table 1 shares its exclusive card with table 5
  const g = byTable(1)[0].page;
  const before5 = JSON.stringify(await readState()).length;
  await g.getByRole('button', { name: /exclusive ·/ }).first().click(); await sleep(300);
  await g.getByRole('button', { name: /^Send to Table 5$/ }).first().click(); await sleep(1200);
  await g.screenshot({ path: `${OUT}/16d_phone_after_give.png` });
  {
    const st = JSON.stringify(await readState());
    if (!st.includes('"by":"table:1"')) problems.push('gift did not land on table 5 board');
  }
  await byTable(5)[0].page.getByRole('button', { name: /^Board/ }).first().click(); await sleep(400);
  await byTable(5)[0].page.screenshot({ path: `${OUT}/16e_phone_received_gift.png`, fullPage: true });
  // small call at 480 s = 48 s real
  await byTable(1)[0].page.getByText('QUICK CALL').waitFor({ timeout: 40000 }).catch(() => problems.push('small call never appeared'));
  await byTable(1)[0].page.screenshot({ path: `${OUT}/17_phone_small_call.png` });
  for (const [t, choice] of [[1, /Yes, approve/], [2, /Regional Director/]]) {
    const pg = byTable(t)[0].page; if (!(await pg.getByText('QUICK CALL').count())) continue;
    await pg.getByRole('button', { name: choice }).click(); await pg.getByRole('button', { name: 'Confirm for the table' }).click(); await sleep(500);
    if (await pg.getByText('ON THE LINE').count()) await pg.getByRole('button', { name: 'Hang up' }).click();
  }
  await playTable(1, { report: false, calls: ['Store operations lead'], seal: true, option: 'C', evidence: ['72%', 'Dates cannot move'], measure: 'Sell-through by Dec 31' });
  await playTable(2, { seal: true, option: 'B', evidence: [], measure: 'Online out-of-stock days' });
  await hostClick(/End round now/); await host.getByRole('button', { name: 'Yes, do it' }).click(); await sleep(1000);
  await hostClick(/Reveal results/); await sleep(1200);
  await stage.screenshot({ path: `${OUT}/18_stage_reveal_r2.png` });
  await byTable(2)[0].page.screenshot({ path: `${OUT}/19_phone_score_trap_signed.png`, fullPage: true });
  const t2 = await byTable(2)[0].page.textContent('main');
  if (!/quality and trust drop to 1/.test(t2)) problems.push('signed trap feedback missing on phone');
  await hostClick(/Show final results/); await sleep(1200);
  await stage.screenshot({ path: `${OUT}/20_stage_final.png` });

  // reload resilience: a phone reloads mid-game and keeps its seat
  const p0 = byTable(1)[0].page; await p0.reload(); await sleep(1500);
  if (!(await p0.textContent('body')).includes('BOTH ROUNDS')) problems.push('phone lost its seat after reload');
  // stage reload keeps state
  await stage.reload(); await sleep(1500);
  if (!(await stage.textContent('body')).includes("river's best desks") && !(await stage.textContent('body')).includes('best desks')) problems.push('stage lost state after reload');

  log('screenshots in', OUT);
  console.log(`\nPROBLEMS (${problems.length}):`); [...new Set(problems)].forEach((p) => console.log(' - ' + p));
  await browser.close();
})().catch(async (e) => { console.error('E2E CRASH', e); console.log(`\nPROBLEMS (${problems.length}):`); [...new Set(problems)].forEach((p) => console.log(' - ' + p)); process.exit(1); });
