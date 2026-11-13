"use client";

// Calls the two public database functions straight from the browser (no server function needed):
// check_coupon and save_checkout_draft. The database decides what is allowed.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function publicRpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  if (!URL || !KEY) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      keepalive: true,
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
