import {
  Building2,
  ClipboardCheck,
  HardHat,
  IndianRupee,
  KeyRound,
  ListChecks,
  Package,
  PhoneCall,
  TriangleAlert,
  Truck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import type { DashboardSectionKey } from "@/src/projects/domain/dashboard-sections";

/**
 * Each Project Dashboard section's icon and tint, shown left of its title
 * on the dashboard and beside its name in Manage dashboard. The tints are
 * whole class names (Tailwind reads them from source): a 10% chip with the
 * 600 or 700 shade in light mode and the 400 shade in dark mode, so the
 * icon keeps at least 3:1 against its chip.
 */
export const SECTION_APPEARANCE: Record<
  DashboardSectionKey,
  { icon: LucideIcon; tint: string }
> = {
  summary: {
    icon: Building2,
    tint: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400",
  },
  attendance: {
    icon: UserCheck,
    tint: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400",
  },
  task: {
    icon: ListChecks,
    tint: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-400",
  },
  payments: {
    icon: IndianRupee,
    tint: "bg-green-500/10 text-green-700 dark:bg-green-400/15 dark:text-green-400",
  },
  daily_work: {
    icon: HardHat,
    tint: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400",
  },
  equipment_usage: {
    icon: Truck,
    tint: "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-400",
  },
  materials: {
    icon: Package,
    tint: "bg-yellow-500/10 text-yellow-700 dark:bg-yellow-400/15 dark:text-yellow-400",
  },
  issue_snag: {
    icon: TriangleAlert,
    tint: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400",
  },
  inspection_request: {
    icon: ClipboardCheck,
    tint: "bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-400",
  },
  booking: {
    icon: KeyRound,
    tint: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400",
  },
  inquiry: {
    icon: PhoneCall,
    tint: "bg-fuchsia-500/10 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-400",
  },
};
