import {
  Banknote,
  BookOpen,
  CalendarClock,
  GraduationCap,
  LayoutDashboard,
  UserRound,
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
  "/student": UserRound,
  "/parent": UsersRound,
  "/teacher": BookOpen,
  "/teachers": UsersRound,
  "/attendance": CalendarClock,
};
