"""Whitewater Line: factory case content (draft v0.1, for Hack's review).
Writes src/game/case_pack.json. Everything not about the case (scoring, layouts, audio rules)
is copied unchanged from the Whitewater Desk pack."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
old = json.load(open(os.path.join(ROOT, 'src/game/case_pack.json')))

def card(id, role, kind, tier, text, title=None, fact=None, source=None, only_if=None):
    c = {'id': id, 'role': role, 'kind': kind, 'cost': 0 if kind == 'note' else 15, 'text': text, 'tier': tier}
    if title: c['title'] = title
    if fact: c['fact'] = fact
    if source: c['source'] = source
    if only_if: c['only_if'] = only_if
    return c

R1 = {
 'id': 'r1', 'title': 'The Rush Order', 'real_seconds': 720, 'game_minutes': 240, 'clock_start': '10:00',
 'brief': 'Aurelle, a key customer, wants all 5,000 pendants of order AU-118 one week early, for a store launch. Decide by 2 p.m.',
 'options': {
  'A': {'label': 'Full order early', 'text': 'All 5,000 in 1 week. Both lines run 12-hour shifts, 7 days a week.', 'base': 1},
  'B': {'label': 'Split the shipment', 'text': 'Ship the 3,000 that pass QC this week. Ship the other 2,000 on the original date.', 'base': 5, 'tag': 'Reduce scope'},
  'C': {'label': 'Ask for a new date', 'text': 'Offer all 5,000 three days before the original date, with no extra overtime.', 'base': 4, 'tag': 'Park'},
  'D': {'label': 'Polite no', 'text': 'Keep the original date for the full order.', 'base': 2},
 },
 'cards': [
  # Production
  card('r1-ops-1', 'ops', 'note', 'key', 'Normal output: 250 finished pendants a day. Line 1 plates, Line 2 polishes.'),
  card('r1-ops-2', 'ops', 'note', 'context', 'Both lines already run 2 shifts, 6 days a week.'),
  card('r1-ops-3', 'ops', 'report', 'context', 'A third shift needs 5 trained platers. We have 2.', title='Third shift check'),
  card('r1-ops-4', 'ops', 'report', 'critical', 'Line 1 plating tank is overdue for service. It failed twice this year when it ran non-stop.', title='Line 1 service log', fact='tank'),
  # Supply Chain and Planning
  card('r1-merch-1', 'merch', 'note', 'critical', '3,100 of the 5,000 pendants are finished and waiting for final QC.', fact='stock'),
  card('r1-merch-2', 'merch', 'note', 'context', 'Original ship date: in 2 weeks. Aurelle now asks for all 5,000 in 1 week.'),
  card('r1-merch-3', 'merch', 'report', 'context', 'We ship to Aurelle by air: 3 days, door to door.', title='Freight plan'),
  card('r1-merch-4', 'merch', 'rumor', 'rumor', 'A rival factory offered Aurelle the same pendants for 10% less.', title='Market chatter', source='a planner heard'),
  # Procurement and Cost
  card('r1-fin-1', 'finance', 'note', 'context', 'Aurelle buys about $2.4M from us a year.'),
  card('r1-fin-2', 'finance', 'note', 'context', 'Overtime costs 1.5 times normal pay. Overtime budget left this month: $6,000.'),
  card('r1-fin-3', 'finance', 'report', 'critical', 'Our contract with Aurelle allows split shipments: up to 2 per order, no penalty.', title='Contract terms', fact='split'),
  card('r1-fin-4', 'finance', 'report', 'context', 'A second air shipment costs about $3,500 extra.', title='Freight cost'),
  # EHS and People
  card('r1-hr-1', 'hr', 'note', 'context', 'This week, 4 of our 30 line workers are on approved leave.'),
  card('r1-hr-2', 'hr', 'note', 'key', 'Hours cap: 60 hours per person per week, overtime included. Line teams already work 48.'),
  card('r1-hr-3', 'hr', 'report', 'context', 'Last year, minor injuries tripled on the third 12-hour shift in a row.', title='Fatigue data'),
  card('r1-hr-4', 'hr', 'rumor', 'rumor', 'Some workers want extra overtime pay before the New Year.', title='Shop-floor mood', source='canteen talk'),
  # Quality
  card('r1-mkt-1', 'marketing', 'note', 'key', 'Customer rule: every shipment needs a QC certificate. No certificate, no delivery.'),
  card('r1-mkt-2', 'marketing', 'note', 'context', 'Final QC of this batch takes 1 day. Pass rate this month: 98%.'),
  card('r1-mkt-3', 'marketing', 'report', 'context', 'Rushed batches last year had 3 times more plating defects.', title='Defect history'),
  card('r1-mkt-4', 'marketing', 'rumor', 'rumor', 'Aurelle rarely checks certificates on rush orders.', title='QC rumor', source='QC team chat'),
 ],
 'stakeholders': [
  {'id': 'buyer', 'name': "Aurelle's buyer", 'cost': 15, 'key': True, 'fact': 'need',
   'text': 'Our store launch is on the 20th. 3,000 pieces would cover our top stores. The rest can follow on the original date.'},
  {'id': 'planner', 'name': 'Head of Production Planning', 'cost': 15, 'key': False,
   'text': 'We can still finish the last 2,000 by the original date, even if a line stops for 2 days.'},
  {'id': 'maint', 'name': 'Head of Maintenance', 'cost': 15, 'key': True,
   'text': 'The Line 1 tank is overdue. Run it non-stop this week and I would expect a breakdown.'},
  {'id': 'qc', 'name': 'QC Manager', 'cost': 15, 'key': False,
   'text': 'I will not sign a certificate for parts we did not inspect.'},
  {'id': 'freight', 'name': 'Freight forwarder', 'cost': 15, 'key': False,
   'text': 'Two air shipments are fine. Just book 48 hours ahead.'},
 ],
 'breaking_news': [{'at_real_seconds': 240, 'text': 'Maintenance: the Line 1 plating tank has failed. Line 1 is down for 48 hours.', 'kills': ['A']}],
 'measures': {
  'right': ["Aurelle's stock at launch and their feedback", 'Zero injuries, nobody over the hours cap'],
  'wrong': ['Overtime hours worked this week', 'Machine running hours'],
 },
 'outcomes': {
  'A': [[0.3, 'good', 'Somehow it worked and nobody got hurt. Pure luck.'], [0.7, 'bad', 'Line 1 broke down, tired crews made a reject batch, and two people got minor injuries.']],
  'B': [[0.85, 'good', 'Aurelle launched on time and placed a reorder.'], [0.15, 'bad', 'The first flight left a day late. Aurelle was annoyed but kept the order.']],
  'C': [[0.75, 'good', 'Aurelle accepted the new date and thanked us for being honest.'], [0.25, 'bad', 'Aurelle moved part of the order to another factory.']],
  'D': [[0.4, 'good', 'Aurelle accepted the original date.'], [0.6, 'bad', 'Aurelle complained to our Plant Director.']],
 },
}

R2 = {
 'id': 'r2', 'title': 'The Short Supply', 'real_seconds': 900, 'game_minutes': 180, 'clock_start': '09:00',
 'brief': 'Only 600 of 1,000 kg of brass alloy arrived. The rest comes in 3 weeks. Decide how to use the 600 kg by 12 noon.',
 'options': {
  'A': {'label': 'Equal cut', 'text': 'Every open order gets 60% of the metal it needs.', 'base': 2},
  'B': {'label': 'Due dates first', 'text': '450 kg to the two big orders due in 10 days, 150 kg to small orders. Nord waits.', 'base': 5, 'tag': 'Approximate'},
  'C': {'label': 'Key account first', 'text': 'Hold 100 kg for Aurelle, our biggest customer. Then use the rest by due date.', 'base': 4, 'tag': 'Pick'},
  'D': {'label': 'Stop and wait', 'text': 'Pause production until the full 1,000 kg arrives.', 'base': 1},
 },
 'trap': {
  'at_real_seconds': 150,
  'text': 'Supplier Kestrel Metals: we can deliver the missing 400 kg in 5 days if you sign a 3-year exclusive contract for all your brass alloy. Value: $6.5M. Answer in 2 hours.',
  'label': 'NO WAY BACK',
  'choices': {'sign': {'q': 1, 't': 1}, 'decline': {'t_delta': -1}, 'escalate': {}, 'ask_time': {}},
  'authority_card': 'Contracts over $1M need the Regional VP and Legal.',
 },
 'critical_facts': ['orders', 'penalty'],
 'stakeholder_keys': ['plant_dir', 'prod_head'],
 'cards': [
  # Production
  card('r2-ops-1', 'ops', 'note', 'key', 'Each product change on a line takes 4 hours of setup.'),
  card('r2-ops-2', 'ops', 'note', 'context', 'Lines 3 and 4 stand side by side in Building B, 2 minutes apart.'),
  card('r2-ops-3', 'ops', 'report', 'context', 'Metal waste: 2% on long runs, 6% when we switch products often.', title='Scrap data'),
  card('r2-ops-4', 'ops', 'rumor', 'rumor', 'Night shift says they can get more parts from the same kilos.', title='Shift chatter', source='night shift'),
  # Supply Chain and Planning
  card('r2-merch-1', 'merch', 'note', 'context', '600 kg arrived today. The other 400 kg arrive in 3 weeks.'),
  card('r2-merch-2', 'merch', 'report', 'critical', 'Aurelle and Mira Home: 450 kg, due in 10 days. Nord: 300 kg, due in 4 weeks. Small orders: 250 kg, flexible dates.', title='Order book', fact='orders'),
  card('r2-merch-3', 'merch', 'report', 'context', 'Last year, small-order customers accepted a 2-week delay 9 times out of 10.', title='Delay history'),
  card('r2-merch-4', 'merch', 'note', 'key', 'After the rush order, Aurelle placed a reorder: 100 kg more, due in 10 days.', fact='waitlist', only_if='r1_choice_in_BC'),
  card('r2-merch-5', 'merch', 'note', 'key', 'After the rush order, Aurelle told our sales team the delivery felt chaotic.', only_if='r1_choice_A'),
  # Procurement and Cost
  card('r2-fin-1', 'finance', 'report', 'context', 'Brass alloy price rose 8% this quarter.', title='Price trend'),
  card('r2-fin-2', 'finance', 'note', 'critical', 'Contract approval: Plant Director up to $500k. Over $1M: Regional VP and Legal.', fact='authority'),
  card('r2-fin-3', 'finance', 'note', 'critical', 'Late penalties on the two big orders: about $60k per week, from day 1.', fact='penalty'),
  card('r2-fin-4', 'finance', 'rumor', 'rumor', 'Kestrel Metals may have money problems next year.', title='Supplier gossip', source='hallway talk'),
  # EHS and People
  card('r2-hr-1', 'hr', 'note', 'context', 'Line teams are tired after the rush order.'),
  card('r2-hr-2', 'hr', 'note', 'key', 'Weekend rule: a maintenance tech must reach any running line within 10 minutes.'),
  card('r2-hr-3', 'hr', 'report', 'context', 'If a line stops, 30 contract workers get no shift pay.', title='Stop impact'),
  card('r2-hr-4', 'hr', 'rumor', 'rumor', 'Some team leaders say an equal cut is the only fair way.', title='Team mood', source='canteen talk'),
  # Quality
  card('r2-mkt-1', 'marketing', 'note', 'key', 'Every order must use certified nickel-free alloy. No certificate, no shipment.'),
  card('r2-mkt-2', 'marketing', 'note', 'context', 'Mira Home audits our material certificates every quarter.'),
  card('r2-mkt-3', 'marketing', 'report', 'key', "Kestrel's alloy is not yet certified nickel-free. Certification takes 6 weeks.", title='Supplier certification'),
  card('r2-mkt-4', 'marketing', 'rumor', 'rumor', 'One buyer said an equal cut would look fairer to all customers.', title="Buyer's view", source="a buyer's email"),
 ],
 'stakeholders': [
  {'id': 'plant_dir', 'name': 'Plant Director', 'cost': 15, 'key': True,
   'text': 'I can approve the allocation. A supplier contract that size is not mine. Take it to the Regional VP.'},
  {'id': 'prod_head', 'name': 'Head of Production', 'cost': 15, 'key': True,
   'text': 'Long runs on the two big orders waste the least metal. Small orders can wait 2 weeks.'},
  {'id': 'legal', 'name': 'Legal', 'cost': 15, 'key': False, 'text': 'Never sign an exclusive deal in 2 hours.'},
  {'id': 'supplier', 'name': 'Kestrel Metals sales rep', 'cost': 15, 'key': False, 'text': 'Other buyers want this slot. Decide fast.'},
  {'id': 'account', 'name': 'Aurelle account manager', 'cost': 15, 'key': False, 'text': 'Aurelle is our biggest customer. Give them everything first.'},
 ],
 'measures': {
  'right': ['Big orders shipped on time, with certificates', 'Late-penalty cost this month'],
  'wrong': ['Number of customers who got some metal', 'Machine running hours'],
 },
 'outcomes': {
  'A': [[0.3, 'good', 'Customers were patient this time. Penalties stayed small.'], [0.7, 'bad', 'Both big orders shipped late. Penalties hit $120k.']],
  'B': [[0.8, 'good', 'Both big orders shipped on time. Small customers took the delay well.'], [0.2, 'bad', 'A machine fault cost a day, but penalties stayed small.']],
  'C': [[0.8, 'good', 'Aurelle got its reorder and praised the factory.'], [0.2, 'bad', 'Mira Home shipped 3 days late and complained.']],
  'D': [[0.1, 'good', 'The rest of the metal came early and orders caught up.'], [0.9, 'bad', 'The lines sat idle and every order shipped late.']],
 },
 'carry': {**old['rounds'][1]['carry']},
 'small_call': {
  'at_real_seconds': 480, 'from': 'Weekend shift lead',
  'text': 'Can Lines 3 and 4 share one maintenance tech this weekend? I need a yes or no today.',
  'within_authority': True,
  'choices': {'approve': {'note': 'right: your call'}, 'decline': {'note': 'fine'},
              'escalate': {'cost': 15, 't_delta': -1, 'reply': "Plant Director: That's your call. You don't need me for this."}},
 },
}
R2['carry']['client_note'] = 'Aurelle reorder (B, C) or Aurelle complaint (A)'

pack = {**old}
pack['pack'] = 'factory-v1'
pack['company'] = {'name': 'Sun & Luna Manufacturing', 'type': 'Jewelry factory', 'lines': 4}
pack['role_names'] = {'ops': 'Production', 'merch': 'Supply Chain and Planning', 'finance': 'Procurement and Cost',
                      'hr': 'EHS and People', 'marketing': 'Quality', 'cos': 'Chief of Staff'}
pack['rounds'] = [R1, R2]

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'src/game/case_pack.json')
    json.dump(pack, open(out, 'w'), indent=1, ensure_ascii=False)
    print('wrote', out)
