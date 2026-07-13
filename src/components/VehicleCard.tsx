import { Fuel, Zap } from "lucide-react";
import type { Vehicle } from "../lib/tco";
import { EV_PRESETS, ICE_PRESETS } from "../lib/presets";
import { Field } from "./Field";

interface Props {
  vehicle: Vehicle;
  onChange: (patch: Partial<Vehicle>) => void;
}

export function VehicleCard({ vehicle, onChange }: Props) {
  const isEv = vehicle.powertrain === "ev";
  const presets = isEv ? EV_PRESETS : ICE_PRESETS;
  const Icon = isEv ? Zap : Fuel;
  const accent = isEv ? "text-primary" : "text-ice";
  const consumptionSuffix = isEv ? "kWh/100km" : "L/100km";

  const applyPreset = (name: string) => {
    const p = presets.find((x) => x.name === name);
    if (p) onChange({ ...p });
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 hairline-soft sm:p-6">
      <header className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-secondary ${accent}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {isEv ? "EV · future" : "ICE · petrol"}
          </div>
          <div className="font-display text-[15px] font-semibold text-foreground">
            {vehicle.name}
          </div>
        </div>
      </header>

      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-medium text-foreground">
          Pick a model
        </span>
        <div className="relative">
          <select
            value={presets.some((p) => p.name === vehicle.name) ? vehicle.name : ""}
            onChange={(e) => applyPreset(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-lg bg-secondary px-3 py-2.5 text-[14px] text-foreground outline-none hairline-soft focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>
              Custom — {vehicle.name}
            </option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            ▾
          </span>
        </div>
      </label>

      <Field
        label="Purchase price"
        prefix="R"
        value={vehicle.price}
        step={5000}
        onChange={(price) => onChange({ price })}
      />
      <Field
        label="Consumption"
        suffix={consumptionSuffix}
        value={vehicle.consumption}
        step={0.1}
        onChange={(consumption) => onChange({ consumption })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Service / yr"
          prefix="R"
          value={vehicle.servicePerYear}
          step={250}
          onChange={(servicePerYear) => onChange({ servicePerYear })}
        />
        <Field
          label="Insurance / yr"
          prefix="R"
          value={vehicle.insurancePerYear}
          step={250}
          onChange={(insurancePerYear) => onChange({ insurancePerYear })}
        />
        <Field
          label="Tyres etc / yr"
          prefix="R"
          value={vehicle.tyresPerYear}
          step={100}
          onChange={(tyresPerYear) => onChange({ tyresPerYear })}
        />
        <Field
          label="Depreciation"
          suffix="%/yr"
          value={Math.round(vehicle.depreciationRate * 1000) / 10}
          step={0.5}
          onChange={(pct) => onChange({ depreciationRate: pct / 100 })}
        />
      </div>
    </div>
  );
}
