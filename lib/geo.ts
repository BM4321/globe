// Schematic road network for Tanzania's main freight corridors.
// Coordinates are approximate (longitude, latitude) and are used for the
// schematic map and for distance estimates. This is not GPS data.

export interface Town {
  name: string;
  lon: number;
  lat: number;
  hub: boolean; // selectable as origin / destination
}

export const TOWNS: Town[] = [
  { name: "Dar es Salaam", lon: 39.28, lat: -6.82, hub: true },
  { name: "Chalinze", lon: 38.35, lat: -6.64, hub: false },
  { name: "Morogoro", lon: 37.66, lat: -6.82, hub: true },
  { name: "Dodoma", lon: 35.74, lat: -6.17, hub: true },
  { name: "Singida", lon: 34.74, lat: -4.82, hub: false },
  { name: "Nzega", lon: 33.18, lat: -4.21, hub: false },
  { name: "Shinyanga", lon: 33.42, lat: -3.66, hub: true },
  { name: "Mwanza", lon: 32.9, lat: -2.52, hub: true },
  { name: "Tanga", lon: 39.1, lat: -5.07, hub: true },
  { name: "Korogwe", lon: 38.48, lat: -5.15, hub: false },
  { name: "Same", lon: 37.73, lat: -4.07, hub: false },
  { name: "Moshi", lon: 37.34, lat: -3.35, hub: true },
  { name: "Arusha", lon: 36.68, lat: -3.37, hub: true },
  { name: "Babati", lon: 35.75, lat: -4.21, hub: false },
  { name: "Iringa", lon: 35.69, lat: -7.77, hub: true },
  { name: "Makambako", lon: 34.83, lat: -8.85, hub: false },
  { name: "Mbeya", lon: 33.46, lat: -8.9, hub: true },
  { name: "Tabora", lon: 32.8, lat: -5.02, hub: true },
];

export const HUBS = TOWNS.filter((t) => t.hub).map((t) => t.name);

export const ROADS: [string, string][] = [
  ["Dar es Salaam", "Chalinze"],
  ["Chalinze", "Morogoro"],
  ["Morogoro", "Dodoma"],
  ["Dodoma", "Singida"],
  ["Singida", "Nzega"],
  ["Nzega", "Shinyanga"],
  ["Shinyanga", "Mwanza"],
  ["Chalinze", "Korogwe"],
  ["Korogwe", "Tanga"],
  ["Korogwe", "Same"],
  ["Same", "Moshi"],
  ["Moshi", "Arusha"],
  ["Arusha", "Babati"],
  ["Babati", "Dodoma"],
  ["Babati", "Singida"],
  ["Morogoro", "Iringa"],
  ["Iringa", "Makambako"],
  ["Makambako", "Mbeya"],
  ["Nzega", "Tabora"],
  ["Dodoma", "Iringa"],
];

const byName = new Map(TOWNS.map((t) => [t.name, t]));
export const town = (name: string) => byName.get(name);

function haversine(a: Town, b: Town) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Road distance estimate: straight-line distance x 1.22 winding factor.
function legKm(a: string, b: string) {
  const ta = byName.get(a);
  const tb = byName.get(b);
  if (!ta || !tb) return 0;
  return Math.round(haversine(ta, tb) * 1.22);
}

const adj = new Map<string, { to: string; km: number }[]>();
for (const [a, b] of ROADS) {
  const km = legKm(a, b);
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a)!.push({ to: b, km });
  adj.get(b)!.push({ to: a, km });
}

export interface RoutePlan {
  path: string[];
  legs: number[]; // km per leg
  km: number;
}

const routeCache = new Map<string, RoutePlan>();

export function planRoute(from: string, to: string): RoutePlan {
  const key = `${from}|${to}`;
  const cached = routeCache.get(key);
  if (cached) return cached;
  if (from === to || !adj.has(from) || !adj.has(to)) {
    return { path: [from, to], legs: [0], km: 0 };
  }
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set(adj.keys());
  while (todo.size) {
    let u: string | null = null;
    for (const n of todo) if (dist.has(n) && (u === null || dist.get(n)! < dist.get(u)!)) u = n;
    if (u === null || u === to) break;
    todo.delete(u);
    for (const { to: v, km } of adj.get(u)!) {
      const alt = dist.get(u)! + km;
      if (!dist.has(v) || alt < dist.get(v)!) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }
  const path = [to];
  while (path[0] !== from && prev.has(path[0])) path.unshift(prev.get(path[0])!);
  const legs = path.slice(1).map((p, i) => legKm(path[i], p));
  const plan = { path, legs, km: legs.reduce((s, x) => s + x, 0) };
  routeCache.set(key, plan);
  return plan;
}

// Typical transit days for a loaded truck (about 380 km per driving day).
export function transitDays(from: string, to: string) {
  return Math.max(1, Math.ceil(planRoute(from, to).km / 380));
}

// Suggested freight charge in TZS: base handling + rate per tonne-km.
export function suggestCharge(from: string, to: string, weightKg: number) {
  const km = planRoute(from, to).km;
  const tonnes = Math.max(1, weightKg / 1000);
  const raw = 350_000 + km * tonnes * 165;
  return Math.round(raw / 10_000) * 10_000;
}
