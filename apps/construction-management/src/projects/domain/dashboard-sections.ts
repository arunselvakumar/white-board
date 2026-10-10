import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * The Project Dashboard's sections (ADR CM-0013 §12), in the default
 * order. `milestone` names the milestone whose data fills a section that
 * is still a stub; null for sections with data today. Keys are stored in
 * `member_preferences.dashboard_sections`: never rename one.
 */
export const DASHBOARD_SECTIONS = [
  { key: "summary", label: "Project summary", milestone: null },
  { key: "attendance", label: "Attendance", milestone: null },
  { key: "task", label: "Task", milestone: "M8" },
  { key: "payments", label: "Payments", milestone: "M7" },
  { key: "daily_work", label: "Daily Work", milestone: "M6" },
  { key: "equipment_usage", label: "Equipment Usage", milestone: "M6" },
  { key: "materials", label: "Materials", milestone: null },
  { key: "issue_snag", label: "Issue & Snag", milestone: "M8" },
  {
    key: "inspection_request",
    label: "Inspection Request",
    milestone: "M8",
  },
  { key: "booking", label: "Booking", milestone: "M10" },
  { key: "inquiry", label: "Inquiry", milestone: "M10" },
] as const;

export type DashboardSectionKey = (typeof DASHBOARD_SECTIONS)[number]["key"];

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
