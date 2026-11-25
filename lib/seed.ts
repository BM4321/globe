import type { Activity, AppData, Customer, Driver, Shipment, Vehicle, VehicleType } from "./types";
import { addDays, toISODate } from "./format";
import { planRoute, suggestCharge, transitDays } from "./geo";

export const DATA_VERSION = 5;

// Deterministic pseudo-random generator so every first load looks the same.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CustomerSeed extends Omit<Customer, "id" | "since"> {
  lanes: string[]; // destinations (or origins when inbound)
  inbound?: boolean; // goods travel from Dar es Salaam to the customer
  cargo: { text: string; min: number; max: number; reefer?: boolean; tanker?: boolean }[];
  weight: number; // relative share of volume
}

const CUSTOMERS: CustomerSeed[] = [
  { company: "Kariakoo Wholesale Traders", contact: "Halima Msuya", phone: "+255 754 318 902", email: "halima.msuya@kariakoowholesale.co.tz", city: "Dar es Salaam", address: "Msimbazi Street, Kariakoo", industry: "FMCG distribution", lanes: ["Mwanza", "Dodoma", "Mbeya", "Arusha", "Tabora"], cargo: [{ text: "Mixed FMCG goods, 30 pallets", min: 14000, max: 22000 }, { text: "Cooking oil, 1,200 jerrycans", min: 18000, max: 24000 }], weight: 3 },
  { company: "Tanga Coastal Cement PLC", contact: "Ibrahim Shekilango", phone: "+255 713 440 271", email: "logistics@tangacoastalcement.co.tz", city: "Tanga", address: "Pongwe Industrial Area", industry: "Construction materials", lanes: ["Dodoma", "Arusha", "Morogoro", "Dar es Salaam", "Moshi"], cargo: [{ text: "Bagged cement, 600 bags", min: 30000, max: 30000 }, { text: "Bagged cement, 500 bags", min: 25000, max: 25000 }], weight: 3 },
  { company: "Lake Zone Fish Processors", contact: "Neema Masanja", phone: "+255 767 902 114", email: "n.masanja@lakezonefish.co.tz", city: "Mwanza", address: "Igogo Industrial Area, Nyamagana", industry: "Food processing", lanes: ["Dar es Salaam"], cargo: [{ text: "Chilled Nile perch fillets", min: 12000, max: 18000, reefer: true }], weight: 2 },
  { company: "Mbeya Highland Coffee Co.", contact: "Gerald Mwakalinga", phone: "+255 755 610 338", email: "gerald@mbeyahighlandcoffee.co.tz", city: "Mbeya", address: "Uyole Road, Mbeya", industry: "Agriculture export", lanes: ["Dar es Salaam"], cargo: [{ text: "Green coffee, 280 sacks", min: 16800, max: 16800 }, { text: "Green coffee, 200 sacks", min: 12000, max: 12000 }], weight: 2 },
  { company: "Pwani Steel Works", contact: "Rajesh Patel", phone: "+255 784 225 610", email: "dispatch@pwanisteel.co.tz", city: "Dar es Salaam", address: "Nyerere Road, Vingunguti", industry: "Manufacturing", lanes: ["Dodoma", "Arusha", "Mwanza", "Morogoro"], cargo: [{ text: "Reinforcement steel bars, Y12–Y16", min: 24000, max: 28000 }, { text: "Roofing sheets, 900 pieces", min: 12000, max: 16000 }], weight: 2 },
  { company: "Dodoma Grain Millers", contact: "Agnes Chilongani", phone: "+255 716 330 845", email: "agnes@dodomagrain.co.tz", city: "Dodoma", address: "Kizota Industrial Area", industry: "Food processing", lanes: ["Dar es Salaam", "Morogoro", "Iringa", "Arusha"], cargo: [{ text: "Maize flour, 25 kg bags", min: 20000, max: 28000 }, { text: "Sunflower cake, bulk bags", min: 18000, max: 24000 }], weight: 2 },
  { company: "Morogoro Sugar Packers", contact: "Salum Kibwana", phone: "+255 765 118 402", email: "salum.kibwana@morogorosugar.co.tz", city: "Morogoro", address: "Mazimbu Road, Morogoro", industry: "Food processing", lanes: ["Dar es Salaam", "Dodoma", "Arusha"], cargo: [{ text: "Refined sugar, 50 kg bags", min: 25000, max: 30000 }], weight: 2 },
  { company: "Uhuru Agro Inputs Ltd", contact: "Peter Mtei", phone: "+255 787 604 917", email: "peter.mtei@uhuruagro.co.tz", city: "Dar es Salaam", address: "Pugu Road, Ilala", industry: "Agriculture inputs", lanes: ["Mbeya", "Iringa", "Tabora", "Shinyanga"], cargo: [{ text: "Fertiliser, 50 kg bags", min: 25000, max: 30000 }, { text: "Certified maize seed, 2 kg packs", min: 8000, max: 12000 }], weight: 2 },
  { company: "Southern Petroleum Distributors", contact: "Mussa Abdallah", phone: "+255 714 987 330", email: "ops@southernpetroleum.co.tz", city: "Dar es Salaam", address: "Kurasini Oil Terminal", industry: "Energy", lanes: ["Dodoma", "Mwanza", "Mbeya", "Morogoro"], cargo: [{ text: "Diesel, 33,000 litres", min: 28000, max: 28000, tanker: true }, { text: "Petrol, 33,000 litres", min: 24500, max: 24500, tanker: true }], weight: 2 },
  { company: "Arusha Bloom Growers", contact: "Esther Laizer", phone: "+255 768 552 093", email: "esther@arushabloom.co.tz", city: "Arusha", address: "Usa River, Arumeru", industry: "Horticulture", lanes: ["Dar es Salaam", "Moshi"], cargo: [{ text: "Cut roses, chilled, 640 boxes", min: 6000, max: 9000, reefer: true }], weight: 1 },
  { company: "Msasani Pharma Distributors", contact: "Dr. Faith Mrisho", phone: "+255 713 205 774", email: "faith.mrisho@msasanipharma.co.tz", city: "Dar es Salaam", address: "Haile Selassie Road, Msasani", industry: "Healthcare", lanes: ["Arusha", "Mwanza", "Dodoma", "Mbeya"], cargo: [{ text: "Pharmaceuticals, temperature-controlled", min: 3000, max: 4800, reefer: true }, { text: "Medical consumables, 120 cartons", min: 2500, max: 4500 }], weight: 1 },
  { company: "Kahama Mining Supplies", contact: "Joseph Lukumay", phone: "+255 756 731 208", email: "joseph@kahamamining.co.tz", city: "Shinyanga", address: "Kahama Road, Shinyanga", industry: "Mining", inbound: true, lanes: ["Dar es Salaam"], cargo: [{ text: "Mining consumables and spares", min: 8000, max: 15000 }, { text: "Grinding media, steel balls", min: 26000, max: 30000 }], weight: 2 },
  { company: "Usambara Tea Estates", contact: "Mariam Shemsanga", phone: "+255 715 482 660", email: "mariam@usambaratea.co.tz", city: "Tanga", address: "Lushoto Road, Korogwe", industry: "Agriculture export", lanes: ["Dar es Salaam"], cargo: [{ text: "Packed black tea, 480 cartons", min: 9600, max: 9600 }], weight: 1 },
  { company: "Moshi Coffee Curing Co.", contact: "Godfrey Swai", phone: "+255 754 090 176", email: "godfrey@moshicoffeecuring.co.tz", city: "Moshi", address: "Pasua Industrial Area", industry: "Agriculture export", lanes: ["Dar es Salaam", "Tanga"], cargo: [{ text: "Parchment coffee, 200 sacks", min: 12000, max: 12000 }], weight: 1 },
  { company: "Tabora Tobacco Leaf Cooperative", contact: "Ramadhani Kasubi", phone: "+255 782 371 549", email: "rkasubi@taboraleaf.co.tz", city: "Tabora", address: "Station Road, Tabora", industry: "Agriculture", lanes: ["Dar es Salaam", "Morogoro"], cargo: [{ text: "Baled tobacco leaf", min: 14000, max: 20000 }], weight: 1 },
];

const DRIVERS: Omit<Driver, "id" | "vehicleId" | "availability" | "joined" | "licenceExpiry">[] = [
  { name: "Juma Mwakyusa", phone: "+255 754 201 388", email: "juma.mwakyusa@globetrans.co.tz", licence: "TZ-DL-4021187", licenceClass: "E", base: "Dar es Salaam" },
  { name: "Neema Kweka", phone: "+255 713 908 452", email: "neema.kweka@globetrans.co.tz", licence: "TZ-DL-3988014", licenceClass: "E", base: "Mwanza" },
  { name: "Baraka Mollel", phone: "+255 767 330 219", email: "baraka.mollel@globetrans.co.tz", licence: "TZ-DL-4107763", licenceClass: "E", base: "Arusha" },
  { name: "Elia Mushi", phone: "+255 784 562 031", email: "elia.mushi@globetrans.co.tz", licence: "TZ-DL-3851290", licenceClass: "E", base: "Dar es Salaam" },
  { name: "Hamisi Said", phone: "+255 715 004 873", email: "hamisi.said@globetrans.co.tz", licence: "TZ-DL-4230558", licenceClass: "E", base: "Tanga" },
  { name: "Rashidi Mfinanga", phone: "+255 756 447 120", email: "rashidi.mfinanga@globetrans.co.tz", licence: "TZ-DL-3779406", licenceClass: "E", base: "Dodoma" },
  { name: "Grace Massawe", phone: "+255 768 215 694", email: "grace.massawe@globetrans.co.tz", licence: "TZ-DL-4312905", licenceClass: "C", base: "Dar es Salaam" },
  { name: "Daudi Lyimo", phone: "+255 782 663 507", email: "daudi.lyimo@globetrans.co.tz", licence: "TZ-DL-3920671", licenceClass: "E", base: "Moshi" },
  { name: "Saidi Kombo", phone: "+255 714 780 336", email: "saidi.kombo@globetrans.co.tz", licence: "TZ-DL-4058812", licenceClass: "E", base: "Dar es Salaam" },
  { name: "Joseph Mrema", phone: "+255 755 129 840", email: "joseph.mrema@globetrans.co.tz", licence: "TZ-DL-3699235", licenceClass: "E", base: "Mbeya" },
  { name: "Peter Kisanga", phone: "+255 765 872 013", email: "peter.kisanga@globetrans.co.tz", licence: "TZ-DL-4176049", licenceClass: "C", base: "Morogoro" },
  { name: "Musa Njau", phone: "+255 787 316 455", email: "musa.njau@globetrans.co.tz", licence: "TZ-DL-3864418", licenceClass: "E", base: "Dar es Salaam" },
  { name: "Emmanuel Shayo", phone: "+255 716 550 762", email: "emmanuel.shayo@globetrans.co.tz", licence: "TZ-DL-4289133", licenceClass: "E", base: "Arusha" },
  { name: "Faraja Ngowi", phone: "+255 754 993 281", email: "faraja.ngowi@globetrans.co.tz", licence: "TZ-DL-4401276", licenceClass: "C", base: "Dar es Salaam" },
  { name: "Yusuph Mbwana", phone: "+255 713 645 907", email: "yusuph.mbwana@globetrans.co.tz", licence: "TZ-DL-3945520", licenceClass: "E", base: "Tanga" },
  { name: "Abdallah Chande", phone: "+255 767 418 336", email: "abdallah.chande@globetrans.co.tz", licence: "TZ-DL-4122689", licenceClass: "E", base: "Dar es Salaam" },
];

const VEHICLES: { reg: string; type: VehicleType; make: string; capacityKg: number; year: number }[] = [
  { reg: "T 482 DKL", type: "Prime mover + trailer", make: "Scania R460", capacityKg: 30000, year: 2021 },
  { reg: "T 207 DHX", type: "Refrigerated truck", make: "Mercedes-Benz Actros 2545", capacityKg: 20000, year: 2020 },
  { reg: "T 913 DLC", type: "Prime mover + trailer", make: "Scania R460", capacityKg: 30000, year: 2022 },
  { reg: "T 615 DMB", type: "Prime mover + trailer", make: "MAN TGS 33.440", capacityKg: 30000, year: 2023 },
  { reg: "T 338 DJR", type: "Fuel tanker", make: "Volvo FH 440", capacityKg: 30000, year: 2021 },
  { reg: "T 774 DGF", type: "Rigid truck", make: "Isuzu FVZ 1400", capacityKg: 15000, year: 2019 },
  { reg: "T 529 DKT", type: "Flatbed", make: "FAW J6P 420", capacityKg: 28000, year: 2022 },
  { reg: "T 146 DLM", type: "Refrigerated truck", make: "Mercedes-Benz Actros 2545", capacityKg: 20000, year: 2023 },
  { reg: "T 861 DHP", type: "Prime mover + trailer", make: "Scania R460", capacityKg: 30000, year: 2020 },
  { reg: "T 390 DMK", type: "Rigid truck", make: "Isuzu FVZ 1400", capacityKg: 15000, year: 2021 },
  { reg: "T 702 DJW", type: "Fuel tanker", make: "Volvo FH 440", capacityKg: 30000, year: 2022 },
  { reg: "T 255 DKC", type: "Light truck", make: "Isuzu NPR 4.6", capacityKg: 5000, year: 2023 },
  { reg: "T 618 DLS", type: "Flatbed", make: "FAW J6P 420", capacityKg: 28000, year: 2021 },
  { reg: "T 947 DGA", type: "Prime mover + trailer", make: "MAN TGS 33.440", capacityKg: 30000, year: 2019 },
  { reg: "T 183 DMR", type: "Refrigerated truck", make: "Mercedes-Benz Actros 2545", capacityKg: 20000, year: 2024 },
  { reg: "T 436 DHN", type: "Rigid truck", make: "Isuzu FVZ 1400", capacityKg: 15000, year: 2020 },
  { reg: "T 571 DLV", type: "Light truck", make: "Isuzu NPR 4.6", capacityKg: 5000, year: 2024 },
  { reg: "T 824 DJE", type: "Prime mover + trailer", make: "Scania R460", capacityKg: 30000, year: 2024 },
];

// Delay reasons tied to a town on the route; generic ones apply anywhere.
const DELAY_REASONS: { town?: string; text: string }[] = [
  { town: "Chalinze", text: "Held at Vigwaza weighbridge" },
  { town: "Same", text: "Heavy rain on the Same–Mombo stretch" },
  { town: "Korogwe", text: "Tyre replacement at Korogwe" },
  { town: "Nzega", text: "Road works near Nzega" },
  { town: "Makambako", text: "Fuel stop queue at Makambako" },
  { town: "Dodoma", text: "Diversion around road works in Dodoma" },
  { text: "Engine fault, mechanic on the way" },
  { text: "Brake inspection at a roadside police check" },
];

function delayReasonFor(origin: string, destination: string, roll: number) {
  const path = planRoute(origin, destination).path;
  const options = DELAY_REASONS.filter((d) => !d.town || path.includes(d.town));
  return options[Math.floor(roll * options.length)].text;
}

export function buildSeed(now = new Date()): AppData {
  const r = rng(20261125);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const T = toISODate(now);

  const customers: Customer[] = CUSTOMERS.map((c, i) => ({
    id: `cus_${String(i + 1).padStart(3, "0")}`,
    company: c.company,
    contact: c.contact,
    phone: c.phone,
    email: c.email,
    city: c.city,
    address: c.address,
    industry: c.industry,
    since: addDays(T, -(400 + Math.floor(r() * 1200))),
  }));

  const drivers: Driver[] = DRIVERS.map((d, i) => ({
    ...d,
    id: `drv_${String(i + 1).padStart(3, "0")}`,
    vehicleId: null,
    availability: "Available",
    joined: addDays(T, -(300 + Math.floor(r() * 2200))),
    licenceExpiry: addDays(T, 120 + Math.floor(r() * 1100)),
  }));

  const vehicles: Vehicle[] = VEHICLES.map((v, i) => {
    const odo = 60000 + Math.floor(r() * 380000);
    return {
      ...v,
      id: `veh_${String(i + 1).padStart(3, "0")}`,
      driverId: i < drivers.length ? drivers[i].id : null,
      location: drivers[i]?.base ?? "Dar es Salaam",
      availability: "Available",
      maintenance: "Good",
      odometerKm: odo,
      nextServiceKm: odo + 1500 + Math.floor(r() * 8500),
    };
  });
  vehicles.forEach((v) => {
    if (v.driverId) drivers.find((d) => d.id === v.driverId)!.vehicleId = v.id;
  });

  // Fleet condition for the demo.
  const workshop = vehicles[9]; // T 390 DMK
  workshop.availability = "In workshop";
  workshop.maintenance = "In workshop";
  workshop.location = "Dar es Salaam";
  vehicles[13].maintenance = "Service due";
  vehicles[13].nextServiceKm = vehicles[13].odometerKm + 600;
  vehicles[5].maintenance = "Service due";
  vehicles[5].nextServiceKm = vehicles[5].odometerKm + 420;

  // Shipments from ~6 months ago to a few days ahead.
  const totalWeight = CUSTOMERS.reduce((s, c) => s + c.weight, 0);
  const pickCustomer = () => {
    let x = r() * totalWeight;
    for (let i = 0; i < CUSTOMERS.length; i++) {
      x -= CUSTOMERS[i].weight;
      if (x <= 0) return i;
    }
    return 0;
  };

  type Draft = Omit<Shipment, "id"> & { _created: string };
  const drafts: Draft[] = [];
  for (let d = -182; d <= 4; d++) {
    const growth = 0.75 + ((d + 182) / 186) * 0.6;
    const base = d > 0 ? 0.9 : 1.05 * growth;
    const count = Math.floor(base + r() * 1.3);
    for (let k = 0; k < count; k++) {
      const ci = pickCustomer();
      const c = CUSTOMERS[ci];
      const lane = pick(c.lanes);
      const origin = c.inbound ? lane : c.city;
      const destination = c.inbound ? c.city : lane;
      const cg = pick(c.cargo);
      const weightKg = Math.round((cg.min + r() * (cg.max - cg.min)) / 50) * 50;
      const departureDate = addDays(T, d);
      const expectedDate = addDays(departureDate, transitDays(origin, destination));
      const createdDate = addDays(departureDate, -(1 + Math.floor(r() * 3)));
      const created = new Date(`${createdDate}T${String(8 + Math.floor(r() * 9)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00`);
      const charge = Math.round((suggestCharge(origin, destination, weightKg) * (0.92 + r() * 0.16)) / 10000) * 10000;
      drafts.push({
        customerId: customers[ci].id,
        origin,
        destination,
        cargo: cg.text,
        weightKg,
        vehicleId: null,
        driverId: null,
        departureDate,
        expectedDate,
        deliveredDate: null,
        status: "Pending",
        chargeTZS: charge,
        createdAt: created.toISOString(),
        _created: createdDate,
        // stash cargo needs on the draft via delayReason placeholder (cleared below)
        delayReason: cg.reefer ? "__reefer" : cg.tanker ? "__tanker" : undefined,
      });
    }
  }
  drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // IDs: GT-YYMM-NNNN, numbered per month of booking.
  const perMonth = new Map<string, number>();
  const shipments: Shipment[] = drafts.map((dr) => {
    const ym = dr._created.slice(2, 4) + dr._created.slice(5, 7);
    const n = (perMonth.get(ym) ?? 0) + 1;
    perMonth.set(ym, n);
    const { _created: _ignored, ...rest } = dr;
    void _ignored;
    return { ...rest, id: `GT-${ym}-${String(n).padStart(4, "0")}` };
  });

  const fits = (v: Vehicle, s: Shipment) => {
    const need = s.delayReason;
    if (need === "__reefer") return v.type === "Refrigerated truck" && v.capacityKg >= s.weightKg;
    if (need === "__tanker") return v.type === "Fuel tanker";
    return v.type !== "Fuel tanker" && v.type !== "Refrigerated truck" && v.capacityKg >= s.weightKg;
  };

  const busy = new Set<string>();
  // Walk newest first so active trips claim vehicles before history does.
  const ordered = [...shipments].sort((a, b) => b.departureDate.localeCompare(a.departureDate));
  for (const s of ordered) {
    const depOffset = Math.round((new Date(s.departureDate).getTime() - new Date(T).getTime()) / 86_400_000);
    const expOffset = Math.round((new Date(s.expectedDate).getTime() - new Date(T).getTime()) / 86_400_000);
    const candidates = vehicles.filter((v) => fits(v, s) && v.availability !== "In workshop" && v.driverId);

    if (depOffset > 0) {
      s.status = "Pending";
      // Some future bookings already have a truck reserved.
      if (r() < 0.35) {
        const v = candidates.find((x) => !busy.has(x.id));
        if (v) {
          // A reserved truck waits in the yard for this booking.
          busy.add(v.id);
          s.vehicleId = v.id;
          s.driverId = v.driverId;
        }
      }
    } else if (expOffset >= -1 && s.status === "Pending") {
      // Active window: departed but not past expected delivery (+1 day grace).
      const v = candidates.find((x) => !busy.has(x.id));
      if (!v) {
        s.status = depOffset === 0 ? "Pending" : "Delivered";
        if (s.status === "Delivered") {
          const hv = pick(vehicles.filter((x) => fits(x, s) && x.driverId)) ?? vehicles[0];
          s.vehicleId = hv.id;
          s.driverId = hv.driverId;
          s.deliveredDate = s.expectedDate < T ? s.expectedDate : T;
        }
        continue;
      }
      busy.add(v.id);
      s.vehicleId = v.id;
      s.driverId = v.driverId;
      if (depOffset === 0) s.status = "Dispatched";
      else if (expOffset < 0 || r() < 0.16) {
        s.status = "Delayed";
        s.delayReason = delayReasonFor(s.origin, s.destination, r());
        continue;
      } else s.status = "In transit";
      v.availability = "On trip";
    } else {
      // History.
      const hv = pick(vehicles.filter((x) => fits(x, s) && x.driverId)) ?? vehicles[0];
      s.vehicleId = hv.id;
      s.driverId = hv.driverId;
      if (r() < 0.035) {
        s.status = "Cancelled";
        s.vehicleId = null;
        s.driverId = null;
      } else {
        s.status = "Delivered";
        const slip = r() < 0.12 ? 1 + Math.floor(r() * 2) : r() < 0.2 ? -1 : 0;
        s.deliveredDate = addDays(s.expectedDate, slip);
      }
    }
  }

  // Clear the internal cargo markers, keep real delay reasons.
  for (const s of shipments) if (s.delayReason?.startsWith("__")) s.delayReason = undefined;

  // Vehicles / drivers on active trips.
  for (const s of shipments) {
    if (["Dispatched", "In transit", "Delayed"].includes(s.status) && s.vehicleId) {
      const v = vehicles.find((x) => x.id === s.vehicleId)!;
      v.availability = "On trip";
      v.location = s.status === "Dispatched" ? s.origin : `En route to ${s.destination}`;
      const d = drivers.find((x) => x.id === s.driverId);
      if (d) d.availability = "On trip";
    }
  }
  drivers[10].availability = drivers[10].availability === "On trip" ? "On trip" : "Off duty";

  // Recent activity feed.
  const activities: Activity[] = [];
  const nowMs = now.getTime();
  const recent = [...shipments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let minutes = 6;
  const push = (kind: Activity["kind"], text: string, ref?: string) => {
    activities.push({ id: `act_${activities.length + 1}`, at: new Date(nowMs - minutes * 60_000).toISOString(), kind, text, ref });
    minutes += 18 + Math.floor(r() * 70);
  };
  const delayed = shipments.filter((s) => s.status === "Delayed");
  const transit = shipments.filter((s) => s.status === "In transit");
  const dispatched = shipments.filter((s) => s.status === "Dispatched");
  const delivered = shipments.filter((s) => s.status === "Delivered" && s.deliveredDate && s.deliveredDate >= addDays(T, -2));
  const regOf = (id: string | null) => vehicles.find((v) => v.id === id)?.reg ?? "";
  if (delayed[0]) push("status", `${delayed[0].id} marked Delayed: ${delayed[0].delayReason}`, delayed[0].id);
  if (dispatched[0]) push("status", `${dispatched[0].id} dispatched from ${dispatched[0].origin} on ${regOf(dispatched[0].vehicleId)}`, dispatched[0].id);
  if (delivered[0]) push("status", `${delivered[0].id} delivered in ${delivered[0].destination}`, delivered[0].id);
  if (recent[0]) push("shipment", `${recent[0].id} created for ${customers.find((c) => c.id === recent[0].customerId)?.company}`, recent[0].id);
  push("fleet", `${workshop.reg} checked into the workshop for brake service`);
  if (transit[0]) { const p = planRoute(transit[0].origin, transit[0].destination).path; push("status", p.length > 2 ? `${transit[0].id} passed ${p[1]} checkpoint` : `${transit[0].id} is on the road to ${transit[0].destination}`, transit[0].id); }
  if (delivered[1]) push("status", `${delivered[1].id} delivered in ${delivered[1].destination}`, delivered[1].id);
  if (recent[1]) push("shipment", `${recent[1].id} created for ${customers.find((c) => c.id === recent[1].customerId)?.company}`, recent[1].id);
  push("driver", `${drivers[13].name} completed defensive driving refresher`);
  if (transit[1]) push("status", `${transit[1].id} dispatched from ${transit[1].origin}`, transit[1].id);
  push("customer", `${customers[10].company} account updated`);

  return {
    version: DATA_VERSION,
    shipments,
    vehicles,
    drivers,
    customers,
    activities,
    settings: {
      company: {
        name: "Globe Trans Ltd",
        tin: "112-457-893",
        address: "Plot 42, Nyerere Road, Dar es Salaam",
        phone: "+255 22 286 4410",
        email: "operations@globetrans.co.tz",
        currency: "TZS",
      },
      user: {
        name: "Asha Kimaro",
        role: "Operations manager",
        email: "asha.kimaro@globetrans.co.tz",
        phone: "+255 754 600 128",
      },
      notifications: {
        delays: true,
        deliveries: true,
        maintenance: true,
        newShipments: false,
        dailySummary: true,
        sms: false,
      },
    },
  };
}
