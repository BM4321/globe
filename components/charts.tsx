"use client";

import { useEffect, useRef, useState } from "react";

export const CHART = {
  brand: "var(--brand)",
  signal: "var(--signal)",
  success: "var(--success)",
  danger: "var(--danger)",
  muted: "#a9b4b1",
  ink: "var(--ink)",
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: { label: string; value: string; color: string }[] }) {
  const left = Math.min(Math.max(8, x - 90), width - 188);
  return (
    <div className="pointer-events-none absolute z-10 w-[180px] rounded-md border border-line bg-surface-1 px-3 py-2 text-[13px] shadow-[var(--shadow-overlay)]" style={{ left, top: Math.max(0, y - 12) }}>
      <div className="mb-1 font-semibold">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-ink-muted">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="gt-num font-semibold">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const PAD = { top: 8, right: 8, bottom: 26, left: 48 };

export function BarChart({ labels, series, stacked = false, height = 240, format = (n: number) => String(n), axisFormat }: { labels: string[]; series: Series[]; stacked?: boolean; height?: number; format?: (n: number) => string; axisFormat?: (n: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = labels.map((_, i) => (stacked ? series.reduce((s, x) => s + (x.values[i] ?? 0), 0) : Math.max(...series.map((x) => x.values[i] ?? 0))));
  const max = niceMax(Math.max(0, ...totals));
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const band = labels.length ? iw / labels.length : 0;
  const groupW = Math.min(band * 0.62, stacked ? 44 : 64);
  const barW = stacked ? groupW : groupW / series.length;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const af = axisFormat ?? format;
  const labelStep = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(iw / 60))));

  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Bar chart: ${series.map((s) => s.label).join(", ")}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)" className="gt-num">
                  {af(t)}
                </text>
              </g>
            ))}
            {labels.map((l, i) => {
              const cx = PAD.left + band * i + band / 2;
              let acc = 0;
              return (
                <g key={l} onMouseEnter={() => setHover(i)}>
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={ih} fill={hover === i ? "var(--surface-2)" : "transparent"} />
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    const h = (v / max) * ih;
                    const x = stacked ? cx - groupW / 2 : cx - groupW / 2 + si * barW;
                    const top = stacked ? y(acc + v) : y(v);
                    acc += v;
                    if (h <= 0) return null;
                    return <rect key={s.key} x={x + (stacked ? 0 : 1)} y={top} width={Math.max(1, barW - (stacked ? 0 : 2))} height={Math.max(0, h - (stacked ? 1 : 0))} fill={s.color} rx={2} />;
                  })}
                  {i % labelStep === 0 && (
                    <text x={cx} y={height - 8} textAnchor="middle" fontSize="11.5" fill="var(--ink-muted)">
                      {l}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tooltip
            x={PAD.left + band * hover + band / 2}
            y={y(totals[hover]) - 70}
            width={width}
            title={labels[hover]}
            rows={[
              ...series.map((s) => ({ label: s.label, value: format(s.values[hover] ?? 0), color: s.color })),
              ...(stacked && series.length > 1 ? [{ label: "Total", value: format(totals[hover]), color: "transparent" }] : []),
            ]}
          />
        )}
      </div>
    </div>
  );
}

export function LineChart({ labels, series, height = 240, format = (n: number) => String(n), axisFormat, area = true, minZero = true }: { labels: string[]; series: Series[]; height?: number; format?: (n: number) => string; axisFormat?: (n: number) => string; area?: boolean; minZero?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(0, ...all));
  const min = minZero ? 0 : 0;
  const iw = Math.max(0, width - PAD.left - PAD.right - 12);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + 6 + (labels.length > 1 ? (i / (labels.length - 1)) * iw : iw / 2);
  const y = (v: number) => PAD.top + ih - ((v - min) / (max - min || 1)) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  const af = axisFormat ?? format;
  const step = Math.ceil(labels.length / Math.max(1, Math.floor(iw / 64)));

  return (
    <div>
      <Legend series={series} />
      <div
        ref={ref}
        className="relative"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - r.left - PAD.left - 6;
          const i = Math.round((px / (iw || 1)) * (labels.length - 1));
          setHover(Math.min(labels.length - 1, Math.max(0, i)));
        }}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Line chart: ${series.map((s) => s.label).join(", ")}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === min ? undefined : "3 4"} />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)" className="gt-num">
                  {af(t)}
                </text>
              </g>
            ))}
            {labels.map((l, i) =>
              i % step === 0 || i === labels.length - 1 ? (
                <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11.5" fill="var(--ink-muted)">
                  {l}
                </text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--line-strong)" strokeDasharray="3 3" />}
            {series.map((s, si) => {
              const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
              return (
                <g key={s.key}>
                  {area && si === 0 && labels.length > 1 && <polygon points={`${x(0)},${y(min)} ${pts} ${x(labels.length - 1)},${y(min)}`} fill={s.color} opacity={0.1} />}
                  <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
                  {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill="var(--surface-1)" stroke={s.color} strokeWidth={2} />}
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <Tooltip x={x(hover)} y={Math.min(...series.map((s) => y(s.values[hover] ?? 0))) - 70} width={width} title={labels[hover]} rows={series.map((s) => ({ label: s.label, value: format(s.values[hover] ?? 0), color: s.color }))} />
        )}
      </div>
    </div>
  );
}

export function Donut({ items, centerValue, centerLabel, size = 168, onSelect }: { items: { label: string; value: number; color: string }[]; centerValue: string; centerLabel: string; size?: number; onSelect?: (label: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Distribution: ${items.map((i) => `${i.label} ${i.value}`).join(", ")}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={20} />
          {items.map((it, i) => {
            const len = (it.value / total) * c;
            const seg = (
              <circle
                key={it.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={it.color}
                strokeWidth={hover === i ? 24 : 20}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: onSelect ? "pointer" : undefined, transition: "stroke-width .12s" }}
                onClick={() => onSelect?.(it.label)}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="gt-num text-2xl font-semibold leading-7">{hover !== null ? items[hover].value : centerValue}</span>
          <span className="text-xs text-ink-muted">{hover !== null ? items[hover].label : centerLabel}</span>
        </div>
      </div>
      <ul className="grid min-w-[160px] flex-1 gap-2 text-[13px]">
        {items.map((it, i) => (
          <li key={it.label}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-sm px-1 py-0.5 text-left hover:bg-surface-2"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(it.label)}
              disabled={!onSelect}
            >
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
                {it.label}
              </span>
              <span className="gt-num font-semibold">
                {it.value}
                <span className="ml-1.5 font-normal text-ink-muted">{Math.round((it.value / total) * 100)}%</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarList({ items, format = (n: number) => String(n), color = CHART.brand, max }: { items: { label: string; value: number; sub?: string }[]; format?: (n: number) => string; color?: string; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="grid gap-3">
      {items.map((it) => (
        <li key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium">
              {it.label}
              {it.sub && <span className="ml-1.5 font-normal text-ink-muted">{it.sub}</span>}
            </span>
            <span className="gt-num flex-none font-semibold">{format(it.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(it.value / m) * 100}%`, background: color, transition: "width .4s ease" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
