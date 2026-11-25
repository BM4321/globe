export const SHIPMENT_STATUSES = [
  "Pending",
  "Dispatched",
  "In transit",
  "Delayed",
  "Delivered",
  "Cancelled",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const VEHICLE_AVAILABILITY = ["Available", "On trip", "In workshop", "Off duty"] as const;
export type VehicleAvailability = (typeof VEHICLE_AVAILABILITY)[number];

export const MAINTENANCE_STATUSES = ["Good", "Service due", "In workshop"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const DRIVER_AVAILABILITY = ["Available", "On trip", "Off duty"] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITY)[number];

export const VEHICLE_TYPES = [
  "Prime mover + trailer",
  "Rigid truck",
  "Refrigerated truck",
  "Fuel tanker",
  "Flatbed",
  "Light truck",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export interface Shipment {
  id: string;
  customerId: string;
  origin: string;
  destination: string;
  cargo: string;
  weightKg: number;
  vehicleId: string | null;
  driverId: string | null;
  departureDate: string; // YYYY-MM-DD
  expectedDate: string; // YYYY-MM-DD
  deliveredDate?: string | null;
  status: ShipmentStatus;
  chargeTZS: number;
  delayReason?: string;
  createdAt: string; // ISO
}

export interface Vehicle {
  id: string;
  reg: string;
  type: VehicleType;
  make: string;
  capacityKg: number;
  driverId: string | null;
  location: string;
  availability: VehicleAvailability;
  maintenance: MaintenanceStatus;
  odometerKm: number;
  nextServiceKm: number;
  year: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  licence: string;
  licenceClass: string;
  licenceExpiry: string;
  vehicleId: string | null;
  availability: DriverAvailability;
  base: string;
  joined: string;
}

export interface Customer {
  id: string;
  company: string;
  contact: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  industry: string;
  since: string;
}

export interface Activity {
  id: string;
  at: string; // ISO
  kind: "shipment" | "fleet" | "driver" | "customer" | "status" | "settings";
  text: string;
  ref?: string;
}

export interface Settings {
  company: {
    name: string;
    tin: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
  };
  user: {
    name: string;
    role: string;
    email: string;
    phone: string;
  };
  notifications: {
    delays: boolean;
    deliveries: boolean;
    maintenance: boolean;
    newShipments: boolean;
    dailySummary: boolean;
    sms: boolean;
  };
}

export interface AppData {
  version: number;
  shipments: Shipment[];
  vehicles: Vehicle[];
  drivers: Driver[];
  customers: Customer[];
  activities: Activity[];
  settings: Settings;
}
