import { DomainError } from "@/src/shared-kernel/domain-error";

import type { ProjectModuleKey } from "./project-modules";

/**
 * The Project Dashboard's sections (ADR CM-0013 §12), in the default
 * order. `milestone` names the milestone whose data fills a section that
 * is still a stub; null for sections with data today. `module` is the
 * Project module (`project-modules.ts`) a section belongs to: hiding that
 * module on a Project leaves the section out of its dashboard (CM-902,
 * ADR CM-0021 §4); null for sections of no module. Keys are stored in
 * `member_preferences.dashboard_sections`: never rename one.
 */
export const DASHBOARD_SECTIONS = [
  { key: "summary", label: "Project summary", milestone: null, module: null },
  {
    key: "attendance",
    label: "Attendance",
    milestone: null,
    module: "attendance",
  },
  { key: "task", label: "Task", milestone: null, module: "tasks" },
  { key: "payments", label: "Payments", milestone: null, module: "payments" },
  {
    key: "daily_work",
    label: "Daily Work",
    milestone: null,
    module: "daily_worksheet",
  },
  {
    key: "equipment_usage",
    label: "Equipment Usage",
    milestone: null,
    module: "equipment_usage",
  },
  {
    key: "materials",
    label: "Materials",
    milestone: null,
    module: "materials",
  },
  {
    key: "issue_snag",
    label: "Issue & Snag",
    milestone: null,
    module: "issues",
  },
  {
    key: "inspection_request",
    label: "Inspection Request",
    milestone: null,
    module: "inspections",
  },
  // Sales (M10, ADR CM-0022 §11, CM-1008).
  { key: "booking", label: "Booking", milestone: null, module: "bookings" },
  { key: "inquiry", label: "Inquiry", milestone: null, module: "inquiries" },
] as const satisfies readonly {
  key: string;
  label: string;
  milestone: string | null;
  module: ProjectModuleKey | null;
}[];

export type DashboardSectionKey = (typeof DASHBOARD_SECTIONS)[number]["key"];

/**
 * The milestone a stub section waits for, or null when it shows data. No
 * section is a stub since M10; later modules may add one again.
 */
export function sectionMilestone(key: string): string | null {
  const section: { milestone: string | null } | undefined =
    DASHBOARD_SECTIONS.find((item) => item.key === key);
  return section?.milestone ?? null;
}

export const DASHBOARD_SECTION_KEYS: readonly DashboardSectionKey[] =
  DASHBOARD_SECTIONS.map((section) => section.key);

export function isDashboardSectionKey(
  value: string,
): value is DashboardSectionKey {
  return (DASHBOARD_SECTION_KEYS as readonly string[]).includes(value);
}

/** One section in a member's layout. */
export type DashboardSectionSetting = {
  key: DashboardSectionKey;
  visible: boolean;
};

/** Every section, shown, in the default order. */
export function defaultDashboardLayout(): DashboardSectionSetting[] {
  return DASHBOARD_SECTION_KEYS.map((key) => ({ key, visible: true }));
}

/**
 * The sections in the member's order with what they show; sections the
 * member never placed (new ones, or no layout yet) follow, shown, in the
 * default order.
 */
function complete(
  placed: readonly DashboardSectionSetting[],
): DashboardSectionSetting[] {
  const keys = new Set(placed.map((section) => section.key));
  return [
    ...placed,
    ...defaultDashboardLayout().filter((section) => !keys.has(section.key)),
  ];
}

/**
 * A stored layout read back. Anything unreadable, unknown keys and
 * repeats are dropped rather than failing the dashboard.
 */
export function storedDashboardLayout(
  stored: unknown,
): DashboardSectionSetting[] {
  if (!Array.isArray(stored)) return defaultDashboardLayout();
  const placed: DashboardSectionSetting[] = [];
  for (const entry of stored as unknown[]) {
    if (typeof entry !== "object" || entry == null) continue;
    const { key, visible } = entry as { key?: unknown; visible?: unknown };
    if (typeof key !== "string" || !isDashboardSectionKey(key)) continue;
    if (placed.some((section) => section.key === key)) continue;
    placed.push({ key, visible: visible !== false });
  }
  return complete(placed);
}

/**
 * A layout sent by Manage Dashboard: known keys only (400
 * `DASHBOARD_SECTION_UNKNOWN` with `details.keys`), each once (400
 * `DASHBOARD_SECTION_DUPLICATE`). Sections left out follow, shown.
 */
export function cleanDashboardLayout(
  sections: readonly { key: string; visible: boolean }[],
): DashboardSectionSetting[] {
  const unknown = sections
    .map((section) => section.key)
    .filter((key) => !isDashboardSectionKey(key));
  if (unknown.length > 0)
    throw new DomainError(
      "DASHBOARD_SECTION_UNKNOWN",
      "One of these sections does not exist. Reload and try again.",
      { details: { keys: unknown } },
    );
  const keys = sections.map((section) => section.key);
  const repeated = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (repeated.length > 0)
    throw new DomainError(
      "DASHBOARD_SECTION_DUPLICATE",
      "Each section can be placed once.",
      { details: { keys: [...new Set(repeated)] } },
    );
  return complete(
    sections.map((section) => ({
      key: section.key as DashboardSectionKey,
      visible: section.visible,
    })),
  );
}

/**
 * The sections left out of a Project's dashboard because their module is
 * hidden on it (CM-902): Manage Dashboard shows them disabled with
 * "Hidden on this Project".
 */
export function sectionsHiddenOnProject(
  hiddenModules: Iterable<string>,
): Set<DashboardSectionKey> {
  const hidden = new Set(hiddenModules);
  return new Set(
    DASHBOARD_SECTIONS.filter(
      (section) => section.module != null && hidden.has(section.module),
    ).map((section) => section.key),
  );
}
