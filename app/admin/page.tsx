"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Login } from "@/components/admin/Login";
import { OrderPanel } from "@/components/admin/OrderPanel";
import { OrdersView } from "@/components/admin/OrdersView";
import { PreordersView } from "@/components/admin/PreordersView";
import { ProductsView } from "@/components/admin/ProductsView";
import { ProfitView } from "@/components/admin/ProfitView";
import { SettingsView } from "@/components/admin/SettingsView";
import { ROLE_LABEL, staffApi, supabase, type Integrations, type Role } from "@/lib/supabase-browser";

type View = "orders" | "preorders" | "products" | "settings" | "profit";

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [view, setView] = useState<View>("orders");
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setRole(null);
      setRoleLoaded(false);
      return;
    }
    supabase()
      .rpc("my_role")
      .then(({ data }) => {
        setRole((data as Role | null) ?? null);
        setRoleLoaded(true);
        if (data) staffApi<Integrations>("/api/integrations").then(setIntegrations).catch(() => {});
      });
  }, [session]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const signOut = () => supabase().auth.signOut();

  if (checking) return <div className="adm-center muted">Loading…</div>;
  if (!session) return <Login />;
  if (!roleLoaded) return <div className="adm-center muted">Loading…</div>;
  if (!role)
    return (
      <div className="adm-center">
        <div className="adm-card" style={{ maxWidth: 420 }}>
          <h1 className="adm-h1">No staff access</h1>
          <p className="muted">This account ({session.user.email}) is not set up as FEMIS staff. Ask the owner to add you.</p>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );

  return (
    <>
      <header className="adm-top">
        <div className="adm-top-left">
          <Image src="/brand/femis-logo.png" alt="FEMIS" width={82} height={28} priority />
          <nav className="adm-tabs" aria-label="Admin">
            <button aria-pressed={view === "orders"} onClick={() => setView("orders")}>Orders</button>
            {role !== "packing" && <button aria-pressed={view === "preorders"} onClick={() => setView("preorders")}>Pre-orders</button>}
            {role === "owner" && <button aria-pressed={view === "products"} onClick={() => setView("products")}>Products</button>}
            {role === "owner" && <button aria-pressed={view === "profit"} onClick={() => setView("profit")}>Profit</button>}
            {role === "owner" && <button aria-pressed={view === "settings"} onClick={() => setView("settings")}>Settings</button>}
          </nav>
        </div>
        <div className="adm-top-right">
          <span className="muted small">{session.user.email} · {ROLE_LABEL[role]}</span>
          <button className="adm-btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="adm-main">
        {view === "orders" && <OrdersView role={role} onOpen={setOpenOrder} refreshKey={refreshKey} onChanged={refresh} steadfast={!!integrations?.steadfast.connected} />}
        {view === "preorders" && <PreordersView onOpen={setOpenOrder} refreshKey={refreshKey} />}
        {view === "products" && role === "owner" && <ProductsView />}
        {view === "profit" && role === "owner" && <ProfitView />}
        {view === "settings" && role === "owner" && <SettingsView integrations={integrations} />}
      </main>
      {openOrder && <OrderPanel orderNo={openOrder} role={role} onClose={() => setOpenOrder(null)} onChanged={refresh} integrations={integrations} />}
    </>
  );
}
