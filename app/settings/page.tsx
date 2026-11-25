"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import type { Settings } from "@/lib/types";
import { Avatar, ConfirmDialog, Field, PageHeader, PageSkeleton, Switch } from "@/components/ui";

type Tab = "company" | "user" | "notifications";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const NOTIFS: { key: keyof Settings["notifications"]; title: string; text: string }[] = [
  { key: "delays", title: "Delays", text: "When a shipment is marked Delayed, or passes its expected delivery date." },
  { key: "deliveries", title: "Deliveries", text: "When a consignee signs for a shipment." },
  { key: "maintenance", title: "Maintenance", text: "When a vehicle is within 1,000 km of its next service." },
  { key: "newShipments", title: "New bookings", text: "When anyone on the team creates a shipment." },
  { key: "dailySummary", title: "Daily summary", text: "A 07:00 email with yesterday's deliveries and today's departures." },
  { key: "sms", title: "SMS alerts", text: "Send delay alerts to your mobile as well as by email." },
];

function SettingsInner() {
  const { data, ready, updateSettings, resetDemo } = useStore();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const tab = ((params.get("tab") as Tab) ?? "company") as Tab;
  const [s, setS] = useState<Settings>(data.settings);
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (ready) setS(data.settings);
  }, [ready, data.settings]);

  if (!ready) return <PageSkeleton />;

  const dirty = JSON.stringify(s) !== JSON.stringify(data.settings);
  const setTab = (t: Tab) => router.replace(`/settings?tab=${t}`, { scroll: false });

  const save = () => {
    const e: Record<string, string> = {};
    if (tab === "company") {
      if (s.company.name.trim().length < 3) e.cname = "Enter the company name.";
      if (!/^\d{3}-\d{3}-\d{3}$/.test(s.company.tin)) e.tin = "TIN uses the format 112-457-893.";
      if (!EMAIL.test(s.company.email)) e.cemail = "Enter a valid email address.";
    }
    if (tab === "user") {
      if (s.user.name.trim().split(/\s+/).length < 2) e.uname = "Enter your first and last name.";
      if (!EMAIL.test(s.user.email)) e.uemail = "Enter a valid email address.";
    }
    setErr(e);
    if (Object.keys(e).length) return;
    updateSettings(s);
    toast.success(tab === "company" ? "Company profile saved" : tab === "user" ? "Your profile saved" : "Notification preferences saved");
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
      {dirty && <span className="mr-auto text-[13px] text-ink-muted">You have unsaved changes.</span>}
      <button className="gt-btn gt-btn--secondary" onClick={() => { setS(data.settings); setErr({}); }} disabled={!dirty}>
        Discard
      </button>
      <button className="gt-btn gt-btn--primary" onClick={save} disabled={!dirty}>
        Save changes
      </button>
    </div>
  );

  return (
    <>
      <PageHeader title="Settings" description="Company details, your profile and how Globe Trans keeps you informed." />
      <div className="mb-6 border-b border-line" role="tablist" aria-label="Settings sections">
        {(
          [
            ["company", "Company profile"],
            ["user", "Your profile"],
            ["notifications", "Notifications"],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} className="gt-tab" onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="gt-card xl:col-span-2">
          {tab === "company" && (
            <>
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <Field label="Company name" required error={err.cname} className="sm:col-span-2">
                  <input className="gt-input" value={s.company.name} onChange={(e) => setS({ ...s, company: { ...s.company, name: e.target.value } })} />
                </Field>
                <Field label="TIN" required error={err.tin}>
                  <input className="gt-input gt-num" value={s.company.tin} onChange={(e) => setS({ ...s, company: { ...s.company, tin: e.target.value } })} />
                </Field>
                <Field label="Currency" help="All amounts are shown in Tanzanian shillings.">
                  <select className="gt-input" value={s.company.currency} onChange={(e) => setS({ ...s, company: { ...s.company, currency: e.target.value } })}>
                    <option value="TZS">TZS, Tanzanian shilling</option>
                  </select>
                </Field>
                <Field label="Head office address" className="sm:col-span-2">
                  <input className="gt-input" value={s.company.address} onChange={(e) => setS({ ...s, company: { ...s.company, address: e.target.value } })} />
                </Field>
                <Field label="Phone">
                  <input className="gt-input gt-num" value={s.company.phone} onChange={(e) => setS({ ...s, company: { ...s.company, phone: e.target.value } })} />
                </Field>
                <Field label="Operations email" required error={err.cemail}>
                  <input className="gt-input" type="email" value={s.company.email} onChange={(e) => setS({ ...s, company: { ...s.company, email: e.target.value } })} />
                </Field>
              </div>
              {footer}
            </>
          )}
          {tab === "user" && (
            <>
              <div className="flex items-center gap-4 px-6 pt-6">
                <Avatar name={s.user.name || "User"} size={56} />
                <div>
                  <p className="font-semibold">{s.user.name}</p>
                  <p className="text-[13px] text-ink-muted">{s.user.role}</p>
                </div>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-2">
                <Field label="Full name" required error={err.uname}>
                  <input className="gt-input" value={s.user.name} onChange={(e) => setS({ ...s, user: { ...s.user, name: e.target.value } })} />
                </Field>
                <Field label="Role">
                  <select className="gt-input" value={s.user.role} onChange={(e) => setS({ ...s, user: { ...s.user, role: e.target.value } })}>
                    {["Operations manager", "Dispatcher", "Fleet manager", "Finance officer", "Managing director"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Email" required error={err.uemail}>
                  <input className="gt-input" type="email" value={s.user.email} onChange={(e) => setS({ ...s, user: { ...s.user, email: e.target.value } })} />
                </Field>
                <Field label="Mobile">
                  <input className="gt-input gt-num" value={s.user.phone} onChange={(e) => setS({ ...s, user: { ...s.user, phone: e.target.value } })} />
                </Field>
              </div>
              {footer}
            </>
          )}
          {tab === "notifications" && (
            <>
              <ul>
                {NOTIFS.map((n) => (
                  <li key={n.key} className="flex items-center justify-between gap-6 border-b border-line px-6 py-4 last:border-0">
                    <div>
                      <p className="font-semibold">{n.title}</p>
                      <p className="text-[13px] text-ink-muted">{n.text}</p>
                    </div>
                    <Switch label={n.title} checked={s.notifications[n.key]} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, [n.key]: v } })} />
                  </li>
                ))}
              </ul>
              {footer}
            </>
          )}
        </section>

        <aside className="gt-card h-fit p-6">
          <h2 className="section-title mb-1">Demo data</h2>
          <p className="mb-4 text-[13px] text-ink-muted">
            This prototype keeps its records in your browser. Reset to restore the original sample shipments, fleet, drivers and customers before a presentation.
          </p>
          <button className="gt-btn gt-btn--secondary w-full" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="gt-icon" /> Reset demo data
          </button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        text="All shipments, vehicles, drivers, customers and settings you changed are replaced with the original sample data."
        confirmLabel="Reset demo data"
        onConfirm={() => {
          resetDemo();
          toast.success("Demo data reset", "The original sample records are back.");
        }}
      />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsInner />
    </Suspense>
  );
}
