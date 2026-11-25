"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock, Coins, Download, Package, Truck } from "lucide-react";
import { useLookups, useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { ACTIVE, onTime } from "@/lib/derive";
import { addDays, daysBetween, fmtDate, fmtNum, fmtPct, fmtShortDate, fmtTZS, fmtTZSShort, monthLabel, today } from "@/lib/format";
import { Card, EmptyState, Field, MetricTile, PageHeader, PageSkeleton } from "@/components/ui";
import { BarChart, CHART, HBarList, LineChart } from "@/components/charts";
import { downloadCSV } from "@/lib/csv";

type Preset = "30" | "90" | "182" | "custom";

export default function ReportsPage() {
  const { data, ready } = useStore();
  const look = useLookups();
  const toast = useToast();
  const T = today();
  const [preset, setPreset] = useState<Preset>("90");
  const [from, setFrom] = useState(addDays(T, -89));
  const [to, setTo] = useState(T);
  const [rangeError, setRangeError] = useState("");

  const range = useMemo(() => {
    if (preset === "custom") return { from, to };
    return { from: addDays(T, -(Number(preset) - 1)), to: T };
  }, [preset, from, to, T]);

  const r = useMemo(() => {
    const inRange = data.shipments.filter((s) => s.departureDate >= range.from && s.departureDate <= range.to);
    const live = inRange.filter((s) => s.status !== "Cancelled");
    const delivered = inRange.filter((s) => s.status === "Delivered");
    const due = live.filter((s) => s.expectedDate < T);
    const dueDelivered = due.filter((s) => s.status === "Delivered");
    const revenue = live.reduce((a, s) => a + s.chargeTZS, 0);
    const days = Math.max(1, daysBetween(range.from, range.to) + 1);

    // Buckets: weekly up to ~3 months, monthly beyond.
    const weekly = days <= 100;
    const buckets: { label: string; from: string; to: string }[] = [];
    if (weekly) {
      for (let start = range.from; start <= range.to; start = addDays(start, 7)) {
        const end = addDays(start, 6) > range.to ? range.to : addDays(start, 6);
        buckets.push({ label: fmtShortDate(start), from: start, to: end });
      }
    } else {
      let k = range.from.slice(0, 7);
      while (k <= range.to.slice(0, 7)) {
        buckets.push({ label: monthLabel(k), from: `${k}-01`, to: `${k}-31` });
        const [y, m] = k.split("-").map(Number);
        k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      }
    }
    const inB = (b: (typeof buckets)[0]) => inRange.filter((s) => s.departureDate >= b.from && s.departureDate <= b.to);
    const perf = buckets.map((b) => {
      const ss = inB(b);
      const del = ss.filter((s) => s.status === "Delivered");
      return {
        onTime: del.filter(onTime).length,
        late: del.filter((s) => !onTime(s)).length,
        open: ss.filter((s) => s.status === "Pending" || ACTIVE.includes(s.status)).length,
        cancelled: ss.filter((s) => s.status === "Cancelled").length,
        revenue: ss.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + s.chargeTZS, 0),
        completion: (() => {
          const d = ss.filter((s) => s.status !== "Cancelled" && s.expectedDate < T);
          return d.length ? (d.filter((s) => s.status === "Delivered").length / d.length) * 100 : null;
        })(),
        onTimeRate: del.length ? (del.filter(onTime).length / del.length) * 100 : null,
      };
    });

    // Fleet utilisation: trip-days inside the range / available vehicle-days.
    const util = data.vehicles
      .map((v) => {
        let tripDays = 0;
        data.shipments
          .filter((s) => s.vehicleId === v.id && (s.status === "Delivered" || ACTIVE.includes(s.status)))
          .forEach((s) => {
            const start = s.departureDate > range.from ? s.departureDate : range.from;
            const endRaw = s.status === "Delivered" ? (s.deliveredDate ?? s.expectedDate) : T < s.expectedDate ? T : s.expectedDate;
            const end = endRaw < range.to ? endRaw : range.to;
            if (end >= start) tripDays += daysBetween(start, end) + 1;
          });
        return { label: v.reg, sub: v.type, value: Math.min(100, (tripDays / days) * 100) };
      })
      .sort((a, b) => b.value - a.value);
    // Buckets with nothing due yet carry the previous value forward.
    let lastC = 100;
    let lastO = 100;
    const perfFilled = perf.map((p) => {
      lastC = p.completion ?? lastC;
      lastO = p.onTimeRate ?? lastO;
      return { ...p, completion: lastC, onTimeRate: lastO };
    });
    const fleetUtil = util.length ? util.reduce((a, u) => a + u.value, 0) / util.length : 0;

    // Customers.
    const byCust = new Map<string, { n: number; rev: number }>();
    live.forEach((s) => {
      const c = byCust.get(s.customerId) ?? { n: 0, rev: 0 };
      byCust.set(s.customerId, { n: c.n + 1, rev: c.rev + s.chargeTZS });
    });
    const customers = [...byCust.entries()]
      .map(([id, v]) => ({ label: look.customer(id)?.company ?? "Removed customer", sub: `${v.n} shipments`, value: v.rev }))
      .sort((a, b) => b.value - a.value);

    // Lanes.
    const lanes = new Map<string, { n: number; rev: number; transit: number[] }>();
    live.forEach((s) => {
      const k = `${s.origin} → ${s.destination}`;
      const l = lanes.get(k) ?? { n: 0, rev: 0, transit: [] };
      l.n++;
      l.rev += s.chargeTZS;
      if (s.status === "Delivered" && s.deliveredDate) l.transit.push(daysBetween(s.departureDate, s.deliveredDate));
      lanes.set(k, l);
    });
    const laneRows = [...lanes.entries()].map(([k, v]) => ({ lane: k, n: v.n, rev: v.rev, avg: v.transit.length ? v.transit.reduce((a, b) => a + b, 0) / v.transit.length : null })).sort((a, b) => b.n - a.n);

    return {
      inRange,
      delivered,
      revenue,
      completion: due.length ? (dueDelivered.length / due.length) * 100 : 0,
      onTimeRate: delivered.length ? (delivered.filter(onTime).length / delivered.length) * 100 : 0,
      buckets,
      perf: perfFilled,
      util,
      fleetUtil,
      customers,
      activeCustomers: byCust.size,
      laneRows,
      weekly,
    };
  }, [data.shipments, data.vehicles, range, T, look]);

  if (!ready) return <PageSkeleton />;

  const labels = r.buckets.map((b) => b.label);
  const exportCsv = () => {
    downloadCSV(
      `globe-trans-report-${range.from}-to-${range.to}.csv`,
      ["Period starting", "Delivered on time", "Delivered late", "Open", "Cancelled", "Revenue (TZS)", "Completion %", "On-time %"],
      r.buckets.map((b, i) => [b.from, r.perf[i].onTime, r.perf[i].late, r.perf[i].open, r.perf[i].cancelled, r.perf[i].revenue, r.perf[i].completion.toFixed(1), r.perf[i].onTimeRate.toFixed(1)]),
    );
    toast.success("Report exported", `${fmtDate(range.from)} to ${fmtDate(range.to)}.`);
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Performance from ${fmtDate(range.from)} to ${fmtDate(range.to)}, by departure date.`}
        actions={
          <button className="gt-btn gt-btn--secondary" onClick={exportCsv} disabled={r.inRange.length === 0}>
            <Download className="gt-icon" /> Export CSV
          </button>
        }
      />

      <div className="gt-card mb-6 flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
          {(
            [
              ["30", "Last 30 days"],
              ["90", "Last 90 days"],
              ["182", "Last 6 months"],
              ["custom", "Custom range"],
            ] as [Preset, string][]
          ).map(([v, l]) => (
            <button key={v} className="gt-chip" aria-pressed={preset === v} onClick={() => { setPreset(v); setRangeError(""); }}>
              {l}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-start gap-3">
            <Field label="From">
              <input
                className="gt-input gt-num"
                type="date"
                value={from}
                max={to}
                onChange={(e) => {
                  if (e.target.value > to) return setRangeError("The start date must be before the end date.");
                  setRangeError("");
                  setFrom(e.target.value);
                }}
              />
            </Field>
            <Field label="To" error={rangeError}>
              <input
                className="gt-input gt-num"
                type="date"
                value={to}
                min={from}
                onChange={(e) => {
                  if (e.target.value < from) return setRangeError("The end date must be after the start date.");
                  setRangeError("");
                  setTo(e.target.value);
                }}
              />
            </Field>
          </div>
        )}
      </div>

      {r.inRange.length === 0 ? (
        <div className="gt-card">
          <EmptyState icon={BarChart3} title="No shipments departed in this period" text="Choose a wider date range. Sample data covers the last six months." action={<button className="gt-btn gt-btn--secondary gt-btn--sm" onClick={() => setPreset("182")}>Show last 6 months</button>} />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <MetricTile icon={Package} label="Shipments" value={fmtNum(r.inRange.length)} foot={`${r.activeCustomers} active customers`} />
            <MetricTile icon={CheckCircle2} label="Completion rate" value={fmtPct(r.completion, 1)} meter={r.completion} foot="Delivered of those due before today" />
            <MetricTile icon={Clock} label="On-time delivery" value={fmtPct(r.onTimeRate, 1)} meter={r.onTimeRate} foot={`${r.delivered.length} deliveries measured`} />
            <MetricTile icon={Truck} label="Fleet utilisation" value={fmtPct(r.fleetUtil)} meter={r.fleetUtil} foot="Average days on trips per truck" />
            <MetricTile icon={Coins} label="Revenue" value={fmtTZSShort(r.revenue)} foot={`${fmtTZS(Math.round(r.revenue / Math.max(1, r.inRange.length)))} per shipment`} />
          </div>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card title={`Shipment performance, ${r.weekly ? "by week" : "by month"}`}>
              <BarChart
                stacked
                labels={labels}
                series={[
                  { key: "ot", label: "Delivered on time", color: CHART.success, values: r.perf.map((p) => p.onTime) },
                  { key: "late", label: "Delivered late", color: CHART.danger, values: r.perf.map((p) => p.late) },
                  { key: "open", label: "Active or pending", color: CHART.signal, values: r.perf.map((p) => p.open) },
                  { key: "c", label: "Cancelled", color: CHART.muted, values: r.perf.map((p) => p.cancelled) },
                ]}
                height={260}
              />
            </Card>
            <Card title="Completion and on-time rates">
              <LineChart
                labels={labels}
                area={false}
                series={[
                  { key: "comp", label: "Completion rate", color: CHART.brand, values: r.perf.map((p) => Math.round(p.completion)) },
                  { key: "ot", label: "On-time rate", color: CHART.signal, values: r.perf.map((p) => Math.round(p.onTimeRate)) },
                ]}
                format={(n) => `${n}%`}
                height={260}
              />
            </Card>
          </div>

          <Card title="Revenue trend" className="mb-6">
            <LineChart labels={labels} series={[{ key: "rev", label: "Revenue", color: CHART.brand, values: r.perf.map((p) => p.revenue) }]} format={fmtTZS} axisFormat={(n) => (n >= 1e6 ? `${Math.round(n / 1e6)}M` : String(n))} height={240} />
          </Card>

          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card title="Fleet utilisation by vehicle">
              <HBarList items={r.util.slice(0, 10).map((u) => ({ ...u, value: Math.round(u.value) }))} format={(n) => `${n}%`} color={CHART.signal} max={100} />
              {r.util.length > 10 && <p className="mt-3 text-xs text-ink-muted">Showing the 10 busiest of {r.util.length} vehicles.</p>}
            </Card>
            <Card title="Customer activity, by revenue">
              <HBarList items={r.customers.slice(0, 8)} format={fmtTZSShort} color={CHART.brand} />
            </Card>
          </div>

          <Card title="Busiest lanes" bodyClass="p-0">
            <div className="overflow-x-auto">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th className="gt-r">Shipments</th>
                    <th className="gt-r">Average transit</th>
                    <th className="gt-r">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {r.laneRows.slice(0, 10).map((l) => (
                    <tr key={l.lane}>
                      <td className="font-semibold">{l.lane}</td>
                      <td className="gt-r">{l.n}</td>
                      <td className="gt-r">{l.avg === null ? <span className="text-ink-muted">No deliveries</span> : `${l.avg.toFixed(1)} days`}</td>
                      <td className="gt-r">{fmtTZS(l.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
