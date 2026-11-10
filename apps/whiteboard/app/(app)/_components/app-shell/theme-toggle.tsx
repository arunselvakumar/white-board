"use client";

import { Moon, Sun } from "lucide-react";
import { Switch } from "@repo/ui/components/switch";

import { useThemeStore } from "@/lib/theme-store";

/** The Dark mode row in the sidebar footer, shaped like a menu row (ADR-0049). */
export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div className="flex h-10 items-center gap-3 rounded-xl px-3">
      {theme === "dark" ? (
        <Moon
          aria-hidden="true"
          className="text-sidebar-foreground/65 size-[18px] shrink-0"
        />
      ) : (
        <Sun
          aria-hidden="true"
          className="text-sidebar-foreground/65 size-[18px] shrink-0"
        />
      )}
      <label
        htmlFor="theme-toggle"
        className="text-sidebar-foreground/70 min-w-0 flex-1 truncate text-sm"
      >
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
