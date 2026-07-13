/**
 * Total cost-of-ownership engine — ICE vs EV.
 * Pure functions, no UI. All money in ZAR, all distance in km.
 */

export type Powertrain = "ice" | "ev";

export interface Vehicle {
  id: string;
  name: string;
  powertrain: Powertrain;
  /** Purchase price, R */
  price: number;
  /** ICE: litres / 100km · EV: kWh / 100km */
  consumption: number;
  /** Scheduled servicing, R / year */
  servicePerYear: number;
  /** Insurance premium, R / year */
  insurancePerYear: number;
  /** Tyres + sundries, R / year */
  tyresPerYear: number;
  /** Straight-line-ish annual depreciation, fraction (0.15 = 15%/yr) */
  depreciationRate: number;
}

export interface Assumptions {
  /** Distance driven per year, km */
  annualKm: number;
  /** Ownership horizon, years */
  years: number;
  /** Petrol / diesel price, R / litre */
  fuelPrice: number;
  /** Home charging tariff, R / kWh */
  electricityPrice: number;
}

export interface YearRow {
  year: number; // 1..N
  energy: number;
  maintenance: number;
  running: number; // energy + maintenance for that year
  cumulativeRunning: number;
  bookValue: number; // resale value if sold at end of this year
  /** Net money out if you bought new and sold at end of this year */
  netCumulative: number;
}

export interface VehicleResult {
  vehicle: Vehicle;
  /** Effective energy price used (R/L or R/kWh) */
  energyPrice: number;
  /** Energy units consumed per year (L or kWh) */
  energyUnitsPerYear: number;
  rows: YearRow[];
  totalEnergy: number;
  totalMaintenance: number;
  resaleValue: number; // book value at end of horizon
  /** price − resale + total running over the horizon */
  tco: number;
  costPerKm: number;
  /** Average money out per month over the horizon */
  monthlyCost: number;
}

const energyPriceFor = (v: Vehicle, a: Assumptions) =>
  v.powertrain === "ice" ? a.fuelPrice : a.electricityPrice;

export function computeVehicle(v: Vehicle, a: Assumptions): VehicleResult {
  const energyPrice = energyPriceFor(v, a);
  const energyUnitsPerYear = (v.consumption / 100) * a.annualKm;
  const energyPerYear = energyUnitsPerYear * energyPrice;
  const maintenancePerYear =
    v.servicePerYear + v.insurancePerYear + v.tyresPerYear;

  const rows: YearRow[] = [];
  let cumulativeRunning = 0;
  for (let year = 1; year <= a.years; year++) {
    const running = energyPerYear + maintenancePerYear;
    cumulativeRunning += running;
    const bookValue = v.price * Math.pow(1 - v.depreciationRate, year);
    rows.push({
      year,
      energy: energyPerYear,
      maintenance: maintenancePerYear,
      running,
      cumulativeRunning,
      bookValue,
      netCumulative: v.price - bookValue + cumulativeRunning,
    });
  }

  const resaleValue = v.price * Math.pow(1 - v.depreciationRate, a.years);
  const totalEnergy = energyPerYear * a.years;
  const totalMaintenance = maintenancePerYear * a.years;
  const tco = v.price - resaleValue + cumulativeRunning;
  const totalKm = a.annualKm * a.years;

  return {
    vehicle: v,
    energyPrice,
    energyUnitsPerYear,
    rows,
    totalEnergy,
    totalMaintenance,
    resaleValue,
    tco,
    costPerKm: totalKm > 0 ? tco / totalKm : 0,
    monthlyCost: a.years > 0 ? tco / (a.years * 12) : 0,
  };
}

export interface Comparison {
  ice: VehicleResult;
  ev: VehicleResult;
  /** Positive = EV is cheaper to own over the horizon */
  evSavesTotal: number;
  /** Whole year EV's net cumulative first drops below ICE's; null if never */
  crossoverYear: number | null;
  /** Combined chart series, one point per year (plus year 0 = purchase) */
  series: Array<{ year: number; ice: number; ev: number }>;
}

export function compare(
  ice: Vehicle,
  ev: Vehicle,
  a: Assumptions
): Comparison {
  const iceR = computeVehicle(ice, a);
  const evR = computeVehicle(ev, a);

  const series: Comparison["series"] = [
    { year: 0, ice: 0, ev: 0 },
    ...Array.from({ length: a.years }, (_, i) => ({
      year: i + 1,
      ice: Math.round(iceR.rows[i].netCumulative),
      ev: Math.round(evR.rows[i].netCumulative),
    })),
  ];

  let crossoverYear: number | null = null;
  for (let i = 0; i < a.years; i++) {
    const iceLeads = iceR.rows[i].netCumulative < evR.rows[i].netCumulative;
    // crossover = first year EV becomes the cheaper one and stays measured
    if (!iceLeads) {
      crossoverYear = i + 1;
      break;
    }
  }
  // Only meaningful if EV started behind (more expensive early on)
  if (crossoverYear === 1 && evR.rows[0].netCumulative <= iceR.rows[0].netCumulative) {
    crossoverYear = evR.vehicle.price > iceR.vehicle.price ? 1 : null;
  }

  return {
    ice: iceR,
    ev: evR,
    evSavesTotal: iceR.tco - evR.tco,
    crossoverYear,
    series,
  };
}
