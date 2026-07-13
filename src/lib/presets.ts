import type { Assumptions, Vehicle } from "./tco";

/**
 * Indicative South African market figures (mid-2026). Prices, consumption and
 * running costs are editable estimates — not quotes. Insurance is roughly
 * scaled from list price; tweak per your own premium.
 */

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  annualKm: 20_000,
  years: 6,
  fuelPrice: 22.0, // R / litre, 95 unleaded inland
  electricityPrice: 3.5, // R / kWh, home tariff
};

type Seed = Omit<Vehicle, "id" | "insurancePerYear"> & {
  insurancePerYear?: number;
};

const insure = (price: number) => Math.round((price * 0.038) / 100) * 100;

function mk(seed: Seed): Omit<Vehicle, "id"> {
  return {
    ...seed,
    insurancePerYear: seed.insurancePerYear ?? insure(seed.price),
  };
}

export const ICE_PRESETS: Array<Omit<Vehicle, "id">> = [
  mk({
    name: "VW Polo Vivo 1.4",
    powertrain: "ice",
    price: 295_000,
    consumption: 6.5,
    servicePerYear: 5_500,
    tyresPerYear: 2_200,
    depreciationRate: 0.12,
  }),
  mk({
    name: "Toyota Corolla Cross 1.8",
    powertrain: "ice",
    price: 460_000,
    consumption: 6.8,
    servicePerYear: 6_500,
    tyresPerYear: 2_600,
    depreciationRate: 0.12,
  }),
  mk({
    name: "Toyota Hilux 2.4 GD-6",
    powertrain: "ice",
    price: 560_000,
    consumption: 7.9,
    servicePerYear: 7_500,
    tyresPerYear: 3_200,
    depreciationRate: 0.11,
  }),
  mk({
    name: "VW Golf 8 GTI",
    powertrain: "ice",
    price: 800_000,
    consumption: 7.2,
    servicePerYear: 9_000,
    tyresPerYear: 4_000,
    depreciationRate: 0.13,
  }),
];

export const EV_PRESETS: Array<Omit<Vehicle, "id">> = [
  mk({
    name: "BYD Dolphin",
    powertrain: "ev",
    price: 540_000,
    consumption: 15.9,
    servicePerYear: 3_000,
    tyresPerYear: 2_800,
    depreciationRate: 0.18,
  }),
  mk({
    name: "Volvo EX30",
    powertrain: "ev",
    price: 776_000,
    consumption: 16.5,
    servicePerYear: 3_500,
    tyresPerYear: 3_200,
    depreciationRate: 0.18,
  }),
  mk({
    name: "Mini Cooper SE",
    powertrain: "ev",
    price: 740_000,
    consumption: 17.0,
    servicePerYear: 3_800,
    tyresPerYear: 3_000,
    depreciationRate: 0.19,
  }),
  mk({
    name: "BMW iX1 xDrive30",
    powertrain: "ev",
    price: 1_100_000,
    consumption: 18.0,
    servicePerYear: 4_500,
    tyresPerYear: 4_200,
    depreciationRate: 0.17,
  }),
];

let counter = 0;
export const newId = () => `v${++counter}`;

export const withId = (v: Omit<Vehicle, "id">): Vehicle => ({
  ...v,
  id: newId(),
});
