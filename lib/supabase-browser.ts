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
