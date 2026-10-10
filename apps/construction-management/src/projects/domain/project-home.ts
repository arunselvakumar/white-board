import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  PROJECT_MODULES,
  isProjectModuleKey,
  type ProjectModuleKey,
} from "./project-modules";
import type { ProjectStructure } from "./project-type";

/** A module on a member's Project home, in their order. */
export type HomeModule = {
  key: ProjectModuleKey;
  label: string;
  description: string;
  segment: string;
  /** Hidden on this Project; only sent to those who may unhide it. */
  hidden: boolean;
};

/**
 * Module keys as sent by a client: each must be a module key (400
 * `PROJECT_MODULE_UNKNOWN` with `details.keys` otherwise); duplicates
 * collapse to the first.
 */
export function cleanModuleKeys(keys: readonly string[]): ProjectModuleKey[] {
  const unknown = keys.filter((key) => !isProjectModuleKey(key));
  if (unknown.length > 0)
    throw new DomainError(
      "PROJECT_MODULE_UNKNOWN",
      "One of these modules does not exist. Reload and try again.",
      { details: { keys: unknown } },
    );
  return [...new Set(keys as readonly ProjectModuleKey[])];
}

/**
 * Every module in a member's tile order: the keys they arranged first,
 * then the rest in the default order. Keys that are no longer modules are
 * skipped, so a stored order never breaks the home.
 */
export function arrangeModules(
  tileOrder: readonly string[],
): (typeof PROJECT_MODULES)[number][] {
  const first = [...new Set(tileOrder)].flatMap(
    (key) => PROJECT_MODULES.find((module) => module.key === key) ?? [],
  );
  return [
    ...first,
    ...PROJECT_MODULES.filter((module) => !first.includes(module)),
  ];
}

/**
 * The modules a member sees on a Project's home (ADR CM-0013 §11), in
 * their tile order. A module shows when the member may read its menu; Wings
 * and Locations also need the Project to be built that way or to hold rows
 * of that kind already, so a change of Project Type never hides data.
 * Hidden modules are left out, except for those who may unhide them
 * (`showHidden`), who get them marked.
 */
export function homeModules(input: {
  structure: ProjectStructure;
  /** The Project has live rows of each structure. */
  rows: { wings: boolean; locations: boolean };
  canRead: (menu: string) => boolean;
  hidden: ReadonlySet<string>;
  showHidden: boolean;
  tileOrder: readonly string[];
}): HomeModule[] {
  return arrangeModules(input.tileOrder).flatMap((module) => {
    if (!input.canRead(module.menu)) return [];
    if (
      "structure" in module &&
      module.structure !== input.structure &&
      !input.rows[module.structure]
    )
      return [];
    const hidden = input.hidden.has(module.key);
    if (hidden && !input.showHidden) return [];
    return [
      {
        key: module.key,
        label: module.label,
        description: module.description,
        segment: module.segment,
        hidden,
      },
    ];
  });
}

/** Pinned Projects first, each group keeping the order it came in. */
export function pinnedFirst<T extends { id: string }>(
  items: readonly T[],
  pinned: ReadonlySet<string>,
): T[] {
  return [
    ...items.filter((item) => pinned.has(item.id)),
    ...items.filter((item) => !pinned.has(item.id)),
  ];
}
