"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Package, Plus, Truck, Wrench, PackageCheck, PackageOpen } from "lucide-react";
import { useLookups, useStore } from "@/lib/store";
import { ACTIVE, isActive, lastMonths, monthKey, progressOf } from "@/lib/derive";
import { addDays, fmtDate, fmtNum, fmtRelative, fmtShortDate, fmtTZS, fmtTZSShort, monthLabel, today } from "@/lib/format";
import { SHIPMENT_STATUSES, type Shipment } from "@/lib/types";
import { Card, MetricTile, PageHeader, PageSkeleton, RouteLine, StatusBadge } from "@/components/ui";
import { BarChart, CHART, Donut } from "@/components/charts";
import { ShipmentDrawer, ShipmentFormModal } from "@/components/shipments";

const STATUS_COLOR: Record<string, string> = {
  Pending: CHART.muted,
  Dispatched: CHART.brand,
  "In transit": CHART.signal,
  Delayed: CHART.danger,
  Delivered: CHART.success,
  Cancelled: "#d3d9d7",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const { data, ready } = useStore();
  const look = useLookups();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Shipment | null>(null);

  const m = useMemo(() => {
    const S = data.shipments;
    const T = today();
    const months = lastMonths(6);
    const thisMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const revenueBy = (k: string) => S.filter((s) => s.status !== "Cancelled" && monthKey(s.departureDate) === k).reduce((a, s) => a + s.chargeTZS, 0);
    const active = S.filter(isActive);
    const delivered = S.filter((s) => s.status === "Delivered");
    const deliveredThisMonth = delivered.filter((s) => monthKey(s.deliveredDate ?? s.expectedDate) === thisMonth);
    const pending = S.filter((s) => s.status === "Pending");
    const pendingUnassigned = pending.filter((s) => !s.vehicleId);
    const vehicles = data.vehicles;
    const available = vehicles.filter((v) => v.availability === "Available");
    const activeYesterday = S.filter((s) => s.departureDate <= addDays(T, -1) && s.expectedDate >= addDays(T, -1) && s.status !== "Cancelled" && s.status !== "Pending").length;
    const statusCounts = SHIPMENT_STATUSES.map((st) => ({ label: st, value: S.filter((s) => s.status === st).length, color: STATUS_COLOR[st] }));
    const monthly = months.map((k) => {
      const inMonth = S.filter((s) => monthKey(s.departureDate) === k);
      return {
        delivered: inMonth.filter((s) => s.status === "Delivered").length,
        active: inMonth.filter((s) => ACTIVE.includes(s.status) || s.status === "Pending").length,
        cancelled: inMonth.filter((s) => s.status === "Cancelled").length,
      };
    });
    const revenue = months.map(revenueBy);
    const attention = [
      ...S.filter((s) => s.status === "Delayed").map((s) => ({ kind: "delay" as const, key: s.id, title: `${s.id} delayed`, text: s.delayReason ?? "Delay reported", href: s.id })),
      ...pendingUnassigned
        .filter((s) => s.departureDate <= addDays(T, 2))
        .map((s) => ({ kind: "assign" as const, key: s.id, title: `${s.id} needs a vehicle`, text: `Departs ${fmtDate(s.departureDate)}, ${s.origin} → ${s.destination}`, href: s.id })),
      ...vehicles
        .filter((v) => v.maintenance !== "Good")
        .map((v) => ({ kind: "fleet" as const, key: v.id, title: `${v.reg} ${v.maintenance === "In workshop" ? "in workshop" : "due for service"}`, text: v.maintenance === "In workshop" ? `${v.make}, back in service soon` : `Service in ${fmtNum(v.nextServiceKm - v.odometerKm)} km`, href: `/fleet?q=${encodeURIComponent(v.reg)}` })),
    ];
    return {
      total: S.length,
      totalThisMonth: S.filter((s) => monthKey(s.departureDate) === thisMonth).length,
      active,
      activeDelta: active.length - activeYesterday,
      delivered,
      deliveredThisMonth,
      pending,
      pendingUnassigned,
      vehicles,
      available,
      statusCounts,
      months,
      monthly,
      revenue,
      revThis: revenueBy(thisMonth),
      revPrev: revenueBy(prevMonth),
      attention,
      recent: [...S].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    };
  }, [data.shipments, data.vehicles]);

  if (!ready) return <PageSkeleton />;

  const revChange = m.revPrev ? ((m.revThis - m.revPrev) / m.revPrev) * 100 : 0;
  const firstName = data.settings.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`${fmtDate(today())}. ${m.active.length} shipments on the road, ${m.attention.filter((a) => a.kind === "delay").length} delayed, ${m.available.length} trucks ready for loading.`}
        actions={
          <>
            <Link href="/tracking" className="gt-btn gt-btn--secondary">
              Track a shipment
            </Link>
            <button className="gt-btn gt-btn--primary" onClick={() => setCreateOpen(true)}>
              <Plus className="gt-icon" /> Create shipment
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricTile icon={Package} label="Total shipments" value={fmtNum(m.total)} foot={`${m.totalThisMonth} booked this month`} href="/shipments" />
        <MetricTile icon={Truck} label="Active deliveries" value={fmtNum(m.active.length)} foot={<><span className={m.activeDelta >= 0 ? "font-semibold text-success-text" : "font-semibold text-danger-text"}>{m.activeDelta >= 0 ? "+" : "−"}{Math.abs(m.activeDelta)}</span> since yesterday</>} href="/shipments?status=active" />
        <MetricTile icon={PackageCheck} label="Completed deliveries" value={fmtNum(m.delivered.length)} foot={`${m.deliveredThisMonth.length} delivered this month`} href="/shipments?status=Delivered" />
        <MetricTile icon={PackageOpen} label="Pending shipments" value={fmtNum(m.pending.length)} foot={`${m.pendingUnassigned.length} without a vehicle`} href="/shipments?status=Pending" />
        <MetricTile icon={Truck} label="Fleet vehicles" value={fmtNum(m.vehicles.length)} foot={`${m.vehicles.filter((v) => v.availability === "On trip").length} on trips now`} href="/fleet" />
        <MetricTile icon={CheckCircle2} label="Available vehicles" value={String(m.available.length)} unit={`/ ${m.vehicles.length}`} meter={(m.available.length / Math.max(1, m.vehicles.length)) * 100} href="/fleet?availability=Available" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Revenue overview"
          action={
            <Link href="/reports" className="text-[13px] font-semibold text-brand-text hover:underline">
              Open reports
            </Link>
          }
        >
          <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <p className="text-[13px] text-ink-muted">Freight billed in {monthLabel(m.months[5])}</p>
              <p className="gt-num text-[28px] font-semibold leading-9">{fmtTZS(m.revThis)}</p>
            </div>
            <p className="pb-1.5 text-[13px] text-ink-muted">
              <span className={`font-semibold ${revChange >= 0 ? "text-success-text" : "text-danger-text"}`}>
                {revChange >= 0 ? "+" : "−"}
                {Math.abs(revChange).toFixed(1)}%
              </span>{" "}
              vs {monthLabel(m.months[4])}
            </p>
            <p className="pb-1.5 text-[13px] text-ink-muted">
              6-month total <span className="gt-num font-semibold text-ink">{fmtTZSShort(m.revenue.reduce((a, b) => a + b, 0))}</span>
            </p>
          </div>
          <BarChart labels={m.months.map(monthLabel)} series={[{ key: "rev", label: "Revenue", color: CHART.brand, values: m.revenue }]} format={fmtTZS} axisFormat={(n) => (n >= 1e6 ? `${Math.round(n / 1e6)}M` : String(n))} height={230} />
        </Card>

        <Card title="Shipment status">
          <Donut items={m.statusCounts.filter((x) => x.value > 0)} centerValue={fmtNum(m.total)} centerLabel="shipments" onSelect={(label) => router.push(`/shipments?status=${encodeURIComponent(label)}`)} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Monthly shipments">
          <BarChart
            stacked
            labels={m.months.map(monthLabel)}
            series={[
              { key: "d", label: "Delivered", color: CHART.success, values: m.monthly.map((x) => x.delivered) },
              { key: "a", label: "Active and pending", color: CHART.signal, values: m.monthly.map((x) => x.active) },
              { key: "c", label: "Cancelled", color: CHART.muted, values: m.monthly.map((x) => x.cancelled) },
            ]}
            height={230}
          />
        </Card>

        <Card title="Needs attention" bodyClass="p-0">
          {m.attention.length === 0 ? (
            <p className="p-5 text-ink-muted">Nothing needs attention. All trips are on schedule.</p>
          ) : (
            <ul className="max-h-[300px] overflow-auto">
              {m.attention.slice(0, 8).map((a) => {
                const Icon = a.kind === "delay" ? AlertTriangle : a.kind === "assign" ? Clock : Wrench;
                const tone = a.kind === "delay" ? "bg-danger-soft text-danger-text" : a.kind === "assign" ? "bg-signal-soft text-signal-text" : "bg-surface-2 text-ink-muted";
                const inner = (
                  <>
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-full ${tone}`}>
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{a.title}</span>
                      <span className="block truncate text-[13px] text-ink-muted">{a.text}</span>
                    </span>
                  </>
                );
                return (
                  <li key={a.kind + a.key} className="border-b border-line last:border-0">
                    {a.href.startsWith("/") ? (
                      <Link href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                        {inner}
                      </Link>
                    ) : (
                      <button className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-2" onClick={() => setOpenId(a.href)}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Recent shipments"
          bodyClass="p-0"
          action={
            <Link href="/shipments" className="text-[13px] font-semibold text-brand-text hover:underline">
              View all
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="gt-table">
              <thead>
                <tr>
                  <th>Shipment</th>
                  <th>Customer</th>
                  <th className="min-w-[220px]">Route</th>
                  <th>Expected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {m.recent.map((s) => (
                  <tr key={s.id} className="is-clickable" onClick={() => setOpenId(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)}>
                    <td>
                      <span className="gt-id">{s.id}</span>
                    </td>
                    <td className="max-w-[200px] truncate font-semibold">{look.customer(s.customerId)?.company}</td>
                    <td>
                      <RouteLine compact origin={s.origin} destination={s.destination} progress={progressOf(s)} />
                    </td>
                    <td className="gt-num">{fmtShortDate(s.expectedDate)}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent activity" bodyClass="p-0">
          <ul className="max-h-[360px] overflow-auto">
            {data.activities.slice(0, 9).map((a) => (
              <li key={a.id} className="flex gap-3 border-b border-line px-5 py-3 last:border-0">
                <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${a.text.includes("Delayed") ? "bg-danger" : a.text.includes("delivered") ? "bg-success" : a.kind === "status" ? "bg-signal" : "bg-[color:var(--line-strong)]"}`} />
                <span className="min-w-0">
                  {a.ref && data.shipments.some((s) => s.id === a.ref) ? (
                    <button className="text-left text-[13px] leading-[19px] hover:underline" onClick={() => setOpenId(a.ref!)}>
                      {a.text}
                    </button>
                  ) : (
                    <span className="block text-[13px] leading-[19px]">{a.text}</span>
                  )}
                  <span className="block text-xs text-ink-muted">{fmtRelative(a.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ShipmentFormModal open={createOpen || !!editing} shipment={editing} onClose={() => { setCreateOpen(false); setEditing(null); }} onSaved={(s) => setOpenId(s.id)} />
      <ShipmentDrawer shipmentId={openId} onClose={() => setOpenId(null)} onEdit={(s) => { setEditing(s); setOpenId(null); }} />
    </>
  );
}
