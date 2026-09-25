"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { useThemeStore } from "@/lib/theme-store";

export function ThemePreferenceSync() {
  const theme = useThemeStore((state) => state.theme);
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return null;
}
