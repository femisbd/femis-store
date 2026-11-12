"use client";

import { taka } from "@/lib/config";
import { useSettings } from "./cart-context";

export function FreeDeliveryBar({ subtotal }: { subtotal: number }) {
  const config = useSettings();
  if (config.delivery.freeOver <= 0) return null;
  const left = Math.max(0, config.delivery.freeOver - subtotal);
  const pct = Math.min(100, Math.round((subtotal / config.delivery.freeOver) * 100));
  return (
    <div className="freebar">
      {left > 0 ? (
        <span>Free delivery over {taka(config.delivery.freeOver)}. Add <strong>{taka(left)}</strong> more.</span>
      ) : (
        <span><strong>You have free delivery.</strong></span>
      )}
      <div className="freebar-track" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
