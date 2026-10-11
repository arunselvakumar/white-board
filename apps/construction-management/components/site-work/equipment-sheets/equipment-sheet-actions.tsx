"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import {
  AlertDialog,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { ReasonDialog } from "@/components/procurement/purchase-requests/reason-dialog";
import { fieldForCode } from "@/lib/server-errors";
import {
  equipmentSheetsPath,
  useEquipmentSheetCommand,
  type EquipmentSheet,
} from "@/src/queries/equipment-sheets";

/**
 * What can be done with one Equipment Usage sheet (CM-604), from its `actions`:
 * View, Approve, Reject, Edit, Duplicate and Delete — a menu on list rows,
 * buttons on the detail page.
 */
export function EquipmentSheetActions({
  sheet,
  variant,
  onError,
  onDeleted,
}: {
  sheet: EquipmentSheet;
  variant: "menu" | "buttons";
  onError: (message: string | undefined) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const command = useEquipmentSheetCommand();
  const [rejecting, setRejecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { actions } = sheet;
  const path = (rest: string) => equipmentSheetsPath(sheet.projectId, rest);

  const items: {
    key: string;
    label: string;
    run: () => void;
    primary?: boolean;
    destructive?: boolean;
  }[] = [];
  if (variant === "menu")
    items.push({
      key: "view",
      label: "View",
      run: () => {
        router.push(path(`/${sheet.id}`));
      },
    });
  if (actions.approve)
    items.push({
      key: "approve",
      label: "Approve",
      primary: true,
      run: () => {
        onError(undefined);
        command.mutate(
          { kind: "approve", id: sheet.id, expectedUpdatedAt: sheet.updatedAt },
          {
            onError: (failure) => {
              onError(fieldForCode(failure, {}).message);
            },
          },
        );
      },
    });
  if (actions.reject)
    items.push({
      key: "reject",
      label: "Reject",
      run: () => {
        setRejecting(true);
      },
    });
  if (actions.edit)
    items.push({
      key: "edit",
      label: "Edit",
      run: () => {
        router.push(path(`/${sheet.id}/edit`));
      },
    });
  if (actions.duplicate)
    items.push({
      key: "duplicate",
      label: "Duplicate",
      run: () => {
        router.push(path(`/new?from=${encodeURIComponent(sheet.id)}`));
      },
    });
  if (actions.delete)
    items.push({
      key: "delete",
      label: "Delete",
      destructive: true,
      run: () => {
        setDeleting(true);
      },
    });

  const dialogs = (
    <>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title={`Reject ${sheet.number}?`}
        description="The person who filled it sees the reason and can edit it, which sends it back for approval."
        action="Reject"
        onSubmit={async (reason) => {
          try {
            await command.mutateAsync({
              kind: "reject",
              id: sheet.id,
              reason,
              expectedUpdatedAt: sheet.updatedAt,
            });
          } catch (failure) {
            throw new Error(fieldForCode(failure, {}).message, {
              cause: failure,
            });
          }
        }}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {sheet.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The usage sheet is removed and the material it consumed goes back
              into the Project&apos;s stock. Its number is not used again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={command.isPending}
              onClick={() => {
                onError(undefined);
                command.mutate(
                  {
                    kind: "delete",
                    id: sheet.id,
                    expectedUpdatedAt: sheet.updatedAt,
                  },
                  {
                    onSuccess: () => {
                      setDeleting(false);
                      onDeleted?.();
                    },
                    onError: (failure) => {
                      setDeleting(false);
                      onError(fieldForCode(failure, {}).message);
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
    </>
  );

  if (variant === "buttons")
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={item.primary === true ? "default" : "outline"}
            className={
              item.destructive === true ? "text-destructive" : undefined
            }
            disabled={command.isPending}
            onClick={item.run}
          >
            {item.label}
          </Button>
        ))}
        {dialogs}
      </div>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${sheet.number}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((item, index) => (
            <Fragment key={item.key}>
              {item.destructive === true && index > 0 && (
                <DropdownMenuSeparator />
              )}
              <DropdownMenuItem
                variant={item.destructive === true ? "destructive" : "default"}
                onClick={item.run}
              >
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}
