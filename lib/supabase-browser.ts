"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client for the admin panel. Staff log in with email and password;
// the database security rules decide what each staff role can see and change.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase settings are missing (see .env.example)");
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "femis-admin" } });
  }
  return client;
}

export type Role = "owner" | "orders" | "packing";
export type Status = "pending" | "confirmed" | "packed" | "shipped" | "delivered" | "returned" | "cancelled";

export const STATUS_LABEL: Record<Status, string> = {
  pending: "New",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", orders: "Order staff", packing: "Packing" };

export const dhakaTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

// Calls one of the site's own server routes as the logged-in staff member.
export async function staffApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}`, ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(body && typeof body === "object" && ("results" in body || "sent" in body))) {
    throw new Error((body as { error?: string; reason?: string }).error ?? (body as { reason?: string }).reason ?? `Error ${res.status}`);
  }
  return body as T;
}

export type Integrations = {
  steadfast: { connected: boolean; balance?: number; error?: string };
  meta: { pixel: boolean; server: boolean; testMode: boolean };
};

export const COURIER_LABEL: Record<string, string> = {
  in_review: "Waiting for pickup", pending: "On the way", hold: "On hold",
  delivered_approval_pending: "Delivered (awaiting approval)", partial_delivered_approval_pending: "Partly delivered (awaiting approval)",
  cancelled_approval_pending: "Cancelled (awaiting approval)", unknown_approval_pending: "Unknown (awaiting approval)",
  delivered: "Delivered", partial_delivered: "Partly delivered", cancelled: "Cancelled, returning", unknown: "Unknown, contact Steadfast",
};
