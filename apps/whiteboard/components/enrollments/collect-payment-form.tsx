"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { parseRupeesInput } from "@/lib/money";

const METHOD_ITEMS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

const schema = z
  .object({
    amountRupees: z.string().trim().min(1, "Amount is required"),
    method: z.enum(["cash", "upi", "card", "other"]),
  })
  .superRefine((value, ctx) => {
    const paise = parseRupeesInput(value.amountRupees);
    if (paise == null || paise < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["amountRupees"],
        message: "Enter an amount in rupees, up to 2 decimal places",
      });
    }
  });

export type CollectPaymentValues = z.infer<typeof schema>;

export function CollectPaymentForm({
  onSubmit,
}: {
  onSubmit: (input: {
    amountPaise: number;
    method: "cash" | "upi" | "card" | "other";
  }) => Promise<void>;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CollectPaymentValues>({
    resolver: zodResolver(schema),
    defaultValues: { amountRupees: "", method: "cash" },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const amountPaise = parseRupeesInput(values.amountRupees);
        if (amountPaise == null) {
          return;
        }
        try {
          await onSubmit({ amountPaise, method: values.method });
          reset({ amountRupees: "", method: values.method });
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not record this Fee Payment. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="amountRupees">Amount (₹)</Label>
        <Input
          id="amountRupees"
          className="h-10"
          inputMode="decimal"
          autoComplete="off"
          {...register("amountRupees")}
        />
        <FieldError message={errors.amountRupees?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="method">Method</Label>
        <Controller
          name="method"
          control={control}
          render={({ field }) => (
            <Select
              items={[...METHOD_ITEMS]}
              value={field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger id="method" size="lg" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {METHOD_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Record Fee Payment
      </Button>
    </form>
  );
}
