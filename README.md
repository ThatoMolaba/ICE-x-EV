# Voltage · ICE vs EV cost

An interactive total cost-of-ownership comparison for petrol (ICE) vs electric
(EV) cars, tuned for the South African market. Built on the **Voltage** design
system in [`handoff/`](handoff/).

> Petrol, power, upkeep and depreciation — one honest number.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # type-check + production bundle into dist/
npm run preview  # serve the built bundle
```

## How it works

- **`src/lib/tco.ts`** — the pure computation engine. For each vehicle it sums
  energy (fuel ÷ charging), maintenance (service + insurance + tyres) and
  depreciation (compounding annual resale loss) over your ownership horizon.
  TCO = `price − resale + running costs`. `compare()` also finds the break-even
  year where the cheaper-upfront option gets overtaken.
- **`src/lib/presets.ts`** — indicative SA vehicle figures and default prices
  (petrol R/L, electricity R/kWh). All editable — they're estimates, not quotes.
- **`src/components/`** — the UI: editable vehicle columns, side-by-side
  results, and a cumulative-cost crossover chart (recharts).

## Theming

The look comes straight from the handoff. `src/index.css` is a copy of
[`handoff/index.css`](handoff/index.css) (the Voltage theme), and
`tailwind.config.ts` wires the shadcn/Tailwind HSL token contract it expects.
Dark is the default; the toggle in the header flips to light. To reskin, replace
`src/index.css` — no component changes needed. See
[`handoff/TOKEN-MAP.md`](handoff/TOKEN-MAP.md).

## Stack

Vite · React 18 · TypeScript · Tailwind CSS v3 · recharts · lucide-react
