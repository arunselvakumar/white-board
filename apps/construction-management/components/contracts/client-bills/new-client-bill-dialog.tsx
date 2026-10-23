"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  clientBillFormOptionsQuery,
  clientBillsPath,
  useCreateClientBill,
  type ClientBillFormOptions,
} from "@/src/queries/contracts-client-bills";

import { dateText } from "./client-bill-format";

const NewBillSchema = z
  .object({
    billDate: z.string().min(1, "Pick the bill date."),
    measuredUpTo: z.string().min(1, "Pick the date measured up to."),
  })
  .refine((values) => values.measuredUpTo <= values.billDate, {
    message: "Bill measurements up to the bill date at the latest.",
    path: ["measuredUpTo"],
  });

type NewBillValues = z.infer<typeof NewBillSchema>;

/** Checked client-side rows a bill measured up to `date` would take. */
export function clientRowsUpTo(
  unbilled: ClientBillFormOptions["unbilled"] | undefined,
  date: string,
): number {
  if (unbilled == null || date === "") return 0;
  return unbilled
    .filter((day) => day.measuredOn <= date)
    .reduce((sum, day) => sum + day.rows, 0);
}

/**
 * New Client Bill (CM-1107): the bill date and the date the Project's
 * checked client-side measurements are billed up to, with how many rows
 * the bill will take, and a link to a bill already open.
 */
export function NewClientBillDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const options = useQuery({
    ...clientBillFormOptionsQuery(projectId),
    enabled: open,
  }).data;
  const create = useCreateClientBill();
  const today = options?.today ?? "";
  const form = useForm<NewBillValues>({
    resolver: zodResolver(NewBillSchema),
    values: { billDate: today, measuredUpTo: today },
    resetOptions: { keepDirtyValues: true },
  });
  const { control, register, handleSubmit, formState, setError } = form;
  const measuredUpTo = useWatch({ control, name: "measuredUpTo" });
  const rows = clientRowsUpTo(options?.unbilled, measuredUpTo);
  const openBillId = options?.openBillId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={handleSubmit((values) => {
            create.mutate(
              { projectId, ...values },
              {
                onSuccess: (bill) => {
                  onOpenChange(false);
                  router.push(clientBillsPath(projectId, bill.id));
                },
                onError: (failure) => {
                  const found = fieldForCode(failure, {
                    BILL_DATE_IN_FUTURE: "billDate",
                    BILL_NO_MEASUREMENTS: "measuredUpTo",
                    MEASURED_UP_TO_AFTER_BILL_DATE: "measuredUpTo",
                  } as const);
                  setError(found.field ?? "root", { message: found.message });
                },
              },
            );
          })}
        >
          <DialogHeader>
            <DialogTitle>New Client Bill</DialogTitle>
            <DialogDescription>
              The bill takes every checked client-side measurement of the
              Project up to the date that no bill has taken yet, at the
              BOQ&apos;s rates. It is numbered when you submit it for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="new-client-bill-date" required>
                  Bill date
                </Label>
                <Input
                  id="new-client-bill-date"
                  type="date"
                  max={today === "" ? undefined : today}
                  aria-required
                  aria-invalid={formState.errors.billDate != null}
                  {...register("billDate")}
                />
                <FieldError message={formState.errors.billDate?.message} />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="new-client-bill-up-to" required>
                  Measured up to
                </Label>
                <Input
                  id="new-client-bill-up-to"
                  type="date"
                  aria-required
                  aria-invalid={formState.errors.measuredUpTo != null}
                  {...register("measuredUpTo")}
                />
                <FieldError message={formState.errors.measuredUpTo?.message} />
              </div>
            </div>
            {options == null ? null : (
              <p className="text-sm" aria-live="polite">
                {rows === 0
                  ? `No checked measurements up to ${dateText(measuredUpTo)} are waiting to be billed.`
                  : `Takes ${String(rows)} checked ${rows === 1 ? "row" : "rows"} measured up to ${dateText(measuredUpTo)}.`}
              </p>
            )}
            {openBillId != null ? (
              <p className="text-muted-foreground text-xs">
                A Client Bill on this Project is still open.{" "}
                <Link
                  href={clientBillsPath(projectId, openBillId)}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Open it
                </Link>
              </p>
            ) : null}
          </div>
          <FormAlert message={formState.errors.root?.message} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Drafting…" : "Draft bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
