import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { Assumptions, Vehicle } from "./lib/tco";
import { compare } from "./lib/tco";
import {
  DEFAULT_ASSUMPTIONS,
  EV_PRESETS,
  ICE_PRESETS,
  withId,
} from "./lib/presets";
import { Field } from "./components/Field";
import { VehicleCard } from "./components/VehicleCard";
import { ResultsPanel } from "./components/ResultsPanel";
import { CrossoverChart } from "./components/CrossoverChart";
import { ThemeToggle } from "./components/ThemeToggle";

const freshIce = () => withId({ ...ICE_PRESETS[1] });
const freshEv = () => withId({ ...EV_PRESETS[0] });

export default function App() {
  const [ice, setIce] = useState<Vehicle>(freshIce);
  const [ev, setEv] = useState<Vehicle>(freshEv);
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);

  // Re-read CSS theme colors for the chart whenever the `dark` class flips.
  const [themeKey, setThemeKey] = useState("init");
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setThemeKey(document.documentElement.className)
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  const comparison = useMemo(
    () => compare(ice, ev, assumptions),
    [ice, ev, assumptions]
  );

  const patchIce = (p: Partial<Vehicle>) => setIce((v) => ({ ...v, ...p }));
  const patchEv = (p: Partial<Vehicle>) => setEv((v) => ({ ...v, ...p }));
  const patchA = (p: Partial<Assumptions>) =>
    setAssumptions((a) => ({ ...a, ...p }));

  const reset = () => {
    setIce(freshIce());
    setEv(freshEv());
    setAssumptions(DEFAULT_ASSUMPTIONS);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glow">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" />
              </svg>
            </span>
            <span className="font-display text-[17px] font-semibold tracking-tight">
              Voltage
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container pb-24 pt-10 sm:pt-14">
        {/* Hero */}
        <section className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] text-primary hairline">
            <span className="h-1.5 w-1.5 rounded-full bg-primary glow-accent" />
            Live model · South Africa
          </span>
          <h1 className="mt-5 max-w-2xl font-display text-[clamp(2rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">
            From ICE to EV.
            <br />
            <span className="text-muted-foreground">The real cost, side by side.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Petrol, power, upkeep and depreciation — one honest number. Edit any
            figure to match your own car, your own driving, your own tariff.
          </p>
        </section>

        {/* Assumptions */}
        <section className="mt-10 rounded-2xl bg-card p-5 hairline-soft sm:p-6">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Your driving &amp; energy
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Field
              label="Distance / year"
              suffix="km"
              value={assumptions.annualKm}
              step={1000}
              onChange={(annualKm) => patchA({ annualKm })}
            />
            <Field
              label="Keep it for"
              suffix="years"
              value={assumptions.years}
              step={1}
              min={1}
              onChange={(years) => patchA({ years: Math.max(1, Math.round(years)) })}
            />
            <Field
              label="Petrol price"
              prefix="R"
              suffix="/ L"
              value={assumptions.fuelPrice}
              step={0.5}
              onChange={(fuelPrice) => patchA({ fuelPrice })}
            />
            <Field
              label="Electricity"
              prefix="R"
              suffix="/ kWh"
              value={assumptions.electricityPrice}
              step={0.25}
              onChange={(electricityPrice) => patchA({ electricityPrice })}
            />
          </div>
        </section>

        {/* Inputs + results */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <VehicleCard vehicle={ice} onChange={patchIce} />
            <VehicleCard vehicle={ev} onChange={patchEv} />
          </div>

          <div className="flex flex-col gap-6">
            <ResultsPanel comparison={comparison} />
            <div className="rounded-2xl bg-card p-5 hairline-soft sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Cumulative cost to own
                </h2>
                <div className="flex items-center gap-4 text-[11.5px]">
                  <span className="flex items-center gap-1.5 text-ice">
                    <span className="h-2 w-2 rounded-full bg-ice" /> {ice.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary" /> {ev.name}
                  </span>
                </div>
              </div>
              <CrossoverChart
                comparison={comparison}
                iceName={ice.name}
                evName={ev.name}
                themeKey={themeKey}
              />
            </div>
          </div>
        </div>

        {/* Footer note */}
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-[12.5px] text-muted-foreground">
          <p className="max-w-2xl">
            Figures are indicative South African estimates, not quotes. Resale uses
            compounding annual depreciation; running costs assume today's prices held
            flat. Adjust anything to fit reality.
          </p>
          <a
            className="inline-flex items-center gap-1.5 text-foreground transition-opacity hover:opacity-70"
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            Back to top <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </footer>
      </main>
    </div>
  );
}
