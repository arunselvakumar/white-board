import { PROJECT_MODULES } from "@/src/projects/domain/project-modules";
import type { ProjectHome } from "@/src/queries/project-home";

/**
 * A Project home for stories (CM-411): the modules of a Wings Project in
 * the default order, or the given keys in that order.
 */
export function storyHome(
  options: {
    keys?: string[];
    hidden?: string[];
    pinned?: boolean;
    canHideModules?: boolean;
  } = {},
): ProjectHome {
  const keys =
    options.keys ??
    PROJECT_MODULES.filter((module) => module.key !== "locations").map(
      (module) => module.key,
    );
  return {
    modules: keys.flatMap((key) => {
      const found = PROJECT_MODULES.find((item) => item.key === key);
      return found == null
        ? []
        : [
            {
              key: found.key,
              label: found.label,
              description: found.description,
              segment: found.segment,
              hidden: options.hidden?.includes(key) ?? false,
            },
          ];
    }),
    pinned: options.pinned ?? false,
    canHideModules: options.canHideModules ?? true,
  };
}
