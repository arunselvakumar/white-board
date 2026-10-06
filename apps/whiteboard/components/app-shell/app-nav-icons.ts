import {
  Banknote,
  BookOpen,
  CalendarClock,
  GraduationCap,
  House,
  LayoutDashboard,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";

import type { AppNavHref } from "@/lib/app-nav";

export const APP_NAV_ICONS: Record<AppNavHref, LucideIcon> = {
  "/": LayoutDashboard,
  "/calendar": CalendarClock,
  "/online-classes": Video,
  "/students": GraduationCap,
  "/courses": BookOpen,
  "/batches": CalendarClock,
  "/fees": Banknote,
  "/student": House,
  "/parent": House,
  "/teacher": BookOpen,
  "/teachers": UsersRound,
  "/attendance": CalendarClock,
};
