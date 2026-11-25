"use client";

import { ROADS, TOWNS, planRoute, town } from "@/lib/geo";

const W = 640;
const H = 540;
const LON = [32.2, 40.6];
const LAT = [-1.9, -9.6];
// Label placement per town: [text-anchor, dx, dy], tuned so busy clusters do not collide.
const LABEL: Record<string, ["start" | "middle" | "end", number, number]> = {
  "Dar es Salaam": ["start", 10, 18],
  Chalinze: ["middle", 0, -11],
  Morogoro: ["middle", 0, 20],
  Tanga: ["start", 10, 4],
  Korogwe: ["middle", 0, 18],
  Arusha: ["end", -10, 4],
  Moshi: ["start", 10, -2],
  Same: ["start", 10, 4],
  Dodoma: ["end", -10, 4],
  Iringa: ["start", 10, 4],
  Shinyanga: ["start", 10, 4],
  Nzega: ["end", -10, -6],
  Tabora: ["end", -10, 4],
};

const px = (lon: number) => 24 + ((lon - LON[0]) / (LON[1] - LON[0])) * (W - 48);
const py = (lat: number) => 20 + ((lat - LAT[0]) / (LAT[1] - LAT[0])) * (H - 40);

function pointAlong(points: [number, number][], frac: number): [number, number] {
  const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = frac * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) {
      const t = segs[i] ? d / segs[i] : 0;
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
    }
    d -= segs[i];
  }
  return points[points.length - 1];
}

function splitAt(points: [number, number][], frac: number) {
  const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let d = frac * total;
  const done: [number, number][] = [points[0]];
  for (let i = 0; i < segs.length; i++) {
    if (d >= segs[i]) {
      done.push(points[i + 1]);
      d -= segs[i];
    } else {
      done.push(pointAlong(points, frac));
      break;
    }
  }
  return done;
}

export function RouteMap({ origin, destination, progress }: { origin: string; destination: string; progress: number }) {
  const route = planRoute(origin, destination);
  const pts = route.path.map((n) => {
    const t = town(n)!;
    return [px(t.lon), py(t.lat)] as [number, number];
  });
  const frac = Math.min(1, Math.max(0, progress / 100));
  const covered = splitAt(pts, frac);
  const truck = pointAlong(pts, frac);
  const onRoute = new Set(route.path);
  const toStr = (p: [number, number][]) => p.map((x) => x.join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Schematic map of the route from ${origin} to ${destination} via ${route.path.slice(1, -1).join(", ") || "a direct road"}`}>
      <rect width={W} height={H} fill="var(--surface-0)" />
      {/* graticule */}
      {[-3, -5, -7, -9].map((lat) => (
        <line key={lat} x1={0} x2={W} y1={py(lat)} y2={py(lat)} stroke="var(--line)" strokeDasharray="2 6" />
      ))}
      {[33, 35, 37, 39].map((lon) => (
        <line key={lon} y1={0} y2={H} x1={px(lon)} x2={px(lon)} stroke="var(--line)" strokeDasharray="2 6" />
      ))}
      <text x={px(32.55)} y={py(-2.05)} fontSize="12" fill="var(--ink-muted)" fontStyle="italic">
        Lake Victoria
      </text>
      <text x={px(39.75)} y={py(-7.9)} fontSize="12" fill="var(--ink-muted)" fontStyle="italic">
        Indian Ocean
      </text>

      {/* road network */}
      {ROADS.map(([a, b]) => {
        const ta = town(a)!;
        const tb = town(b)!;
        return <line key={a + b} x1={px(ta.lon)} y1={py(ta.lat)} x2={px(tb.lon)} y2={py(tb.lat)} stroke="var(--line-strong)" strokeOpacity={0.45} strokeWidth={3} strokeLinecap="round" />;
      })}

      {/* planned route: remaining as lane dashes, covered as solid amber */}
      <polyline points={toStr(pts)} fill="none" stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" />
      {frac > 0 && <polyline points={toStr(covered)} fill="none" stroke="var(--signal)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />}

      {/* towns */}
      {TOWNS.map((t) => {
        const isEnd = t.name === origin || t.name === destination;
        const on = onRoute.has(t.name);
        const x = px(t.lon);
        const y = py(t.lat);
        const [anchor, dx, dy] = LABEL[t.name] ?? ["start", 10, 4];
        return (
          <g key={t.name}>
            {t.name === origin ? (
              <circle cx={x} cy={y} r={7} fill="var(--ink)" />
            ) : t.name === destination ? (
              <circle cx={x} cy={y} r={7} fill="var(--surface-1)" stroke="var(--ink)" strokeWidth={3} />
            ) : (
              <circle cx={x} cy={y} r={on ? 4.5 : 3.5} fill={on ? "var(--ink)" : "var(--surface-1)"} stroke={on ? "var(--ink)" : "var(--line-strong)"} strokeWidth={1.5} />
            )}
            <text x={x + dx} y={y + dy} textAnchor={anchor} fontSize={isEnd ? 14 : 11.5} fontWeight={isEnd ? 700 : on ? 600 : 400} fill={on || isEnd ? "var(--ink)" : "var(--ink-muted)"} paintOrder="stroke" stroke="var(--surface-0)" strokeWidth={4} strokeLinejoin="round">
              {t.name}
            </text>
          </g>
        );
      })}

      {/* estimated position */}
      {frac > 0 && frac < 1 && (
        <g transform={`translate(${truck[0]},${truck[1]})`}>
          <circle r={18} fill="var(--signal)" opacity={0.25} />
          <circle r={13} fill="var(--ink)" />
          <g transform="translate(-7,-7) scale(0.58)" fill="none" stroke="var(--surface-1)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
            <path d="M15 18H9" />
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
            <circle cx="17" cy="18" r="2" />
            <circle cx="7" cy="18" r="2" />
          </g>
        </g>
      )}
    </svg>
  );
}
