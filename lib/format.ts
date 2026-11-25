const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function today() {
  return toISODate(new Date());
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return "Not set";
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShortDate(s: string) {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return fmtDateTime(iso);
}

export function monthLabel(key: string) {
  // key: YYYY-MM
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

export const nf = new Intl.NumberFormat("en-US");

export function fmtNum(n: number) {
  return nf.format(Math.round(n));
}

export function fmtKg(n: number) {
  return `${nf.format(Math.round(n))} kg`;
}

export function fmtTZS(n: number) {
  return `TZS ${nf.format(Math.round(n))}`;
}

export function fmtTZSShort(n: number) {
  if (Math.abs(n) >= 1e9) return `TZS ${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `TZS ${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `TZS ${(n / 1e3).toFixed(0)}K`;
  return `TZS ${n}`;
}

export function fmtPct(n: number, digits = 0) {
  return `${n.toFixed(digits)}%`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
