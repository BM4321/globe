"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Trash2, Truck, Wrench } from "lucide-react";
import { useLookups, useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { HUBS } from "@/lib/geo";
import { fmtKg, fmtNum } from "@/lib/format";
import { MAINTENANCE_STATUSES, VEHICLE_AVAILABILITY, VEHICLE_TYPES, type MaintenanceStatus, type Vehicle, type VehicleAvailability, type VehicleType } from "@/lib/types";
import { AvailabilityBadge, Chips, ConfirmDialog, EmptyState, Field, MaintenanceBadge, MetricTile, Modal, PageHeader, RowMenu, SearchInput, TableSkeleton } from "@/components/ui";

type Avail = "all" | VehicleAvailability;

function normaliseReg(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = s.match(/^T(\d{3})([A-Z]{3})$/);
  return m ? `T ${m[1]} ${m[2]}` : raw.toUpperCase().trim();
}

function VehicleForm({ open, onClose, vehicle }: { open: boolean; onClose: () => void; vehicle: Vehicle | null }) {
  const { data, saveVehicle } = useStore();
  const toast = useToast();
  const empty = { reg: "", type: "Prime mover + trailer" as VehicleType, make: "", year: String(new Date().getFullYear()), capacityKg: "", driverId: "", location: "Dar es Salaam", maintenance: "Good" as MaintenanceStatus, odometerKm: "", nextServiceKm: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErr({});
    setF(
      vehicle
        ? { reg: vehicle.reg, type: vehicle.type, make: vehicle.make, year: String(vehicle.year), capacityKg: String(vehicle.capacityKg), driverId: vehicle.driverId ?? "", location: vehicle.location.replace("En route to ", ""), maintenance: vehicle.maintenance, odometerKm: String(vehicle.odometerKm), nextServiceKm: String(vehicle.nextServiceKm) }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle]);

  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErr((e) => ({ ...e, [k]: "" }));
  };

  const save = () => {
    const e: Record<string, string> = {};
    const reg = normaliseReg(f.reg);
    if (!/^T \d{3} [A-Z]{3}$/.test(reg)) e.reg = "Use the Tanzanian format, for example T 482 DKL.";
    else if (data.vehicles.some((v) => v.reg === reg && v.id !== vehicle?.id)) e.reg = `${reg} is already in the fleet.`;
    if (f.make.trim().length < 2) e.make = "Enter the make and model, for example Scania R460.";
    const year = Number(f.year);
    if (!(year >= 1995 && year <= new Date().getFullYear() + 1)) e.year = "Enter a year between 1995 and next year.";
    const cap = Number(f.capacityKg);
    if (!(cap >= 500 && cap <= 60000)) e.capacityKg = "Enter a capacity between 500 and 60,000 kg.";
    const odo = Number(f.odometerKm || 0);
    const next = Number(f.nextServiceKm || 0);
    if (f.nextServiceKm && next <= odo) e.nextServiceKm = "Next service must be above the current odometer reading.";
    setErr(e);
    if (Object.keys(e).length) return;
    const onTrip = vehicle?.availability === "On trip";
    const saved = saveVehicle({
      id: vehicle?.id,
      reg,
      type: f.type,
      make: f.make.trim(),
      year,
      capacityKg: cap,
      driverId: f.driverId || null,
      location: onTrip ? vehicle!.location : f.location,
      maintenance: f.maintenance,
      availability: onTrip ? "On trip" : f.maintenance === "In workshop" ? "In workshop" : vehicle?.availability === "Off duty" ? "Off duty" : "Available",
      odometerKm: odo,
      nextServiceKm: next || odo + 10000,
    });
    toast.success(vehicle ? `Vehicle ${saved.reg} updated` : `Vehicle ${saved.reg} added`, vehicle ? undefined : "It is now available for assignment.");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={vehicle ? `Edit ${vehicle.reg}` : "Add vehicle"}
      subtitle={vehicle ? `${vehicle.make}, ${vehicle.type}` : "Register a truck so it can be assigned to shipments."}
      width={640}
      footer={
        <>
          <button className="gt-btn gt-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="gt-btn gt-btn--primary" onClick={save}>
            {vehicle ? "Save changes" : "Add vehicle"}
          </button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <Field label="Registration number" required error={err.reg}>
          <input className="gt-input gt-num uppercase" value={f.reg} onChange={(e) => set("reg", e.target.value)} onBlur={() => set("reg", normaliseReg(f.reg))} placeholder="T 482 DKL" />
        </Field>
        <Field label="Vehicle type" required>
          <select className="gt-input" value={f.type} onChange={(e) => set("type", e.target.value)}>
            {VEHICLE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Make and model" required error={err.make}>
          <input className="gt-input" value={f.make} onChange={(e) => set("make", e.target.value)} placeholder="Scania R460" />
        </Field>
        <Field label="Year" required error={err.year}>
          <input className="gt-input gt-num" inputMode="numeric" value={f.year} onChange={(e) => set("year", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Capacity (kg)" required error={err.capacityKg}>
          <input className="gt-input gt-num" inputMode="numeric" value={f.capacityKg} onChange={(e) => set("capacityKg", e.target.value.replace(/\D/g, ""))} placeholder="30000" />
        </Field>
        <Field label="Assigned driver" help="Drivers keep one vehicle at a time. Choosing one moves them here.">
          <select className="gt-input" value={f.driverId} onChange={(e) => set("driverId", e.target.value)}>
            <option value="">No driver</option>
            {data.drivers.map((d) => {
              const other = d.vehicleId && d.vehicleId !== vehicle?.id ? data.vehicles.find((v) => v.id === d.vehicleId)?.reg : null;
              return (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {other ? ` (now on ${other})` : ""}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="Current location" help={vehicle?.availability === "On trip" ? "Set automatically while the vehicle is on a trip." : undefined}>
          <select className="gt-input" value={f.location} onChange={(e) => set("location", e.target.value)} disabled={vehicle?.availability === "On trip"}>
            {HUBS.map((h) => (
              <option key={h}>{h}</option>
            ))}
            {!HUBS.includes(f.location) && <option>{f.location}</option>}
          </select>
        </Field>
        <Field label="Maintenance status">
          <select className="gt-input" value={f.maintenance} onChange={(e) => set("maintenance", e.target.value)}>
            {MAINTENANCE_STATUSES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Odometer (km)">
          <input className="gt-input gt-num" inputMode="numeric" value={f.odometerKm} onChange={(e) => set("odometerKm", e.target.value.replace(/\D/g, ""))} placeholder="184000" />
        </Field>
        <Field label="Next service at (km)" error={err.nextServiceKm}>
          <input className="gt-input gt-num" inputMode="numeric" value={f.nextServiceKm} onChange={(e) => set("nextServiceKm", e.target.value.replace(/\D/g, ""))} placeholder="194000" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function FleetInner() {
  const { data, ready, saveVehicle, deleteVehicle } = useStore();
  const look = useLookups();
  const toast = useToast();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [avail, setAvail] = useState<Avail>((params.get("availability") as Avail) ?? "all");
  const [type, setType] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);

  useEffect(() => {
    const qq = params.get("q");
    if (qq !== null) setQ(qq);
    const a = params.get("availability") as Avail | null;
    if (a) setAvail(a);
  }, [params]);

  const V = data.vehicles;
  const searched = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s/g, "");
    return V.filter((v) => {
      if (type !== "all" && v.type !== type) return false;
      if (!t) return true;
      const d = look.driver(v.driverId);
      return [v.reg, v.make, v.location, v.type, d?.name].some((x) => x?.toLowerCase().replace(/\s/g, "").includes(t));
    });
  }, [V, q, type, look]);
  const rows = searched.filter((v) => avail === "all" || v.availability === avail).sort((a, b) => a.reg.localeCompare(b.reg));

  const totalCap = V.reduce((s, v) => s + v.capacityKg, 0);
  const onTrip = V.filter((v) => v.availability === "On trip");
  const util = V.length ? (onTrip.length / V.filter((v) => v.availability !== "In workshop").length) * 100 : 0;

  const toggleWorkshop = (v: Vehicle) => {
    if (v.availability === "On trip") {
      toast.error(`${v.reg} is on a trip`, "Finish or reassign its shipment before sending it to the workshop.");
      return;
    }
    const into = v.maintenance !== "In workshop";
    saveVehicle({ ...v, maintenance: into ? "In workshop" : "Good", availability: into ? "In workshop" : "Available", nextServiceKm: into ? v.nextServiceKm : v.odometerKm + 10000 });
    toast.success(into ? `${v.reg} checked into the workshop` : `${v.reg} returned to service`, into ? "It is hidden from assignment until it returns." : "Next service scheduled in 10,000 km.");
  };

  return (
    <>
      <PageHeader
        title="Fleet"
        description="Every truck, its driver, where it is, and when it is next due for service."
        actions={
          <button className="gt-btn gt-btn--primary" onClick={() => setFormOpen(true)}>
            <Plus className="gt-icon" /> Add vehicle
          </button>
        }
      />
      {ready && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile icon={Truck} label="Fleet size" value={String(V.length)} foot={`${fmtNum(totalCap / 1000)} t total capacity`} />
          <MetricTile icon={CheckCircle2} label="Available now" value={String(V.filter((v) => v.availability === "Available").length)} foot="Ready for loading" />
          <MetricTile icon={Truck} label="Utilisation" value={`${Math.round(util)}%`} meter={util} foot={`${onTrip.length} of ${V.filter((v) => v.availability !== "In workshop").length} serviceable trucks on trips`} />
          <MetricTile icon={Wrench} label="Maintenance" value={String(V.filter((v) => v.maintenance !== "Good").length)} foot={`${V.filter((v) => v.maintenance === "In workshop").length} in workshop, ${V.filter((v) => v.maintenance === "Service due").length} due soon`} />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search by registration, make, driver or location" className="w-full lg:max-w-[440px]" />
        <label className="flex items-center gap-2 text-[13px] text-ink-muted lg:ml-auto">
          Type
          <select className="gt-input h-9 w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {VEHICLE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mb-4">
        <Chips label="Filter by availability" value={avail} onChange={setAvail} options={[{ value: "all" as Avail, label: "All", count: searched.length }, ...VEHICLE_AVAILABILITY.map((a) => ({ value: a as Avail, label: a, count: searched.filter((v) => v.availability === a).length }))]} />
      </div>

      {!ready ? (
        <TableSkeleton />
      ) : (
        <div className="gt-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={Truck}
              title={V.length === 0 ? "No vehicles yet" : "No vehicles match these filters"}
              text={V.length === 0 ? "Add your first truck to start assigning shipments." : "Clear the search or choose another availability."}
              action={
                V.length === 0 ? (
                  <button className="gt-btn gt-btn--primary gt-btn--sm" onClick={() => setFormOpen(true)}>
                    Add vehicle
                  </button>
                ) : (
                  <button className="gt-btn gt-btn--secondary gt-btn--sm" onClick={() => { setQ(""); setAvail("all"); setType("all"); }}>
                    Clear filters
                  </button>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th>Registration</th>
                    <th>Type</th>
                    <th className="gt-r">Capacity</th>
                    <th>Driver</th>
                    <th>Current location</th>
                    <th>Availability</th>
                    <th>Maintenance</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const d = look.driver(v.driverId);
                    const toService = v.nextServiceKm - v.odometerKm;
                    const trip = data.shipments.find((s) => s.vehicleId === v.id && ["Dispatched", "In transit", "Delayed"].includes(s.status));
                    return (
                      <tr key={v.id} className="is-clickable" onClick={() => setEditing(v)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEditing(v)}>
                        <td>
                          <span className="gt-num font-semibold">{v.reg}</span>
                          <span className="gt-sub">
                            {v.make}, {v.year}
                          </span>
                        </td>
                        <td>{v.type}</td>
                        <td className="gt-r">{fmtKg(v.capacityKg)}</td>
                        <td>{d ? d.name : <span className="text-ink-muted">No driver</span>}</td>
                        <td>
                          {v.location}
                          {trip && <span className="gt-sub">{trip.id}</span>}
                        </td>
                        <td>
                          <AvailabilityBadge value={v.availability} />
                        </td>
                        <td>
                          <MaintenanceBadge value={v.maintenance} />
                          {v.maintenance !== "In workshop" && <span className="gt-sub gt-num mt-1">Service in {fmtNum(Math.max(0, toService))} km</span>}
                        </td>
                        <td className="w-10 pr-2">
                          <RowMenu
                            label={`Actions for ${v.reg}`}
                            items={[
                              { label: "Edit vehicle", icon: Pencil, onClick: () => setEditing(v) },
                              { label: v.maintenance === "In workshop" ? "Return to service" : "Send to workshop", icon: Wrench, onClick: () => toggleWorkshop(v) },
                              { label: "Delete vehicle", icon: Trash2, danger: true, onClick: () => (trip ? toast.error(`${v.reg} is on ${trip.id}`, "Deliver or reassign the shipment before deleting the vehicle.") : setDeleting(v)) },
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

      <VehicleForm open={formOpen || !!editing} vehicle={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.reg}?`}
        text="The vehicle is removed from the fleet and unassigned from its driver and any pending shipments. Past shipments stay on record without the vehicle link. This cannot be undone."
        confirmLabel={`Delete ${deleting?.reg}`}
        onConfirm={() => {
          if (!deleting) return;
          deleteVehicle(deleting.id);
          toast.success(`Vehicle ${deleting.reg} deleted`);
        }}
      />
    </>
  );
}

export default function FleetPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <FleetInner />
    </Suspense>
  );
}
