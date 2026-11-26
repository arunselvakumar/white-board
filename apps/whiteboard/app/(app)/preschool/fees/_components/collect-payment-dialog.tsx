"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  formatPaiseAsRupees,
  paiseToRupeesInput,
  parseRupeesInput,
} from "@/lib/money";
import {
  FEE_PAYMENT_METHODS,
  feeReferenceLabel,
  suggestedPaymentPaise,
} from "@/lib/preschool-fees";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import { feeKeys, recordFeePayment } from "@/src/queries/preschool/fees";

export type CollectPaymentTarget = {
  childId: string;
  childName: string;
  duePaise: number;
  overduePaise: number;
};

function schemaFor(today: string) {
  return z
    .object({
      amountRupees: z.string().trim().min(1, "Enter the amount received"),
      method: z.enum(["cash", "upi", "card", "cheque", "bank_transfer"]),
      reference: z.string().trim().max(100, "At most 100 characters"),
      receivedOn: z.string().min(1, "Enter the date received"),
      note: z.string().trim().max(300, "At most 300 characters"),
    })
    .superRefine((value, ctx) => {
      const paise = parseRupeesInput(value.amountRupees);
      if (paise == null || paise < 1)
        ctx.addIssue({
          code: "custom",
          path: ["amountRupees"],
          message: "Enter an amount in rupees, up to 2 decimal places",
        });
      if (value.receivedOn > today)
        ctx.addIssue({
          code: "custom",
          path: ["receivedOn"],
          message: "The date received cannot be in the future",
        });
    });
}

type Values = z.infer<ReturnType<typeof schemaFor>>;

function owedPaise(error: QueryHttpError): number | null {
  const details = error.details;
  if (typeof details !== "object" || details == null) return null;
  const owed = (details as { owedPaise?: unknown }).owedPaise;
  return typeof owed === "number" ? owed : null;
}

function CollectPaymentForm({
  target,
  onCancel,
}: {
  target: CollectPaymentTarget;
  onCancel: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const today = todayInIndia(new Date());
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schemaFor(today)),
    defaultValues: {
      amountRupees: paiseToRupeesInput(suggestedPaymentPaise(target)),
      method: "cash",
      reference: "",
      receivedOn: today,
      note: "",
    },
  });
  const method = useWatch({ control, name: "method" });
  const referenceLabel = feeReferenceLabel(method);
  const record = useMutation({
    mutationFn: recordFeePayment,
    onSuccess: async (receipt) => {
      await queryClient.invalidateQueries({ queryKey: feeKeys.all });
      router.push(`/preschool/fees/receipts/${receipt.id}`);
    },
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const amountPaise = parseRupeesInput(values.amountRupees);
        if (amountPaise == null) return;
        try {
          await record.mutateAsync({
            childId: target.childId,
            amountPaise,
            method: values.method,
            receivedOn: values.receivedOn,
            reference:
              values.method === "cash" || values.reference === ""
                ? null
                : values.reference,
            note: values.note === "" ? null : values.note,
          });
        } catch (error) {
          if (error instanceof QueryHttpError && error.code === "FEE_OVERPAY") {
            const owed = owedPaise(error);
            setError("amountRupees", {
              message:
                owed == null
                  ? error.message
                  : `More than ${target.childName} owes: ${formatPaiseAsRupees(owed)}`,
            });
            return;
          }
          if (
            error instanceof QueryHttpError &&
            error.code === "FEE_PAYMENT_DATE_IN_FUTURE"
          ) {
            setError("receivedOn", { message: error.message });
            return;
          }
          setError("root", {
            message:
              error instanceof QueryHttpError
                ? error.message
                : "Could not record this Fee Payment. Please try again.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <dl className="bg-muted/50 grid grid-cols-2 gap-2 rounded-lg p-3">
        <div>
          <dt className="text-muted-foreground text-xs">Due</dt>
          <dd className="font-medium tabular-nums">
            {formatPaiseAsRupees(target.duePaise)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Overdue</dt>
          <dd
            className={
              target.overduePaise > 0
                ? "text-destructive font-medium tabular-nums"
                : "font-medium tabular-nums"
            }
          >
            {formatPaiseAsRupees(target.overduePaise)}
          </dd>
        </div>
      </dl>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="collect-amount" required>
            Amount (₹)
          </Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => {
              setValue("amountRupees", paiseToRupeesInput(target.duePaise), {
                shouldValidate: true,
              });
            }}
          >
            Pay all dues
          </Button>
        </div>
        <Input
          id="collect-amount"
          aria-required
          className="h-10"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={errors.amountRupees != null}
          {...register("amountRupees")}
        />
        <FieldError message={errors.amountRupees?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="collect-method" required>
            Method
          </Label>
          <Controller
            name="method"
            control={control}
            render={({ field }) => (
              <Select
                items={[...FEE_PAYMENT_METHODS]}
                value={field.value}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="collect-method"
                  size="lg"
                  aria-required
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_PAYMENT_METHODS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="collect-date" required>
            Date received
          </Label>
          <Input
            id="collect-date"
            type="date"
            aria-required
            className="h-10"
            max={today}
            aria-invalid={errors.receivedOn != null}
            {...register("receivedOn")}
          />
          <FieldError message={errors.receivedOn?.message} />
        </div>
      </div>
      {referenceLabel == null ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="collect-reference">{referenceLabel}</Label>
          <Input
            id="collect-reference"
            className="h-10"
            autoComplete="off"
            {...register("reference")}
          />
          <FieldError message={errors.reference?.message} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="collect-note">Note</Label>
        <Textarea id="collect-note" rows={2} {...register("note")} />
        <FieldError message={errors.note?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Record payment
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Takes a Fee Payment for a Child, oldest dues first, and opens its Receipt.
 * Used by the fees desk and a Child's fee account.
 */
export function CollectPaymentDialog({
  target,
  onOpenChange,
}: {
  /** The Child to collect from; null keeps the dialog closed. */
  target: CollectPaymentTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>
            {target == null
              ? null
              : `From ${target.childName}'s family. It pays the oldest dues first.`}
          </DialogDescription>
        </DialogHeader>
        {target == null ? null : (
          <CollectPaymentForm
            target={target}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
