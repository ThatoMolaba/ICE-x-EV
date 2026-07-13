import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Comparison } from "../lib/tco";
import { rand, randCompact } from "../lib/format";

function readVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return v.trim() || fallback;
}

export function CrossoverChart({
  comparison,
  iceName,
  evName,
  themeKey,
}: {
  comparison: Comparison;
  iceName: string;
  evName: string;
  /** changes when theme flips so colors re-read */
  themeKey: string;
}) {
  // read live theme colors (cheap; runs on each render / theme flip)
  void themeKey;
  const evColor = readVar("--v-accent", "#6E98FF");
  const iceColor = `hsl(${readVar("--ice", "223 6% 52%")})`;
  const grid = readVar("--v-line-2", "rgba(255,255,255,0.055)");
  const axis = `hsl(${readVar("--muted-foreground", "224 6% 64%")})`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={comparison.series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="fillEv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={evColor} stopOpacity={0.25} />
            <stop offset="100%" stopColor={evColor} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillIce" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={iceColor} stopOpacity={0.18} />
            <stop offset="100%" stopColor={iceColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis
          dataKey="year"
          tickFormatter={(y) => (y === 0 ? "Buy" : `Yr ${y}`)}
          tick={{ fill: axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={randCompact}
          tick={{ fill: axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          contentStyle={{
            background: readVar("--v-surface", "#14171D"),
            border: `1px solid ${readVar("--v-line", "rgba(255,255,255,.1)")}`,
            borderRadius: 12,
            fontSize: 12,
          }}
          labelFormatter={(y) => (y === 0 ? "At purchase" : `Year ${y}`)}
          formatter={(value: number, key) => [
            rand(value),
            key === "ev" ? evName : iceName,
          ]}
        />
        {comparison.crossoverYear != null && (
          <ReferenceLine
            x={comparison.crossoverYear}
            stroke={evColor}
            strokeDasharray="4 4"
            label={{
              value: `break-even · yr ${comparison.crossoverYear}`,
              position: "insideTopRight",
              fill: evColor,
              fontSize: 11,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="ice"
          stroke={iceColor}
          strokeWidth={2}
          fill="url(#fillIce)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="ev"
          stroke={evColor}
          strokeWidth={2.5}
          fill="url(#fillEv)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
