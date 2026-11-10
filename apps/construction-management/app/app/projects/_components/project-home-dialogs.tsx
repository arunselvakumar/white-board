"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { FormAlert } from "@/components/auth/form-alert";
import { CheckList } from "@/components/masters/check-list";
import { fieldForCode } from "@/lib/server-errors";
import { PROJECT_NAV_GROUPS } from "@/src/projects/domain/project-nav-groups";
import {
  projectHomeQuery,
  useHideModules,
  type ProjectHomeModule,
} from "@/src/queries/project-home";

import { ModuleCheckListSkeleton } from "./projects-skeletons";

const MENU_ORDER: readonly string[] = PROJECT_NAV_GROUPS.flatMap(
  (group) => group.keys,
);

/** The modules in the sidebar menu's order. */
function inMenuOrder(modules: readonly ProjectHomeModule[]) {
  return [...modules].sort(
    (a, b) => MENU_ORDER.indexOf(a.key) - MENU_ORDER.indexOf(b.key),
  );
}

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
          options={inMenuOrder(modules).map((module) => ({
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
 * sees. Needs the Project menu's Update flag; hiding changes the sidebar
 * menu (and the Dashboard's sections), never what anyone may open.
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
      description="Untick a module to take it off this Project's menu for everyone on it. It does not change what anyone may open."
      onClose={onClose}
    >
      {isPending ? (
        <ModuleCheckListSkeleton />
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
