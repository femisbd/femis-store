"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { refreshStore } from "./ProductsView";

type Form = {
  delivery_inside: string; delivery_outside: string; free_delivery_over: string;
  addon_enabled: boolean; addon_name: string; addon_note: string; addon_price: string;
  bkash_number: string; whatsapp_number: string; facebook_url: string; instagram_url: string;
  exchange_line: string; policy_text: string;
  courier_cost_inside: string; courier_cost_outside: string; addon_cost: string;
};
const NUMS = ["delivery_inside", "delivery_outside", "free_delivery_over", "addon_price", "courier_cost_inside", "courier_cost_outside", "addon_cost"] as const;
const isMobile = (v: string) => v === "" || /^01[3-9]\d{8}$/.test(v);
const isUrl = (v: string) => v === "" || /^https:\/\/\S+$/.test(v);

export function SettingsView() {
  const [f, setF] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase().from("settings").select("*").eq("id", 1).single().then(({ data }) => {
      if (!data) return setMsg("Could not load settings.");
      const d = data as Record<string, unknown>;
      setF({
        delivery_inside: String(d.delivery_inside), delivery_outside: String(d.delivery_outside), free_delivery_over: String(d.free_delivery_over),
        addon_enabled: d.addon_enabled !== false, addon_name: String(d.addon_name ?? ""), addon_note: String(d.addon_note ?? ""), addon_price: String(d.addon_price),
        bkash_number: String(d.bkash_number ?? ""), whatsapp_number: String(d.whatsapp_number ?? ""), facebook_url: String(d.facebook_url ?? ""),
        instagram_url: String(d.instagram_url ?? ""), exchange_line: String(d.exchange_line ?? ""), policy_text: String(d.policy_text ?? ""),
        courier_cost_inside: String(d.courier_cost_inside ?? 0), courier_cost_outside: String(d.courier_cost_outside ?? 0), addon_cost: String(d.addon_cost ?? 0),
      });
    });
  }, []);

  if (!f) return <p className="adm-empty muted">{msg || "Loading…"}</p>;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const digits = (k: (typeof NUMS)[number] | "bkash_number" | "whatsapp_number") => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value.replace(/[^\d]/g, ""));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f) return;
    const e: Record<string, string> = {};
    for (const k of NUMS) if (f[k] === "" || !Number.isInteger(Number(f[k]))) e[k] = "Enter a whole number in taka.";
    if (!isMobile(f.bkash_number)) e.bkash_number = "Enter an 11-digit number starting with 01, or leave it empty.";
    if (!isMobile(f.whatsapp_number)) e.whatsapp_number = "Enter an 11-digit number starting with 01, or leave it empty.";
    if (!isUrl(f.facebook_url.trim())) e.facebook_url = "Paste the full link, starting with https://";
    if (!isUrl(f.instagram_url.trim())) e.instagram_url = "Paste the full link, starting with https://";
    if (f.addon_enabled && f.addon_name.trim().length < 2) e.addon_name = "Enter the add-on name.";
    setErrors(e);
    setMsg("");
    if (Object.keys(e).length) return;
    setSaving(true);
    const { error } = await supabase().from("settings").update({
      delivery_inside: Number(f.delivery_inside), delivery_outside: Number(f.delivery_outside), free_delivery_over: Number(f.free_delivery_over),
      addon_enabled: f.addon_enabled, addon_name: f.addon_name.trim() || "Add-on", addon_note: f.addon_note.trim(), addon_price: Number(f.addon_price),
      bkash_number: f.bkash_number, whatsapp_number: f.whatsapp_number, facebook_url: f.facebook_url.trim(), instagram_url: f.instagram_url.trim(),
      exchange_line: f.exchange_line.trim(), policy_text: f.policy_text.trim(),
      courier_cost_inside: Number(f.courier_cost_inside), courier_cost_outside: Number(f.courier_cost_outside), addon_cost: Number(f.addon_cost),
    }).eq("id", 1).select("id").single();
    setSaving(false);
    if (error) return setErrors({ form: error.message });
    await refreshStore();
    setMsg("Settings saved. The website is updated.");
  }

  const hasPreorderAdvanceWarning = f.bkash_number === "";

  return (
    <form className="adm-settings" onSubmit={save} noValidate>
      <div className="adm-toolbar"><h1 className="adm-h1" style={{ margin: 0 }}>Settings</h1></div>

      <section className="adm-card">
        <h2 className="adm-h2">Delivery</h2>
        <div className="adm-grid2">
          <F id="s-in" label="Inside Dhaka city (৳)" error={errors.delivery_inside}><input id="s-in" className="input" inputMode="numeric" value={f.delivery_inside} onChange={digits("delivery_inside")} /></F>
          <F id="s-out" label="Outside Dhaka city (৳)" error={errors.delivery_outside}><input id="s-out" className="input" inputMode="numeric" value={f.delivery_outside} onChange={digits("delivery_outside")} /></F>
        </div>
        <F id="s-free" label="Free delivery on orders over (৳)" hint="Enter 0 to switch free delivery off" error={errors.free_delivery_over}><input id="s-free" className="input" inputMode="numeric" value={f.free_delivery_over} onChange={digits("free_delivery_over")} /></F>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">Checkout add-on</h2>
        <label className="adm-check"><input type="checkbox" checked={f.addon_enabled} onChange={(e) => set("addon_enabled", e.target.checked)} />Offer an add-on at checkout</label>
        {f.addon_enabled && (
          <>
            <div className="adm-grid2">
              <F id="s-an" label="Add-on name" hint="For example: Gift box" error={errors.addon_name}><input id="s-an" className="input" value={f.addon_name} onChange={(e) => set("addon_name", e.target.value)} /></F>
              <F id="s-ap" label="Price (৳)" error={errors.addon_price}><input id="s-ap" className="input" inputMode="numeric" value={f.addon_price} onChange={digits("addon_price")} /></F>
            </div>
            <F id="s-anote" label="Short line under the name"><input id="s-anote" className="input" value={f.addon_note} onChange={(e) => set("addon_note", e.target.value)} /></F>
          </>
        )}
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">Payment and contact</h2>
        <div className="adm-grid2">
          <F id="s-bk" label="bKash number for pre-order advances" hint="Shown at checkout when an advance is due" error={errors.bkash_number}><input id="s-bk" className="input" inputMode="numeric" placeholder="01XXXXXXXXX" value={f.bkash_number} onChange={digits("bkash_number")} /></F>
          <F id="s-wa" label="WhatsApp number" hint="Used by the Order on WhatsApp buttons" error={errors.whatsapp_number}><input id="s-wa" className="input" inputMode="numeric" placeholder="01XXXXXXXXX" value={f.whatsapp_number} onChange={digits("whatsapp_number")} /></F>
        </div>
        {hasPreorderAdvanceWarning && <p className="adm-warn">No bKash number is set. Customers ordering a pre-order piece with an advance won't know where to send it.</p>}
        <div className="adm-grid2">
          <F id="s-fb" label="Facebook page link" error={errors.facebook_url}><input id="s-fb" className="input" placeholder="https://facebook.com/…" value={f.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} /></F>
          <F id="s-ig" label="Instagram page link" error={errors.instagram_url}><input id="s-ig" className="input" placeholder="https://instagram.com/…" value={f.instagram_url} onChange={(e) => set("instagram_url", e.target.value)} /></F>
        </div>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">Exchange and refund</h2>
        <F id="s-ex" label="One-line promise" hint="Shown next to the order button, for example: 3-day easy exchange if the product has a problem"><input id="s-ex" className="input" maxLength={120} value={f.exchange_line} onChange={(e) => set("exchange_line", e.target.value)} /></F>
        <F id="s-pol" label="Full policy" hint="Shown on the policy page. Press Enter for a new line."><textarea id="s-pol" className="input" rows={10} value={f.policy_text} onChange={(e) => set("policy_text", e.target.value)} /></F>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">Costs (for the profit report, only you can see this)</h2>
        <div className="adm-grid2">
          <F id="s-cin" label="Courier charges you, inside Dhaka (৳)" error={errors.courier_cost_inside}><input id="s-cin" className="input" inputMode="numeric" value={f.courier_cost_inside} onChange={digits("courier_cost_inside")} /></F>
          <F id="s-cout" label="Courier charges you, outside Dhaka (৳)" error={errors.courier_cost_outside}><input id="s-cout" className="input" inputMode="numeric" value={f.courier_cost_outside} onChange={digits("courier_cost_outside")} /></F>
        </div>
        <F id="s-acost" label="What the add-on costs you (৳)" error={errors.addon_cost}><input id="s-acost" className="input" inputMode="numeric" value={f.addon_cost} onChange={digits("addon_cost")} /></F>
        <span className="muted small">These apply to new orders. Past orders keep the costs they were placed with.</span>
      </section>

      {errors.form && <p className="notice" role="alert">{errors.form}</p>}
      {Object.keys(errors).some((k) => k !== "form") && <p className="err" role="alert">Please fix the fields marked above.</p>}
      {msg && <p className="adm-ok" role="status">{msg}</p>}
      <div><button className="adm-btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}

function F({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="muted small">{hint}</span>}
      {error && <span className="err" role="alert">{error}</span>}
    </div>
  );
}
