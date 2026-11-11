"use client";

import { formatMobile } from "@repo/auth/construction/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { buttonVariants } from "@repo/ui/components/button";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { SITE_ENGINEERS_PATH } from "@/lib/staff-nav";
import {
  siteEngineerQueries,
  useSiteEngineerCommand,
  type SiteEngineer,
} from "@/src/queries/site-engineers";

import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "@/app/app/_components/masters/master-list-parts";
import {
  MasterAddButtonSkeleton,
  MasterListPageSkeleton,
} from "@/app/app/_components/masters/masters-skeletons";
import { SignInBadge } from "./sign-in-badge";

const NEW_PATH = `${SITE_ENGINEERS_PATH}/new`;

function editPath(id: string): string {
  return `${SITE_ENGINEERS_PATH}/${encodeURIComponent(id)}`;
}

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

/** Mobile, employee code and specialisation, as far as they are known. */
function details(engineer: SiteEngineer): string | null {
  const parts = [
    engineer.mobile == null ? null : formatMobile(engineer.mobile),
    engineer.profile.employeeCode,
    engineer.profile.specialisation,
  ].filter((part): part is string => part != null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function matches(engineer: SiteEngineer, needle: string): boolean {
  const digits = needle.replace(/\s/g, "");
  return (
    engineer.name.toLowerCase().includes(needle) ||
    (engineer.profile.employeeCode ?? "").toLowerCase().includes(needle) ||
    (digits !== "" && (engineer.mobile ?? "").includes(digits))
  );
}

/**
 * Search, Add, and per row Edit / Disable / Enable / Delete. Each Site
 * Engineer has a page of their own and a sign-in (ADR CM-0037). Disabled
 * ones stay listed, muted.
 */
export function SupervisorsList() {
  return (
    <Suspense
      fallback={
        <MasterListPageSkeleton
          back={null}
          title="Site Engineers"
          meta={SUPERVISORS_META}
          actions={<MasterAddButtonSkeleton label="Add Site Engineer" />}
          details
        />
      }
    >
      <SupervisorsListContent />
    </Suspense>
  );
}

const SUPERVISORS_META =
  "The people on site who look after a group of Labours. Each signs in with the Site Engineer Role.";

function SupervisorsListContent() {
  const router = useRouter();
  const { data } = useSuspenseQuery(siteEngineerQueries.list());
  const command = useSiteEngineerCommand();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SiteEngineer | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter((item) => needle === "" || matches(item, needle))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [data.items, query]);

  const addButton = (
    <Link href={NEW_PATH} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Site Engineer
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Site Engineers"
          meta={SUPERVISORS_META}
          actions={addButton}
        />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={UserCheck}
            title="No Site Engineers yet"
            description="Add the Site Engineers your Labours report to. Each signs in with the Site Engineer Role, and attendance can be filtered by Site Engineer."
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label="Search Site Engineers"
              value={query}
              onChange={setQuery}
            />
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="bg-card text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Site Engineer matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label="Site Engineers"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((engineer) => {
                  const line = details(engineer);
                  return (
                    <MasterRow
                      key={engineer.id}
                      name={engineer.name}
                      href={editPath(engineer.id)}
                      details={
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <SignInBadge signIn={engineer.signIn} />
                          {line == null ? null : (
                            <p className="text-muted-foreground min-w-0 truncate text-sm">
                              {line}
                            </p>
                          )}
                        </div>
                      }
                      disabled={engineer.disabled}
                      busy={
                        command.isPending &&
                        command.variables.id === engineer.id
                      }
                      editLabel="Edit"
                      onEdit={() => {
                        router.push(editPath(engineer.id));
                      }}
                      onToggle={() => {
                        setListError(undefined);
                        command.mutate(
                          {
                            kind: engineer.disabled ? "enable" : "disable",
                            id: engineer.id,
                          },
                          {
                            onError: (error) => {
                              setListError(errorMessage(error));
                            },
                          },
                        );
                      }}
                      onDelete={() => {
                        setDeleteError(undefined);
                        setPendingDelete(engineer);
                      }}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description={
          pendingDelete?.signIn.kind === "office_staff"
            ? `They will no longer be offered anywhere. ${pendingDelete.signIn.name} stays on Office Staff. A Site Engineer that Labours or attendance name cannot be deleted; disable them instead.`
            : "They will no longer be offered anywhere, and their sign-in is removed too: they can no longer sign in to this Company. A Site Engineer that Labours or attendance name cannot be deleted; disable them instead."
        }
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete == null) return;
          command.mutate(
            { kind: "delete", id: pendingDelete.id },
            {
              onSuccess: () => {
                setPendingDelete(null);
              },
              onError: (error) => {
                setDeleteError(errorMessage(error));
              },
            },
          );
        }}
      />
    </div>
  );
}
