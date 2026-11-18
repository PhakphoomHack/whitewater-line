"""Whitewater Line Player Manual v1.0 (A4, English, plain words for non-native readers).
No spoilers: it explains how to play, never which option or answer is right."""
import base64, os, sys
from playwright.sync_api import sync_playwright

D = os.path.dirname(os.path.abspath(__file__))
FD = '/home/claude/rolecards/fonts/node_modules/@fontsource/'

def b64(p, mime=None):
    mime = mime or ('image/webp' if p.endswith('.webp') else 'image/png')
    return f'data:{mime};base64,' + base64.b64encode(open(p, 'rb').read()).decode()
def ff(fam, pkg, w):
    return f"@font-face{{font-family:'{fam}';font-weight:{w};src:url({b64(f'{FD}{pkg}/files/{pkg}-latin-{w}-normal.woff2','font/woff2')}) format('woff2');}}"
FONTS = ff('Title', 'cinzel', 700) + ff('Fun', 'lilita-one', 400) + ff('Body', 'nunito-sans', 400) + ff('Body', 'nunito-sans', 700) + ff('Body', 'nunito-sans', 800)
I = lambda n: b64(os.path.join(D, n))
S = lambda n: b64(os.path.join(D, 'shots', n + '.png'))

def phone(shot, cap, crop=1688):
    return f'<figure class="ph"><div class="frame"><img src="{S(shot)}" style="object-position:top"></div><figcaption>{cap}</figcaption></figure>'

CSS = FONTS + """
@page { size: A4; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: 'Body'; color: #1d2433; font-size: 10.6pt; line-height: 1.45 }
.pg { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; padding: 15mm 15mm 14mm }
.pg.dark { background: #070F26; color: #EAF0FF }
h1 { font-family: 'Title'; font-size: 24pt; color: #0B1636; line-height: 1.1 }
.dark h1 { color: #FFE3A0 }
h2 { font-family: 'Fun'; font-weight: 400; font-size: 15pt; color: #B57E12; margin: 5mm 0 2mm; letter-spacing: .3pt }
h3 { font-size: 11pt; font-weight: 800; color: #0B1636; margin: 3mm 0 1mm }
p + p { margin-top: 2mm }
.kick { font-weight: 800; font-size: 8.5pt; letter-spacing: 2.2pt; color: #2E7FB8; text-transform: uppercase; margin-bottom: 2mm }
.lead { font-size: 12pt; color: #3b4458; margin-top: 3mm }
.foot { position: absolute; left: 15mm; right: 15mm; bottom: 7mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #8a93a6 }
.row { display: flex; gap: 6mm }
.col { flex: 1 }
.ph { width: 46mm; flex: none }
.ph .frame { width: 46mm; height: 92mm; border-radius: 5mm; overflow: hidden; border: 1.6mm solid #111a33; box-shadow: 0 1.2mm 3mm rgba(0,0,0,.25); background: #070F26 }
.ph img { width: 100%; height: 100%; object-fit: cover }
.ph figcaption { font-size: 8.4pt; color: #4b556b; margin-top: 1.6mm; line-height: 1.3 }
.box { border-radius: 3mm; padding: 3.2mm 4mm; background: #F4F1E8; border-left: 1.4mm solid #E2AE4E; margin-top: 3mm }
.box.blue { background: #EAF3FA; border-left-color: #2E7FB8 }
.box.red { background: #FBECEC; border-left-color: #C9363B }
.box b { color: #0B1636 }
table { width: 100%; border-collapse: collapse; margin-top: 2mm; font-size: 9.6pt }
th { text-align: left; background: #0B1636; color: #FFE3A0; font-weight: 800; padding: 1.8mm 2.4mm; font-size: 8.8pt; letter-spacing: .4pt }
td { padding: 1.8mm 2.4mm; border-bottom: .3mm solid #e1e4ea; vertical-align: top }
tr:nth-child(even) td { background: #f8f9fb }
.num { display: inline-flex; width: 6.4mm; height: 6.4mm; border-radius: 50%; background: #E2AE4E; color: #0B1636; font-weight: 800; align-items: center; justify-content: center; font-size: 9pt; margin-right: 2mm; flex: none }
.step { display: flex; align-items: flex-start; margin-top: 2.4mm }
.chip { display: inline-block; font-weight: 800; font-size: 8pt; padding: .4mm 2mm; border-radius: 3mm; background: #0B1636; color: #FFE3A0; letter-spacing: .5pt }
.big { font-family: 'Fun'; font-size: 20pt; color: #0B1636; text-align: center; margin: 3mm 0 }
.wide { width: 100%; border-radius: 3mm; box-shadow: 0 1mm 3mm rgba(0,0,0,.2) }
.pebble { position: absolute }
"""

def foot(n):
    return f'<div class="foot"><span>Whitewater Line · Player Manual v1.0 · a decision game for Accelerating Business Decisions</span><span>{n}</span></div>'

pages = []
# 1 cover
pages.append(f"""<div class="pg dark" style="padding:0">
<img src="{I('stage_river.webp')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55">
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,15,38,.35),rgba(7,15,38,.92) 70%)"></div>
<div style="position:absolute;left:18mm;right:18mm;top:28mm">
<div class="kick" style="color:#7FD0FF">Player Manual</div>
<h1 style="font-size:44pt">Whitewater<br>Line</h1>
<p class="lead" style="color:#EAF0FF;font-size:14pt;max-width:120mm">A decision game on the river. Your table runs a jewelry factory for one day. Decide fast, decide well, and bring your team with you.</p>
</div>
<img src="{I('sunluna_logo.webp')}" style="position:absolute;left:18mm;bottom:26mm;height:44mm">
<img src="{I('pebble_wave.webp')}" style="position:absolute;right:18mm;bottom:22mm;height:92mm">
<div class="foot" style="color:#9fb0d0"><span>For players · Read this before the game, or keep it on the table</span><span>1</span></div>
</div>""")

# 2 mission + join + roles
pages.append(f"""<div class="pg">
<div class="kick">Before you start</div><h1>Your mission</h1>
<p class="lead">Each table is the leadership team of <b>Sun &amp; Luna Manufacturing</b>, a factory that makes jewelry for global brands. You will face 2 real-life problems. For each one, your table makes <b>one</b> decision before the clock runs out.</p>
<div class="box blue"><b>Nobody sees everything.</b> Each of you holds different facts. The best decisions come from tables that talk, ask the right people and check their facts.</div>
<div class="row" style="margin-top:5mm">
<div class="col">
<h2>Join in 1 minute</h2>
<div class="step"><span class="num">1</span><span>Scan the QR code on the big screen with your phone camera.</span></div>
<div class="step"><span class="num">2</span><span>Type a nickname. No email, no phone number.</span></div>
<div class="step"><span class="num">3</span><span>Tap your table number, then <b>Join Table</b>.</span></div>
<div class="step"><span class="num">4</span><span>Turn your phone volume to low. Calls play on your phone.</span></div>
<p style="margin-top:3mm;font-size:9.4pt;color:#4b556b">Lost your page? Open the same link again. You keep your seat and your table.</p>
</div>
{phone('m01_join', 'Pick a nickname and your table.')}
{phone('m02_lobby', 'Wait here until the host starts.')}
</div>
<h2>Your role</h2>
<p>When the round starts, your phone gives you one role (sometimes two). Roles are random. You do not need to know the job: your cards tell you what you know.</p>
<table><tr><th style="width:36%">Role</th><th>What your cards are about</th></tr>
<tr><td><b>Production</b></td><td>Lines, machines, output, shifts</td></tr>
<tr><td><b>Supply Chain and Planning</b></td><td>Orders, stock, ship dates, freight</td></tr>
<tr><td><b>Procurement and Cost</b></td><td>Suppliers, contracts, costs, who can approve what</td></tr>
<tr><td><b>EHS and People</b></td><td>Safety rules, working hours, fatigue, people on each shift</td></tr>
<tr><td><b>Quality</b></td><td>QC results, customer rules, certificates, defects</td></tr>
<tr><td><b>Chief of Staff</b> (tables of 6)</td><td>No facts of your own. You lead the table and seal the decision.</td></tr></table>
{foot(2)}</div>""")

# 3 phone tabs
pages.append(f"""<div class="pg">
<div class="kick">Your phone</div><h1>Four tabs</h1>
<p class="lead">Everything happens on your phone. The big screen shows the clock, the news and the results.</p>
<div class="row" style="margin-top:4mm;justify-content:space-between">
{phone('m06_desk', '<b>My desk</b>: your own cards. Only you see them.')}
{phone('m08_calls', '<b>Calls</b>: people you can phone for help.')}
{phone('m10_board', '<b>Board</b>: facts your table pinned. Everyone sees it.')}
</div>
<div class="row" style="margin-top:5mm">
{phone('m13_decide', '<b>Decide</b>: build the decision together.')}
<div class="col">
<h2>The top of your screen</h2>
<p><b>Round and table</b> on the left. <b>★ leader</b> shows who seals for your table.</p>
<p><b>Game clock</b> on the right, with the deadline. Game time runs faster than real time. Each report you open and each call you make moves <b>your table's</b> clock forward.</p>
<p><b>Role tags</b> under your name show your role.</p>
<div class="box"><b>Tip:</b> Read your free notes first. Then tell your table the 1 or 2 facts that matter most. Do not read every card aloud.</div>
</div></div>
{foot(3)}</div>""")

# 4 cards, calls, pins
pages.append(f"""<div class="pg">
<div class="kick">Cards and calls</div><h1>Every fact has a price</h1>
<table><tr><th style="width:22%">Card</th><th style="width:22%">Cost</th><th>What it is</th></tr>
<tr><td><span class="chip">NOTE</span></td><td>Free</td><td>A fact you already know. Read it any time.</td></tr>
<tr><td><span class="chip">REPORT</span></td><td>15 game minutes</td><td>A sealed document. Tap <b>Open</b>, then tap again to confirm.</td></tr>
<tr><td><span class="chip" style="background:#8a5a00">RUMOR</span></td><td>15 game minutes</td><td>Something people say. It may be true or not. The card shows the source.</td></tr>
<tr><td><span class="chip" style="background:#1f6b4a">CALL</span></td><td>15 game minutes</td><td>A short phone call. The answer plays on your phone with subtitles, and stays on your Calls tab.</td></tr></table>
<div class="row" style="margin-top:5mm">
{phone('m07_report_open', 'A report after you open it. Now you can pin it.')}
{phone('m09_on_the_line', 'On the line: the answer plays once. Read the subtitle.')}
<div class="col">
<h2>Calls: ask the right person</h2>
<p>Your <b>table</b> can make 2 calls with no penalty. From the 3rd call, your table loses Trust, and people answer shorter, because they are busy.</p>
<p>Each person can only be called once per table. Agree as a table before you call.</p>
<h2>Pin what matters</h2>
<p>Tap <b>Pin to team board</b> on a fact you want your table to use. Pinned facts are your evidence. You can unpin later.</p>
<div class="box blue">Pinning facts from <b>4 or more roles</b> raises your table's Trust. It shows the decision used the whole team.</div>
</div></div>
{foot(4)}</div>""")

# 5 decide + seal + river
pages.append(f"""<div class="pg">
<div class="kick">Making the call</div><h1>Decide and seal</h1>
<p class="lead">Anyone can build the draft. Only the leader can seal it. Once sealed, there is no way back.</p>
<div class="row" style="margin-top:3mm">
<div class="col">
<h2>A decision has 3 parts</h2>
<div class="step"><span class="num">1</span><span><b>One option</b> (A, B, C or D).</span></div>
<div class="step"><span class="num">2</span><span><b>Up to 2 pieces of evidence</b> from your board. Pick the facts that really support your option.</span></div>
<div class="step"><span class="num">3</span><span><b>One measure</b>: how you will know it worked. Some measures look busy but do not show success.</span></div>
<p style="margin-top:3mm">Your phone writes your <b>rationale</b> as one sentence from these 3 parts. The host may ask your table to defend it.</p>
<h2>Seal</h2>
<p>The leader taps <b>Seal the decision</b>, then taps again. If the leader's phone is offline for 30 seconds, anyone at the table can seal.</p>
</div>
{phone('m14_tap_again', 'Tap twice to seal. The second tap is the point of no return.')}
</div>
<h2>Breaking news</h2>
<p>News can arrive in the middle of a round. If it rules out an option, that option turns grey and your draft is cleared. Look at the big screen and the red strip on your phone.</p>
<div class="row" style="margin-top:3mm">
<img class="wide" src="{S('m11_stage_news')}" style="width:96mm">
<div class="col">
<h2 style="margin-top:0">The river</h2>
<p><b>The river is rising:</b> when 2 in 3 tables have sealed and half the round has passed, the other tables get 2 minutes.</p>
<p><b>Out of time:</b> if your table has not sealed, the river decides for you. You get the weakest option and a low score.</p>
</div></div>
{foot(5)}</div>""")

# 6 scoring
pages.append(f"""<div class="pg">
<div class="kick">Scoring</div><h1>Speed × Quality × Trust</h1>
<p class="lead">Each part scores 1 to 5. We multiply them, so the best score is 125. One weak part pulls the whole score down.</p>
<table><tr><th style="width:18%">Part</th><th style="width:41%">Goes up when</th><th>Goes down when</th></tr>
<tr><td><b>Speed</b></td><td>Your table seals with more game time left.</td><td>You open many reports, make many calls, or wait too long.</td></tr>
<tr><td><b>Quality</b></td><td>You pick a strong option, and your evidence supports it. The host may add +1 if your table defends its rationale well.</td><td>Your evidence does not support your option, your only evidence is a rumor, or your measure does not show success.</td></tr>
<tr><td><b>Trust</b></td><td>You pin facts from 4 or more roles. You call the right person. You share a confirmed fact with another table.</td><td>You make more than 2 calls, seal with fewer than 2 pins, or pass up a decision that was yours to make.</td></tr></table>
<div class="row" style="margin-top:5mm">
{phone('m18_phone_score', 'Your score and the reasons, line by line.')}
<div class="col">
<h2>Luck tells a story. It never changes your score.</h2>
<p>After each round, each table hears what happened next. A good decision can still meet bad luck, and a poor decision can get lucky. The story is for discussion. The score only looks at <b>how</b> you decided.</p>
<img class="wide" src="{S('m17_stage_reveal')}" style="margin-top:3mm">
<p style="font-size:9pt;color:#4b556b;margin-top:1.5mm">The big screen ranks all tables after each round, then for both rounds together.</p>
</div></div>
{foot(6)}</div>""")

# 7 round 2 extras
pages.append(f"""<div class="pg">
<div class="kick">Round 2</div><h1>New in round 2</h1>
<p class="lead">Round 2 adds 3 things. Each one asks the same question: <b>whose decision is this, and what do we really know?</b></p>
<div class="row" style="margin-top:4mm">
{phone('m19_offer', 'An offer arrives on the leader’s phone.')}
<div class="col">
<h2>1. An incoming offer</h2>
<p>A caller makes your table an offer, with a deadline. It is marked <b>NO WAY BACK</b>. Talk as a table, then choose one answer. One answer counts for the whole table.</p>
<p>Every table meets this offer. If your leader tries to seal before it arrives, the offer comes in at once, and you must answer it before you can seal.</p>
<h2>2. A quick call</h2>
<p>Later, someone calls with a small yes or no question. Decide if it is your call to make.</p>
</div>
{phone('m24_small_call', 'A quick call: yes, no, or ask someone else.')}
</div>
<h2>3. The market (90 seconds)</h2>
<div class="row">
<div class="col">
<p>Each table gets one <b>exclusive</b> card that no other table has. Some are confirmed facts. Some are only <b>buzz</b> (not confirmed).</p>
<div class="step"><span class="num">1</span><span><b>Visit:</b> walk to another table and listen. Keep at least half of your table at home.</span></div>
<div class="step"><span class="num">2</span><span><b>Share:</b> send up to 3 cards to other tables. The table that receives a card pays 10 game minutes.</span></div>
<div class="step"><span class="num">3</span><span><b>Close:</b> your table can close its door to visitors.</span></div>
<div class="box"><b>Check the source.</b> A card from another table is only as good as where it came from.</div>
</div>
{phone('m22_phone_market', 'The market panel on your phone.')}
</div>
{foot(7)}</div>""")

# 8 cheat sheet + FAQ
pages.append(f"""<div class="pg">
<div class="kick">Keep this on the table</div><h1>Quick guide</h1>
<div class="row" style="margin-top:3mm">
<div class="col">
<h2>The 4 rules</h2>
<div class="step"><span class="num">1</span><span><b>Evidence matters.</b> Pick facts that support your option.</span></div>
<div class="step"><span class="num">2</span><span><b>Ask the right people, not everyone.</b> 2 calls are free.</span></div>
<div class="step"><span class="num">3</span><span><b>Every report and call costs time.</b> Open what you really need.</span></div>
<div class="step"><span class="num">4</span><span><b>Luck never changes your score.</b></span></div>
<h2>A good round, step by step</h2>
<div class="step"><span class="num">1</span><span>Read the brief and the 4 options together (1 min).</span></div>
<div class="step"><span class="num">2</span><span>Each person shares the 1 or 2 facts that matter most.</span></div>
<div class="step"><span class="num">3</span><span>Agree which report or call is worth the time.</span></div>
<div class="step"><span class="num">4</span><span>Pin the facts. Build the draft. Check the measure.</span></div>
<div class="step"><span class="num">5</span><span>Leader seals. No way back.</span></div>
</div>
<div class="col">
<h2>Questions</h2>
<h3>My phone shows nothing new.</h3><p>Wait for the host to start the round. Pull down to refresh if the page looks frozen.</p>
<h3>I have no card that matters.</h3><p>Ask questions. Your role is to help the table see the whole picture.</p>
<h3>Can we change a sealed decision?</h3><p>No. Sealed means sealed.</p>
<h3>Who is the leader?</h3><p>The Chief of Staff, if your table has one. If not, the leader changes in round 2.</p>
<h3>Do we need to know the job of our role?</h3><p>No. The cards give you what you need.</p>
<h3>Is my data kept?</h3><p>Only your nickname, and only for this session.</p>
</div></div>
<img src="{I('pebble_cheer.webp')}" style="position:absolute;right:16mm;bottom:16mm;height:62mm">
{foot(8)}</div>""")

html = f'<html><head><meta charset="utf-8"><style>{CSS}</style></head><body>{"".join(pages)}</body></html>'
open(os.path.join(D, 'manual.html'), 'w').write(html)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome'); pg = b.new_page()
    pg.goto('file://' + os.path.join(D, 'manual.html')); pg.evaluate('document.fonts.ready')
    over = pg.evaluate("[...document.querySelectorAll('.pg')].map((e,i)=>{const f=e.querySelector('.foot');if(!f)return 0;const fb=f.getBoundingClientRect().top;let m=0;e.querySelectorAll('p,table,.row,.step,h2,.box').forEach(x=>{const r=x.getBoundingClientRect();if(!x.closest('.foot'))m=Math.max(m,r.bottom)});return Math.round(fb-m)})")
    print('space above footer (px) per page:', over)
    pg.pdf(path=sys.argv[1], prefer_css_page_size=True, print_background=True); b.close()
