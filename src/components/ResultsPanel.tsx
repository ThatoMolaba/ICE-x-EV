import type { Comparison, VehicleResult } from "../lib/tco";
import { number, rand, randPrecise } from "../lib/format";

function StatRow({
  label,
  ice,
  ev,
  emphasize = false,
}: {
  label: string;
  ice: string;
  ev: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 py-2.5 hairline-soft border-x-0 border-b-0 ${
        emphasize ? "border-t" : "border-t-0"
      }`}
    >
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span
        className={`text-right font-display tabular-nums text-ice ${
          emphasize ? "text-[15px] font-semibold" : "text-[13.5px]"
        }`}
      >
        {ice}
      </span>
      <span
        className={`min-w-[92px] text-right font-display tabular-nums text-primary ${
          emphasize ? "text-[15px] font-semibold" : "text-[13.5px]"
        }`}
      >
        {ev}
      </span>
    </div>
  );
}

export function ResultsPanel({ comparison }: { comparison: Comparison }) {
  const { ice, ev, evSavesTotal } = comparison;
  const evWins = evSavesTotal > 0;
  const winner = evWins ? ev : ice;
  const saving = Math.abs(evSavesTotal);

  const energyLabel = (r: VehicleResult) =>
    r.vehicle.powertrain === "ev"
      ? `${number(r.energyUnitsPerYear)} kWh/yr`
      : `${number(r.energyUnitsPerYear)} L/yr`;

  return (
    <div className="flex flex-col gap-5">
      {/* Verdict */}
      <div className="overflow-hidden rounded-2xl bg-card hairline-soft">
        <div className="bg-band px-6 py-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 px-3 py-1 text-[12px] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary glow-accent" />
            {evWins ? "EV is cheaper to own" : "ICE is cheaper to own"}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="font-display text-[40px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {rand(saving)}
            </span>
            <span className="pb-1 text-[14px] text-muted-foreground">
              less over {ice.rows.length} years
            </span>
          </div>
          <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            Going with the{" "}
            <span className="font-medium text-foreground">{winner.vehicle.name}</span>{" "}
            saves you {rand(saving)} in total cost of ownership — petrol vs charging,
            upkeep and depreciation, one honest number.
          </p>
        </div>
      </div>

      {/* Side-by-side breakdown */}
      <div className="rounded-2xl bg-card p-5 hairline-soft sm:p-6">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Over {ice.rows.length} years
          </span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-ice">
            ICE
          </span>
          <span className="min-w-[92px] text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            EV
          </span>
        </div>

        <StatRow
          label="Energy use"
          ice={energyLabel(ice)}
          ev={energyLabel(ev)}
        />
        <StatRow
          label="Fuel / charging"
          ice={rand(ice.totalEnergy)}
          ev={rand(ev.totalEnergy)}
        />
        <StatRow
          label="Service · insurance · tyres"
          ice={rand(ice.totalMaintenance)}
          ev={rand(ev.totalMaintenance)}
        />
        <StatRow
          label="Depreciation (price − resale)"
          ice={rand(ice.vehicle.price - ice.resaleValue)}
          ev={rand(ev.vehicle.price - ev.resaleValue)}
        />
        <StatRow
          label="Total cost of ownership"
          ice={rand(ice.tco)}
          ev={rand(ev.tco)}
          emphasize
        />
        <StatRow
          label="Cost per km"
          ice={randPrecise(ice.costPerKm)}
          ev={randPrecise(ev.costPerKm)}
        />
        <StatRow
          label="Average per month"
          ice={rand(ice.monthlyCost)}
          ev={rand(ev.monthlyCost)}
        />
      </div>
    </div>
  );
}
