import {
  Building2,
  BookOpenText,
  CalendarCheck,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Construction,
  FileChartColumn,
  DraftingCompass,
  FileBarChart,
  FileText,
  FlaskConical,
  Images,
  ListTodo,
  LayoutDashboard,
  MapPin,
  OctagonPause,
  Package,
  Users,
  Wallet,
  Waves,
  type LucideIcon,
} from "lucide-react";

import type { ProjectModuleKey } from "@/src/projects/domain/project-modules";

/** The icon of each Project module's tile and section link (CM-411). */
export const PROJECT_MODULE_ICONS: Record<ProjectModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  wings: Building2,
  locations: MapPin,
  amenities: Waves,
  drawings: DraftingCompass,
  testing_reports: FlaskConical,
  gallery: Images,
  documents: FileText,
  resources: Users,
  attendance: CalendarCheck,
  payments: Wallet,
  materials: Package,
  daily_worksheet: ClipboardList,
  equipment_usage: Construction,
  site_diary: BookOpenText,
  hindrances: OctagonPause,
  tasks: ListTodo,
  issues: CircleAlert,
  inspections: ClipboardCheck,
  progress_reports: FileChartColumn,
  reports: FileBarChart,
};

export function projectModuleIcon(key: string): LucideIcon {
  const icons: Partial<Record<string, LucideIcon>> = PROJECT_MODULE_ICONS;
  return icons[key] ?? LayoutDashboard;
}
