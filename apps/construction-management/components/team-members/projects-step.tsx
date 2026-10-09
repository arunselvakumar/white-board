"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { ProjectStatusBadge } from "@/components/projects/project-status";
import { fieldForCode } from "@/lib/server-errors";
import { projectOptionsQuery } from "@/src/queries/projects";
import {
  TEAM_MEMBERS_KEY,
  assignTeamMemberProjects,
  teamMemberQuery,
  type TeamMember,
} from "@/src/queries/team-members";

type Selection = {
  /** The chosen Project ids. Without it the step keeps its own choice. */
  value?: readonly string[];
  onChange?: (projectIds: string[]) => void;
};

function ProjectChecklist({ value, onChange }: Selection) {
  const { data } = useSuspenseQuery(projectOptionsQuery);
  const [own, setOwn] = useState<readonly string[]>([]);
  const chosen = new Set(value ?? own);

  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>No Projects yet</EmptyTitle>
          <EmptyDescription>
            Once you add Projects, choose here which ones this Team Member works
            on. You can assign them later from Edit.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/app/projects/new"
            className={buttonVariants({ variant: "outline" })}
          >
            Add a Project
          </Link>
        </EmptyContent>
      </Empty>
    );

  const toggle = (id: string, on: boolean) => {
    const next = data.items
      .map((item) => item.id)
      .filter((item) => (item === id ? on : chosen.has(item)));
    setOwn(next);
    onChange?.(next);
  };

  return (
    <fieldset className="space-y-3">
      <legend className="text-muted-foreground mb-3 text-sm">
        The Team Member works only on the Projects you tick. Leave all empty to
        assign them later.
      </legend>
      <ul className="bg-card divide-y rounded-xl border">
        {data.items.map((project) => {
          const id = `project-${project.id}`;
          return (
            <li key={project.id}>
              <label
                htmlFor={id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
              >
                <Checkbox
                  id={id}
                  checked={chosen.has(project.id)}
                  onCheckedChange={(checked) => {
                    toggle(project.id, checked);
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {project.name}
                </span>
                <ProjectStatusBadge status={project.status} />
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {chosen.size === 1
          ? "1 Project selected"
          : `${String(chosen.size)} Projects selected`}
      </p>
    </fieldset>
  );
}

function ChecklistSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/**
 * Select Projects (wizard step 2, CM-204): a checklist of the Company's
 * Projects from `/projects/options`. Pass `value`/`onChange` to send the
 * choice with the new Team Member.
 */
export function ProjectsStep(props: Selection) {
  return (
    <Suspense fallback={<ChecklistSkeleton />}>
      <ProjectChecklist {...props} />
    </Suspense>
  );
}

/** Edit Team Member → Projects tab: the checklist plus Save. */
export function TeamMemberProjectsTab({ member }: { member: TeamMember }) {
  const queryClient = useQueryClient();
  const [projectIds, setProjectIds] = useState<readonly string[]>(
    member.projectIds,
  );
  const save = useMutation({
    mutationFn: () => assignTeamMemberProjects(member.id, [...projectIds]),
    onSuccess: async (updated) => {
      queryClient.setQueryData(teamMemberQuery(member.id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY });
    },
  });
  return (
    <div className="space-y-4">
      <ProjectsStep
        value={projectIds}
        onChange={(next) => {
          setProjectIds(next);
          save.reset();
        }}
      />
      <FormAlert
        message={
          save.error == null ? undefined : fieldForCode(save.error, {}).message
        }
      />
      {save.isSuccess && (
        <p role="status" className="text-muted-foreground text-sm">
          Projects saved.
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          {save.isPending ? "Saving…" : "Save Projects"}
        </Button>
      </div>
    </div>
  );
}
