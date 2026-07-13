import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function getInitial(): Theme {
  const stored = localStorage.getItem("voltage-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "dark"; // Voltage is dark-first
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("voltage-theme", theme);
  }, [theme]);

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full p-0.5 hairline bg-card">
      {(["light", "dark"] as const).map((t) => {
        const active = theme === t;
        const Icon = t === "light" ? Sun : Moon;
        return (
          <button
            key={t}
            aria-label={t}
            aria-pressed={active}
            onClick={() => setTheme(t)}
            className={`flex h-7 w-8 items-center justify-center rounded-full transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
