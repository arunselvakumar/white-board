"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { z } from "zod";
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
import { Skeleton } from "@repo/ui/components/skeleton";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  formatPaiseAsRupees,
  paiseToRupeesInput,
  parseRupeesInput,
} from "@/lib/money";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import {
  cancelInvoice,
  createInvoice,
  feeHeadsQueryOptions,
  feeKeys,
  setInvoiceConcession,
  updateInvoiceDetails,
  type PreschoolInvoice,
} from "@/src/queries/preschool/fees";

const rupees = (message: string, minimumPaise: number) =>
  z
    .string()
    .trim()
    .refine((value) => {
      const paise = parseRupeesInput(value);
      return paise != null && paise >= minimumPaise;
    }, message);

const AMOUNT_MESSAGE = "Enter an amount in rupees, up to 2 decimal places";

function showError<Values extends Record<string, unknown>>(
  error: unknown,
  setError: UseFormSetError<Values>,
  fields: Partial<Record<string, keyof Values & string>>,
): void {
  if (error instanceof QueryHttpError) {
    const field = fields[error.code];
    if (field != null) {
      setError(field as Parameters<UseFormSetError<Values>>[0], {
        message: error.message,
      });
      return;
    }
    setError("root", { message: error.message });
    return;
  }
  setError("root", { message: "Could not save. Please try again." });
}

function useFeeSaved() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: feeKeys.all });
}

const detailsSchema = z.object({
  label: z.string().trim().min(1, "Enter what the Invoice is for").max(200),
  dueOn: z.string().min(1, "Enter the due date"),
  amountRupees: rupees(AMOUNT_MESSAGE, 0),
});

type DetailsValues = z.infer<typeof detailsSchema>;

function EditInvoiceForm({
  invoice,
  onDone,
}: {
  invoice: PreschoolInvoice;
  onDone: () => void;
}) {
  const saved = useFeeSaved();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      label: invoice.label,
      dueOn: invoice.dueOn,
      amountRupees: paiseToRupeesInput(invoice.amountPaise),
    },
  });
  const minimum = invoice.paidPaise + invoice.concessionPaise;
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const amountPaise = parseRupeesInput(values.amountRupees) ?? 0;
        try {
          await updateInvoiceDetails(invoice.id, {
            label: values.label,
            dueOn: values.dueOn,
            amountPaise,
          });
          await saved();
          onDone();
        } catch (error) {
          showError(error, setError, {
            INVOICE_AMOUNT_BELOW_PAID: "amountRupees",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="invoice-label" required>
          Label
        </Label>
        <Input
          id="invoice-label"
          aria-required
          className="h-10"
          {...register("label")}
        />
        <FieldError message={errors.label?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-due" required>
            Due date
          </Label>
          <Input
            id="invoice-due"
            type="date"
            aria-required
            className="h-10"
            {...register("dueOn")}
          />
          <FieldError message={errors.dueOn?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invoice-amount" required>
            Amount (₹)
          </Label>
          <Input
            id="invoice-amount"
            aria-required
            inputMode="decimal"
            className="h-10"
            aria-invalid={errors.amountRupees != null}
            {...register("amountRupees")}
          />
          <FieldError message={errors.amountRupees?.message} />
        </div>
      </div>
      {minimum > 0 ? (
        <p className="text-muted-foreground text-xs">
          Paid and concession so far: {formatPaiseAsRupees(minimum)}. The amount
          cannot be lower.
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Save Invoice
        </Button>
      </DialogFooter>
    </form>
  );
}

export const QUICK_CONCESSION_REASONS = ["Sibling", "Staff ward"] as const;

const concessionSchema = z
  .object({
    amountRupees: rupees(AMOUNT_MESSAGE, 0),
    reason: z.string().trim().max(200, "At most 200 characters"),
  })
  .superRefine((value, ctx) => {
    if ((parseRupeesInput(value.amountRupees) ?? 0) > 0 && value.reason === "")
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Say why the concession is given",
      });
  });

type ConcessionValues = z.infer<typeof concessionSchema>;

function ConcessionForm({
  invoice,
  onDone,
}: {
  invoice: PreschoolInvoice;
  onDone: () => void;
}) {
  const saved = useFeeSaved();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ConcessionValues>({
    resolver: zodResolver(concessionSchema),
    defaultValues: {
      amountRupees: paiseToRupeesInput(invoice.concessionPaise),
      reason: invoice.concessionReason ?? "",
    },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const concessionPaise = parseRupeesInput(values.amountRupees) ?? 0;
        try {
          await setInvoiceConcession(invoice.id, {
            concessionPaise,
            reason: concessionPaise === 0 ? null : values.reason,
          });
          await saved();
          onDone();
        } catch (error) {
          showError(error, setError, {
            CONCESSION_EXCEEDS_DUE: "amountRupees",
            CONCESSION_INVALID: "amountRupees",
            CONCESSION_REASON_REQUIRED: "reason",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <p className="text-muted-foreground text-sm">
        {invoice.label}: {formatPaiseAsRupees(invoice.amountPaise)}, paid{" "}
        {formatPaiseAsRupees(invoice.paidPaise)}. Enter 0 to remove the
        concession.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="concession-amount" required>
          Concession (₹)
        </Label>
        <Input
          id="concession-amount"
          aria-required
          inputMode="decimal"
          className="h-10"
          aria-invalid={errors.amountRupees != null}
          {...register("amountRupees")}
        />
        <FieldError message={errors.amountRupees?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="concession-reason">Reason</Label>
        <Input
          id="concession-reason"
          className="h-10"
          aria-invalid={errors.reason != null}
          {...register("reason")}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_CONCESSION_REASONS.map((reason) => (
            <Button
              key={reason}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setValue("reason", reason, { shouldValidate: true });
              }}
            >
              {reason}
            </Button>
          ))}
        </div>
        <FieldError message={errors.reason?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Save concession
        </Button>
      </DialogFooter>
    </form>
  );
}

const addSchema = detailsSchema.extend({
  feeHeadId: z.string().min(1, "Choose a Fee Head"),
  amountRupees: rupees("Enter an amount above ₹0, up to 2 decimal places", 1),
});

type AddValues = z.infer<typeof addSchema>;

function AddInvoiceForm({
  childId,
  onDone,
}: {
  childId: string;
  onDone: () => void;
}) {
  const saved = useFeeSaved();
  const { data: heads } = useSuspenseQuery(feeHeadsQueryOptions());
  const headItems = heads.items.map((head) => ({
    value: head.id,
    label: head.name,
  }));
  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddValues>({
    resolver: zodResolver(addSchema),
    defaultValues: {
      feeHeadId: "",
      label: "",
      dueOn: todayInIndia(new Date()),
      amountRupees: "",
    },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const amountPaise = parseRupeesInput(values.amountRupees) ?? 0;
        try {
          await createInvoice({
            childId,
            feeHeadId: values.feeHeadId,
            label: values.label,
            dueOn: values.dueOn,
            amountPaise,
          });
          await saved();
          onDone();
        } catch (error) {
          showError(error, setError, {
            FEE_HEAD_ARCHIVED: "feeHeadId",
            FEE_AMOUNT_INVALID: "amountRupees",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="add-invoice-head" required>
          Fee Head
        </Label>
        <Controller
          name="feeHeadId"
          control={control}
          render={({ field }) => (
            <Select
              items={headItems}
              value={field.value === "" ? null : field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
                if (getValues("label") === "")
                  setValue(
                    "label",
                    headItems.find((item) => item.value === value)?.label ?? "",
                  );
              }}
            >
              <SelectTrigger
                id="add-invoice-head"
                size="lg"
                aria-required
                className="w-full min-w-0"
              >
                <SelectValue placeholder="Choose a Fee Head" />
              </SelectTrigger>
              <SelectContent>
                {headItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.feeHeadId?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-invoice-label" required>
          Label
        </Label>
        <Input
          id="add-invoice-label"
          aria-required
          className="h-10"
          placeholder="Annual day costume"
          {...register("label")}
        />
        <FieldError message={errors.label?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="add-invoice-due" required>
            Due date
          </Label>
          <Input
            id="add-invoice-due"
            type="date"
            aria-required
            className="h-10"
            {...register("dueOn")}
          />
          <FieldError message={errors.dueOn?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="add-invoice-amount" required>
            Amount (₹)
          </Label>
          <Input
            id="add-invoice-amount"
            aria-required
            inputMode="decimal"
            className="h-10"
            aria-invalid={errors.amountRupees != null}
            {...register("amountRupees")}
          />
          <FieldError message={errors.amountRupees?.message} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Add Invoice
        </Button>
      </DialogFooter>
    </form>
  );
}

export type InvoiceDialog =
  | { kind: "edit"; invoice: PreschoolInvoice }
  | { kind: "concession"; invoice: PreschoolInvoice }
  | { kind: "cancel"; invoice: PreschoolInvoice }
  | { kind: "add" };

const TITLES = {
  edit: "Edit Invoice",
  concession: "Concession",
  add: "Add Invoice",
} as const;

/** Edit, Concession, Add Invoice and Cancel for a Child's fee account. */
export function InvoiceDialogs({
  childId,
  dialog,
  onClose,
}: {
  childId: string;
  dialog: InvoiceDialog | null;
  onClose: () => void;
}) {
  const saved = useFeeSaved();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: cancelInvoice,
    onSuccess: async () => {
      await saved();
      onClose();
    },
    onError: (error) => {
      setCancelError(
        error instanceof QueryHttpError
          ? error.message
          : "Could not cancel this Invoice.",
      );
    },
  });
  const formDialog = dialog != null && dialog.kind !== "cancel" ? dialog : null;
  const cancelDialog = dialog?.kind === "cancel" ? dialog : null;
  return (
    <>
      <Dialog
        open={formDialog != null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {formDialog == null ? null : TITLES[formDialog.kind]}
            </DialogTitle>
            <DialogDescription>
              {formDialog?.kind === "add"
                ? "An extra charge on the Child's current Admission."
                : formDialog == null
                  ? null
                  : formDialog.invoice.label}
            </DialogDescription>
          </DialogHeader>
          {formDialog?.kind === "edit" ? (
            <EditInvoiceForm invoice={formDialog.invoice} onDone={onClose} />
          ) : formDialog?.kind === "concession" ? (
            <ConcessionForm invoice={formDialog.invoice} onDone={onClose} />
          ) : formDialog?.kind === "add" ? (
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <AddInvoiceForm childId={childId} onDone={onClose} />
            </Suspense>
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={cancelDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelError(null);
            onClose();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelDialog == null
                ? null
                : `${cancelDialog.invoice.label} (${formatPaiseAsRupees(cancelDialog.invoice.amountPaise)}) will no longer be due. It stays on the account as cancelled.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={cancelError ?? undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={cancel.isPending}
              onClick={() => {
                if (cancelDialog != null)
                  cancel.mutate(cancelDialog.invoice.id);
              }}
            >
              Cancel Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
