// Public client config. The publishable key is meant to live in the browser (Supabase "publishable" key).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ndnwpyswobejutuzulrk.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_zF6A_HZCB8r6Ac9fxGcd8Q_YS8zNsUw';
export const ADMIN_EMAILS = ['phakphoom1985@gmail.com'];
/** Local mode (BroadcastChannel, one browser) for demos and automated tests: add ?net=local to any URL. */
export function wantsLocal(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('net');
    if (q === 'local') sessionStorage.setItem('wwd:net', 'local');
    if (q === 'online') sessionStorage.removeItem('wwd:net');
    return sessionStorage.getItem('wwd:net') === 'local';
  } catch { return false; }
}
