import {
  PROJECT_MODULES,
  type ProjectModuleKey,
} from "@/src/projects/domain/project-modules";
import { PROJECT_NAV_GROUPS } from "@/src/projects/domain/project-nav-groups";
import type { ProjectStructure } from "@/src/projects/domain/project-type";
import { type AppHref, pageHref } from "@/lib/page-href";

export type ProjectNavSection = {
  key: ProjectModuleKey;
  /** The path under `/app/projects/<id>/`. */
  segment: string;
  label: string;
};

export type ProjectNavGroup = {
  label: string;
  sections: readonly ProjectNavSection[];
};

/** The part of a Project home the menu needs (CM-411). */
type HomeModules = {
  modules: readonly { key: string; hidden: boolean }[];
};

const PROJECT_PATH = /^\/app\/projects\/([^/]+)(?:\/|$)/;

/**
 * The Project a page belongs to, from its path: any page under
 * `/app/projects/<id>`, but not New Project.
 */
export function projectIdFromPath(pathname: string): string | null {
  const id = PROJECT_PATH.exec(pathname)?.[1];
  if (id == null || id === "new") return null;
  try {
    return decodeURIComponent(id);
  } catch {
    // A bad escape (`/app/projects/%E0`): no Project menu; the page shows not found.
    return null;
  }
}

/**
 * Each module's page, by key (ADR CM-0045). A Record, so a new module fails
 * `check-types` until its page is named here, and each entry names the page
 * by its folder, so a moved page fails too. The page is the module's
 * `segment` under the Project.
 */
const MODULE_PAGES: Record<ProjectModuleKey, (id: string) => AppHref> = {
  dashboard: (id) => pageHref("/app/projects/[id]/dashboard", { id }),
  activity: (id) => pageHref("/app/projects/[id]/activity", { id }),
  wings: (id) => pageHref("/app/projects/[id]/wings", { id }),
  locations: (id) => pageHref("/app/projects/[id]/locations", { id }),
  amenities: (id) => pageHref("/app/projects/[id]/amenities", { id }),
  drawings: (id) => pageHref("/app/projects/[id]/drawings", { id }),
  testing_reports: (id) =>
    pageHref("/app/projects/[id]/testing-reports", { id }),
  gallery: (id) => pageHref("/app/projects/[id]/gallery", { id }),
  documents: (id) => pageHref("/app/projects/[id]/documents", { id }),
  resources: (id) => pageHref("/app/projects/[id]/teams", { id }),
  attendance: (id) => pageHref("/app/projects/[id]/attendance", { id }),
  payments: (id) => pageHref("/app/projects/[id]/payments", { id }),
  materials: (id) => pageHref("/app/projects/[id]/materials", { id }),
  daily_worksheet: (id) => pageHref("/app/projects/[id]/worksheets", { id }),
  equipment_usage: (id) => pageHref("/app/projects/[id]/equipment", { id }),
  site_diary: (id) => pageHref("/app/projects/[id]/site-diary", { id }),
  hindrances: (id) => pageHref("/app/projects/[id]/hindrances", { id }),
  tasks: (id) => pageHref("/app/projects/[id]/tasks", { id }),
  issues: (id) => pageHref("/app/projects/[id]/issues", { id }),
  inspections: (id) => pageHref("/app/projects/[id]/inspections", { id }),
  inquiries: (id) => pageHref("/app/projects/[id]/inquiries", { id }),
  bookings: (id) => pageHref("/app/projects/[id]/bookings", { id }),
  progress_reports: (id) =>
    pageHref("/app/projects/[id]/progress-reports", { id }),
  reports: (id) => pageHref("/app/projects/[id]/reports", { id }),
};

/** A module's page in a Project: `/app/projects/<id>/<segment>`. */
export function projectModuleHref(
  projectId: string,
  key: ProjectModuleKey,
): AppHref {
  return MODULE_PAGES[key](projectId);
}

/**
 * The Project's sidebar menu (ADR CM-0020): the modules the member may
 * open and nobody hid, under the fixed headings. Until the home
 * loads (or if it cannot), every module of the Project's structure; each
 * page checks access itself. Empty headings are left out.
 */
export function projectNavGroups(
  home: HomeModules | undefined,
  structure: ProjectStructure | undefined,
): ProjectNavGroup[] {
  const visible = new Set<string>(
    home?.modules
      .filter((module) => !module.hidden)
      .map((module) => module.key) ??
      PROJECT_MODULES.filter(
        (module) => !("structure" in module) || module.structure === structure,
      ).map((module) => module.key),
  );
  return PROJECT_NAV_GROUPS.flatMap((group) => {
    const sections = group.keys.flatMap((key) => {
      const found = PROJECT_MODULES.find((item) => item.key === key);
      return found == null || !visible.has(key)
        ? []
        : [{ key: found.key, segment: found.segment, label: found.label }];
    });
    return sections.length === 0 ? [] : [{ label: group.label, sections }];
  });
}

/**
 * Where opening a Project lands: the first module in the member's menu
 * (Dashboard for most), or null when they can open none.
 */
export function firstProjectModulePath(
  projectId: string,
  groups: readonly ProjectNavGroup[],
): AppHref | null {
  const first = groups[0]?.sections[0];
  return first == null ? null : projectModuleHref(projectId, first.key);
}

/**
 * The menu entry a page belongs to: the first segment under the Project
 * when it is a module in the menu. Edit, and any other page, has none.
 */
export function activeProjectSegment(
  pathname: string,
  projectId: string,
  segments: readonly string[],
): string | null {
  const base = pageHref("/app/projects/[id]", { id: projectId });
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const segment = rest.split("/").find(Boolean);
  return segment != null && segments.includes(segment) ? segment : null;
}
