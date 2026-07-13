# Voltage → codebase handoff

Drop-in theme that maps the **Voltage** design language onto your existing
`src/index.css` token contract. Replace the file and the app reskins — no
component rewrites required.

## 1. What to change

| File | Action |
|---|---|
| `src/index.css` | **Replace** with `handoff/index.css`. |
| `tailwind.config.ts` | No change required. (Optional additions below for `--v-*`.) |
| `src/App.tsx` | Keep `defaultTheme="dark"`. Voltage is dark-first. |
| Fonts | Already `Inter` (sans) + `Space Grotesk` (display). For prod, self-host instead of the Google import. |

## 2. Two token systems (no clashes)

**shadcn / Tailwind HSL tokens** keep their exact names, so `bg-background`,
`text-foreground`, `bg-card`, `bg-primary`, `border-border`,
`text-muted-foreground`, `bg-secondary`, `bg-accent`, `ring`, the
`ice` / `ev` / `surface` colors and the `sidebar-*` set all render Voltage automatically.

**Raw Voltage tokens** are namespaced `--v-*` to avoid colliding with the HSL
tokens. Use them for effects the HSL system can't express:

| Voltage token (in my HTML) | Codebase token | Use |
|---|---|---|
| `var(--bg)` | `bg-background` **or** `var(--v-bg)` | page background |
| `var(--surface)` | `bg-card` **or** `var(--v-surface)` | panels, cards |
| `var(--surface-2)` | `bg-secondary` / `bg-surface-elevated` **or** `var(--v-surface-2)` | hovers, insets |
| `var(--fg)` | `text-foreground` **or** `var(--v-fg)` | primary text |
| `var(--fg-2)` | `text-muted-foreground` **or** `var(--v-fg-2)` | secondary text |
| `var(--fg-3)` | `var(--v-fg-3)` | faint text / captions |
| `var(--accent)` | `text-primary` / `bg-primary` **or** `var(--v-accent)` | the one electric accent |
| `var(--line)` | `.hairline` util **or** `var(--v-line)` | translucent hairline border |
| `var(--glow)` | `.glow-accent` util **or** `var(--v-glow)` | accent glow shadow |
| `var(--band)` | `.bg-band` util **or** `var(--v-band)` | diagonal energy gradient |

### Porting one of my Voltage HTML screens verbatim
Find-and-replace the Voltage token prefix in that component's CSS:
`var(--` → `var(--v-` (and the `-2`/`-3` suffixes carry over). Everything else
already resolves through the shared theme.

## 3. Palette (computed HSL)

| Role | Dark (hex → HSL) | Light (hex → HSL) |
|---|---|---|
| background | `#0A0B0D` → `220 13% 5%` | `#F4F4F2` → `60 8% 95%` |
| surface / card | `#14171D` → `220 18% 10%` | `#FFFFFF` → `0 0% 100%` |
| foreground | `#F3F5F8` → `216 26% 96%` | `#121419` → `223 16% 8%` |
| muted-foreground | `#9DA0A8` → `224 6% 64%` | `#5A5E66` → `220 6% 38%` |
| primary / accent (EV) | `#6E98FF` → `223 100% 72%` | `#2F5BD6` → `224 67% 51%` |
| ice (mono) | `#7E828C` → `223 6% 52%` | `#6B6F78` → `222 6% 45%` |
| border (line over bg) | → `220 4% 14%` | → `76 1% 84%` |

## 4. Migration notes

- The old neon helpers (`gradient-ice-ev`, `gradient-ice`, `gradient-ev`,
  `text-gradient-ice-ev`, `glow-ice`, `glass`) are **dropped** by the new
  palette. Replace usages with: `bg-primary` / `text-primary` for the accent,
  `.glow-accent` for glow, `.bg-band` for the hero gradient, `bg-card` for glass panels.
- `--ice` is now a **graphite mono** (not red) — the design treats the mono
  palette as "ICE / past" and the single accent as "EV / future".
- Borders: the HSL `--border` is a solid approximation of the translucent
  hairline. For pixel-faithful hairlines on varied backgrounds, use the
  `.hairline` utility (`var(--v-line)`).
- Default radius stays `0.75rem`; Voltage cards use 12–20px — bump per-component if desired.

## 5. Optional tailwind.config additions
Only if you want Tailwind classes for the raw tokens:
```ts
// theme.extend.colors
"v-line":   "var(--v-line)",
"v-accent": "var(--v-accent)",
"v-fg-3":   "var(--v-fg-3)",
// boxShadow
// "glow": "0 0 30px -5px var(--v-glow)",
```

Files: `handoff/index.css` (the theme), `handoff/tokens.html` (visual swatch sheet, both modes).
