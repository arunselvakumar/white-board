"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Building2, HardHat, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";

import { fieldForCode } from "@/lib/server-errors";
import type { BranchKind } from "@/src/hrms/domain/branch";
import {
  HRMS_BRANCHES_KEY,
  hrmsBranchesQuery,
  removeHrmsBranch,
  type HrmsBranch,
} from "@/src/queries/hrms-branches";

import { BranchDialog } from "./branch-dialog";
import { BranchMembersDialog } from "./branch-members-dialog";
import { ConfirmDialog, HrmsEmpty, HrmsPage, RowMenu } from "./hrms-parts";

function where(branch: HrmsBranch): string {
  const point = `${branch.latitude.toFixed(5)}, ${branch.longitude.toFixed(5)}`;
  return `${point} · ${branch.radiusMetres.toLocaleString("en-IN")} m radius`;
}

function FenceRow({
  branch,
  detail,
  onEdit,
  onMembers,
  onRemove,
}: {
  branch: HrmsBranch;
  detail: string | null;
  onEdit: () => void;
  onMembers?: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{branch.name}</p>
        {detail == null ? null : (
          <p className="text-muted-foreground truncate text-sm">{detail}</p>
        )}
        <p className="text-muted-foreground text-xs tabular-nums">
          {where(branch)}
        </p>
      </div>
      <RowMenu
        name={branch.name}
        actions={[
          { label: "Edit fence", onSelect: onEdit },
          ...(onMembers == null
            ? []
            : [{ label: "Members", onSelect: onMembers }]),
          { label: "Remove fence", onSelect: onRemove, destructive: true },
        ]}
      />
    </li>
  );
}

/**
 * Configuration → Branches & Sites (CM-304): office branches with the
 * members who check in at each, and one site fence per Project. Menu
 * `hrms.settings`.
 */
export function BranchesPage({ showMap = true }: { showMap?: boolean }) {
  const { data } = useSuspenseQuery(hrmsBranchesQuery);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{
    kind: BranchKind;
    branch: HrmsBranch | null;
  } | null>(null);
  const [members, setMembers] = useState<HrmsBranch | null>(null);
  const [removing, setRemoving] = useState<HrmsBranch | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>();
  const remove = useMutation({
    mutationFn: (id: string) => removeHrmsBranch(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HRMS_BRANCHES_KEY });
      setRemoving(null);
    },
    onError: (error) => {
      setRemoveError(fieldForCode(error, {}).message);
    },
  });

  const offices = data.items.filter((item) => item.kind === "office_branch");
  const sites = data.items.filter((item) => item.kind === "project_site");
  const names = new Map(
    data.employees.map((employee) => [employee.memberId, employee.name]),
  );

  const addOffice = (
    <Button
      type="button"
      onClick={() => {
        setEditing({ kind: "office_branch", branch: null });
      }}
    >
      <Plus aria-hidden="true" />
      New Office Branch
    </Button>
  );
  const addSite = (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        setEditing({ kind: "project_site", branch: null });
      }}
    >
      <HardHat aria-hidden="true" />
      New site fence
    </Button>
  );

  const memberLine = (branch: HrmsBranch): string => {
    if (branch.memberIds.length === 0)
      return "No members linked: open to everyone not linked elsewhere";
    const first = branch.memberIds
      .slice(0, 2)
      .map((id) => names.get(id) ?? "Removed member");
    const rest = branch.memberIds.length - first.length;
    return `Members: ${first.join(", ")}${rest > 0 ? ` and ${String(rest)} more` : ""}`;
  };

  return (
    <HrmsPage
      title="Branches & Sites"
      description="Office branches and Project site fences. When GPS check-in is required, people check in only inside the fences that apply to them."
      actions={
        data.items.length === 0 ? null : (
          <>
            {addSite}
            {addOffice}
          </>
        )
      }
    >
      {data.items.length === 0 ? (
        <HrmsEmpty
          icon={MapPin}
          title="No fences yet"
          description="Add your office with its location and a radius. Add a site fence for each Project where staff check in."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {addOffice}
              {addSite}
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="hrms-offices" className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              <h3 id="hrms-offices" className="font-semibold">
                Office branches
              </h3>
              <Badge variant="secondary">{offices.length}</Badge>
            </div>
            {offices.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No office branch yet. Members not on a Project need one to check
                in when GPS is required.
              </p>
            ) : (
              <ul
                aria-label="Office branches"
                className="bg-card divide-y rounded-xl border"
              >
                {offices.map((branch) => (
                  <FenceRow
                    key={branch.id}
                    branch={branch}
                    detail={memberLine(branch)}
                    onEdit={() => {
                      setEditing({ kind: "office_branch", branch });
                    }}
                    onMembers={() => {
                      setMembers(branch);
                    }}
                    onRemove={() => {
                      setRemoveError(undefined);
                      setRemoving(branch);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="hrms-sites" className="space-y-3">
            <div className="flex items-center gap-2">
              <HardHat
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              <h3 id="hrms-sites" className="font-semibold">
                Project sites
              </h3>
              <Badge variant="secondary">{sites.length}</Badge>
            </div>
            {sites.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No site fence yet. Team Members on a Project can check in at its
                site once it has one.
              </p>
            ) : (
              <ul
                aria-label="Project sites"
                className="bg-card divide-y rounded-xl border"
              >
                {sites.map((branch) => (
                  <FenceRow
                    key={branch.id}
                    branch={branch}
                    detail={branch.projectName ?? "Project removed"}
                    onEdit={() => {
                      setEditing({ kind: "project_site", branch });
                    }}
                    onRemove={() => {
                      setRemoveError(undefined);
                      setRemoving(branch);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {editing == null ? null : (
        <BranchDialog
          kind={editing.kind}
          branch={editing.branch}
          showMap={showMap}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {members == null ? null : (
        <BranchMembersDialog
          branch={members}
          employees={data.employees}
          onClose={() => {
            setMembers(null);
          }}
        />
      )}
      <ConfirmDialog
        open={removing != null}
        title={`Remove ${removing?.name ?? ""}?`}
        description="Nobody will be able to check in inside this fence. Members linked to it are unlinked. Past check-ins keep their record."
        confirmLabel="Remove fence"
        error={removeError}
        pending={remove.isPending}
        onClose={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          if (removing != null) remove.mutate(removing.id);
        }}
      />
    </HrmsPage>
  );
}
