"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  FlaskConical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { FormAlert } from "@/components/auth/form-alert";
import { uploadErrorMessage } from "@/src/queries/direct-upload";
import {
  testingItemsQuery,
  useDeleteTestingItem,
  type TestingItem,
} from "@/src/queries/project-testing-reports";

import { TestingItemDialog } from "./testing-item-dialog";

/** `/app/projects/<id>/testing-reports/<itemId>`. */
export function testingItemHref(projectId: string, itemId: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/testing-reports/${encodeURIComponent(itemId)}`;
}

export function reportCountLabel(count: number): string {
  return count === 1 ? "1 report" : `${String(count)} reports`;
}

function ItemRow({
  projectId,
  item,
  canUpdate,
  canDelete,
  onRename,
  onDelete,
}: {
  projectId: string;
  item: TestingItem;
  canUpdate: boolean;
  canDelete: boolean;
  onRename: (item: TestingItem) => void;
  onDelete: (item: TestingItem) => void;
}) {
  return (
    <li className="flex items-center gap-1 pr-2">
      <Link
        href={testingItemHref(projectId, item.id)}
        className="hover:bg-muted/50 focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-3 outline-none focus-visible:ring-2 sm:px-4"
      >
        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FlaskConical aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-sm font-medium"
            title={item.name}
          >
            {item.name}
          </span>
          <span className="text-muted-foreground block text-xs tabular-nums">
            {reportCountLabel(item.reportCount)}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
      {canUpdate || canDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${item.name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate ? (
              <DropdownMenuItem
                onClick={() => {
                  onRename(item);
                }}
              >
                <Pencil aria-hidden="true" />
                Rename
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  onDelete(item);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

function DeleteItemDialog({
  projectId,
  item,
  onClose,
}: {
  projectId: string;
  item: TestingItem | null;
  onClose: () => void;
}) {
  const removal = useDeleteTestingItem(projectId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(item);
  if (item != null && item !== last) setLast(item);
  const shown = item ?? last;
  return (
    <AlertDialog
      open={item != null}
      onOpenChange={(open) => {
        if (!open) {
          removal.reset();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Delete {shown?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Only a testing material without reports can be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert
            message={uploadErrorMessage(
              removal.error,
              "Couldn't delete. Try again.",
            )}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (item == null) return;
              removal.mutate(item.id, {
                onSuccess: () => {
                  removal.reset();
                  onClose();
                },
              });
            }}
          >
            {removal.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The Project's Testing reports (CM-409): the materials sent to the lab
 * (Rcc cube, Steel, Cement, Bricks to start with, and any added), each
 * with how many reports it holds. A material opens its reports. Add,
 * Rename and Delete follow the Testing reports menu's flags.
 */
export function TestingReportsPage({
  projectId,
  canCreate,
  canUpdate,
  canDelete,
}: {
  projectId: string;
  /** Add testing material. */
  canCreate: boolean;
  /** Rename a testing material. */
  canUpdate: boolean;
  /** Delete a testing material. */
  canDelete: boolean;
}) {
  const { data } = useSuspenseQuery(testingItemsQuery(projectId));
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<TestingItem | null>(null);
  const [deleting, setDeleting] = useState<TestingItem | null>(null);
  const reports = data.items.reduce((sum, item) => sum + item.reportCount, 0);

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setAdding(true);
      }}
    >
      <Plus aria-hidden="true" />
      Add testing material
    </Button>
  );

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Testing reports</h2>
          {data.items.length > 0 ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              {data.items.length === 1
                ? "1 material"
                : `${String(data.items.length)} materials`}{" "}
              · {reportCountLabel(reports)}
            </p>
          ) : null}
        </div>
        {canCreate && data.items.length > 0 ? addButton : null}
      </div>

      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FlaskConical />
            </EmptyMedia>
            <EmptyTitle>No testing materials yet</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Add a material you send to the lab, then keep its reports under it."
                : "Materials tested on this Project and their lab reports show here."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? <EmptyContent>{addButton}</EmptyContent> : null}
        </Empty>
      ) : (
        <ul
          aria-label="Testing materials"
          className="divide-border bg-card divide-y rounded-lg border"
        >
          {data.items.map((item) => (
            <ItemRow
              key={item.id}
              projectId={projectId}
              item={item}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onRename={setRenaming}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}

      {canCreate || canUpdate ? (
        <TestingItemDialog
          projectId={projectId}
          open={adding || renaming != null}
          item={renaming}
          onClose={() => {
            setAdding(false);
            setRenaming(null);
          }}
        />
      ) : null}
      {canDelete ? (
        <DeleteItemDialog
          projectId={projectId}
          item={deleting}
          onClose={() => {
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}
