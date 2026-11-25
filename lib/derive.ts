import type { AppData, Shipment, ShipmentStatus } from "./types";
import { planRoute } from "./geo";
import { addDays, parseDate, today } from "./format";

export const ACTIVE: ShipmentStatus[] = ["Dispatched", "In transit", "Delayed"];
export const isActive = (s: Shipment) => ACTIVE.includes(s.status);

const at = (date: string, hh: number, mm = 0) => {
  const d = parseDate(date);
  d.setHours(hh, mm, 0, 0);
  return d;
};

/** Share of the route covered, 0–100, estimated from schedule and status. */
export function progressOf(s: Shipment, now = new Date()) {
  switch (s.status) {
    case "Pending":
    case "Cancelled":
      return 0;
    case "Dispatched":
      return 6;
    case "Delivered":
      return 100;
    default: {
      const start = at(s.departureDate, 6, 10).getTime();
      const end = at(s.expectedDate, 12).getTime();
      const f = end > start ? (now.getTime() - start) / (end - start) : 0.5;
      const max = s.status === "Delayed" ? 0.82 : 0.92;
      return Math.round(Math.min(max, Math.max(0.12, f)) * 100);
    }
  }
}

export type StepState = "done" | "current" | "upcoming" | "alert";
export interface TimelineStep {
  title: string;
  meta: string;
  time: Date | null;
  state: StepState;
  estimated?: boolean;
}

export function timelineOf(s: Shipment, data: Pick<AppData, "vehicles" | "drivers">, now = new Date()): TimelineStep[] {
  const route = planRoute(s.origin, s.destination);
  const progress = progressOf(s, now) / 100;
  const vehicle = data.vehicles.find((v) => v.id === s.vehicleId);
  const driver = data.drivers.find((d) => d.id === s.driverId);
  const depart = at(s.departureDate, 6, 10);
  const arrive = at(s.expectedDate, 9);
  const steps: TimelineStep[] = [];

  steps.push({ title: "Shipment created", meta: "Booked by operations", time: new Date(s.createdAt), state: "done" });

  if (s.status === "Cancelled") {
    steps.push({ title: "Shipment cancelled", meta: "No vehicle dispatched", time: null, state: "alert" });
    return steps;
  }

  const assigned = Boolean(vehicle && driver);
  steps.push({
    title: assigned ? "Vehicle and driver assigned" : "Waiting for vehicle and driver",
    meta: assigned ? `${vehicle!.reg}, ${driver!.name}` : "Assign a vehicle to dispatch",
    time: assigned ? new Date(new Date(s.createdAt).getTime() + 3 * 3_600_000) : null,
    state: assigned ? "done" : "current",
  });

  const departed = s.status !== "Pending";
  steps.push({
    title: `Loaded and dispatched from ${s.origin}`,
    meta: departed ? `${s.origin} depot` : "Scheduled departure",
    time: depart,
    state: departed ? "done" : assigned ? "current" : "upcoming",
    estimated: !departed,
  });

  // Checkpoints along the planned route.
  let cum = 0;
  const total = route.km || 1;
  let alertPlaced = false;
  route.path.slice(1, -1).forEach((town, i) => {
    cum += route.legs[i];
    const frac = cum / total;
    const passed = departed && (s.status === "Delivered" || progress >= frac);
    if (!passed && s.status === "Delayed" && !alertPlaced) {
      steps.push({ title: "Delayed", meta: s.delayReason ?? "Delay reported by driver", time: now, state: "alert" });
      alertPlaced = true;
    }
    steps.push({
      title: passed ? `Passed ${town} checkpoint` : `${town} checkpoint`,
      meta: `${Math.round(cum)} km from ${s.origin}`,
      time: new Date(depart.getTime() + frac * (arrive.getTime() - depart.getTime())),
      state: passed ? "done" : "upcoming",
      estimated: !passed,
    });
  });
  if (s.status === "Delayed" && !alertPlaced) {
    steps.push({ title: "Delayed", meta: s.delayReason ?? "Delay reported by driver", time: now, state: "alert" });
  }

  const delivered = s.status === "Delivered";
  const deliveredAt = delivered ? at(s.deliveredDate ?? s.expectedDate, 13, 40) : at(s.expectedDate, 11);
  steps.push({
    title: `Arrived at ${s.destination}`,
    meta: delivered ? `${s.destination} depot` : "Estimated",
    time: delivered ? new Date(deliveredAt.getTime() - 2 * 3_600_000) : arrive,
    state: delivered ? "done" : "upcoming",
    estimated: !delivered,
  });
  steps.push({
    title: "Delivered to consignee",
    meta: delivered ? "Proof of delivery signed" : "Proof of delivery required",
    time: deliveredAt,
    state: delivered ? "done" : "upcoming",
    estimated: !delivered,
  });

  // The first upcoming step after the last done one is current for moving shipments.
  if (s.status === "In transit" || s.status === "Dispatched") {
    const idx = steps.findIndex((x) => x.state === "upcoming");
    if (idx >= 0) steps[idx].state = "current";
  }
  return steps;
}

/** Next leg / last checkpoint text for tables. */
export function lastCheckpoint(s: Shipment, now = new Date()) {
  if (!isActive(s)) return null;
  const route = planRoute(s.origin, s.destination);
  const p = progressOf(s, now) / 100;
  let cum = 0;
  let last = s.origin;
  route.path.slice(1, -1).forEach((t, i) => {
    cum += route.legs[i];
    if (cum / (route.km || 1) <= p) last = t;
  });
  return last;
}

/** Returns a copy with vehicle and driver availability matching active trips. */
export function reconcile(data: AppData): AppData {
  const activeByVehicle = new Map<string, Shipment>();
  const activeByDriver = new Map<string, Shipment>();
  for (const s of data.shipments) {
    if (!isActive(s)) continue;
    if (s.vehicleId) activeByVehicle.set(s.vehicleId, s);
    if (s.driverId) activeByDriver.set(s.driverId, s);
  }
  const vehicles = data.vehicles.map((v) => {
    const trip = activeByVehicle.get(v.id);
    if (trip) {
      return {
        ...v,
        availability: "On trip" as const,
        location: trip.status === "Dispatched" ? trip.origin : `En route to ${trip.destination}`,
      };
    }
    if (v.maintenance === "In workshop") return { ...v, availability: "In workshop" as const };
    if (v.availability === "On trip" || v.availability === "In workshop") {
      const last = data.shipments
        .filter((s) => s.vehicleId === v.id && s.status === "Delivered")
        .sort((a, b) => (b.deliveredDate ?? "").localeCompare(a.deliveredDate ?? ""))[0];
      const loc = v.location.startsWith("En route to ") ? v.location.replace("En route to ", "") : v.location;
      return { ...v, availability: "Available" as const, location: last?.destination ?? loc };
    }
    return v;
  });
  const drivers = data.drivers.map((d) => {
    if (activeByDriver.has(d.id)) return { ...d, availability: "On trip" as const };
    if (d.availability === "On trip") return { ...d, availability: "Available" as const };
    return d;
  });
  return { ...data, vehicles, drivers };
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function lastMonths(n: number, from = today()) {
  const d = parseDate(from);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export function onTime(s: Shipment) {
  return s.status === "Delivered" && (s.deliveredDate ?? s.expectedDate) <= s.expectedDate;
}

export function nextShipmentId(shipments: Shipment[], date = today()) {
  const ym = date.slice(2, 4) + date.slice(5, 7);
  const prefix = `GT-${ym}-`;
  const max = shipments
    .filter((s) => s.id.startsWith(prefix))
    .reduce((m, s) => Math.max(m, Number(s.id.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function defaultDeparture() {
  return addDays(today(), 1);
}
