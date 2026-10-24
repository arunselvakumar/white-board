"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
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
import { MasterListPageSkeleton } from "@/components/masters/masters-skeletons";
import { fieldForCode } from "@/lib/server-errors";
import { ROLES_PATH, rolePath } from "@/lib/users-roles-nav";
import { QueryHttpError } from "@/src/queries/http";
import {
  rolesQuery,
  useDeleteRole,
  useDuplicateRole,
  type Role,
} from "@/src/queries/roles";

import type { RoleActions } from "./role-actions";

export const ROLES_META =
  "A Role is what its Users may do. Editing a Role changes access for everyone on it.";

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function usersCount(count: number): string {
  return count === 1 ? "1 User" : `${String(count)} Users`;
}

/** Why a Role cannot be deleted yet, or null when it can. */
function deleteBlockedReason(role: Role): string | null {
  if (role.userCount === 0) return null;
  return `${usersCount(role.userCount)} on it. Move them to another Role first.`;
}

/** The user count a ROLE_IN_USE refusal carries, when it does. */
function userCountOf(error: unknown): number | null {
  if (!(error instanceof QueryHttpError) || error.code !== "ROLE_IN_USE")
    return null;
  const details = error.details;
  if (
    typeof details === "object" &&
    details != null &&
    "userCount" in details &&
    typeof details.userCount === "number"
  )
    return details.userCount;
  return null;
}

function AddRoleLink() {
  return (
    <Link href={`${ROLES_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Role
    </Link>
  );
}

function RoleRow({
  role,
  actions,
  busy,
  onDuplicate,
  onDelete,
}: {
  role: Role;
  actions: RoleActions;
  busy: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const blocked = deleteBlockedReason(role);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={rolePath(role.id)}
            className="text-foreground truncate font-medium hover:underline"
          >
            {role.name}
          </Link>
          {role.isSeed ? <Badge variant="secondary">Default</Badge> : null}
        </div>
        {role.description != null && role.description !== "" ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {role.description}
          </p>
        ) : null}
        {/* On a phone the count sits under the name. */}
        <p className="text-muted-foreground text-xs sm:hidden">
          {usersCount(role.userCount)}
        </p>
      </div>
      <p className="text-muted-foreground hidden w-24 shrink-0 text-right text-sm tabular-nums sm:block">
        {usersCount(role.userCount)}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Actions for ${role.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              router.push(rolePath(role.id));
            }}
          >
            {actions.update ? "Edit" : "View"}
          </DropdownMenuItem>
          {actions.create ? (
            <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
          ) : null}
          {actions.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={blocked != null}
                onClick={onDelete}
                className="flex-col items-start gap-0.5"
              >
                <span>Delete</span>
                {blocked != null ? (
                  <span className="text-muted-foreground text-xs font-normal">
                    {blocked}
                  </span>
                ) : null}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Users & Roles → Role Management (ADR CM-0030): the Company's Roles. */
export function RolesList({ actions }: { actions: RoleActions }) {
  return (
    <Suspense
      fallback={
        <MasterListPageSkeleton
          back={null}
          title="Role Management"
          meta={ROLES_META}
          actions={actions.create ? <AddRoleLink /> : undefined}
          details
        />
      }
    >
      <RolesListContent actions={actions} />
    </Suspense>
  );
}

function RolesListContent({ actions }: { actions: RoleActions }) {
  const { data } = useSuspenseQuery(rolesQuery);
  const duplicate = useDuplicateRole();
  const remove = useDeleteRole();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.description ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [data, query]);

  const addLink = actions.create ? <AddRoleLink /> : null;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Role Management"
          meta={ROLES_META}
          actions={addLink}
        />
        {data.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>No Roles yet</EmptyTitle>
              <EmptyDescription>
                Make a Role for each kind of work, like Site Engineer or
                Accountant, and tick what it may do.
              </EmptyDescription>
            </EmptyHeader>
            {addLink != null ? <EmptyContent>{addLink}</EmptyContent> : null}
          </Empty>
        ) : (
          <div className="space-y-3">
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search Roles"
                placeholder="Search Roles"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </InputGroup>
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Role matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label="Roles"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((item) => (
                  <RoleRow
                    key={item.id}
                    role={item}
                    actions={actions}
                    busy={
                      duplicate.isPending && duplicate.variables === item.id
                    }
                    onDuplicate={() => {
                      setListError(undefined);
                      duplicate.mutate(item.id, {
                        onError: (error) => {
                          setListError(fieldForCode(error, {}).message);
                        },
                      });
                    }}
                    onDelete={() => {
                      setDeleteError(undefined);
                      setPendingDelete(item);
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
              Delete {pendingDelete?.name ?? "this Role"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer be offered on Add User. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={deleteError} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || deleteError != null}
              onClick={() => {
                if (pendingDelete == null) return;
                remove.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    setPendingDelete(null);
                  },
                  onError: (error) => {
                    // Someone was put on it after the list loaded.
                    const count = userCountOf(error);
                    setDeleteError(
                      count == null
                        ? fieldForCode(error, {}).message
                        : `${usersCount(count)} on this Role now. Move them to another Role first.`,
                    );
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
