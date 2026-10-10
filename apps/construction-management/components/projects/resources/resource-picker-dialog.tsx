"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { QueryHttpError } from "@/src/queries/http";
import {
  projectResourcesQuery,
  resourceOptionsQuery,
  useSetProjectResources,
  type ProjectResource,
} from "@/src/queries/project-resources";

import type { ResourceSectionInfo } from "./resource-sections";

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function matches(item: ProjectResource, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase("en");
  if (needle === "") return true;
  return `${item.name} ${item.detail ?? ""}`
    .toLocaleLowerCase("en")
    .includes(needle);
}

function PickerBody({
  projectId,
  section,
  assigned,
  onDone,
}: {
  projectId: string;
  section: ResourceSectionInfo;
  assigned: readonly ProjectResource[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    resourceOptionsQuery(projectId, section.key),
  );
  const save = useSetProjectResources(projectId);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(assigned.map((item) => item.id)),
  );
  const [error, setError] = useState<string | undefined>();

  // Active parties, plus inactive ones already on the Project: they may stay.
  const choices = useMemo(() => {
    const byId = new Map(data.items.map((item) => [item.id, item]));
    for (const item of assigned)
      if (!byId.has(item.id)) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => collator.compare(a.name, b.name));
  }, [data.items, assigned]);
  const visible = choices.filter((item) => matches(item, search));

  if (choices.length === 0)
    return (
      <>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <section.icon />
            </EmptyMedia>
            <EmptyTitle>No {section.title} yet</EmptyTitle>
            <EmptyDescription>
              Add {section.title} in Masters, then choose them here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href={section.addPath} className={buttonVariants()}>
              Add a {section.singular}
            </Link>
          </EmptyContent>
        </Empty>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Close
          </Button>
        </DialogFooter>
      </>
    );

  return (
    <>
      <InputGroup className="h-9">
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label={`Search ${section.title}`}
          placeholder="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </InputGroup>
      <ul
        aria-label={section.title}
        className="-mx-1 max-h-72 divide-y overflow-y-auto rounded-lg border"
      >
        {visible.map((item) => {
          const id = `resource-${section.key}-${item.id}`;
          return (
            <li key={item.id}>
              <label
                htmlFor={id}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5"
              >
                <Checkbox
                  id={id}
                  checked={chosen.has(item.id)}
                  onCheckedChange={(checked) => {
                    setChosen((current) => {
                      const next = new Set(current);
                      if (checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  {item.detail != null && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {item.detail}
                    </span>
                  )}
                </span>
                {!item.isActive && <Badge variant="outline">Inactive</Badge>}
              </label>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="text-muted-foreground px-3 py-6 text-center text-sm">
            No {section.title} match “{search.trim()}”.
          </li>
        )}
      </ul>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {chosen.size} selected
      </p>
      <FormAlert message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            setError(undefined);
            save.mutate(
              {
                section: section.key,
                ids: [...chosen],
                expectedIds: assigned.map((item) => item.id),
              },
              {
                onSuccess: onDone,
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
                  if (
                    failure instanceof QueryHttpError &&
                    failure.code === "PROJECT_RESOURCES_CHANGED"
                  )
                    void queryClient.invalidateQueries({
                      queryKey: projectResourcesQuery(projectId).queryKey,
                    });
                },
              },
            );
          }}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

function PickerSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/**
 * Edit one section of a Project's Resources (CM-406): a searchable list
 * of the Company's active parties of that kind, ticked for those on the
 * Project, saved together. Inactive parties already on the Project are
 * listed so they can be taken off; they cannot be added again.
 */
export function ResourcePickerDialog({
  projectId,
  section,
  assigned,
  open,
  onOpenChange,
}: {
  projectId: string;
  section: ResourceSectionInfo;
  /** Who is on the Project now (the Owner left out). */
  assigned: readonly ProjectResource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{section.title} on this Project</DialogTitle>
          <DialogDescription>{section.description}</DialogDescription>
        </DialogHeader>
        {open && (
          <Suspense fallback={<PickerSkeleton />}>
            <PickerBody
              projectId={projectId}
              section={section}
              assigned={assigned}
              onDone={() => {
                onOpenChange(false);
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
