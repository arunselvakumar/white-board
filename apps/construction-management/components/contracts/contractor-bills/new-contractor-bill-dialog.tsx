"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  contractorBillFormOptionsQuery,
  contractorBillsPath,
  useCreateContractorBill,
  type ContractorBillFormOptions,
} from "@/src/queries/contracts-contractor-bills";

import { dateText } from "./contractor-bill-format";

const NewBillSchema = z
  .object({
    workOrderId: z.string().min(1, "Pick an issued Work Order."),
    billDate: z.string().min(1, "Pick the bill date."),
    measuredUpTo: z.string().min(1, "Pick the date measured up to."),
  })
  .refine((values) => values.measuredUpTo <= values.billDate, {
    message: "Bill measurements up to the bill date at the latest.",
    path: ["measuredUpTo"],
  });

type NewBillValues = z.infer<typeof NewBillSchema>;

type WorkOrderOption = ContractorBillFormOptions["workOrders"][number];

/** Checked rows a bill on `workOrder` would take when measured up to `date`. */
export function rowsUpTo(
  workOrder: WorkOrderOption | undefined,
  date: string,
): number {
  if (workOrder == null || date === "") return 0;
  return workOrder.unbilled
    .filter((day) => day.measuredOn <= date)
    .reduce((sum, day) => sum + day.rows, 0);
}

function label(workOrder: WorkOrderOption): string {
  return `${workOrder.number ?? "Draft"} · ${workOrder.contractorName}`;
}

/**
 * New Contractor Bill (CM-1106): an issued Work Order and the date its
 * checked measurements are billed up to. Shows how many checked rows the
 * bill will take, and links to a bill already open on the Work Order.
 */
export function NewContractorBillDialog({
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
    ...contractorBillFormOptionsQuery(projectId),
    enabled: open,
  }).data;
  const create = useCreateContractorBill();
  const today = options?.today ?? "";
  const form = useForm<NewBillValues>({
    resolver: zodResolver(NewBillSchema),
    values: { workOrderId: "", billDate: today, measuredUpTo: today },
    resetOptions: { keepDirtyValues: true },
  });
  const { control, register, handleSubmit, formState, setError } = form;
  const [workOrderId, measuredUpTo] = useWatch({
    control,
    name: ["workOrderId", "measuredUpTo"],
  });
  const workOrders = options?.workOrders ?? [];
  const picked = workOrders.find((item) => item.id === workOrderId);
  const rows = rowsUpTo(picked, measuredUpTo);
  const items = workOrders.map((item) => ({
    value: item.id,
    label: label(item),
  }));

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
                  router.push(contractorBillsPath(projectId, bill.id));
                },
                onError: (failure) => {
                  const found = fieldForCode(failure, {
                    BILL_WORK_ORDER_INVALID: "workOrderId",
                    BILL_OPEN_EXISTS: "workOrderId",
                    BILL_DATE_IN_FUTURE: "billDate",
                    BILL_DATE_BEFORE_ORDER_DATE: "billDate",
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
            <DialogTitle>New Contractor Bill</DialogTitle>
            <DialogDescription>
              The bill takes every checked measurement of the Work Order up to
              the date, that no bill has taken yet. It is numbered when you
              submit it for approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-bill-work-order">Work Order</Label>
              <Controller
                name="workOrderId"
                control={control}
                render={({ field }) => (
                  <Select
                    items={items}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(value) => {
                      if (value == null) return;
                      field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="new-bill-work-order"
                      className="w-full min-w-0"
                      aria-invalid={formState.errors.workOrderId != null}
                    >
                      <SelectValue
                        placeholder={
                          options == null
                            ? "Loading…"
                            : workOrders.length === 0
                              ? "No issued Work Orders"
                              : "Pick a Work Order"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={formState.errors.workOrderId?.message} />
              {picked?.openBillId != null ? (
                <p className="text-muted-foreground text-xs">
                  A bill on this Work Order is still open.{" "}
                  <Link
                    href={contractorBillsPath(projectId, picked.openBillId)}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Open it
                  </Link>
                </p>
              ) : null}
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="new-bill-date">Bill date</Label>
                <Input
                  id="new-bill-date"
                  type="date"
                  max={today === "" ? undefined : today}
                  aria-invalid={formState.errors.billDate != null}
                  {...register("billDate")}
                />
                <FieldError message={formState.errors.billDate?.message} />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="new-bill-up-to">Measured up to</Label>
                <Input
                  id="new-bill-up-to"
                  type="date"
                  aria-invalid={formState.errors.measuredUpTo != null}
                  {...register("measuredUpTo")}
                />
                <FieldError message={formState.errors.measuredUpTo?.message} />
              </div>
            </div>
            {picked == null ? null : (
              <p className="text-sm" aria-live="polite">
                {rows === 0
                  ? `No checked measurements up to ${dateText(measuredUpTo)} are waiting to be billed.`
                  : `Takes ${String(rows)} checked ${rows === 1 ? "row" : "rows"} measured up to ${dateText(measuredUpTo)}.`}
              </p>
            )}
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
