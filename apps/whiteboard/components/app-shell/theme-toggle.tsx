"use client";

import { Moon, Sun } from "lucide-react";
import { Switch } from "@repo/ui/components/switch";

import { useThemeStore } from "@/lib/theme-store";

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div className="text-sidebar-foreground/65 flex h-10 items-center gap-3 rounded-xl px-3">
      {theme === "dark" ? (
        <Moon aria-hidden="true" className="size-[18px]" />
      ) : (
        <Sun aria-hidden="true" className="size-[18px]" />
      )}
      <label htmlFor="theme-toggle" className="min-w-0 flex-1 text-sm">
        Dark mode
      </label>
      <Switch
        id="theme-toggle"
        aria-label="Dark mode"
        checked={theme === "dark"}
        onCheckedChange={(checked) => {
          setTheme(checked ? "dark" : "light");
        }}
      />
    </div>
  );
}
