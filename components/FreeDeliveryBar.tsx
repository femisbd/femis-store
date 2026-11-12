import { config, taka } from "@/lib/config";

export function FreeDeliveryBar({ subtotal }: { subtotal: number }) {
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
