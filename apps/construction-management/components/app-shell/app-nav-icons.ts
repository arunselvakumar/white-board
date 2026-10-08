import { Building2, LayoutGrid, Library, type LucideIcon } from "lucide-react";

import type { AppNavHref } from "@/lib/app-nav";

export const APP_NAV_ICONS: Record<AppNavHref, LucideIcon> = {
  "/app/projects": Building2,
  "/app/workspace": LayoutGrid,
  "/app/masters": Library,
};
