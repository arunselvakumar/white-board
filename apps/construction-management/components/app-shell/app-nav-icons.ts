import {
  Briefcase,
  Building2,
  LayoutDashboard,
  Library,
  type LucideIcon,
} from "lucide-react";

import type { AppNavHref } from "@/lib/app-nav";

export const APP_NAV_ICONS: Record<AppNavHref, LucideIcon> = {
  // The Company Dashboard uses the Project Dashboard's icon (CM-902);
  // Workspace moves to a briefcase so the two grids do not look alike.
  "/app/dashboard": LayoutDashboard,
  "/app/projects": Building2,
  "/app/workspace": Briefcase,
  "/app/masters": Library,
};
