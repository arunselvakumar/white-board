"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheck, MoreHorizontal, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  designationsQuery,
  useDeleteDesignation,
  useDuplicateDesignation,
  type DesignationResponse,
} from "@/src/queries/designations";

import { DESIGNATIONS_PATH } from "./designation-form";

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function editPath(id: string): string {
  return `${DESIGNATIONS_PATH}/${encodeURIComponent(id)}`;
}

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

function DesignationRow({
  designation,
  busy,
  onDuplicate,
  onDelete,
}: {
  designation: DesignationResponse;
  busy: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={editPath(designation.id)}
          className="text-foreground block truncate font-medium hover:underline"
        >
          {designation.name}
        </Link>
        {designation.isSeed || designation.template != null ? (
          <div className="flex flex-wrap gap-1.5">
            {designation.isSeed ? (
              <Badge variant="secondary">Default</Badge>
            ) : null}
            {designation.template != null ? (
              <Badge variant="outline">Has template</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Actions for ${designation.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              router.push(editPath(designation.id));
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Masters → Designations (CM-112): search, Add, and Edit / Duplicate / Delete. */
export function DesignationsList() {
  const { data } = useSuspenseQuery(designationsQuery);
  const duplicate = useDuplicateDesignation();
  const remove = useDeleteDesignation();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] =
    useState<DesignationResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter((item) => item.name.toLowerCase().includes(needle))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [data.items, query]);

  const addLink = (
    <Link href={`${DESIGNATIONS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Designation
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Designations"
          meta="Job titles and the Permission Template each one starts with."
          actions={addLink}
        />
        {data.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BadgeCheck />
              </EmptyMedia>
              <EmptyTitle>No Designations yet</EmptyTitle>
              <EmptyDescription>
                Add the job titles your Team Members hold, like Site Engineer or
                Store Keeper.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addLink}</EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3">
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search Designations"
                placeholder="Search Designations"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </InputGroup>
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Designation matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label="Designations"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((designation) => (
                  <DesignationRow
                    key={designation.id}
                    designation={designation}
                    busy={
                      duplicate.isPending &&
                      duplicate.variables === designation.id
                    }
                    onDuplicate={() => {
                      setListError(undefined);
                      duplicate.mutate(designation.id, {
                        onError: (error) => {
                          setListError(errorMessage(error));
                        },
                      });
                    }}
                    onDelete={() => {
                      setDeleteError(undefined);
                      setPendingDelete(designation);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.name ?? "this Designation"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be offered for new Team Members. A Designation a
              Team Member holds cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={deleteError} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (pendingDelete == null) return;
                remove.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    setPendingDelete(null);
                  },
                  onError: (error) => {
                    setDeleteError(errorMessage(error));
                  },
                });
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
