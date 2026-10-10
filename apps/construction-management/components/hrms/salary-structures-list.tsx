"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Receipt } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  salaryStructuresQuery,
  useDeleteSalaryStructure,
  type SalaryStructureModel,
} from "@/src/queries/hrms-salary-setup";

import { SALARY_STRUCTURES_PATH } from "./salary-structure-form";

function editPath(id: string): string {
  return `${SALARY_STRUCTURES_PATH}/${encodeURIComponent(id)}`;
}

/** "Basic 50% · Conveyance ₹1,600.00 · Special Allowance (balance)". */
export function componentSummary(structure: SalaryStructureModel): string {
  return structure.components
    .map((component) => {
      if (component.isBalancing) return `${component.name} (balance)`;
      if (component.basis === "fixed")
        return `${component.name} ${formatPaise(component.amount ?? 0)}`;
      return `${component.name} ${component.percent ?? "0"}%`;
    })
    .join(" · ");
}

function StructureRow({
  structure,
  onDelete,
}: {
  structure: SalaryStructureModel;
  onDelete: () => void;
}) {
  const router = useRouter();
  const statutory = [
    structure.pf.applicable ? "PF" : null,
    structure.esi.applicable ? "ESI" : null,
    structure.pt.applicable ? "PT" : null,
  ].filter((item) => item != null);
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={editPath(structure.id)}
            className="text-foreground font-medium hover:underline"
          >
            {structure.name}
          </Link>
          {structure.isActive ? null : (
            <Badge variant="secondary">Inactive</Badge>
          )}
          {statutory.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
        <p className="text-muted-foreground text-sm break-words">
          {componentSummary(structure)}
        </p>
        <p className="text-muted-foreground text-xs">
          {structure.membersUsing === 0
            ? "No members yet"
            : `${String(structure.membersUsing)} ${structure.membersUsing === 1 ? "member" : "members"}`}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${structure.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              router.push(editPath(structure.id));
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/**
 * Configuration → Salary Structures (CM-314): the Company's structures
 * with their components and statutory switches; Add, Edit and Delete (a
 * structure members use cannot be deleted).
 */
export function SalaryStructuresList() {
  const { data } = useSuspenseQuery(salaryStructuresQuery);
  const remove = useDeleteSalaryStructure();
  const [pendingDelete, setPendingDelete] =
    useState<SalaryStructureModel | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const addLink = (
    <Link href={`${SALARY_STRUCTURES_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add salary structure
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Salary Structures
            </h2>
            <p className="text-muted-foreground text-sm">
              Earnings components, PF, ESI, professional tax and other
              deductions. Give each member one on the Employees screen.
            </p>
          </div>
          {data.items.length === 0 ? null : addLink}
        </div>
        {data.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt />
              </EmptyMedia>
              <EmptyTitle>No salary structures yet</EmptyTitle>
              <EmptyDescription>
                Add one for each way you pay Team Members, like Site staff with
                Basic, HRA and a Special Allowance.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addLink}</EmptyContent>
          </Empty>
        ) : (
          <ul
            aria-label="Salary structures"
            className="bg-card divide-y rounded-xl border"
          >
            {data.items.map((structure) => (
              <StructureRow
                key={structure.id}
                structure={structure}
                onDelete={() => {
                  setDeleteError(undefined);
                  setPendingDelete(structure);
                }}
              />
            ))}
          </ul>
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
              Delete {pendingDelete?.name ?? "this salary structure"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Slips already calculated keep their figures. A structure members
              still use cannot be deleted.
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
                remove.mutate(
                  {
                    id: pendingDelete.id,
                    expectedUpdatedAt: pendingDelete.updatedAt,
                  },
                  {
                    onSuccess: () => {
                      setPendingDelete(null);
                    },
                    onError: (error) => {
                      setDeleteError(fieldForCode(error, {}).message);
                    },
                  },
                );
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
