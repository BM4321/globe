"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, AppData, Customer, Driver, Settings, Shipment, ShipmentStatus, Vehicle } from "./types";
import { buildSeed, DATA_VERSION } from "./seed";
import { nextShipmentId, reconcile } from "./derive";
import { today, uid } from "./format";

const KEY = "globe-trans:data";

export type ShipmentInput = Omit<Shipment, "id" | "createdAt" | "status" | "deliveredDate"> & {
  status?: ShipmentStatus;
};

interface Store {
  ready: boolean;
  data: AppData;
  createShipment: (input: ShipmentInput) => Shipment;
  updateShipment: (id: string, patch: Partial<Shipment>) => void;
  deleteShipment: (id: string) => void;
  setShipmentStatus: (id: string, status: ShipmentStatus, reason?: string) => void;
  assignShipment: (id: string, vehicleId: string | null, driverId: string | null) => void;
  saveVehicle: (v: Omit<Vehicle, "id"> & { id?: string }) => Vehicle;
  deleteVehicle: (id: string) => void;
  saveDriver: (d: Omit<Driver, "id"> & { id?: string }) => Driver;
  deleteDriver: (id: string) => void;
  saveCustomer: (c: Omit<Customer, "id"> & { id?: string }) => Customer;
  deleteCustomer: (id: string) => void;
  updateSettings: (s: Settings) => void;
  resetDemo: () => void;
}

const Ctx = createContext<Store | null>(null);

function load(): AppData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed.version === DATA_VERSION && Array.isArray(parsed.shipments)) return parsed;
    }
  } catch {
    // Storage unavailable or corrupted: fall back to fresh demo data.
  }
  return buildSeed();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => ({
    version: DATA_VERSION,
    shipments: [],
    vehicles: [],
    drivers: [],
    customers: [],
    activities: [],
    settings: buildSeed().settings,
  }));
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    setData(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Ignore quota or privacy-mode errors; the session still works in memory.
    }
  }, [data, ready]);

  const commit = useCallback((fn: (d: AppData) => AppData, activity?: Omit<Activity, "id" | "at">) => {
    setData((prev) => {
      let next = reconcile(fn(prev));
      if (activity) {
        next = {
          ...next,
          activities: [{ ...activity, id: uid("act"), at: new Date().toISOString() }, ...next.activities].slice(0, 60),
        };
      }
      return next;
    });
  }, []);

  const store = useMemo<Store>(() => {
    const vehicleReg = (id: string | null) => dataRef.current.vehicles.find((v) => v.id === id)?.reg;
    return {
      ready,
      data,
      createShipment(input) {
        const s: Shipment = {
          ...input,
          id: nextShipmentId(dataRef.current.shipments),
          status: input.status ?? "Pending",
          deliveredDate: null,
          createdAt: new Date().toISOString(),
        };
        const company = dataRef.current.customers.find((c) => c.id === s.customerId)?.company ?? "customer";
        commit((d) => ({ ...d, shipments: [...d.shipments, s] }), { kind: "shipment", text: `${s.id} created for ${company}`, ref: s.id });
        return s;
      },
      updateShipment(id, patch) {
        commit((d) => ({ ...d, shipments: d.shipments.map((s) => (s.id === id ? { ...s, ...patch } : s)) }), {
          kind: "shipment",
          text: `${id} details updated`,
          ref: id,
        });
      },
      deleteShipment(id) {
        commit((d) => ({ ...d, shipments: d.shipments.filter((s) => s.id !== id) }), { kind: "shipment", text: `${id} deleted`, ref: id });
      },
      setShipmentStatus(id, status, reason) {
        const s = dataRef.current.shipments.find((x) => x.id === id);
        let text = `${id} marked ${status}`;
        if (status === "Dispatched" && s) text = `${id} dispatched from ${s.origin}${s.vehicleId ? ` on ${vehicleReg(s.vehicleId)}` : ""}`;
        if (status === "Delivered" && s) text = `${id} delivered in ${s.destination}`;
        if (status === "Delayed" && reason) text = `${id} marked Delayed: ${reason}`;
        commit(
          (d) => ({
            ...d,
            shipments: d.shipments.map((x) =>
              x.id === id
                ? {
                    ...x,
                    status,
                    departureDate: status === "Dispatched" && x.departureDate > today() ? today() : x.departureDate,
                    delayReason: status === "Delayed" ? reason || x.delayReason : x.delayReason,
                    deliveredDate: status === "Delivered" ? today() : status === "Cancelled" ? null : x.deliveredDate,
                  }
                : x,
            ),
          }),
          { kind: "status", text, ref: id },
        );
      },
      assignShipment(id, vehicleId, driverId) {
        const reg = vehicleReg(vehicleId);
        const name = dataRef.current.drivers.find((x) => x.id === driverId)?.name;
        commit(
          (d) => ({ ...d, shipments: d.shipments.map((s) => (s.id === id ? { ...s, vehicleId, driverId } : s)) }),
          { kind: "shipment", text: `${id} assigned to ${[reg, name].filter(Boolean).join(" and ") || "no vehicle"}`, ref: id },
        );
      },
      saveVehicle(v) {
        const isNew = !v.id;
        const saved: Vehicle = { ...v, id: v.id ?? uid("veh") } as Vehicle;
        commit(
          (d) => {
            let drivers = d.drivers;
            // Keep the driver <-> vehicle link one-to-one.
            drivers = drivers.map((dr) => {
              if (dr.id === saved.driverId) return { ...dr, vehicleId: saved.id };
              if (dr.vehicleId === saved.id && dr.id !== saved.driverId) return { ...dr, vehicleId: null };
              return dr;
            });
            let vehicles = d.vehicles.map((x) => (x.id !== saved.id && saved.driverId && x.driverId === saved.driverId ? { ...x, driverId: null } : x));
            vehicles = isNew ? [...vehicles, saved] : vehicles.map((x) => (x.id === saved.id ? saved : x));
            return { ...d, vehicles, drivers };
          },
          { kind: "fleet", text: `Vehicle ${saved.reg} ${isNew ? "added" : "updated"}` },
        );
        return saved;
      },
      deleteVehicle(id) {
        const reg = vehicleReg(id);
        commit(
          (d) => ({
            ...d,
            vehicles: d.vehicles.filter((v) => v.id !== id),
            drivers: d.drivers.map((dr) => (dr.vehicleId === id ? { ...dr, vehicleId: null } : dr)),
            shipments: d.shipments.map((s) => (s.vehicleId === id && s.status === "Pending" ? { ...s, vehicleId: null } : s)),
          }),
          { kind: "fleet", text: `Vehicle ${reg} deleted` },
        );
      },
      saveDriver(dr) {
        const isNew = !dr.id;
        const saved: Driver = { ...dr, id: dr.id ?? uid("drv") } as Driver;
        commit(
          (d) => {
            const vehicles = d.vehicles.map((v) => {
              if (v.id === saved.vehicleId) return { ...v, driverId: saved.id };
              if (v.driverId === saved.id && v.id !== saved.vehicleId) return { ...v, driverId: null };
              return v;
            });
            let drivers = d.drivers.map((x) => (x.id !== saved.id && saved.vehicleId && x.vehicleId === saved.vehicleId ? { ...x, vehicleId: null } : x));
            drivers = isNew ? [...drivers, saved] : drivers.map((x) => (x.id === saved.id ? saved : x));
            return { ...d, drivers, vehicles };
          },
          { kind: "driver", text: `Driver ${saved.name} ${isNew ? "registered" : "updated"}` },
        );
        return saved;
      },
      deleteDriver(id) {
        const name = dataRef.current.drivers.find((x) => x.id === id)?.name;
        commit(
          (d) => ({
            ...d,
            drivers: d.drivers.filter((x) => x.id !== id),
            vehicles: d.vehicles.map((v) => (v.driverId === id ? { ...v, driverId: null } : v)),
            shipments: d.shipments.map((s) => (s.driverId === id && s.status === "Pending" ? { ...s, driverId: null } : s)),
          }),
          { kind: "driver", text: `Driver ${name} removed` },
        );
      },
      saveCustomer(c) {
        const isNew = !c.id;
        const saved: Customer = { ...c, id: c.id ?? uid("cus") } as Customer;
        commit(
          (d) => ({ ...d, customers: isNew ? [...d.customers, saved] : d.customers.map((x) => (x.id === saved.id ? saved : x)) }),
          { kind: "customer", text: `${saved.company} ${isNew ? "registered as a customer" : "account updated"}` },
        );
        return saved;
      },
      deleteCustomer(id) {
        const name = dataRef.current.customers.find((x) => x.id === id)?.company;
        commit((d) => ({ ...d, customers: d.customers.filter((x) => x.id !== id) }), { kind: "customer", text: `${name} removed` });
      },
      updateSettings(settings) {
        commit((d) => ({ ...d, settings }), { kind: "settings", text: "Settings updated" });
      },
      resetDemo() {
        const fresh = buildSeed();
        setData(fresh);
      },
    };
  }, [data, ready, commit]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** Lookup helpers bound to current data. */
export function useLookups() {
  const { data } = useStore();
  return useMemo(() => {
    const customers = new Map(data.customers.map((c) => [c.id, c]));
    const vehicles = new Map(data.vehicles.map((v) => [v.id, v]));
    const drivers = new Map(data.drivers.map((d) => [d.id, d]));
    return {
      customer: (id: string | null | undefined) => (id ? customers.get(id) : undefined),
      vehicle: (id: string | null | undefined) => (id ? vehicles.get(id) : undefined),
      driver: (id: string | null | undefined) => (id ? drivers.get(id) : undefined),
    };
  }, [data.customers, data.vehicles, data.drivers]);
}
