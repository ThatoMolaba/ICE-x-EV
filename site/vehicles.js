// vehicles.js — curated South African vehicle spec table (source of truth).
//
// Powers two things:
//   1. The calculator's "quick pick" — fills price + consumption + running costs
//      with trustworthy figures instead of the user guessing.
//   2. The future autofill feature — a pasted listing fills price/trim, while
//      consumption comes from HERE (ads rarely state real L/100 or kWh/100).
//
// Fields per vehicle:
//   name        display name
//   powertrain  'ice' | 'ev'
//   price       indicative list price, R
//   use         ICE: L/100km · EV: kWh/100km
//   maint       service + tyres + sundries, R / year
//   dep         straight-ish annual depreciation, % / year (drives resale)
//
// Figures are indicative mid-2026 estimates — refine against real quotes.
window.VEHICLE_SPECS = [
  // ---- ICE ----
  { name: "Suzuki Swift 1.2 GL",        powertrain: "ice", price: 240000, use: 4.9, maint: 6500,  dep: 13 },
  { name: "VW Polo Vivo 1.4",           powertrain: "ice", price: 265000, use: 6.5, maint: 7000,  dep: 12 },
  { name: "Hyundai i20 1.2 Motion",     powertrain: "ice", price: 320000, use: 6.3, maint: 7500,  dep: 13 },
  { name: "VW Polo 1.0 TSI",            powertrain: "ice", price: 350000, use: 5.9, maint: 8000,  dep: 12 },
  { name: "Haval Jolion 1.5T",          powertrain: "ice", price: 400000, use: 7.1, maint: 8500,  dep: 15 },
  { name: "Toyota Corolla 1.8 XS",      powertrain: "ice", price: 449900, use: 6.6, maint: 9000,  dep: 12 },
  { name: "Toyota Corolla Cross 1.8",   powertrain: "ice", price: 460000, use: 6.8, maint: 9000,  dep: 12 },
  { name: "Kia Sportage 2.0",           powertrain: "ice", price: 550000, use: 8.1, maint: 10000, dep: 12 },
  { name: "Toyota Hilux 2.4 GD-6",      powertrain: "ice", price: 560000, use: 7.9, maint: 11000, dep: 11 },
  { name: "Ford Ranger 2.0 SiT",        powertrain: "ice", price: 620000, use: 7.6, maint: 12000, dep: 11 },
  { name: "Toyota Fortuner 2.8 GD-6",   powertrain: "ice", price: 780000, use: 7.8, maint: 12000, dep: 11 },
  { name: "VW Golf 8 GTI",              powertrain: "ice", price: 800000, use: 7.2, maint: 13000, dep: 13 },

  // ---- EV ----
  { name: "BYD Dolphin Comfort",        powertrain: "ev",  price: 539900,  use: 15.9, maint: 3500, dep: 18 },
  { name: "GWM Ora 03 400 Pro",         powertrain: "ev",  price: 686000,  use: 15.0, maint: 4000, dep: 18 },
  { name: "BYD Atto 3",                 powertrain: "ev",  price: 770000,  use: 16.0, maint: 4200, dep: 18 },
  { name: "Volvo EX30 Single Motor",    powertrain: "ev",  price: 776000,  use: 16.5, maint: 4500, dep: 18 },
  { name: "Mini Cooper SE",             powertrain: "ev",  price: 740000,  use: 17.0, maint: 4800, dep: 19 },
  { name: "BMW iX1 xDrive30",           powertrain: "ev",  price: 1100000, use: 18.0, maint: 5500, dep: 17 },
  { name: "Volvo EX40 Recharge",        powertrain: "ev",  price: 1100000, use: 18.5, maint: 5500, dep: 18 },
  { name: "Mercedes-Benz EQB 250+",     powertrain: "ev",  price: 1200000, use: 18.5, maint: 6000, dep: 17 },
];
