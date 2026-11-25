"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { HUBS } from "@/lib/geo";
import { fmtDate, fmtShortDate, fmtTZS, fmtTZSShort, today } from "@/lib/format";
import { isActive, lastMonths, monthKey, onTime } from "@/lib/derive";
import type { Customer, Shipment } from "@/lib/types";
import { Avatar, ConfirmDialog, Drawer, EmptyState, Field, Modal, PageHeader, RowMenu, SearchInput, StatusBadge, TableSkeleton } from "@/components/ui";
import { BarChart, CHART } from "@/components/charts";

const INDUSTRIES = ["FMCG distribution", "Construction materials", "Food processing", "Agriculture export", "Agriculture inputs", "Agriculture", "Manufacturing", "Energy", "Horticulture", "Healthcare", "Mining", "Retail", "Other"];
const PHONE = /^\+255 ?\d{2,3} ?\d{3} ?\d{3,4}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function CustomerForm({ open, onClose, customer }: { open: boolean; onClose: () => void; customer: Customer | null }) {
  const { data, saveCustomer } = useStore();
  const toast = useToast();
  const empty = { company: "", industry: "FMCG distribution", contact: "", phone: "", email: "", city: "Dar es Salaam", address: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(customer ? { company: customer.company, industry: customer.industry, contact: customer.contact, phone: customer.phone, email: customer.email, city: customer.city, address: customer.address } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer]);

  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErr((e) => ({ ...e, [k]: "" }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (f.company.trim().length < 3) e.company = "Enter the registered company name.";
    else if (data.customers.some((c) => c.company.toLowerCase() === f.company.trim().toLowerCase() && c.id !== customer?.id)) e.company = "This company is already a customer.";
    if (f.contact.trim().split(/\s+/).length < 2) e.contact = "Enter the contact person's full name.";
    if (!PHONE.test(f.phone.trim())) e.phone = "Enter a Tanzanian number, for example +255 754 318 902.";
    if (!EMAIL.test(f.email.trim())) e.email = "Enter a valid email address.";
    if (f.address.trim().length < 4) e.address = "Enter a street or area for collections.";
    setErr(e);
    if (Object.keys(e).length) return;
    const saved = saveCustomer({
      id: customer?.id,
      company: f.company.trim(),
      industry: f.industry,
      contact: f.contact.trim(),
      phone: f.phone.trim(),
      email: f.email.trim().toLowerCase(),
      city: f.city,
      address: f.address.trim(),
      since: customer?.since ?? today(),
    });
    toast.success(customer ? `${saved.company} updated` : `${saved.company} registered`, customer ? undefined : "You can now book shipments for this customer.");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? `Edit ${customer.company}` : "Register customer"}
      subtitle={customer ? undefined : "Add a shipper so you can book consignments for them."}
      width={620}
      footer={
        <>
          <button className="gt-btn gt-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="gt-btn gt-btn--primary" onClick={save}>
            {customer ? "Save changes" : "Register customer"}
          </button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <Field label="Company name" required error={err.company} className="sm:col-span-2">
          <input className="gt-input" value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="Kariakoo Wholesale Traders" />
        </Field>
        <Field label="Industry">
          <select className="gt-input" value={f.industry} onChange={(e) => set("industry", e.target.value)}>
            {INDUSTRIES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </Field>
        <Field label="Contact person" required error={err.contact}>
          <input className="gt-input" value={f.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Halima Msuya" />
        </Field>
        <Field label="Phone" required error={err.phone}>
          <input className="gt-input gt-num" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+255 754 318 902" />
        </Field>
        <Field label="Email" required error={err.email}>
          <input className="gt-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="logistics@company.co.tz" />
        </Field>
        <Field label="City">
          <select className="gt-input" value={f.city} onChange={(e) => set("city", e.target.value)}>
            {HUBS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Address" required error={err.address}>
          <input className="gt-input" value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Msimbazi Street, Kariakoo" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function CustomerProfile({ customer, shipments, onClose, onEdit }: { customer: Customer; shipments: Shipment[]; onClose: () => void; onEdit: () => void }) {
  const months = lastMonths(6);
  const billed = shipments.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + s.chargeTZS, 0);
  const delivered = shipments.filter((s) => s.status === "Delivered");
  const ontime = delivered.length ? Math.round((delivered.filter(onTime).length / delivered.length) * 100) : null;
  const sorted = [...shipments].sort((a, b) => b.departureDate.localeCompare(a.departureDate));
  const lanes = new Map<string, number>();
  shipments.forEach((s) => lanes.set(`${s.origin} → ${s.destination}`, (lanes.get(`${s.origin} → ${s.destination}`) ?? 0) + 1));
  const topLane = [...lanes.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <Drawer
      open
      onClose={onClose}
      title={customer.company}
      subtitle={`${customer.industry}, customer since ${fmtDate(customer.since)}`}
      footer={
        <>
          <a className="gt-btn gt-btn--secondary mr-auto" href={`mailto:${customer.email}`}>
            <Mail className="gt-icon" /> Email contact
          </a>
          <button className="gt-btn gt-btn--primary" onClick={onEdit}>
            <Pencil className="gt-icon" /> Edit customer
          </button>
        </>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Shipments", String(shipments.length)],
          ["On the road", String(shipments.filter(isActive).length)],
          ["Total billed", fmtTZSShort(billed)],
          ["On-time", ontime === null ? "No data" : `${ontime}%`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-surface-2 px-3 py-3">
            <div className="text-xs text-ink-muted">{k}</div>
            <div className="gt-num text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <h3 className="section-title mb-3">Contact</h3>
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={customer.contact} size={44} />
        <div className="grid gap-0.5 text-[13px]">
          <span className="font-semibold">{customer.contact}</span>
          <span className="flex items-center gap-2"><Phone size={13} className="text-ink-muted" /><span className="gt-num">{customer.phone}</span></span>
          <span className="flex items-center gap-2"><Mail size={13} className="text-ink-muted" />{customer.email}</span>
          <span className="flex items-center gap-2"><MapPin size={13} className="text-ink-muted" />{customer.address}, {customer.city}</span>
        </div>
      </div>

      <h3 className="section-title mb-3">Shipments per month</h3>
      <BarChart labels={months.map((k) => fmtShortDate(`${k}-01`).split(" ")[1])} series={[{ key: "n", label: "Shipments", color: CHART.brand, values: months.map((k) => shipments.filter((s) => monthKey(s.departureDate) === k).length) }]} height={160} />
      {topLane && (
        <p className="mt-2 text-[13px] text-ink-muted">
          Busiest lane: <span className="font-semibold text-ink">{topLane[0]}</span>, {topLane[1]} shipments.
        </p>
      )}

      <h3 className="section-title mb-3 mt-8">Shipment history</h3>
      {sorted.length === 0 ? (
        <p className="text-ink-muted">No shipments yet. Book the first one from Shipments.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--line)] rounded-md border border-line">
          {sorted.slice(0, 15).map((s) => (
            <li key={s.id}>
              <Link href={`/shipments?open=${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="gt-id">{s.id}</span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {s.origin} → {s.destination}, {fmtShortDate(s.departureDate)}, {fmtTZS(s.chargeTZS)}
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > 15 && (
        <Link href={`/shipments?q=${encodeURIComponent(customer.company)}`} className="mt-3 inline-block text-[13px] font-semibold text-brand-text hover:underline">
          See all {sorted.length} shipments
        </Link>
      )}
    </Drawer>
  );
}

function CustomersInner() {
  const { data, ready, deleteCustomer } = useStore();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"billed" | "shipments" | "name" | "recent">("billed");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [deleting, setDeleting] = useState<Customer | null>(null);

  useEffect(() => {
    const o = params.get("open");
    if (o) setOpenId(o);
  }, [params]);

  const byCustomer = useMemo(() => {
    const m = new Map<string, Shipment[]>();
    data.shipments.forEach((s) => m.set(s.customerId, [...(m.get(s.customerId) ?? []), s]));
    return m;
  }, [data.shipments]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = data.customers
      .filter((c) => !t || [c.company, c.contact, c.email, c.phone, c.city, c.industry].some((x) => x.toLowerCase().includes(t)))
      .map((c) => {
        const ss = byCustomer.get(c.id) ?? [];
        return {
          c,
          count: ss.length,
          active: ss.filter(isActive).length,
          billed: ss.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + s.chargeTZS, 0),
          last: ss.reduce((m, s) => (s.departureDate > m ? s.departureDate : m), ""),
        };
      });
    const cmp = {
      billed: (a: (typeof list)[0], b: (typeof list)[0]) => b.billed - a.billed,
      shipments: (a: (typeof list)[0], b: (typeof list)[0]) => b.count - a.count,
      name: (a: (typeof list)[0], b: (typeof list)[0]) => a.c.company.localeCompare(b.c.company),
      recent: (a: (typeof list)[0], b: (typeof list)[0]) => b.last.localeCompare(a.last),
    }[sort];
    return list.sort(cmp);
  }, [data.customers, byCustomer, q, sort]);

  const open = data.customers.find((c) => c.id === openId);

  return (
    <>
      <PageHeader
        title="Customers"
        description="The shippers Globe Trans moves cargo for, with their history and account value."
        actions={
          <button className="gt-btn gt-btn--primary" onClick={() => setFormOpen(true)}>
            <Plus className="gt-icon" /> Register customer
          </button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search by company, contact, email or city" className="w-full lg:max-w-[440px]" />
        <label className="flex items-center gap-2 text-[13px] text-ink-muted lg:ml-auto">
          Sort by
          <select className="gt-input h-9 w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="billed">Total billed</option>
            <option value="shipments">Number of shipments</option>
            <option value="recent">Most recent shipment</option>
            <option value="name">Company name</option>
          </select>
        </label>
      </div>

      {!ready ? (
        <TableSkeleton />
      ) : (
        <div className="gt-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={q ? `No customers match “${q.trim()}”` : "No customers yet"}
              text={q ? "Check the spelling or register them as a new customer." : "Register a customer to start booking shipments."}
              action={
                <button className="gt-btn gt-btn--primary gt-btn--sm" onClick={() => setFormOpen(true)}>
                  Register customer
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Email</th>
                    <th>City</th>
                    <th className="gt-r">Shipments</th>
                    <th className="gt-r">Total billed</th>
                    <th>Last shipment</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ c, count, active, billed, last }) => (
                    <tr key={c.id} className="is-clickable" onClick={() => setOpenId(c.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(c.id)} aria-selected={openId === c.id}>
                      <td>
                        <span className="block font-semibold">{c.company}</span>
                        <span className="gt-sub">{c.industry}</span>
                      </td>
                      <td>
                        {c.contact}
                        <span className="gt-sub gt-num">{c.phone}</span>
                      </td>
                      <td className="text-ink-muted">{c.email}</td>
                      <td>{c.city}</td>
                      <td className="gt-r">
                        {count}
                        {active > 0 && <span className="gt-sub">{active} on the road</span>}
                      </td>
                      <td className="gt-r">{fmtTZSShort(billed)}</td>
                      <td className="gt-num">{last ? fmtShortDate(last) : <span className="text-ink-muted">None</span>}</td>
                      <td className="w-10 pr-2">
                        <RowMenu
                          label={`Actions for ${c.company}`}
                          items={[
                            { label: "View history", icon: Building2, onClick: () => setOpenId(c.id) },
                            { label: "Edit customer", icon: Pencil, onClick: () => setEditing(c) },
                            {
                              label: "Delete customer",
                              icon: Trash2,
                              danger: true,
                              onClick: () => (count > 0 ? toast.error(`${c.company} has ${count} shipments on record`, "Customers with shipment history are kept for invoicing.") : setDeleting(c)),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CustomerForm open={formOpen || !!editing} customer={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
      {open && (
        <CustomerProfile
          customer={open}
          shipments={byCustomer.get(open.id) ?? []}
          onClose={() => {
            setOpenId(null);
            if (params.get("open")) router.replace("/customers", { scroll: false });
          }}
          onEdit={() => {
            setOpenId(null);
            setEditing(open);
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.company}?`}
        text="The customer record and contact details are removed. This cannot be undone."
        confirmLabel="Delete customer"
        onConfirm={() => {
          if (!deleting) return;
          deleteCustomer(deleting.id);
          toast.success(`${deleting.company} deleted`);
        }}
      />
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CustomersInner />
    </Suspense>
  );
}
