"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Building2,
  IdCard,
  LayoutDashboard,
  Menu,
  Package,
  Route,
  Search,
  Settings,
  Truck,
  X,
} from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { ToastProvider } from "@/lib/toast";
import { isActive } from "@/lib/derive";
import { fmtRelative } from "@/lib/format";
import { StatusBadge } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shipments", label: "Shipments", icon: Package, count: "active" as const },
  { href: "/fleet", label: "Fleet", icon: Truck, count: "workshop" as const },
  { href: "/drivers", label: "Drivers", icon: IdCard },
  { href: "/customers", label: "Customers", icon: Building2 },
  { href: "/tracking", label: "Tracking", icon: Route },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function Wordmark({ nav = false, sub = true }: { nav?: boolean; sub?: boolean }) {
  return (
    <span className={`gt-wordmark ${nav ? "gt-wordmark--nav" : ""}`}>
      <span className="gt-wordmark__tile">GT</span>
      <span>
        <span className="gt-wordmark__name">Globe Trans</span>
        {sub && <span className="gt-wordmark__sub">Management System</span>}
      </span>
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data, ready } = useStore();
  const counts = useMemo(
    () => ({
      active: data.shipments.filter(isActive).length,
      workshop: data.vehicles.filter((v) => v.availability === "In workshop").length,
    }),
    [data.shipments, data.vehicles],
  );
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-0.5 bg-nav px-3 py-4 text-[color:var(--on-nav)]">
      <Link href="/" className="mb-5 px-2 py-1" onClick={onNavigate} aria-label="Globe Trans dashboard">
        <Wordmark nav />
      </Link>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="gt-nav__item" aria-current={current(n.href) ? "page" : undefined} onClick={onNavigate}>
          <n.icon className="gt-icon" aria-hidden />
          {n.label}
          {ready && n.count && counts[n.count] > 0 && (
            <span className="gt-nav__count" aria-label={n.count === "active" ? `${counts.active} active shipments` : `${counts.workshop} vehicles in the workshop`}>
              {counts[n.count]}
            </span>
          )}
        </Link>
      ))}
      <div className="px-2.5 pb-1.5 pt-5 text-xs opacity-80">Workspace</div>
      <Link href="/settings" className="gt-nav__item" aria-current={current("/settings") ? "page" : undefined} onClick={onNavigate}>
        <Settings className="gt-icon" aria-hidden />
        Settings
      </Link>
      <div className="mt-auto rounded-md border border-white/10 p-3 text-xs leading-[17px]">
        <span className="block font-semibold text-white">Demo environment</span>
        Sample data is stored in this browser. Reset it any time from Settings.
      </div>
    </nav>
  );
}

function GlobalSearch() {
  const { data } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const custName = new Map(data.customers.map((c) => [c.id, c.company]));
    const ships = data.shipments
      .filter((s) => s.id.toLowerCase().includes(t) || (custName.get(s.customerId) ?? "").toLowerCase().includes(t))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((s) => ({ key: s.id, title: s.id, sub: `${custName.get(s.customerId) ?? ""}, ${s.origin} → ${s.destination}`, href: `/shipments?open=${s.id}`, status: s.status }));
    const vehs = data.vehicles
      .filter((v) => v.reg.toLowerCase().replace(/\s/g, "").includes(t.replace(/\s/g, "")))
      .slice(0, 3)
      .map((v) => ({ key: v.id, title: v.reg, sub: `${v.make}, ${v.location}`, href: `/fleet?q=${encodeURIComponent(v.reg)}`, status: undefined }));
    const drv = data.drivers
      .filter((d) => d.name.toLowerCase().includes(t))
      .slice(0, 3)
      .map((d) => ({ key: d.id, title: d.name, sub: `Driver, ${d.availability}`, href: `/drivers?open=${d.id}`, status: undefined }));
    return [...ships, ...vehs, ...drv];
  }, [q, data]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (href: string) => {
    router.push(href);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-[440px]" ref={ref}>
      <Search className="gt-icon pointer-events-none absolute left-[11px] top-[10px] text-ink-muted" aria-hidden />
      <input
        className="gt-input pl-9"
        placeholder="Search shipments, vehicles, drivers"
        aria-label="Search shipments, vehicles and drivers"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].href);
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim().length >= 2 && (
        <div className="gt-menu left-0 right-0 top-11 max-h-[360px] overflow-auto" role="listbox">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-ink-muted">No matches for “{q.trim()}”. Try a shipment ID such as GT-2611-0012, or a registration.</p>
          ) : (
            results.map((r) => (
              <button key={r.key} className="gt-menu__item justify-between" onClick={() => go(r.href)} role="option" aria-selected={false}>
                <span className="min-w-0">
                  <span className="block font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-ink-muted">{r.sub}</span>
                </span>
                {r.status && <StatusBadge status={r.status} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const items = data.activities.slice(0, 8);
  const unread = items.filter((a) => !seen || a.at > seen).length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        className="gt-btn gt-btn--ghost gt-btn--icon relative text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setSeen(items[0]?.at ?? null);
        }}
      >
        <Bell className="gt-icon" />
        {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />}
      </button>
      {open && (
        <div className="gt-menu right-0 top-11 w-[340px] max-w-[calc(100vw-24px)] p-0">
          <div className="border-b border-line px-4 py-3 font-semibold">Recent activity</div>
          <ul className="max-h-[360px] overflow-auto">
            {items.map((a) => (
              <li key={a.id} className="border-b border-line px-4 py-3 last:border-0">
                <p className="text-[13px] leading-[19px]">{a.text}</p>
                <p className="text-xs text-ink-muted">{fmtRelative(a.at)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserChip() {
  const { data } = useStore();
  const u = data.settings.user;
  const ini = u.name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <Link href="/settings?tab=user" className="flex items-center gap-2.5 rounded-sm px-1.5 py-1 hover:bg-surface-2">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[13px] font-semibold text-white">{ini}</span>
      <span className="hidden leading-tight md:block">
        <span className="block text-[13px] font-semibold">{u.name}</span>
        <span className="block text-xs text-ink-muted">{u.role}</span>
      </span>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] lg:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="gt-scrim" onClick={() => setDrawer(false)} />
          <div className="relative z-[61] h-full w-[264px] shadow-xl" style={{ animation: "gt-rise .16s ease-out" }}>
            <button className="absolute right-3 top-4 z-10 rounded-sm p-1.5 text-white/80 hover:text-white" aria-label="Close menu" onClick={() => setDrawer(false)}>
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-[var(--topbar-height)] items-center gap-3 border-b border-line bg-surface-1 px-4 lg:px-8">
          <button className="gt-btn gt-btn--ghost gt-btn--icon -ml-2 text-ink lg:hidden" aria-label="Open menu" onClick={() => setDrawer(true)}>
            <Menu className="gt-icon" />
          </button>
          <Link href="/" className="mr-2 sm:hidden" aria-label="Globe Trans dashboard">
            <span className="gt-wordmark__tile">GT</span>
          </Link>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <UserChip />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </StoreProvider>
  );
}
