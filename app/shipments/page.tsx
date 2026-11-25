"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, Package, Pencil, Plus, RefreshCw, Trash2, Truck } from "lucide-react";
import { useLookups, useStore } from "@/lib/store";
import { useToast } from "@/lib/toast";
import { ACTIVE, progressOf } from "@/lib/derive";
import { fmtKg, fmtShortDate } from "@/lib/format";
import { SHIPMENT_STATUSES, type Shipment, type ShipmentStatus } from "@/lib/types";
import { Chips, ConfirmDialog, EmptyState, PageHeader, Pagination, RouteLine, RowMenu, SearchInput, StatusBadge, TableSkeleton } from "@/components/ui";
import { AssignModal, ShipmentDrawer, ShipmentFormModal, StatusModal } from "@/components/shipments";
import { downloadCSV } from "@/lib/csv";

type Filter = "all" | "active" | ShipmentStatus;
type Sort = "created" | "departure" | "expected";
const PAGE = 15;

function ShipmentsInner() {
  const { data, ready, deleteShipment } = useStore();
  const look = useLookups();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<Filter>((params.get("status") as Filter) ?? "all");
  const [sort, setSort] = useState<Sort>("created");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [formOpen, setFormOpen] = useState(params.get("new") === "1");
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [assignFor, setAssignFor] = useState<Shipment | null>(null);
  const [statusFor, setStatusFor] = useState<Shipment | null>(null);
  const [deleteFor, setDeleteFor] = useState<Shipment | null>(null);

  // React to links from elsewhere (global search, dashboard tiles).
  useEffect(() => {
    const st = params.get("status") as Filter | null;
    if (st) setFilter(st);
    const open = params.get("open");
    if (open) setOpenId(open);
    const qq = params.get("q");
    if (qq !== null) setQ(qq);
  }, [params]);

  useEffect(() => setPage(1), [q, filter, sort]);

  const searched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data.shipments;
    return data.shipments.filter((s) => {
      const c = look.customer(s.customerId);
      const v = look.vehicle(s.vehicleId);
      const d = look.driver(s.driverId);
      return [s.id, s.origin, s.destination, s.cargo, c?.company, v?.reg, d?.name].some((x) => x?.toLowerCase().includes(t));
    });
  }, [data.shipments, q, look]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searched.length, active: searched.filter((s) => ACTIVE.includes(s.status)).length };
    for (const st of SHIPMENT_STATUSES) c[st] = searched.filter((s) => s.status === st).length;
    return c;
  }, [searched]);

  const rows = useMemo(() => {
    const list = searched.filter((s) => (filter === "all" ? true : filter === "active" ? ACTIVE.includes(s.status) : s.status === filter));
    const key = sort === "created" ? "createdAt" : sort === "departure" ? "departureDate" : "expectedDate";
    return [...list].sort((a, b) => String(b[key]).localeCompare(String(a[key])));
  }, [searched, filter, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);

  const clearUrl = () => router.replace("/shipments", { scroll: false });

  const exportCsv = () => {
    downloadCSV(
      `globe-trans-shipments-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Shipment ID", "Customer", "Origin", "Destination", "Cargo", "Weight (kg)", "Vehicle", "Driver", "Departure", "Expected delivery", "Status", "Charge (TZS)"],
      rows.map((s) => [s.id, look.customer(s.customerId)?.company ?? "", s.origin, s.destination, s.cargo, s.weightKg, look.vehicle(s.vehicleId)?.reg ?? "", look.driver(s.driverId)?.name ?? "", s.departureDate, s.expectedDate, s.status, s.chargeTZS]),
    );
    toast.success(`Exported ${rows.length} shipments`, "The CSV file is in your downloads.");
  };

  const menu = (s: Shipment) => [
    { label: "View details", icon: Eye, onClick: () => setOpenId(s.id) },
    { label: "Edit shipment", icon: Pencil, onClick: () => setEditing(s) },
    ...(s.status !== "Delivered" && s.status !== "Cancelled" ? [{ label: s.vehicleId ? "Change assignment" : "Assign vehicle", icon: Truck, onClick: () => setAssignFor(s) }] : []),
    ...(s.status !== "Delivered" ? [{ label: "Update status", icon: RefreshCw, onClick: () => setStatusFor(s) }] : []),
    { label: "Delete shipment", icon: Trash2, onClick: () => setDeleteFor(s), danger: true },
  ];

  const filterOptions: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "active", label: "On the road", count: counts.active },
    ...SHIPMENT_STATUSES.map((st) => ({ value: st as Filter, label: st, count: counts[st] })),
  ];

  return (
    <>
      <PageHeader
        title="Shipments"
        description="Book consignments, assign trucks and drivers, and keep every status current."
        actions={
          <>
            <button className="gt-btn gt-btn--secondary" onClick={exportCsv} disabled={!ready || rows.length === 0}>
              <Download className="gt-icon" /> Export CSV
            </button>
            <button className="gt-btn gt-btn--primary" onClick={() => setFormOpen(true)}>
              <Plus className="gt-icon" /> Create shipment
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search by shipment ID, customer, town, registration or driver" className="w-full lg:max-w-[440px]" />
        <label className="flex items-center gap-2 text-[13px] text-ink-muted lg:ml-auto">
          Sort by
          <select className="gt-input h-9 w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="created">Newest booked</option>
            <option value="departure">Departure date</option>
            <option value="expected">Expected delivery</option>
          </select>
        </label>
      </div>
      <div className="mb-4">
        <Chips label="Filter by status" options={filterOptions} value={filter} onChange={(v) => { setFilter(v); clearUrl(); }} />
      </div>

      {!ready ? (
        <TableSkeleton rows={10} />
      ) : (
        <div className="gt-card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={Package}
              title={q ? `No shipments match “${q.trim()}”` : "No shipments with this status"}
              text={q ? "Check the spelling, clear the search, or create a shipment for this customer." : "Choose another status, or create a shipment."}
              action={
                <>
                  {(q || filter !== "all") && (
                    <button className="gt-btn gt-btn--secondary gt-btn--sm" onClick={() => { setQ(""); setFilter("all"); clearUrl(); }}>
                      Clear filters
                    </button>
                  )}
                  <button className="gt-btn gt-btn--primary gt-btn--sm" onClick={() => setFormOpen(true)}>
                    Create shipment
                  </button>
                </>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="gt-table">
                  <thead>
                    <tr>
                      <th>Shipment</th>
                      <th>Customer and cargo</th>
                      <th className="min-w-[230px]">Route</th>
                      <th>Vehicle and driver</th>
                      <th className="gt-r">Weight</th>
                      <th>Departure</th>
                      <th>Expected</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((s) => {
                      const v = look.vehicle(s.vehicleId);
                      const d = look.driver(s.driverId);
                      return (
                        <tr key={s.id} className="is-clickable" aria-selected={openId === s.id} onClick={() => setOpenId(s.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)}>
                          <td>
                            <span className="gt-id">{s.id}</span>
                          </td>
                          <td className="max-w-[240px]">
                            <span className="block truncate font-semibold">{look.customer(s.customerId)?.company ?? "Unknown customer"}</span>
                            <span className="gt-sub truncate">{s.cargo}</span>
                          </td>
                          <td>
                            <RouteLine compact origin={s.origin} destination={s.destination} progress={progressOf(s)} />
                          </td>
                          <td>
                            {v ? (
                              <>
                                <span className="gt-num">{v.reg}</span>
                                <span className="gt-sub">{d?.name ?? "No driver"}</span>
                              </>
                            ) : (
                              <span className="text-ink-muted">Not assigned</span>
                            )}
                          </td>
                          <td className="gt-r">{fmtKg(s.weightKg)}</td>
                          <td className="gt-num">{fmtShortDate(s.departureDate)}</td>
                          <td className="gt-num">{fmtShortDate(s.expectedDate)}</td>
                          <td>
                            <StatusBadge status={s.status} />
                          </td>
                          <td className="w-10 pr-2">
                            <RowMenu items={menu(s)} label={`Actions for ${s.id}`} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <ul className="md:hidden">
                {pageRows.map((s) => (
                  <li key={s.id} className="border-b border-line last:border-0">
                    <button className="grid w-full gap-2 px-4 py-3.5 text-left hover:bg-surface-2" onClick={() => setOpenId(s.id)}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="gt-id">{s.id}</span>
                        <StatusBadge status={s.status} />
                      </span>
                      <span className="truncate font-semibold">{look.customer(s.customerId)?.company}</span>
                      <RouteLine compact origin={s.origin} destination={s.destination} progress={progressOf(s)} />
                      <span className="gt-num text-xs text-ink-muted">
                        {fmtKg(s.weightKg)}, expected {fmtShortDate(s.expectedDate)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination page={page} pages={pages} total={rows.length} pageSize={PAGE} onPage={setPage} />
            </>
          )}
        </div>
      )}

      <ShipmentFormModal
        open={formOpen || !!editing}
        shipment={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(s) => {
          setFilter("all");
          setQ("");
          setOpenId(s.id);
        }}
      />
      <ShipmentDrawer
        shipmentId={openId}
        onClose={() => {
          setOpenId(null);
          if (params.get("open")) clearUrl();
        }}
        onEdit={(s) => {
          setOpenId(null);
          setEditing(s);
        }}
      />
      <AssignModal open={!!assignFor} shipment={assignFor} onClose={() => setAssignFor(null)} />
      <StatusModal open={!!statusFor} shipment={statusFor} onClose={() => setStatusFor(null)} onNeedAssign={() => setAssignFor(statusFor)} />
      <ConfirmDialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        title={`Delete ${deleteFor?.id}?`}
        text="The shipment and its history will be removed. Any assigned vehicle and driver become available. This cannot be undone."
        confirmLabel={`Delete ${deleteFor?.id}`}
        onConfirm={() => {
          if (!deleteFor) return;
          deleteShipment(deleteFor.id);
          toast.success(`Shipment ${deleteFor.id} deleted`);
        }}
      />
    </>
  );
}

export default function ShipmentsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <ShipmentsInner />
    </Suspense>
  );
}
