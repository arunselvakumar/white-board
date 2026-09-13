import {
  Banknote,
  BookOpen,
  CalendarClock,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

import type { AppNavHref } from "@/lib/app-nav";

export const APP_NAV_ICONS: Record<AppNavHref, LucideIcon> = {
  "/": LayoutDashboard,
  "/students": GraduationCap,
  "/courses": BookOpen,
  "/batches": CalendarClock,
  "/fees": Banknote,
};
