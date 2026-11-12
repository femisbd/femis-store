import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

// Called by the admin panel after the owner saves a product, so the store shows the change at once.
// Only a logged-in owner may trigger it: the token is checked with the database.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !key || !token) return NextResponse.json({ ok: false }, { status: 401 });

  const res = await fetch(`${url}/rest/v1/rpc/my_role`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const role = res.ok ? await res.json() : null;
  if (role !== "owner") return NextResponse.json({ ok: false }, { status: 403 });

  revalidateTag("catalog", { expire: 0 });
  return NextResponse.json({ ok: true });
}
