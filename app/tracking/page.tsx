"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info, PackageSearch, Search } from "lucide-react";
import { useLookups, useStore } from "@/lib/store";
import { isActive, lastCheckpoint, progressOf } from "@/lib/derive";
import { planRoute } from "@/lib/geo";
import { daysBetween, fmtDate, fmtKg, fmtNum, today } from "@/lib/format";
import { Card, DetailList, EmptyState, PageHeader, PageSkeleton, RouteLine, StatusBadge } from "@/components/ui";
import { RouteMap } from "@/components/RouteMap";
import { ShipmentTimeline } from "@/components/shipments";

function TrackingInner() {
  const { data, ready } = useStore();
  const look = useLookups();
  const params = useSearchParams();
  const router = useRouter();
  const id = (params.get("id") ?? "").toUpperCase();
  const [input, setInput] = useState(id);

  useEffect(() => setInput(id), [id]);

  const shipment = useMemo(() => data.shipments.find((s) => s.id === id), [data.shipments, id]);
  const suggestions = useMemo(
    () =>
      data.shipments
        .filter(isActive)
        .sort((a, b) => (a.status === "Delayed" ? -1 : 0) - (b.status === "Delayed" ? -1 : 0) || b.departureDate.localeCompare(a.departureDate))
        .slice(0, 6),
    [data.shipments],
  );

  const submit = (value: string) => {
    let v = value.trim().toUpperCase().replace(/\s+/g, "");
    if (/^\d{4}-?\d{1,4}$/.test(v)) v = `GT-${v}`;
    const m = v.match(/^GT-?(\d{4})-?(\d{1,4})$/);
    if (m) v = `GT-${m[1]}-${m[2].padStart(4, "0")}`;
    router.push(v ? `/tracking?id=${encodeURIComponent(v)}` : "/tracking");
  };

  if (!ready) return <PageSkeleton />;

  const progress = shipment ? progressOf(shipment) : 0;
  const route = shipment ? planRoute(shipment.origin, shipment.destination) : null;
  const vehicle = look.vehicle(shipment?.vehicleId);
  const driver = look.driver(shipment?.driverId);
  const daysLeft = shipment ? daysBetween(today(), shipment.expectedDate) : 0;

  return (
    <>
      <PageHeader title="Tracking" description="Follow a consignment from depot to delivery. Enter a shipment ID to see where it is and when it arrives." />

      <form
        className="gt-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="relative flex-1">
          <Search className="gt-icon pointer-events-none absolute left-3 top-[13px] text-ink-muted" aria-hidden />
          <input className="gt-input h-11 pl-10 text-base uppercase" value={input} onChange={(e) => setInput(e.target.value)} placeholder="GT-2611-0042" aria-label="Shipment ID" />
        </div>
        <button className="gt-btn gt-btn--primary h-11 px-6" type="submit">
          Track shipment
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-muted">On the road now:</span>
          {suggestions.map((s) => (
            <button key={s.id} className="gt-chip" aria-pressed={s.id === id} onClick={() => submit(s.id)}>
              <span className={`h-2 w-2 rounded-full ${s.status === "Delayed" ? "bg-danger" : s.status === "Dispatched" ? "bg-brand" : "bg-signal"}`} />
              <span className="gt-num">{s.id}</span>
            </button>
          ))}
        </div>
      )}

      {!id ? (
        <div className="gt-card">
          <EmptyState icon={PackageSearch} title="Enter a shipment ID to start tracking" text="IDs look like GT-2611-0042. You can also pick one of the shipments on the road above." />
        </div>
      ) : !shipment ? (
        <div className="gt-card">
          <EmptyState
            icon={PackageSearch}
            title={`No shipment found for ${id}`}
            text="Check the ID on the waybill. Shipment IDs use the format GT-YYMM-NNNN, for example GT-2611-0042."
            action={
              <Link href="/shipments" className="gt-btn gt-btn--secondary gt-btn--sm">
                Browse shipments
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="grid content-start gap-6 xl:col-span-3">
            <Card bodyClass="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <h2 className="gt-num text-lg font-bold" style={{ fontStretch: "108%" }}>
                    {shipment.id}
                  </h2>
                  <StatusBadge status={shipment.status} />
                </div>
                <span className="text-[13px] text-ink-muted">
                  {fmtNum(route!.km)} km, {progress}% covered
                </span>
              </div>
              <div className="px-5 py-5">
                <RouteLine origin={shipment.origin} destination={shipment.destination} progress={progress} originSub={`Departed ${fmtDate(shipment.departureDate)}`} destSub={shipment.status === "Delivered" ? `Delivered ${fmtDate(shipment.deliveredDate)}` : `ETA ${fmtDate(shipment.expectedDate)}`} />
              </div>
              <div className="border-t border-line">
                <RouteMap origin={shipment.origin} destination={shipment.destination} progress={progress} />
              </div>
              <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-ink-muted">
                <Info size={14} className="mt-0.5 flex-none" />
                Schematic corridor map. The truck position is estimated from the dispatch time and checkpoint reports. Live GPS positions can be added by connecting vehicle telematics.
              </p>
            </Card>
          </div>

          <div className="grid content-start gap-6 xl:col-span-2">
            <Card>
              <p className="text-[13px] text-ink-muted">{shipment.status === "Delivered" ? "Delivered on" : shipment.status === "Cancelled" ? "Status" : "Estimated delivery"}</p>
              <p className="gt-num mb-1 text-2xl font-semibold" style={{ fontStretch: "108%" }}>
                {shipment.status === "Cancelled" ? "Cancelled" : fmtDate(shipment.status === "Delivered" ? shipment.deliveredDate : shipment.expectedDate)}
              </p>
              <p className="mb-5 text-[13px]">
                {shipment.status === "Delayed" && <span className="font-semibold text-danger-text">Delayed: {shipment.delayReason}. </span>}
                {isActive(shipment) && (
                  <span className="text-ink-muted">
                    Last checkpoint {lastCheckpoint(shipment)}. {daysLeft > 0 ? `${daysLeft} day${daysLeft > 1 ? "s" : ""} to go.` : daysLeft === 0 ? "Due today." : `${-daysLeft} day${daysLeft < -1 ? "s" : ""} overdue.`}
                  </span>
                )}
                {shipment.status === "Pending" && <span className="text-ink-muted">Departs {fmtDate(shipment.departureDate)}.</span>}
              </p>
              <DetailList
                items={[
                  ["Customer", look.customer(shipment.customerId)?.company ?? "Unknown"],
                  ["Cargo", `${shipment.cargo}, ${fmtKg(shipment.weightKg)}`],
                  ["Origin", shipment.origin],
                  ["Destination", shipment.destination],
                  ["Vehicle", vehicle ? `${vehicle.reg}, ${vehicle.type}` : "Not assigned"],
                  ["Driver", driver ? `${driver.name}, ${driver.phone}` : "Not assigned"],
                ]}
              />
              <Link href={`/shipments?open=${shipment.id}`} className="gt-btn gt-btn--secondary mt-5 w-full">
                Manage shipment
              </Link>
            </Card>
            <Card title="Progress">
              <ShipmentTimeline shipment={shipment} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default function TrackingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TrackingInner />
    </Suspense>
  );
}
