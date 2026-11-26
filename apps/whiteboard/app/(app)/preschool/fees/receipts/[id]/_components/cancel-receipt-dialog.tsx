"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaiseAsRupees } from "@/lib/money";
import { CANCEL_RECEIPT_REASONS } from "@/lib/preschool-fees";
import { QueryHttpError } from "@/src/queries/http";
import {
  cancelFeePayment,
  feeKeys,
  type PreschoolReceipt,
} from "@/src/queries/preschool/fees";

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say why the Receipt is cancelled")
    .max(300, "At most 300 characters"),
});

type Values = z.infer<typeof schema>;

function CancelReceiptForm({
  receipt,
  onDone,
}: {
  receipt: PreschoolReceipt;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          const cancelled = await cancelFeePayment(receipt.id, values.reason);
          queryClient.setQueryData(feeKeys.receipt(receipt.id), cancelled);
          await queryClient.invalidateQueries({ queryKey: feeKeys.all });
          onDone();
        } catch (error) {
          setError("root", {
            message:
              error instanceof QueryHttpError
                ? error.message
                : "Could not cancel the Receipt. Please try again.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason" required>
          Why
        </Label>
        <div className="flex flex-wrap gap-2">
          {CANCEL_RECEIPT_REASONS.map((reason) => (
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
        <Textarea
          id="cancel-reason"
          rows={2}
          aria-required
          aria-invalid={errors.reason != null}
          {...register("reason")}
        />
        <FieldError message={errors.reason?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Keep it
        </Button>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          Cancel Receipt
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Cancels a Receipt entered by mistake. Its number stays on record; the
 * amount goes back onto the Invoices it paid.
 */
export function CancelReceiptDialog({
  receipt,
  open,
  onOpenChange,
}: {
  receipt: PreschoolReceipt;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Receipt {receipt.receiptNumber}?</DialogTitle>
          <DialogDescription>
            {formatPaiseAsRupees(receipt.amountPaise)} goes back onto the
            Invoices it paid. The Receipt number stays on record, marked
            cancelled. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <CancelReceiptForm
            receipt={receipt}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
