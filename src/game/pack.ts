// Case pack + design decisions that are not in the JSON yet (evidence map, audio, subtitles).
import raw from './case_pack.json';

export type RoleId = 'ops' | 'merch' | 'finance' | 'hr' | 'marketing' | 'cos';
export type OptionKey = 'A' | 'B' | 'C' | 'D';

export interface Card {
  id: string; role: RoleId; kind: 'note' | 'report' | 'rumor' | 'buzz'; cost: number; text: string;
  tier: 'critical' | 'key' | 'context' | 'rumor'; title?: string; exclusive?: boolean; source?: string; fact?: string; only_if?: string;
}
export interface Stakeholder { id: string; name: string; cost: number; key: boolean; text: string }
export interface OptionDef { label: string; text: string; base: number; tag?: string }
export interface RoundDef {
  id: string; title: string; real_seconds: number; game_minutes: number; clock_start: string; brief: string;
  options: Record<OptionKey, OptionDef>; cards: Card[]; stakeholders: Stakeholder[];
  breaking_news?: { at_real_seconds: number; text: string; kills: OptionKey[] }[];
  trap?: { at_real_seconds: number; text: string; label: string; authority_card: string };
  small_call?: { at_real_seconds: number; from: string; text: string; choices: { escalate: { cost: number; t_delta: number; reply: string } } };
  measures: { right: string[]; wrong: string[] };
  outcomes: Record<OptionKey, [number, 'good' | 'bad', string][]>;
  carry?: { base_if_waitlist: Partial<Record<OptionKey, number>>; base_otherwise: Partial<Record<OptionKey, number>> };
}

export const PACK = raw as unknown as {
  pack: string; company: { name: string }; roles: RoleId[]; role_names: Record<RoleId, string>;
  rounds: RoundDef[]; table_layouts: Record<string, RoleId[][]>;
};

export const ROLE_NAMES = PACK.role_names;
export const ROLE_COLORS: Record<RoleId, string> = {
  merch: '#8FD8FF', finance: '#7FE0AE', marketing: '#FFB877', hr: '#CDB2FF', ops: '#EAF0FF', cos: '#FFD36B',
};

// Which cards / calls count as evidence for each option (quality v2 "evidence matches the choice").
// Calls are written as "call:<stakeholder id>".
export const SUPPORTS: Record<string, Record<OptionKey, string[]>> = {
  r1: {
    A: ['r1-merch-4'],
    B: ['r1-merch-1', 'r1-fin-3', 'r1-ops-4', 'r1-hr-2', 'r1-ops-1', 'r1-mkt-1', 'r1-merch-4', 'call:assistant', 'call:store_mgr', 'call:broker'],
    C: ['r1-fin-3', 'r1-ops-4', 'r1-mkt-1', 'r1-hr-2', 'r1-hr-4', 'r1-mkt-4', 'r1-merch-4', 'call:assistant', 'call:pr', 'call:broker'],
    D: ['r1-mkt-1', 'r1-ops-4', 'r1-hr-4', 'r1-mkt-4', 'call:pr'],
  },
  r2: {
    A: ['r2-hr-4', 'r2-mkt-4', 'x2-ceo'],
    B: ['r2-merch-2', 'r2-mkt-1', 'r2-mkt-2', 'r2-ops-1', 'r2-ops-3', 'r2-mkt-3', 'r2-hr-3', 'call:store_ops', 'call:regional', 'x2-overnight', 'x2-renovation', 'x2-discount'],
    C: ['r2-merch-4', 'r2-merch-2', 'r2-mkt-1', 'r2-ops-1', 'call:store_ops', 'call:regional', 'x2-deposit', 'x2-overnight'],
    D: ['x2-early'],
  },
};

export const SCORING = {
  speedBands: [[50, 5], [35, 4], [20, 3], [5, 2], [0, 1]] as [number, number][],
  river: { option: 'D' as OptionKey, S: 1, Q: 2, T: 2 },
  freeCalls: 2,
};

export const TRAP_REPLIES = {
  escalate: { who: 'CEO office', text: 'Thank you for flagging this. The CEO and Legal will review it. Do not sign anything today.', audio: 'call_trap_esc', cost: 15 },
  ask_time: { who: 'Velta Gems sales rep', text: 'Fine. Twenty-four hours. Not a minute more.', audio: 'call_trap_time', cost: 0 },
  sign: { who: 'Velta Gems sales rep', text: 'Excellent. The contract is on its way. Three years, all Classic lines.', audio: null, cost: 0 },
  decline: { who: 'Velta Gems sales rep', text: 'Your loss. Other brands are waiting.', audio: null, cost: 0 },
};

// ---------- Audio + subtitles ----------
// Every voice line has the exact words spoken, so subtitles always match the audio.
export interface VoiceLine { id: string; speaker: string; text: string }
export const VOICE: Record<string, VoiceLine> = {
  host_welcome: { id: 'host_welcome', speaker: 'Host', text: 'Welcome aboard, everyone. Grab your phone, scan the code, and find your table.' },
  host_rules: { id: 'host_rules', speaker: 'Host', text: 'Four rules before we hit the water. Evidence matters. Ask the right people, not everyone. Every report and every call costs time. And luck never changes your score.' },
  host_r1: { id: 'host_r1', speaker: 'Host', text: 'Round one. The VIP Preview. Our top client wants a private look at the new collection this Saturday. You have until two p.m. game time. Go!' },
  host_r2: { id: 'host_r2', speaker: 'Host', text: 'Round two. The Late Shipment. Only six hundred of one thousand units arrived. Decide where they go by twelve noon. Go!' },
  host_1min: { id: 'host_1min', speaker: 'Host', text: 'One minute left on the river. Time to seal your decision.' },
  host_first_seal: { id: 'host_first_seal', speaker: 'Host', text: 'The first table has sealed! Everyone else, the river is still moving.' },
  host_timeup: { id: 'host_timeup', speaker: 'Host', text: 'Time\'s up. Where a table did not decide, the river decided for you.' },
  host_reveal: { id: 'host_reveal', speaker: 'Host', text: 'All right. Let\'s see what the river says.' },
  host_champion: { id: 'host_champion', speaker: 'Host', text: 'And the best decision of the round goes to this table! Give them a big hand.' },
  host_end: { id: 'host_end', speaker: 'Host', text: 'That\'s the river for today. Now, let\'s talk about how you decided.' },
  news_r1: { id: 'news_r1', speaker: 'News', text: 'Breaking news. The courier has just confirmed: the HQ shipment is delayed to Sunday.' },
  news_r2: { id: 'news_r2', speaker: 'News', text: 'Breaking news. Supplier Velta Gems is calling every desk with an offer. Read it carefully.' },
  // phone calls (played on the caller's phone only)
  call_r1_assistant: { id: 'call_r1_assistant', speaker: "Mrs. Arora's assistant", text: "She wants to choose a necklace for her daughter's wedding next month, before anyone else sees the collection." },
  call_r1_store_mgr: { id: 'call_r1_store_mgr', speaker: 'Flagship store manager', text: 'Small previews work. Big ones leak photos. Twelve pieces is plenty for a buyer like her.' },
  call_r1_regional: { id: 'call_r1_regional', speaker: 'Regional Director', text: 'She is a friend of our CEO. Keep her happy, but do not break the launch.' },
  call_r1_broker: { id: 'call_r1_broker', speaker: 'Insurance broker', text: 'Your cap is two million dollars out of the vault. More cover needs forty-eight hours.' },
  call_r1_pr: { id: 'call_r1_pr', speaker: 'PR agency', text: 'Any leaked photo breaks our magazine deal.' },
  call_r2_regional: { id: 'call_r2_regional', speaker: 'Regional Director', text: 'I can approve the allocation. A supplier contract that size is not mine. Take it to the CEO.' },
  call_r2_store_ops: { id: 'call_r2_store_ops', speaker: 'Store operations lead', text: 'Small stores barely sell this line in December.' },
  call_r2_legal: { id: 'call_r2_legal', speaker: 'Legal', text: 'Never sign an exclusive deal in two hours.' },
  call_r2_supplier: { id: 'call_r2_supplier', speaker: 'Velta Gems sales rep', text: 'Other brands want this slot. Decide fast.' },
  call_r2_top_store: { id: 'call_r2_top_store', speaker: 'Top store manager', text: 'Give my store more. We always sell out.' },
  call_trap: { id: 'call_trap', speaker: 'Velta Gems sales rep', text: 'We can deliver the missing four hundred units in five days. You just sign a three-year exclusive contract for all Classic lines. Six and a half million dollars. I need your answer in two hours.' },
  call_small: { id: 'call_small', speaker: 'Store operations lead', text: 'Quick one. Can two small stores share one advisor in December? I need a yes or no today.' },
  call_small_esc: { id: 'call_small_esc', speaker: 'Regional Director', text: "That's your call. You don't need me for this." },
  call_trap_esc: { id: 'call_trap_esc', speaker: 'CEO office', text: 'Thank you for flagging this. The CEO and Legal will review it. Do not sign anything today.' },
  call_trap_time: { id: 'call_trap_time', speaker: 'Velta Gems sales rep', text: 'Fine. Twenty-four hours. Not a minute more.' },
  rules_1: { id: 'rules_1', speaker: 'Host', text: 'Here is how the river works. Each table is the leadership team of Sun and Luna, a fine jewelry brand.' },
  rules_2: { id: 'rules_2', speaker: 'Host', text: 'Each of you gets a role and your own cards. Nobody sees everything, so talk to each other.' },
  rules_3: { id: 'rules_3', speaker: 'Host', text: 'Some cards are sealed. Opening a report, or calling someone, costs game time. Choose what you really need.' },
  rules_4: { id: 'rules_4', speaker: 'Host', text: 'Pin the facts that matter to your team board. Then choose one option, up to two pieces of evidence, and how you will know it worked.' },
  rules_5: { id: 'rules_5', speaker: 'Host', text: 'Your leader seals the decision. Once it is sealed, there is no way back. And if time runs out, the river decides for you.' },
  rules_6: { id: 'rules_6', speaker: 'Host', text: "You score on speed, quality, and trust. Luck changes the story, never your score. Ready? Let's go!" },
  rules_market: { id: 'rules_market', speaker: 'Host', text: 'New in round two: the market. When it opens, tables can visit each other and trade information. Some of it is confirmed, some is just buzz. Your call. Keep at least half your table at home.' },
  market_open: { id: 'market_open', speaker: 'Host', text: 'The market is open! Ninety seconds. Visit, listen, trade. Keep half your table at home.' },
  market_close: { id: 'market_close', speaker: 'Host', text: 'Market closed! Back to your desks.' },
  river_rise: { id: 'river_rise', speaker: 'Host', text: 'The river is rising! Most tables have decided. Everyone else, you have two minutes.' },
};

// ---------- Round 2 market: one exclusive card per table (facts and unconfirmed buzz) ----------
export const MARKET: Record<string, { at: number; duration: number; giftCost: number; maxGifts: number }> = {
  r2: { at: 390, duration: 90, giftCost: 10, maxGifts: 3 },
};
const X = (id: string, kind: 'note' | 'buzz', title: string, text: string, tier: Card['tier']): Card =>
  ({ id, role: 'cos', kind, cost: 0, title, text, tier, exclusive: true, source: kind === 'buzz' ? 'word going around, not confirmed' : undefined });
export const EXCLUSIVES: Record<string, Card[]> = {
  r2: [
    X('x2-overnight', 'note', 'Warehouse capacity', 'The central warehouse can restock any top-5 store overnight.', 'key'),
    X('x2-ceo', 'buzz', 'CEO wish', 'Word is the CEO wants every store to get some stock this year.', 'rumor'),
    X('x2-deposit', 'note', 'VIP deposits', 'The flagship VIP pre-orders already have a 20% deposit paid.', 'key'),
    X('x2-discount', 'buzz', 'Competitor move', 'Word is a competitor will cut prices on a similar line in two weeks.', 'rumor'),
    X('x2-renovation', 'note', 'Store closures', 'Two small stores close for renovation from December 15.', 'key'),
    X('x2-early', 'buzz', 'Early delivery?', 'Word is the missing 400 units might arrive one week early.', 'rumor'),
    X('x2-penalty', 'note', 'Contract fine print', 'Velta Gems contracts carry a $1M penalty if we leave early.', 'context'),
    X('x2-mobile', 'note', 'Online pattern', 'Last campaign: 60% of online orders came from phones, mostly at night.', 'context'),
  ],
};

// ---------- How to play: voice + highlighted words on the big screen ----------
export const RULE_SLIDES: { voice: string; big: string; small: string; pebble: string }[] = [
  { voice: 'rules_1', big: 'Each table = one leadership team', small: 'Sun & Luna, a fine jewelry brand', pebble: 'wave' },
  { voice: 'rules_2', big: 'Nobody sees everything', small: 'You each get a role and your own cards. Talk.', pebble: 'think' },
  { voice: 'rules_3', big: 'Reports and calls cost time', small: 'Open only what you really need', pebble: 'phone' },
  { voice: 'rules_4', big: '1 option + 2 evidence + 1 measure', small: 'Pin facts to your team board first', pebble: 'point' },
  { voice: 'rules_5', big: 'Leader seals. No way back.', small: 'Out of time? The river decides for you.', pebble: 'stamp' },
  { voice: 'rules_6', big: 'Speed × Quality × Trust', small: 'Luck changes the story, never your score', pebble: 'cheer' },
];
export const MARKET_SLIDE = { voice: 'rules_market', big: 'Round 2: the market opens', small: 'Visit, trade, check the source. Keep half your table at home.', pebble: 'point' };

export const SFX = ['stamp', 'news', 'ring', 'open', 'pin', 'fanfare', 'tick', 'river', 'join', 'ambience'] as const;
export type SfxId = (typeof SFX)[number];

export function callVoiceId(roundId: string, stakeholderId: string) {
  return `call_${roundId}_${stakeholderId}`;
}

export const IRRITATED_PREFIX = 'Again? I am in the middle of something. ';
