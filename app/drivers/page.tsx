"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IdCard, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useLookups, useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { HUBS, planRoute } from "@/lib/geo";
import { addDays, daysBetween, fmtDate, fmtNum, fmtShortDate, today } from "@/lib/format";
import { isActive, onTime, progressOf } from "@/lib/derive";
import { DRIVER_AVAILABILITY, type Driver, type DriverAvailability } from "@/lib/types";
import { Avatar, AvailabilityBadge, Chips, ConfirmDialog, DetailList, Drawer, EmptyState, Field, Modal, PageHeader, RouteLine, RowMenu, SearchInput, StatusBadge, TableSkeleton } from "@/components/ui";

type Avail = "all" | DriverAvailability;
const PHONE = /^\+255 ?[67]\d{2} ?\d{3} ?\d{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "").replace(/^0/, "255");
  const m = d.match(/^255([67]\d{2})(\d{3})(\d{3})$/);
  return m ? `+255 ${m[1]} ${m[2]} ${m[3]}` : p.trim();
}

function DriverForm({ open, onClose, driver }: { open: boolean; onClose: () => void; driver: Driver | null }) {
  const { data, saveDriver } = useStore();
  const toast = useToast();
  const empty = { name: "", phone: "", email: "", licence: "", licenceClass: "E", licenceExpiry: addDays(today(), 730), base: "Dar es Salaam", vehicleId: "", availability: "Available" as DriverAvailability };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(driver ? { name: driver.name, phone: driver.phone, email: driver.email, licence: driver.licence, licenceClass: driver.licenceClass, licenceExpiry: driver.licenceExpiry, base: driver.base, vehicleId: driver.vehicleId ?? "", availability: driver.availability } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driver]);

  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErr((e) => ({ ...e, [k]: "" }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().split(/\s+/).length < 2) e.name = "Enter the driver's first and last name.";
    const phone = formatPhone(f.phone);
    if (!PHONE.test(phone)) e.phone = "Enter a Tanzanian mobile number, for example +255 754 201 388.";
    if (!EMAIL.test(f.email.trim())) e.email = "Enter a valid email address.";
    const lic = f.licence.toUpperCase().trim();
    if (!/^TZ-DL-\d{7}$/.test(lic)) e.licence = "Use the format TZ-DL-4021187.";
    else if (data.drivers.some((d) => d.licence === lic && d.id !== driver?.id)) e.licence = "Another driver already has this licence number.";
    if (!f.licenceExpiry) e.licenceExpiry = "Enter the licence expiry date.";
    else if (f.licenceExpiry <= today()) e.licenceExpiry = "This licence has expired. Renew it before registering the driver.";
    setErr(e);
    if (Object.keys(e).length) return;
    const saved = saveDriver({
      id: driver?.id,
      name: f.name.trim().replace(/\s+/g, " "),
      phone,
      email: f.email.trim().toLowerCase(),
      licence: lic,
      licenceClass: f.licenceClass,
      licenceExpiry: f.licenceExpiry,
      base: f.base,
      vehicleId: f.vehicleId || null,
      availability: driver?.availability === "On trip" ? "On trip" : f.availability,
      joined: driver?.joined ?? today(),
    });
    toast.success(driver ? `Driver ${saved.name} updated` : `Driver ${saved.name} registered`, driver ? undefined : "They can now be assigned to shipments.");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={driver ? `Edit ${driver.name}` : "Register driver"}
      subtitle={driver ? driver.licence : "Add a driver so they can be assigned to vehicles and shipments."}
      width={640}
      footer={
        <>
          <button className="gt-btn gt-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="gt-btn gt-btn--primary" onClick={save}>
            {driver ? "Save changes" : "Register driver"}
          </button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <Field label="Full name" required error={err.name} className="sm:col-span-2">
          <input className="gt-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Juma Mwakyusa" />
        </Field>
        <Field label="Mobile number" required error={err.phone}>
          <input className="gt-input gt-num" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} onBlur={() => set("phone", formatPhone(f.phone))} placeholder="+255 754 201 388" />
        </Field>
        <Field label="Email" required error={err.email}>
          <input className="gt-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@globetrans.co.tz" />
        </Field>
        <Field label="Licence number" required error={err.licence}>
          <input className="gt-input gt-num uppercase" value={f.licence} onChange={(e) => set("licence", e.target.value)} placeholder="TZ-DL-4021187" />
        </Field>
        <Field label="Licence class" required help="Class E for articulated trucks, C for rigid trucks.">
          <select className="gt-input" value={f.licenceClass} onChange={(e) => set("licenceClass", e.target.value)}>
            {["B", "C", "C1", "D", "E"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Licence expiry" required error={err.licenceExpiry}>
          <input className="gt-input gt-num" type="date" value={f.licenceExpiry} onChange={(e) => set("licenceExpiry", e.target.value)} />
        </Field>
        <Field label="Home base">
          <select className="gt-input" value={f.base} onChange={(e) => set("base", e.target.value)}>
            {HUBS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Assigned vehicle">
          <select className="gt-input" value={f.vehicleId} onChange={(e) => set("vehicleId", e.target.value)}>
            <option value="">No vehicle</option>
            {data.vehicles.map((v) => {
              const other = v.driverId && v.driverId !== driver?.id ? data.drivers.find((d) => d.id === v.driverId)?.name : null;
              return (
                <option key={v.id} value={v.id}>
                  {v.reg}, {v.make}
                  {other ? ` (now with ${other})` : ""}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="Availability" help={driver?.availability === "On trip" ? "Set automatically while the driver is on a trip." : undefined}>
          <select className="gt-input" value={f.availability} onChange={(e) => set("availability", e.target.value)} disabled={driver?.availability === "On trip"}>
            {(driver?.availability === "On trip" ? DRIVER_AVAILABILITY : DRIVER_AVAILABILITY.filter((a) => a !== "On trip")).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function DriverProfile({ driverId, onClose, onEdit }: { driverId: string | null; onClose: () => void; onEdit: (d: Driver) => void }) {
  const { data } = useStore();
  const look = useLookups();
  const d = data.drivers.find((x) => x.id === driverId);
  if (!d) return null;
  const trips = data.shipments.filter((s) => s.driverId === d.id).sort((a, b) => b.departureDate.localeCompare(a.departureDate));
  const current = trips.find(isActive);
  const done = trips.filter((s) => s.status === "Delivered");
  const km = done.reduce((s, x) => s + planRoute(x.origin, x.destination).km, 0);
  const ontime = done.length ? (done.filter(onTime).length / done.length) * 100 : 0;
  const vehicle = look.vehicle(d.vehicleId);
  const expiresIn = daysBetween(today(), d.licenceExpiry);

  return (
    <Drawer
      open
      onClose={onClose}
      title={d.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <AvailabilityBadge value={d.availability} /> Class {d.licenceClass} driver, based in {d.base}
        </span>
      }
      footer={
        <>
          <a className="gt-btn gt-btn--secondary mr-auto" href={`tel:${d.phone.replace(/\s/g, "")}`}>
            <Phone className="gt-icon" /> Call
          </a>
          <button className="gt-btn gt-btn--primary" onClick={() => onEdit(d)}>
            <Pencil className="gt-icon" /> Edit profile
          </button>
        </>
      }
    >
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={d.name} size={56} />
        <div className="grid gap-1 text-[13px]">
          <span className="flex items-center gap-2">
            <Phone size={14} className="text-ink-muted" /> <span className="gt-num">{d.phone}</span>
          </span>
          <span className="flex items-center gap-2">
            <Mail size={14} className="text-ink-muted" /> {d.email}
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          ["Trips completed", fmtNum(done.length)],
          ["Kilometres driven", fmtNum(km)],
          ["On-time delivery", done.length ? `${Math.round(ontime)}%` : "No trips"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-surface-2 px-3 py-3">
            <div className="text-xs text-ink-muted">{k}</div>
            <div className="gt-num text-lg font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <h3 className="section-title mb-3">Current assignment</h3>
      {current ? (
        <Link href={`/shipments?open=${current.id}`} className="gt-card mb-6 block p-4 hover:border-line-strong">
          <span className="mb-3 flex items-center justify-between">
            <span className="gt-id">{current.id}</span>
            <StatusBadge status={current.status} />
          </span>
          <RouteLine origin={current.origin} destination={current.destination} progress={progressOf(current)} originSub={fmtShortDate(current.departureDate)} destSub={`ETA ${fmtShortDate(current.expectedDate)}`} />
          <span className="mt-3 block text-[13px] text-ink-muted">
            {look.customer(current.customerId)?.company}, {current.cargo}
          </span>
        </Link>
      ) : (
        <p className="mb-6 rounded-md bg-surface-2 px-4 py-3 text-ink-muted">Not on a trip. {d.availability === "Available" ? "Ready to be assigned." : "Off duty."}</p>
      )}

      <h3 className="section-title mb-3">Licence and vehicle</h3>
      <DetailList
        items={[
          ["Licence number", <span key="l" className="gt-num">{d.licence}</span>],
          ["Licence expiry", <span key="e" className={expiresIn < 90 ? "font-semibold text-danger-text" : ""}>{fmtDate(d.licenceExpiry)}{expiresIn < 90 ? ` (in ${expiresIn} days)` : ""}</span>],
          ["Assigned vehicle", vehicle ? `${vehicle.reg}, ${vehicle.make}` : "None"],
          ["With Globe Trans since", fmtDate(d.joined)],
        ]}
      />

      <h3 className="section-title mb-3 mt-8">Trip history</h3>
      {trips.length === 0 ? (
        <p className="text-ink-muted">No trips yet.</p>
      ) : (
        <ul className="divide-y divide-[color:var(--line)] rounded-md border border-line">
          {trips.slice(0, 12).map((s) => (
            <li key={s.id}>
              <Link href={`/shipments?open=${s.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="gt-id">{s.id}</span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {s.origin} → {s.destination}, {fmtShortDate(s.departureDate)}
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function DriversInner() {
  const { data, ready, deleteDriver } = useStore();
  const look = useLookups();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [avail, setAvail] = useState<Avail>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [deleting, setDeleting] = useState<Driver | null>(null);

  useEffect(() => {
    const o = params.get("open");
    if (o) setOpenId(o);
  }, [params]);

  const activeByDriver = useMemo(() => new Map(data.shipments.filter(isActive).map((s) => [s.driverId, s])), [data.shipments]);
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data.drivers;
    return data.drivers.filter((d) => [d.name, d.phone, d.email, d.licence, d.base, look.vehicle(d.vehicleId)?.reg].some((x) => x?.toLowerCase().includes(t)));
  }, [data.drivers, q, look]);
  const rows = searched.filter((d) => avail === "all" || d.availability === avail).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Driver contacts, licences, vehicles and who is on the road right now."
        actions={
          <button className="gt-btn gt-btn--primary" onClick={() => setFormOpen(true)}>
            <Plus className="gt-icon" /> Register driver
          </button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, phone, licence or vehicle" className="w-full lg:max-w-[440px]" />
      </div>
      <div className="mb-4">
        <Chips label="Filter by availability" value={avail} onChange={setAvail} options={[{ value: "all" as Avail, label: "All", count: searched.length }, ...DRIVER_AVAILABILITY.map((a) => ({ value: a as Avail, label: a, count: searched.filter((d) => d.availability === a).length }))]} />
      </div>

      {!ready ? (
        <TableSkeleton />
      ) : (
        <div className="gt-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={IdCard}
              title={data.drivers.length === 0 ? "No drivers yet" : "No drivers match"}
              text={data.drivers.length === 0 ? "Register a driver to start assigning trips." : "Clear the search or choose another availability."}
              action={
                <button className="gt-btn gt-btn--secondary gt-btn--sm" onClick={() => { setQ(""); setAvail("all"); }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Contact</th>
                    <th>Licence</th>
                    <th>Vehicle</th>
                    <th>Current assignment</th>
                    <th>Availability</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const trip = activeByDriver.get(d.id);
                    const expSoon = daysBetween(today(), d.licenceExpiry) < 90;
                    return (
                      <tr key={d.id} className="is-clickable" onClick={() => setOpenId(d.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(d.id)} aria-selected={openId === d.id}>
                        <td>
                          <span className="flex items-center gap-3">
                            <Avatar name={d.name} size={34} />
                            <span>
                              <span className="block font-semibold">{d.name}</span>
                              <span className="gt-sub">Based in {d.base}</span>
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="gt-num">{d.phone}</span>
                          <span className="gt-sub">{d.email}</span>
                        </td>
                        <td>
                          <span className="gt-num">{d.licence}</span>
                          <span className={`gt-sub ${expSoon ? "!text-danger-text font-semibold" : ""}`}>
                            Class {d.licenceClass}, expires {fmtDate(d.licenceExpiry)}
                          </span>
                        </td>
                        <td className="gt-num">{look.vehicle(d.vehicleId)?.reg ?? <span className="text-ink-muted">None</span>}</td>
                        <td>
                          {trip ? (
                            <>
                              <span className="gt-id">{trip.id}</span>
                              <span className="gt-sub">
                                {trip.origin} → {trip.destination}
                              </span>
                            </>
                          ) : (
                            <span className="text-ink-muted">None</span>
                          )}
                        </td>
                        <td>
                          <AvailabilityBadge value={d.availability} />
                        </td>
                        <td className="w-10 pr-2">
                          <RowMenu
                            label={`Actions for ${d.name}`}
                            items={[
                              { label: "View profile", icon: IdCard, onClick: () => setOpenId(d.id) },
                              { label: "Edit driver", icon: Pencil, onClick: () => setEditing(d) },
                              { label: "Remove driver", icon: Trash2, danger: true, onClick: () => (trip ? toast.error(`${d.name} is on ${trip.id}`, "Deliver or reassign the shipment first.") : setDeleting(d)) },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <DriverForm open={formOpen || !!editing} driver={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <DriverProfile
        driverId={openId}
        onClose={() => {
          setOpenId(null);
          if (params.get("open")) router.replace("/drivers", { scroll: false });
        }}
        onEdit={(d) => {
          setOpenId(null);
          setEditing(d);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Remove ${deleting?.name}?`}
        text="The driver is removed and unassigned from their vehicle and any pending shipments. This cannot be undone."
        confirmLabel="Remove driver"
        onConfirm={() => {
          if (!deleting) return;
          deleteDriver(deleting.id);
          toast.success(`Driver ${deleting.name} removed`);
        }}
      />
    </>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <DriversInner />
    </Suspense>
  );
}
