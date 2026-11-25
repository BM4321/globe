"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, MoreHorizontal, Search, Truck, X, type LucideIcon } from "lucide-react";
import type { DriverAvailability, MaintenanceStatus, ShipmentStatus, VehicleAvailability } from "@/lib/types";

/* ---------- Badges ---------- */

const STATUS_CLASS: Record<ShipmentStatus, string> = {
  Pending: "pending",
  Dispatched: "dispatched",
  "In transit": "transit",
  Delayed: "delayed",
  Delivered: "delivered",
  Cancelled: "cancelled",
};

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  return <span className={`gt-badge gt-badge--${STATUS_CLASS[status]}`}>{status}</span>;
}

const AVAIL_CLASS: Record<VehicleAvailability | DriverAvailability, string> = {
  Available: "delivered",
  "On trip": "dispatched",
  "In workshop": "delayed",
  "Off duty": "pending",
};

export function AvailabilityBadge({ value }: { value: VehicleAvailability | DriverAvailability }) {
  return <span className={`gt-badge gt-badge--${AVAIL_CLASS[value]}`}>{value}</span>;
}

const MAINT_CLASS: Record<MaintenanceStatus, string> = {
  Good: "delivered",
  "Service due": "transit",
  "In workshop": "delayed",
};

export function MaintenanceBadge({ value }: { value: MaintenanceStatus }) {
  return <span className={`gt-badge gt-badge--${MAINT_CLASS[value]}`}>{value}</span>;
}

/* ---------- Layout ---------- */

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "", bodyClass = "p-5" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`gt-card min-w-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="section-title">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/* ---------- Metric tile ---------- */

export function MetricTile({ icon: Icon, label, value, unit, foot, meter, href }: { icon: LucideIcon; label: string; value: string; unit?: string; foot?: React.ReactNode; meter?: number; href?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px] font-[550] text-ink-muted">
        <Icon className="gt-icon" aria-hidden />
        {label}
      </span>
      <span className="gt-num text-[28px] font-semibold leading-9 tracking-[-0.01em]">
        {value}
        {unit && <span className="ml-1 text-[15px] font-[550] text-ink-muted">{unit}</span>}
      </span>
      {meter !== undefined && (
        <span className="gt-meter mt-1 block" aria-hidden>
          <span style={{ width: `${Math.min(100, Math.max(0, meter))}%` }} />
        </span>
      )}
      {foot && <span className="text-xs text-ink-muted">{foot}</span>}
    </>
  );
  const cls = "gt-card grid content-start gap-1.5 p-5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ---------- Route line ---------- */

export function RouteLine({ origin, destination, progress, compact, originSub, destSub }: { origin: string; destination: string; progress: number; compact?: boolean; originSub?: string; destSub?: string }) {
  return (
    <div className={`gt-route ${compact ? "gt-route--compact" : ""}`} role="img" aria-label={`${origin} to ${destination}, ${progress}% of route covered`}>
      <span className="gt-route__place">
        {origin}
        {!compact && originSub && <small>{originSub}</small>}
      </span>
      <span className="gt-route__track">
        <span className="gt-route__fill" style={{ width: `${progress}%` }} />
        {!compact && progress > 0 && progress < 100 && (
          <span className="gt-route__truck" style={{ left: `${progress}%` }}>
            <Truck size={14} strokeWidth={2} />
          </span>
        )}
      </span>
      <span className="gt-route__place gt-route__place--end">
        {destination}
        {!compact && destSub && <small>{destSub}</small>}
      </span>
    </div>
  );
}

/* ---------- Forms ---------- */

export function Field({ label, required, error, help, children, className = "" }: { label: string; required?: boolean; error?: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`gt-field ${error ? "gt-field--error" : ""} ${className}`}>
      <span className="gt-field__label">
        {label}
        {required && <span className="gt-req" aria-hidden>*</span>}
      </span>
      {children}
      {(error || help) && <span className="gt-field__help">{error || help}</span>}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder, className = "" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="gt-icon pointer-events-none absolute left-[11px] top-[10px] text-ink-muted" aria-hidden />
      <input className="gt-input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} type="search" />
    </div>
  );
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="gt-chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="gt-chip__count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="gt-switch" onClick={() => onChange(!checked)} />;
}

/* ---------- Overlays ---------- */

function usePortal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useOverlayBehaviour(open: boolean, onClose: () => void, ref: React.RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button[data-autofocus]");
    (first ?? node)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && node) {
        const items = Array.from(node.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])"));
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prevFocus?.focus?.();
    };
  }, [open, ref]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 600 }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = usePortal();
  useOverlayBehaviour(open, onClose, ref);
  if (!open || !mounted) return null;
  return createPortal(
    <div className="gt-scrim grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className="gt-modal outline-none" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 id={titleId} className="text-lg font-bold leading-6" style={{ fontStretch: "108%" }}>
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          <button className="gt-btn gt-btn--ghost gt-btn--icon gt-btn--sm -mr-2" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, subtitle, children, footer, headerExtra }: { open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; headerExtra?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = usePortal();
  useOverlayBehaviour(open, onClose, ref);
  if (!open || !mounted) return null;
  return createPortal(
    <>
      <div className="gt-scrim" onMouseDown={onClose} />
      <div ref={ref} tabIndex={-1} className="gt-drawer outline-none" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold leading-6" style={{ fontStretch: "108%" }}>
              {title}
            </h2>
            {subtitle && <div className="mt-1 text-[13px] text-ink-muted">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {headerExtra}
            <button className="gt-btn gt-btn--ghost gt-btn--icon gt-btn--sm -mr-2" aria-label="Close" onClick={onClose} data-autofocus>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; text: React.ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={460}
      footer={
        <>
          <button className="gt-btn gt-btn--secondary" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button
            className="gt-btn gt-btn--danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-ink-muted">{text}</p>
    </Modal>
  );
}

export function RowMenu({ items, label = "More actions" }: { items: { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="gt-btn gt-btn--ghost gt-btn--icon gt-btn--sm text-ink-muted" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="gt-menu right-0 top-9" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={`gt-menu__item ${it.danger ? "text-danger-text" : ""}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon && <it.icon size={16} strokeWidth={1.75} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Feedback ---------- */

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-5 py-12 text-center">
      <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-muted">
        <Icon className="gt-icon" aria-hidden />
      </span>
      <span className="text-base font-[650]">{title}</span>
      <span className="mb-3 max-w-[44ch] text-ink-muted">{text}</span>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`gt-skeleton ${className}`} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="gt-card grid gap-4 p-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

export function Pagination({ page, pages, total, pageSize, onPage }: { page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted">
      <span className="gt-num">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button className="gt-btn gt-btn--secondary gt-btn--sm gt-btn--icon" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span className="gt-num px-2">
          Page {page} of {pages}
        </span>
        <button className="gt-btn gt-btn--secondary gt-btn--sm gt-btn--icon" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function DetailList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-ink-muted">{k}</dt>
          <dd className="mt-0.5 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const ini = name
    .split(/\s+/)
    .filter((p) => /^[A-Za-z]/.test(p) && !p.endsWith("."))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  return (
    <span className="grid flex-none place-items-center rounded-full bg-brand-soft font-semibold text-brand-text" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {ini}
    </span>
  );
}
