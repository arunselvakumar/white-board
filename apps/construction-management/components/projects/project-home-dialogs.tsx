"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { CheckList } from "@/components/masters/check-list";
import { fieldForCode } from "@/lib/server-errors";
import { PROJECT_MODULE_KEYS } from "@/src/projects/domain/project-modules";
import {
  projectHomeQuery,
  useHideModules,
  useSaveTileOrder,
  type ProjectHomeModule,
} from "@/src/queries/project-home";

import { projectModuleIcon } from "./project-module-icons";

function DialogShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

function HideModulesForm({
  projectId,
  modules,
  onClose,
}: {
  projectId: string;
  modules: ProjectHomeModule[];
  onClose: () => void;
}) {
  const save = useHideModules(projectId);
  const [shown, setShown] = useState<string[]>(() =>
    modules.filter((module) => !module.hidden).map((module) => module.key),
  );
  const [error, setError] = useState<string | undefined>();
  return (
    <>
      <div className="max-h-[55vh] overflow-y-auto">
        <CheckList
          legend="Modules shown on this Project"
          legendHidden
          idPrefix="show-module"
          options={modules.map((module) => ({
            id: module.key,
            label: module.label,
          }))}
          value={shown}
          onChange={setShown}
        />
      </div>
      <FormAlert message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            setError(undefined);
            save.mutate(
              modules
                .map((module) => module.key)
                .filter((key) => !shown.includes(key)),
              {
                onSuccess: onClose,
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
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

/**
 * Hide / Show Modules (CM-411): tick the modules everyone on this Project
 * sees. Needs the Project menu's Update flag; hiding changes the home and
 * the section bar, never what anyone may open.
 */
export function HideModulesDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data, isPending, isError } = useQuery(projectHomeQuery(projectId));
  return (
    <DialogShell
      title="Hide / show modules"
      description="Untick a module to take it off this Project's home for everyone on it. It does not change what anyone may open."
      onClose={onClose}
    >
      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <FormAlert message="The modules could not be loaded. Try again." />
      ) : !data.canHideModules ? (
        <>
          <p className="text-muted-foreground text-sm">
            Hiding modules needs the Update permission on Projects. Ask the
            Owner to change your Permission Matrix.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </>
      ) : (
        <HideModulesForm
          projectId={projectId}
          modules={data.modules}
          onClose={onClose}
        />
      )}
    </DialogShell>
  );
}

/** The given modules in the app's default order. */
function defaultOrder(modules: readonly ProjectHomeModule[]) {
  return [...modules].sort(
    (a, b) =>
      PROJECT_MODULE_KEYS.indexOf(
        a.key as (typeof PROJECT_MODULE_KEYS)[number],
      ) -
      PROJECT_MODULE_KEYS.indexOf(
        b.key as (typeof PROJECT_MODULE_KEYS)[number],
      ),
  );
}

function ArrangeForm({
  modules,
  onClose,
}: {
  modules: ProjectHomeModule[];
  onClose: () => void;
}) {
  const save = useSaveTileOrder();
  const [order, setOrder] = useState(modules);
  /** Reset and not moved since: saving clears the stored order. */
  const [reset, setReset] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  /** The button to focus once the list re-renders after a move. */
  const pendingFocus = useRef<string | null>(null);

  // Keep the keyboard on the moved tile; at an end, on its other button.
  useEffect(() => {
    const focus = pendingFocus.current;
    if (focus == null) return;
    pendingFocus.current = null;
    const [key, direction] = focus.split(":");
    const target = buttons.current.get(focus);
    const other = buttons.current.get(
      `${key ?? ""}:${direction === "up" ? "down" : "up"}`,
    );
    (target?.disabled === true ? other : target)?.focus();
  }, [order]);

  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    if (item == null) return;
    next.splice(index + by, 0, item);
    setOrder(next);
    setReset(false);
    pendingFocus.current = `${item.key}:${by < 0 ? "up" : "down"}`;
  };

  return (
    <>
      <ol
        aria-label="Tiles in order"
        className="bg-card max-h-[55vh] divide-y overflow-y-auto rounded-xl border"
      >
        {order.map((module, index) => {
          const Icon = projectModuleIcon(module.key);
          return (
            <li key={module.key} className="flex items-center gap-3 px-3 py-2">
              <Icon
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {module.label}
              </span>
              {module.hidden ? (
                <Badge variant="outline">Hidden here</Badge>
              ) : null}
              <Button
                ref={(node) => {
                  buttons.current.set(`${module.key}:up`, node);
                }}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${module.label} up`}
                disabled={index === 0}
                onClick={() => {
                  move(index, -1);
                }}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                ref={(node) => {
                  buttons.current.set(`${module.key}:down`, node);
                }}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Move ${module.label} down`}
                disabled={index === order.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>
      <FormAlert message={error} />
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOrder(defaultOrder(order));
            setReset(true);
          }}
        >
          Reset to default
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setError(undefined);
              save.mutate(reset ? [] : order.map((module) => module.key), {
                onSuccess: onClose,
                onError: (failure) => {
                  setError(fieldForCode(failure, {}).message);
                },
              });
            }}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

/**
 * Arrange tiles (CM-411): move tiles up and down with buttons (keyboard
 * friendly), or reset to the default order. The order is the member's
 * own and applies on every Project.
 */
export function ArrangeTilesDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data, isPending, isError } = useQuery(projectHomeQuery(projectId));
  return (
    <DialogShell
      title="Arrange tiles"
      description="Put the modules you open most at the top. Your order applies on every Project and only for you."
      onClose={onClose}
    >
      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <FormAlert message="The tiles could not be loaded. Try again." />
      ) : (
        <ArrangeForm modules={data.modules} onClose={onClose} />
      )}
    </DialogShell>
  );
}
