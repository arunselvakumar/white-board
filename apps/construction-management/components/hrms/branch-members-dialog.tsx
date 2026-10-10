"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";

import { FormAlert } from "@/components/auth/form-alert";
import { MasterSearch } from "@/components/masters/master-list-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  HRMS_BRANCHES_KEY,
  setHrmsBranchMembers,
  type HrmsBranch,
  type HrmsBranchEmployee,
} from "@/src/queries/hrms-branches";

/**
 * "Members who check in here" (CM-304, ADR CM-0012 §4): the Team Members
 * linked to an office branch. A member linked to no branch may check in
 * at any office branch.
 */
export function BranchMembersDialog({
  branch,
  employees,
  onClose,
}: {
  branch: HrmsBranch;
  employees: readonly HrmsBranchEmployee[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string[]>([...branch.memberIds]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: () =>
      setHrmsBranchMembers(branch.id, {
        memberIds: chosen,
        expectedUpdatedAt: branch.updatedAt,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HRMS_BRANCHES_KEY });
      onClose();
    },
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees.filter((employee) =>
      employee.name.toLowerCase().includes(needle),
    );
  }, [employees, query]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Members who check in at {branch.name}</DialogTitle>
          <DialogDescription>
            Linked Team Members check in at their own branches. Anyone linked to
            no branch can check in at every office branch. Project sites apply
            to the Team Members on the Project.
          </DialogDescription>
        </DialogHeader>
        <MasterSearch
          label="Search Team Members"
          value={query}
          onChange={setQuery}
        />
        <p className="text-muted-foreground text-sm" role="status">
          {chosen.length === 0
            ? "Nobody linked yet."
            : `${String(chosen.length)} linked.`}
        </p>
        <ul
          aria-label="Team Members"
          className="max-h-72 space-y-2 overflow-y-auto"
        >
          {shown.map((employee) => {
            const checked = chosen.includes(employee.memberId);
            return (
              <li key={employee.memberId}>
                <Label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) => {
                      setChosen((current) =>
                        next
                          ? [...current, employee.memberId]
                          : current.filter((id) => id !== employee.memberId),
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {employee.name}
                    {employee.designationName == null ? null : (
                      <span className="text-muted-foreground">
                        {" "}
                        · {employee.designationName}
                      </span>
                    )}
                  </span>
                  {employee.memberType === "hrms" ? (
                    <Badge variant="secondary">HRMS</Badge>
                  ) : null}
                  {employee.active ? null : (
                    <Badge variant="outline">Joining Pending</Badge>
                  )}
                </Label>
              </li>
            );
          })}
        </ul>
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
              save.mutate();
            }}
          >
            {save.isPending ? "Saving…" : "Save members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
