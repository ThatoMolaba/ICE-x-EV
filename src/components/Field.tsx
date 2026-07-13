import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  value: number;
  step?: number;
  min?: number;
  onChange: (v: number) => void;
}

/** Labeled numeric input with an optional unit prefix/suffix. */
export function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  step = 1,
  min = 0,
  onChange,
}: FieldProps) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-foreground">{label}</span>
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
      </div>
      <div className="flex items-center rounded-lg bg-secondary px-3 hairline-soft focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-shadow">
        {prefix && (
          <span className="mr-1.5 select-none text-[13px] text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-full bg-transparent py-2.5 text-[15px] font-display tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && (
          <span className="ml-1.5 select-none whitespace-nowrap text-[12px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-card hairline-soft ${className}`}
    >
      {children}
    </div>
  );
}
