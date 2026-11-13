// Minimal Supabase client for server routes (no extra package needed).
// The URL and publishable key are public by design. Visitors can only read the catalogue and call
// place_order / track_order. Staff actions pass the staff member's own login token, so the
// database security rules apply to them exactly as in the admin panel.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(URL && KEY);

function headers(token?: string) {
  return { apikey: KEY!, Authorization: `Bearer ${token ?? KEY}`, "Content-Type": "application/json" };
}

export async function rpc<T>(fn: string, args: Record<string, unknown>, token?: string): Promise<T> {
  if (!URL || !KEY) throw new Error("Supabase is not configured");
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: headers(token), body: JSON.stringify(args), cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${fn} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function select<T>(path: string, token?: string): Promise<T> {
  if (!URL || !KEY) throw new Error("Supabase is not configured");
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: headers(token), cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export type StaffRole = "owner" | "orders" | "packing";

// Reads the staff login token sent by the admin panel and checks the role with the database.
export async function staffFromRequest(request: Request): Promise<{ token: string; role: StaffRole } | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !URL || !KEY) return null;
  try {
    const role = await rpc<StaffRole | null>("my_role", {}, token);
    return role ? { token, role } : null;
  } catch {
    return null;
  }
}
