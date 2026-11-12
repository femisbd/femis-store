// Minimal Supabase client for calling the database functions (no extra package needed).
// The URL and publishable key are public by design: the database security rules
// only let visitors read the catalogue and call place_order / track_order.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(URL && KEY);

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!URL || !KEY) throw new Error("Supabase is not configured");
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${fn} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
