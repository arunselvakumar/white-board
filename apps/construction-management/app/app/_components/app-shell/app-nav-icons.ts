import {
  Briefcase,
  Building2,
  LayoutDashboard,
  Library,
  Megaphone,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { AppNavHref } from "@/lib/app-nav";

export const APP_NAV_ICONS: Record<AppNavHref, LucideIcon> = {
  // The Company Dashboard uses the Project Dashboard's icon; Workspace has
  // a briefcase so the two grids do not look alike.
  "/app/dashboard": LayoutDashboard,
  "/app/projects": Building2,
  "/app/marketing": Megaphone,
  // Human Resources (ADR CM-0034): every Staff page lives under /app/staff.
  "/app/staff": UsersRound,
  "/app/workspace": Briefcase,
  "/app/masters": Library,
  "/app/settings": Settings,
};
