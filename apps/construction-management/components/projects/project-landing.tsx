"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { firstProjectModulePath, projectNavGroups } from "@/lib/project-nav";
import { projectHomeQuery } from "@/src/queries/project-home";

/**
 * `/app/projects/[id]`: opening a Project goes to the first module in the
 * member's menu (Dashboard for most), not a page of its own. With none
 * they can open, it says so. While it forwards it draws nothing, so the
 * next thing under the Project header is that module's own skeleton.
 */
export function ProjectLanding({ id }: { id: string }) {
  const router = useRouter();
  const { data: home } = useSuspenseQuery(projectHomeQuery(id));
  const target = firstProjectModulePath(id, projectNavGroups(home, undefined));

  useEffect(() => {
    if (target != null) router.replace(target);
  }, [router, target]);

  if (target != null) return null;
  return (
    <div className="w-full p-6">
      <Empty className="max-w-4xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayoutGrid />
          </EmptyMedia>
          <EmptyTitle>No modules to open</EmptyTitle>
          <EmptyDescription>
            {/* Hidden modules only come marked to those who may show them. */}
            {home.modules.some((module) => module.hidden)
              ? "The modules you may open are hidden on this Project. Show them from Project options → Hide / show modules."
              : "Ask the Owner to grant you access to a module or show a hidden module on this Project."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
