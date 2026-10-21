import {
  PROJECT_MODULES,
  type ProjectModuleKey,
} from "@/src/projects/domain/project-modules";
import { PROJECT_NAV_GROUPS } from "@/src/projects/domain/project-nav-groups";
import type { ProjectStructure } from "@/src/projects/domain/project-type";

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

export function projectBasePath(id: string): string {
  return `/app/projects/${encodeURIComponent(id)}`;
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
): string | null {
  const first = groups[0]?.sections[0];
  return first == null
    ? null
    : `${projectBasePath(projectId)}/${first.segment}`;
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
  const base = projectBasePath(projectId);
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const segment = rest.split("/").find(Boolean);
  return segment != null && segments.includes(segment) ? segment : null;
}
