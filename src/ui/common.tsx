'use client';
import { ROLE_NAMES, ROLE_COLORS, type RoleId } from '../game/pack';

export const TABLE_NAMES = ['The Otters', 'Blue Rapids', 'Riverstone', 'Night Facet', 'Gold Current', 'Clearwater', 'Moon Delta', 'Crystal Falls'];
export const TABLE_COLORS = ['#FFD36B', '#5FD4FF', '#7FE0AE', '#CDB2FF', '#FFB877', '#EAF0FF', '#FF8FA3', '#9AE6E0'];
export const tableName = (n: number) => `Table ${n} · ${TABLE_NAMES[(n - 1) % TABLE_NAMES.length]}`;
export const tableColor = (n: number) => TABLE_COLORS[(n - 1) % TABLE_COLORS.length];

export const GEM: Record<string, string> = { note: '/img/gem_sapphire.webp', report: '/img/gem_sapphire.webp', rumor: '/img/gem_amber.webp', buzz: '/img/gem_amber.webp', call: '/img/gem_emerald.webp', offer: '/img/gem_amber.webp' };

export function RoleTag({ role }: { role: RoleId }) {
  const c = ROLE_COLORS[role];
  return <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 10, background: `${c}22`, color: c, whiteSpace: 'nowrap' }}>{ROLE_NAMES[role]}</span>;
}

export function makeRoomCode() {
  const words = ['RIVER', 'RAPID', 'DELTA', 'OTTER', 'CREEK', 'FALLS'];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(10 + Math.random() * 89)}`;
}
export const makePin = () => String(Math.floor(1000 + Math.random() * 9000));
