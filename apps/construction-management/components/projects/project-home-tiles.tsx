"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Skeleton } from "@repo/ui/components/skeleton";

import { projectHomeQuery } from "@/src/queries/project-home";

import { projectModuleIcon } from "./project-module-icons";
import { projectPath } from "./projects-home";

/**
 * The Project home's tiles (CM-411, ADR CM-0013 §11): one per module the
 * member may open, in their tile order, with an icon, the label and a
 * short description. Hidden modules have no tile; those who may show them
 * again see how many are hidden.
 */
export function ProjectHomeTiles({ projectId }: { projectId: string }) {
  const { data, isPending, isError } = useQuery(projectHomeQuery(projectId));
  if (isError) return null;
  if (isPending)
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-busy="true"
      >
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  const shown = data.modules.filter((module) => !module.hidden);
  const hidden = data.modules.length - shown.length;
  const base = projectPath(projectId);
  return (
    <section aria-labelledby="project-modules" className="space-y-3">
      <h2 id="project-modules" className="sr-only">
        Modules
      </h2>
      {shown.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          No modules to open on this Project. Ask the Owner for access.
        </p>
      ) : (
        <ul
          aria-label="Modules"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {shown.map((module) => {
            const Icon = projectModuleIcon(module.key);
            return (
              <li key={module.key} className="flex min-w-0">
                <Link
                  href={`${base}/${module.segment}`}
                  className="bg-card hover:bg-accent/40 focus-visible:ring-ring/50 flex w-full min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg"
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 space-y-1">
                    <span className="block truncate font-semibold">
                      {module.label}
                    </span>
                    <span className="text-muted-foreground line-clamp-2 block text-xs">
                      {module.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">
          {hidden === 1
            ? "1 module is hidden on this Project."
            : `${String(hidden)} modules are hidden on this Project.`}{" "}
          Show them from Project options.
        </p>
      ) : null}
    </section>
  );
}
