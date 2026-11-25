"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Pencil, Route as RouteIcon, Trash2, Truck } from "lucide-react";
import type { Shipment, ShipmentStatus } from "@/lib/types";
import { useLookups, useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { HUBS, planRoute, suggestCharge, transitDays } from "@/lib/geo";
import { addDays, fmtDate, fmtDateTime, fmtKg, fmtNum, fmtTZS, today } from "@/lib/format";
import { defaultDeparture, progressOf, timelineOf } from "@/lib/derive";
import { ConfirmDialog, DetailList, Drawer, Field, Modal, RouteLine, RowMenu, StatusBadge } from "./ui";

/* ---------- Create / edit ---------- */

interface FormState {
  customerId: string;
  cargo: string;
  origin: string;
  destination: string;
  weightKg: string;
  departureDate: string;
  expectedDate: string;
  chargeTZS: string;
  vehicleId: string;
  driverId: string;
}

export function ShipmentFormModal({ open, onClose, shipment, onSaved }: { open: boolean; onClose: () => void; shipment?: Shipment | null; onSaved?: (s: Shipment) => void }) {
  const { data, createShipment, updateShipment } = useStore();
  const toast = useToast();
  const editing = Boolean(shipment);

  const blank = (): FormState => {
    const dep = defaultDeparture();
    return {
      customerId: "",
      cargo: "",
      origin: "Dar es Salaam",
      destination: "",
      weightKg: "",
      departureDate: dep,
      expectedDate: "",
      chargeTZS: "",
      vehicleId: "",
      driverId: "",
    };
  };
  const [f, setF] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [touchedExpected, setTouchedExpected] = useState(false);
  const [touchedCharge, setTouchedCharge] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (shipment) {
      setF({
        customerId: shipment.customerId,
        cargo: shipment.cargo,
        origin: shipment.origin,
        destination: shipment.destination,
        weightKg: String(shipment.weightKg),
        departureDate: shipment.departureDate,
        expectedDate: shipment.expectedDate,
        chargeTZS: String(shipment.chargeTZS),
        vehicleId: shipment.vehicleId ?? "",
        driverId: shipment.driverId ?? "",
      });
      setTouchedExpected(true);
      setTouchedCharge(true);
    } else {
      setF(blank());
      setTouchedExpected(false);
      setTouchedCharge(false);
    }
  }, [open, shipment]);

  // Auto-fill expected date and charge until the user edits them.
  const weight = Number(f.weightKg);
  useEffect(() => {
    if (!open) return;
    if (f.origin && f.destination && f.origin !== f.destination) {
      setF((p) => ({
        ...p,
        expectedDate: touchedExpected || !p.departureDate ? p.expectedDate : addDays(p.departureDate, transitDays(p.origin, p.destination)),
        chargeTZS: touchedCharge || !(weight > 0) ? p.chargeTZS : String(suggestCharge(p.origin, p.destination, weight)),
      }));
      setErrors((e) => ({
        ...e,
        expectedDate: touchedExpected ? e.expectedDate : undefined,
        chargeTZS: touchedCharge || !(weight > 0) ? e.chargeTZS : undefined,
      }));
    }
  }, [open, f.origin, f.destination, f.departureDate, weight, touchedExpected, touchedCharge]);

  const vehicles = useMemo(
    () => data.vehicles.filter((v) => v.id === shipment?.vehicleId || (v.availability === "Available" && !data.shipments.some((s) => s.vehicleId === v.id && s.status === "Pending" && s.id !== shipment?.id))),
    [data.vehicles, data.shipments, shipment],
  );
  const drivers = useMemo(() => data.drivers.filter((d) => d.id === shipment?.driverId || d.availability === "Available"), [data.drivers, shipment]);
  const selectedVehicle = data.vehicles.find((v) => v.id === f.vehicleId);
  const route = f.origin && f.destination && f.origin !== f.destination ? planRoute(f.origin, f.destination) : null;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!f.customerId) e.customerId = "Choose a customer.";
    if (f.cargo.trim().length < 3) e.cargo = "Describe the cargo, for example “Bagged cement, 600 bags”.";
    if (!f.origin) e.origin = "Choose where the cargo is collected.";
    if (!f.destination) e.destination = "Choose where the cargo is delivered.";
    else if (f.destination === f.origin) e.destination = "Destination must differ from the origin.";
    if (!(weight >= 1 && weight <= 40000)) e.weightKg = "Enter a weight between 1 and 40,000 kg.";
    else if (selectedVehicle && weight > selectedVehicle.capacityKg) e.weightKg = `Exceeds ${selectedVehicle.reg}'s ${fmtKg(selectedVehicle.capacityKg)} capacity.`;
    if (!f.departureDate) e.departureDate = "Choose a departure date.";
    if (!f.expectedDate) e.expectedDate = "Choose an expected delivery date.";
    else if (f.departureDate && f.expectedDate < f.departureDate) e.expectedDate = "Delivery cannot be before departure.";
    if (!(Number(f.chargeTZS) > 0)) e.chargeTZS = "Enter the freight charge in TZS.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const payload = {
      customerId: f.customerId,
      cargo: f.cargo.trim(),
      origin: f.origin,
      destination: f.destination,
      weightKg: weight,
      departureDate: f.departureDate,
      expectedDate: f.expectedDate,
      chargeTZS: Math.round(Number(f.chargeTZS)),
      vehicleId: f.vehicleId || null,
      driverId: f.driverId || null,
    };
    if (shipment) {
      updateShipment(shipment.id, payload);
      toast.success(`Shipment ${shipment.id} updated`);
      onSaved?.({ ...shipment, ...payload });
    } else {
      const s = createShipment(payload);
      toast.success(`Shipment ${s.id} created`, s.vehicleId ? "Update the status to Dispatched when the truck leaves." : "Assign a vehicle and driver to dispatch it.");
      onSaved?.(s);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${shipment!.id}` : "Create shipment"}
      subtitle={editing ? "Changes are saved to the shipment record." : "Book a consignment. You can assign a vehicle now or later."}
      width={680}
      footer={
        <>
          <button className="gt-btn gt-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="gt-btn gt-btn--primary" onClick={save}>
            {editing ? "Save changes" : "Create shipment"}
          </button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        noValidate
      >
        <Field label="Customer" required error={errors.customerId} className="sm:col-span-2">
          <select className="gt-input" value={f.customerId} onChange={(e) => set("customerId", e.target.value)}>
            <option value="">Choose a customer</option>
            {[...data.customers]
              .sort((a, b) => a.company.localeCompare(b.company))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Cargo description" required error={errors.cargo} className="sm:col-span-2">
          <input className="gt-input" value={f.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="e.g. Bagged cement, 600 bags" />
        </Field>
        <Field label="Origin" required error={errors.origin}>
          <select className="gt-input" value={f.origin} onChange={(e) => set("origin", e.target.value)}>
            <option value="">Choose origin</option>
            {HUBS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Destination" required error={errors.destination} help={route ? `${fmtNum(route.km)} km by road via ${route.path.slice(1, -1).join(", ") || "direct route"}` : undefined}>
          <select className="gt-input" value={f.destination} onChange={(e) => set("destination", e.target.value)}>
            <option value="">Choose destination</option>
            {HUBS.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Weight (kg)" required error={errors.weightKg}>
          <input className="gt-input gt-num" inputMode="numeric" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value.replace(/[^\d]/g, ""))} placeholder="18400" />
        </Field>
        <Field label="Freight charge (TZS)" required error={errors.chargeTZS} help={!touchedCharge && f.chargeTZS ? "Suggested from distance and weight. You can change it." : undefined}>
          <input
            className="gt-input gt-num"
            inputMode="numeric"
            value={f.chargeTZS ? fmtNum(Number(f.chargeTZS)) : ""}
            onChange={(e) => {
              setTouchedCharge(true);
              set("chargeTZS", e.target.value.replace(/[^\d]/g, ""));
            }}
            placeholder="4,850,000"
          />
        </Field>
        <Field label="Departure date" required error={errors.departureDate}>
          <input className="gt-input gt-num" type="date" value={f.departureDate} onChange={(e) => set("departureDate", e.target.value)} />
        </Field>
        <Field label="Expected delivery" required error={errors.expectedDate} help={route && !errors.expectedDate ? `Typical transit: ${transitDays(f.origin, f.destination)} day${transitDays(f.origin, f.destination) > 1 ? "s" : ""}` : undefined}>
          <input
            className="gt-input gt-num"
            type="date"
            value={f.expectedDate}
            min={f.departureDate}
            onChange={(e) => {
              setTouchedExpected(true);
              set("expectedDate", e.target.value);
            }}
          />
        </Field>
        <Field label="Vehicle" help={weight > 0 ? `Showing available vehicles. ${fmtKg(weight)} needs capacity to match.` : "Optional. Only available vehicles are listed."}>
          <select
            className="gt-input"
            value={f.vehicleId}
            onChange={(e) => {
              const v = data.vehicles.find((x) => x.id === e.target.value);
              setF((p) => ({ ...p, vehicleId: e.target.value, driverId: v?.driverId && drivers.some((d) => d.id === v.driverId) ? v.driverId : p.driverId }));
              setErrors((er) => ({ ...er, weightKg: undefined }));
            }}
          >
            <option value="">Not assigned</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id} disabled={weight > 0 && v.capacityKg < weight}>
                {v.reg}, {v.make}, {fmtNum(v.capacityKg / 1000)} t{weight > 0 && v.capacityKg < weight ? " (too small)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Driver">
          <select className="gt-input" value={f.driverId} onChange={(e) => set("driverId", e.target.value)}>
            <option value="">Not assigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}, Class {d.licenceClass}
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ---------- Assign ---------- */

export function AssignModal({ open, onClose, shipment }: { open: boolean; onClose: () => void; shipment: Shipment | null }) {
  const { data, assignShipment, setShipmentStatus } = useStore();
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [error, setError] = useState<{ v?: string; d?: string }>({});

  useEffect(() => {
    if (open && shipment) {
      setVehicleId(shipment.vehicleId ?? "");
      setDriverId(shipment.driverId ?? "");
      setError({});
    }
  }, [open, shipment]);

  if (!shipment) return null;
  const vehicles = data.vehicles.filter((v) => v.id === shipment.vehicleId || v.availability === "Available");
  const drivers = data.drivers.filter((d) => d.id === shipment.driverId || d.availability === "Available");

  const submit = (dispatch: boolean) => {
    const e: { v?: string; d?: string } = {};
    const v = data.vehicles.find((x) => x.id === vehicleId);
    if (!vehicleId) e.v = "Choose a vehicle.";
    else if (v && v.capacityKg < shipment.weightKg) e.v = `${v.reg} carries up to ${fmtKg(v.capacityKg)}. This load is ${fmtKg(shipment.weightKg)}.`;
    if (!driverId) e.d = "Choose a driver.";
    setError(e);
    if (e.v || e.d) return;
    assignShipment(shipment.id, vehicleId, driverId);
    const reg = v?.reg;
    const name = data.drivers.find((d) => d.id === driverId)?.name;
    if (dispatch) {
      setShipmentStatus(shipment.id, "Dispatched");
      toast.success(`Shipment ${shipment.id} dispatched`, `${reg} with ${name} is leaving ${shipment.origin}.`);
    } else {
      toast.success(`Assigned ${reg} and ${name}`, `${shipment.id} is ready to dispatch.`);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign vehicle and driver"
      subtitle={`${shipment.id}, ${shipment.origin} → ${shipment.destination}, ${fmtKg(shipment.weightKg)}`}
      footer={
        <>
          <button className="gt-btn gt-btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="gt-btn gt-btn--secondary" onClick={() => submit(false)}>
            Save assignment
          </button>
          {shipment.status === "Pending" && (
            <button className="gt-btn gt-btn--primary" onClick={() => submit(true)}>
              Assign and dispatch
            </button>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle" required error={error.v} help={`Available vehicles with ${fmtNum(shipment.weightKg / 1000)} t capacity or more.`}>
          <select
            className="gt-input"
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              const v = data.vehicles.find((x) => x.id === e.target.value);
              if (v?.driverId && drivers.some((d) => d.id === v.driverId)) setDriverId(v.driverId);
              setError({});
            }}
          >
            <option value="">Choose a vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id} disabled={v.capacityKg < shipment.weightKg}>
                {v.reg}, {v.type}, {fmtNum(v.capacityKg / 1000)} t, at {v.location}
                {v.capacityKg < shipment.weightKg ? " (too small)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Driver" required error={error.d}>
          <select className="gt-input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Choose a driver</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}, Class {d.licenceClass}, {d.base}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {vehicles.length === 0 && <p className="mt-4 rounded-md bg-signal-soft px-3 py-2 text-[13px] text-signal-text">No vehicles are available right now. Free one up from Fleet, or wait for a trip to finish.</p>}
    </Modal>
  );
}

/* ---------- Status ---------- */

export const NEXT_STATUS: Record<ShipmentStatus, ShipmentStatus[]> = {
  Pending: ["Dispatched", "Cancelled"],
  Dispatched: ["In transit", "Delayed", "Cancelled"],
  "In transit": ["Delayed", "Delivered"],
  Delayed: ["In transit", "Delivered"],
  Delivered: [],
  Cancelled: ["Pending"],
};

export function StatusModal({ open, onClose, shipment, onNeedAssign }: { open: boolean; onClose: () => void; shipment: Shipment | null; onNeedAssign: () => void }) {
  const { setShipmentStatus } = useStore();
  const toast = useToast();
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && shipment) {
      setStatus(NEXT_STATUS[shipment.status][0] ?? "");
      setReason("");
      setError("");
    }
  }, [open, shipment]);

  if (!shipment) return null;
  const options = NEXT_STATUS[shipment.status];
  const needsAssign = status === "Dispatched" && (!shipment.vehicleId || !shipment.driverId);

  const submit = () => {
    if (!status) return;
    if (needsAssign) return;
    if (status === "Delayed" && reason.trim().length < 4) {
      setError("Say what is causing the delay, for example “Held at Vigwaza weighbridge”.");
      return;
    }
    setShipmentStatus(shipment.id, status, reason.trim());
    const verb: Record<ShipmentStatus, string> = {
      Pending: "reopened",
      Dispatched: "dispatched",
      "In transit": "marked In transit",
      Delayed: "marked Delayed",
      Delivered: "delivered",
      Cancelled: "cancelled",
    };
    if (status === "Delayed") toast.warning(`Shipment ${shipment.id} ${verb[status]}`, reason.trim());
    else toast.success(`Shipment ${shipment.id} ${verb[status]}`, status === "Delivered" ? "The vehicle and driver are available again." : undefined);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update status"
      subtitle={`${shipment.id} is currently ${shipment.status}.`}
      width={500}
      footer={
        options.length ? (
          <>
            <button className="gt-btn gt-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="gt-btn gt-btn--primary" onClick={submit} disabled={needsAssign}>
              Update status
            </button>
          </>
        ) : (
          <button className="gt-btn gt-btn--secondary" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {options.length === 0 ? (
        <p className="text-ink-muted">Delivered shipments are closed. Create a new shipment for a return load.</p>
      ) : (
        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="gt-field__label mb-2">New status</legend>
            {options.map((o) => (
              <label key={o} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 ${status === o ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}>
                <input type="radio" name="status" className="accent-[var(--brand)]" checked={status === o} onChange={() => setStatus(o)} />
                <StatusBadge status={o} />
                <span className="text-[13px] text-ink-muted">
                  {o === "Dispatched" && "The truck has left the origin depot."}
                  {o === "In transit" && "The truck is on the road."}
                  {o === "Delayed" && "Something is holding the truck up."}
                  {o === "Delivered" && "The consignee signed for the cargo."}
                  {o === "Cancelled" && "The booking will not go ahead."}
                  {o === "Pending" && "Reopen the booking."}
                </span>
              </label>
            ))}
          </fieldset>
          {status === "Delayed" && (
            <Field label="Reason for delay" required error={error}>
              <input className="gt-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Held at Vigwaza weighbridge" />
            </Field>
          )}
          {needsAssign && (
            <div className="flex items-start gap-2 rounded-md bg-signal-soft px-3 py-2.5 text-[13px] text-signal-text">
              <AlertTriangle size={16} className="mt-0.5 flex-none" />
              <span>
                Assign a vehicle and driver before dispatching.{" "}
                <button
                  className="font-semibold underline"
                  onClick={() => {
                    onClose();
                    onNeedAssign();
                  }}
                >
                  Assign now
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------- Detail drawer ---------- */

export function ShipmentTimeline({ shipment }: { shipment: Shipment }) {
  const { data } = useStore();
  const steps = timelineOf(shipment, data);
  return (
    <ol className="gt-timeline">
      {steps.map((st, i) => (
        <li key={i} className={`is-${st.state}`}>
          <span className="gt-timeline__mark">{st.state === "done" ? <Check size={14} strokeWidth={2.25} /> : st.state === "alert" ? <AlertTriangle size={12} strokeWidth={2.25} /> : null}</span>
          <span>
            <span className="gt-timeline__title">{st.title}</span>
            <span className="gt-timeline__meta">{st.meta}</span>
          </span>
          <span className="gt-timeline__time">
            {st.time ? (st.estimated ? `Est. ${fmtDateTime(st.time.toISOString())}` : fmtDateTime(st.time.toISOString())) : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ShipmentDrawer({ shipmentId, onClose, onEdit }: { shipmentId: string | null; onClose: () => void; onEdit: (s: Shipment) => void }) {
  const { data, deleteShipment } = useStore();
  const look = useLookups();
  const toast = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const s = data.shipments.find((x) => x.id === shipmentId) ?? null;

  if (!s) return null;
  const customer = look.customer(s.customerId);
  const vehicle = look.vehicle(s.vehicleId);
  const driver = look.driver(s.driverId);
  const route = planRoute(s.origin, s.destination);
  const progress = progressOf(s);
  const late = s.status === "Delivered" && s.deliveredDate && s.deliveredDate > s.expectedDate;

  return (
    <>
      <Drawer
        open={!!s && !assignOpen && !statusOpen && !confirmDelete}
        onClose={onClose}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="gt-num">{s.id}</span>
            <StatusBadge status={s.status} />
          </span>
        }
        subtitle={customer?.company}
        headerExtra={
          <RowMenu
            items={[
              { label: "Edit shipment", icon: Pencil, onClick: () => onEdit(s) },
              { label: "Delete shipment", icon: Trash2, onClick: () => setConfirmDelete(true), danger: true },
            ]}
          />
        }
        footer={
          <>
            <Link href={`/tracking?id=${s.id}`} className="gt-btn gt-btn--ghost mr-auto">
              <RouteIcon className="gt-icon" /> Open tracking
            </Link>
            {s.status !== "Delivered" && s.status !== "Cancelled" && (
              <button className="gt-btn gt-btn--secondary" onClick={() => setAssignOpen(true)}>
                <Truck className="gt-icon" /> {vehicle ? "Change assignment" : "Assign vehicle"}
              </button>
            )}
            <button className="gt-btn gt-btn--primary" onClick={() => setStatusOpen(true)} disabled={s.status === "Delivered"}>
              Update status
            </button>
          </>
        }
      >
        <div className="gt-card mb-6 p-5">
          <RouteLine origin={s.origin} destination={s.destination} progress={progress} originSub={`Departs ${fmtDate(s.departureDate)}`} destSub={s.status === "Delivered" ? `Delivered ${fmtDate(s.deliveredDate)}` : `ETA ${fmtDate(s.expectedDate)}`} />
          <p className="mt-4 text-[13px] text-ink-muted">
            {fmtNum(route.km)} km via {route.path.slice(1, -1).join(", ") || "direct road"}.{" "}
            {s.status === "Delayed" && <span className="font-semibold text-danger-text">Delayed: {s.delayReason}.</span>}
            {late && <span className="font-semibold text-signal-text">Delivered {Math.round((new Date(s.deliveredDate!).getTime() - new Date(s.expectedDate).getTime()) / 86400000)} day(s) late.</span>}
          </p>
        </div>

        <h3 className="section-title mb-3">Shipment details</h3>
        <DetailList
          items={[
            ["Customer", customer ? <Link className="text-brand-text hover:underline" href={`/customers?open=${customer.id}`}>{customer.company}</Link> : "Unknown"],
            ["Cargo", s.cargo],
            ["Weight", fmtKg(s.weightKg)],
            ["Freight charge", fmtTZS(s.chargeTZS)],
            ["Vehicle", vehicle ? `${vehicle.reg}, ${vehicle.make}` : <span className="text-ink-muted">Not assigned</span>],
            ["Driver", driver ? <Link className="text-brand-text hover:underline" href={`/drivers?open=${driver.id}`}>{driver.name}</Link> : <span className="text-ink-muted">Not assigned</span>],
            ["Departure", fmtDate(s.departureDate)],
            ["Expected delivery", fmtDate(s.expectedDate)],
          ]}
        />
        <h3 className="section-title mb-4 mt-8">Progress</h3>
        <ShipmentTimeline shipment={s} />
      </Drawer>

      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} shipment={s} />
      <StatusModal open={statusOpen} onClose={() => setStatusOpen(false)} shipment={s} onNeedAssign={() => setAssignOpen(true)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${s.id}?`}
        text="The shipment and its history will be removed. Any assigned vehicle and driver become available. This cannot be undone."
        confirmLabel={`Delete ${s.id}`}
        onConfirm={() => {
          deleteShipment(s.id);
          toast.success(`Shipment ${s.id} deleted`);
          onClose();
        }}
      />
    </>
  );
}

export function useNewShipmentDefaults() {
  return today();
}
