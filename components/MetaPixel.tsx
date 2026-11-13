"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PIXEL_ID, rememberClick } from "@/lib/pixel";

// Loads the Meta Pixel on store pages (never in the admin) and sends a PageView on every page change.
export function MetaPixel() {
  const pathname = usePathname();
  const loaded = useRef(false);
  const isAdmin = pathname?.startsWith("/admin");

  useEffect(() => {
    if (!PIXEL_ID || isAdmin) return;
    rememberClick();
    if (!loaded.current) {
      loaded.current = true;
      if (!window.fbq) {
        const q = function (...args: unknown[]) {
          const f = q as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
          if (f.callMethod) f.callMethod(...args);
          else f.queue.push(args);
        } as unknown as NonNullable<Window["fbq"]>;
        q.push = q;
        q.loaded = true;
        q.version = "2.0";
        q.queue = [];
        window.fbq = q;
        window._fbq = q;
        const s = document.createElement("script");
        s.async = true;
        s.src = "https://connect.facebook.net/en_US/fbevents.js";
        document.head.appendChild(s);
        window.fbq("init", PIXEL_ID);
      }
    }
    window.fbq?.("track", "PageView");
  }, [pathname, isAdmin]);

  return null;
}
