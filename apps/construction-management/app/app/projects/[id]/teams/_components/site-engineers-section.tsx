"use client";

import { formatMobile } from "@repo/auth/construction/mobile";
import { useSuspenseQuery } from "@tanstack/react-query";
import { HardHat, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
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

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  isResourcesChanged,
  siteEngineerOptionsQuery,
  useReloadProjectResources,
  useSetProjectSiteEngineers,
  type ProjectSiteEngineer,
  type ProjectSiteEngineerOption,
} from "@/src/queries/project-resources";

import { ResourcePickerSkeleton } from "./resources-skeletons";
import { TeamRow } from "./team-row";

const ADD_SITE_ENGINEER_PATH = "/app/staff/site-engineers/new";

export function siteEngineerPath(id: string): string {
  return `/app/staff/site-engineers/${encodeURIComponent(id)}`;
}

/** "SE-001 · +91 98400 12345", or null when they have neither. */
function detailOf(engineer: ProjectSiteEngineer): string | null {
  const parts = [
    engineer.employeeCode,
    engineer.mobile == null ? null : formatMobile(engineer.mobile),
  ].filter((part): part is string => part != null && part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

function matches(item: ProjectSiteEngineer, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase("en");
  if (needle === "") return true;
  return `${item.name} ${item.employeeCode ?? ""} ${item.mobile ?? ""}`
    .toLocaleLowerCase("en")
    .includes(needle);
}

function PickerBody({
  projectId,
  current,
  canOpenPages,
  onDone,
}: {
  projectId: string;
  current: readonly ProjectSiteEngineer[];
  canOpenPages: boolean;
  onDone: () => void;
}) {
  const { data } = useSuspenseQuery(siteEngineerOptionsQuery(projectId));
  const save = useSetProjectSiteEngineers(projectId);
  const reload = useReloadProjectResources(projectId);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | undefined>();
  const visible = useMemo(
    () => data.items.filter((item) => matches(item, search)),
    [data.items, search],
  );

  if (data.items.length === 0)
    return (
      <>
        <Empty className="bg-card border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HardHat />
            </EmptyMedia>
            <EmptyTitle>No Site Engineers to add</EmptyTitle>
            <EmptyDescription>
              Every enabled Site Engineer is on this Project already, or none
              has been added yet.
            </EmptyDescription>
          </EmptyHeader>
          {canOpenPages && (
            <EmptyContent>
              <Link href={ADD_SITE_ENGINEER_PATH} className={buttonVariants()}>
                Add a Site Engineer
              </Link>
            </EmptyContent>
          )}
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
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label="Search Site Engineers"
          placeholder="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </InputGroup>
      <ul
        aria-label="Site Engineers"
        className="bg-card -mx-1 max-h-72 divide-y overflow-y-auto rounded-lg border"
      >
        {visible.map((item) => (
          <OptionLine
            key={item.id}
            item={item}
            checked={chosen.has(item.id)}
            canOpenPages={canOpenPages}
            onCheckedChange={(checked) => {
              setChosen((was) => {
                const next = new Set(was);
                if (checked) next.add(item.id);
                else next.delete(item.id);
                return next;
              });
            }}
          />
        ))}
        {visible.length === 0 && (
          <li className="text-muted-foreground px-3 py-6 text-center text-sm">
            No Site Engineers match “{search.trim()}”.
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
          disabled={save.isPending || chosen.size === 0}
          onClick={() => {
            setError(undefined);
            const currentIds = current.map((item) => item.id);
            save.mutate(
              { ids: [...currentIds, ...chosen], expectedIds: currentIds },
              {
                onSuccess: onDone,
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
                  if (isResourcesChanged(failure)) void reload();
                },
              },
            );
          }}
        >
          {save.isPending ? "Adding…" : "Add"}
        </Button>
      </DialogFooter>
    </>
  );
}

function OptionLine({
  item,
  checked,
  canOpenPages,
  onCheckedChange,
}: {
  item: ProjectSiteEngineerOption;
  checked: boolean;
  canOpenPages: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = `site-engineer-option-${item.id}`;
  const detail = detailOf(item);
  return (
    <li className="flex min-w-0 items-center gap-3 px-3 py-2.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={!item.hasSignIn}
        onCheckedChange={(next) => {
          onCheckedChange(next);
        }}
      />
      <label
        htmlFor={id}
        className={`min-w-0 flex-1 ${item.hasSignIn ? "cursor-pointer" : "text-muted-foreground"}`}
      >
        <span className="block truncate text-sm font-medium">{item.name}</span>
        {detail != null && (
          <span className="text-muted-foreground block truncate text-xs">
            {detail}
          </span>
        )}
      </label>
      {!item.hasSignIn &&
        (canOpenPages ? (
          <Link
            href={siteEngineerPath(item.id)}
            className="text-primary shrink-0 text-xs font-medium underline-offset-4 hover:underline"
            aria-label={`${item.name} needs a sign-in: open their page`}
          >
            Needs a sign-in
          </Link>
        ) : (
          <Badge variant="outline" className="shrink-0">
            Needs a sign-in
          </Badge>
        ))}
    </li>
  );
}

/**
 * The Site Engineers on a Project (ADR CM-0038 §3): those whose sign-in is
 * on it, so they see the Project when they sign in. Add picks enabled
 * Site Engineers with a sign-in; those without one are listed but cannot
 * be ticked. Each save sends the set the screen loaded, so a change made
 * elsewhere meanwhile is refused rather than overwritten.
 */
export function SiteEngineersSection({
  projectId,
  engineers,
  canEdit,
  canOpenPages,
}: {
  projectId: string;
  engineers: readonly ProjectSiteEngineer[];
  canEdit: boolean;
  /** The Site Engineer pages need Labours Read. */
  canOpenPages: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectSiteEngineer | null>(null);
  const [error, setError] = useState<string | undefined>();
  const save = useSetProjectSiteEngineers(projectId);
  const reload = useReloadProjectResources(projectId);
  const headingId = "resources-site-engineers";

  const remove = (engineer: ProjectSiteEngineer) => {
    setError(undefined);
    const currentIds = engineers.map((item) => item.id);
    save.mutate(
      {
        ids: currentIds.filter((id) => id !== engineer.id),
        expectedIds: currentIds,
      },
      {
        onSuccess: () => {
          setRemoving(null);
        },
        onError: (failure) => {
          setRemoving(null);
          setError(fieldForCode(failure, {}).message);
          if (isResourcesChanged(failure)) void reload();
        },
      },
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="bg-card w-full space-y-4 rounded-xl border p-4 sm:p-6 lg:col-span-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="font-semibold">
            Site Engineers{" "}
            <span className="text-muted-foreground font-normal">
              {engineers.length}
            </span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Site Engineers on a Project see it when they sign in.
          </p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add Site Engineers
          </Button>
        )}
      </div>
      <FormAlert message={error} />
      {engineers.length === 0 ? (
        <Empty className="bg-card border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HardHat />
            </EmptyMedia>
            <EmptyTitle>No Site Engineers on this Project</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? "Add the Site Engineers who run this site."
                : "Nobody has put Site Engineers on this Project yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul
          aria-label="Site Engineers"
          className="bg-card grid divide-y overflow-hidden rounded-lg border sm:grid-cols-2 sm:divide-y-0"
        >
          {engineers.map((engineer) => (
            <TeamRow
              key={engineer.id}
              className="border-b last:border-b-0 sm:[&:nth-last-child(-n+2):nth-child(odd)]:border-b-0"
              name={engineer.name}
              href={canOpenPages ? siteEngineerPath(engineer.id) : null}
              detail={detailOf(engineer)}
              badges={
                engineer.disabled && <Badge variant="outline">Disabled</Badge>
              }
              actions={
                canEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${engineer.name}`}
                    onClick={() => {
                      setRemoving(engineer);
                    }}
                  >
                    Remove
                  </Button>
                )
              }
            />
          ))}
        </ul>
      )}
      {canEdit && (
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="grid-cols-1 sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Site Engineers</DialogTitle>
              <DialogDescription>
                They see this Project when they sign in. A Site Engineer without
                a sign-in gets one on their page first.
              </DialogDescription>
            </DialogHeader>
            {adding && (
              <Suspense
                fallback={<ResourcePickerSkeleton label="Site Engineers" />}
              >
                <PickerBody
                  projectId={projectId}
                  current={engineers}
                  canOpenPages={canOpenPages}
                  onDone={() => {
                    setAdding(false);
                  }}
                />
              </Suspense>
            )}
          </DialogContent>
        </Dialog>
      )}
      <AlertDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.name} from this Project?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer see this Project when they sign in. Their
              other Projects stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={save.isPending}
              onClick={() => {
                if (removing != null) remove(removing);
              }}
            >
              {save.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
