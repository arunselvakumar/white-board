import {
  Banknote,
  BookOpen,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  House,
  Inbox,
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
  "/enquiries": Inbox,
  "/courses": BookOpen,
  "/batches": CalendarClock,
  "/fees": Banknote,
  "/student": House,
  "/parent": House,
  "/student/homework": ClipboardList,
  "/parent/homework": ClipboardList,
  "/teacher": BookOpen,
  "/teachers": UsersRound,
  "/attendance": CalendarClock,
};
