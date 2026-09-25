"use client";

import { Moon, Sun } from "lucide-react";
import { Switch } from "@repo/ui/components/switch";

import { useThemeStore } from "@/lib/theme-store";

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-white/90">
      {theme === "dark" ? (
        <Moon aria-hidden="true" className="size-4" />
      ) : (
        <Sun aria-hidden="true" className="size-4" />
      )}
      <label htmlFor="theme-toggle" className="min-w-0 flex-1 text-sm">
        Dark mode
      </label>
      <Switch
        id="theme-toggle"
        aria-label="Dark mode"
        className="data-checked:bg-white/35 data-unchecked:bg-white/20"
        checked={theme === "dark"}
        onCheckedChange={(checked) => {
          setTheme(checked ? "dark" : "light");
        }}
      />
    </div>
  );
}
