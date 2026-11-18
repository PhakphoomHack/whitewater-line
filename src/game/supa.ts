'use client';
// Lazy Supabase client for admin sign-in (email link) and token checks on the big screen.
import { SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAILS } from './config';
let client: any = null;
export async function supa() {
  if (!client) { const { createClient } = await import('@supabase/supabase-js'); client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } }); }
  return client;
}
export const isAdminEmail = (e?: string | null) => !!e && ADMIN_EMAILS.includes(e.toLowerCase());
const verified = new Map<string, number>(); // token -> expiry ms
/** Big screen: is this access token a signed-in admin? */
export async function verifyAdminToken(token: string): Promise<boolean> {
  const exp = verified.get(token); if (exp && exp > Date.now()) return true;
  try {
    const sb = await supa(); const { data, error } = await sb.auth.getUser(token);
    if (error || !isAdminEmail(data?.user?.email)) return false;
    verified.set(token, Date.now() + 10 * 60 * 1000); return true;
  } catch { return false; }
}
