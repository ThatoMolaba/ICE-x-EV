/** ZAR formatting helpers. */

const zar0 = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

const zar2 = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num0 = new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 });

/** R 76 000 */
export const rand = (v: number) => zar0.format(Math.round(v)).replace(/ /g, " ");

/** R 2.34 — for per-km / per-unit values */
export const randPrecise = (v: number) => zar2.format(v).replace(/ /g, " ");

/** 20 000 */
export const number = (v: number) => num0.format(Math.round(v)).replace(/ /g, " ");

/** Compact rand for axis ticks: R540k, R1.1m */
export function randCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R${(v / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `R${Math.round(v / 1_000)}k`;
  return `R${Math.round(v)}`;
}
