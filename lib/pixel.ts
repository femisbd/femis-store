"use client";

// Browser side of Meta tracking. Does nothing until NEXT_PUBLIC_META_PIXEL_ID is set.
type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

export function track(event: string, params?: Record<string, unknown>, eventId?: string) {
  if (!PIXEL_ID || typeof window === "undefined" || !window.fbq) return;
  if (eventId) window.fbq("track", event, params ?? {}, { eventID: eventId });
  else window.fbq("track", event, params ?? {});
}

function cookie(name: string): string | undefined {
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

// Meta's browser and click ids, sent with the order so the server event can be matched to the ad.
export function attribution() {
  if (typeof window === "undefined") return {};
  let fbc = cookie("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  if (!fbc) {
    try {
      fbc = sessionStorage.getItem("femis-fbc") ?? undefined;
    } catch {}
  }
  return { fbp: cookie("_fbp"), fbc, url: window.location.href.split("?")[0] };
}

// Remember the ad click id for the visit, in case the visitor lands on one page and orders from another.
export function rememberClick() {
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) sessionStorage.setItem("femis-fbc", `fb.1.${Date.now()}.${fbclid}`);
  } catch {}
}
