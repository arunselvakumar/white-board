"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { paiseToRupeesInput, parseRupeesInput } from "@/lib/money";
import type { EnrollmentResponse } from "@/src/queries/enrollments";

const TYPE_ITEMS = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "installments", label: "Installments" },
] as const;

const schema = z
  .object({
    type: z.enum(["one_time", "monthly", "installments"]),
    amountRupees: z.string().trim().min(1, "Amount is required"),
    concessionRupees: z.string().trim(),
    count: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    if (parseRupeesInput(value.amountRupees) == null) {
      ctx.addIssue({
        code: "custom",
        path: ["amountRupees"],
        message: "Enter an amount in rupees, up to 2 decimal places",
      });
    }
    if (
      value.concessionRupees.trim().length > 0 &&
      parseRupeesInput(value.concessionRupees) == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["concessionRupees"],
        message: "Enter a concession in rupees, up to 2 decimal places",
      });
    }
    if (value.type !== "one_time") {
      if (!/^[1-9]\d*$/.test(value.count.trim())) {
        ctx.addIssue({
          code: "custom",
          path: ["count"],
          message:
            value.type === "installments"
              ? "Installments need a count of at least 2"
              : "Enter how many months",
        });
      } else if (value.type === "installments" && Number(value.count) < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["count"],
          message: "Installments need a count of at least 2",
        });
      }
    }
  });

type Values = z.infer<typeof schema>;

export function FeePlanForm({
  enrollment,
  onSubmit,
}: {
  enrollment: EnrollmentResponse;
  onSubmit: (input: {
    type: "one_time" | "monthly" | "installments";
    amountPaise: number;
    concessionPaise: number;
    installmentCount?: number | null;
    dueDates: { dueOn: string; amountPaise: number }[];
  }) => Promise<void>;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: enrollment.feePlanType,
      amountRupees: paiseToRupeesInput(enrollment.feePlanAmountPaise),
      concessionRupees:
        enrollment.feePlanConcessionPaise === 0
          ? ""
          : paiseToRupeesInput(enrollment.feePlanConcessionPaise),
      count: String(
        enrollment.feePlanInstallmentCount ??
          Math.max(enrollment.feePlanDueDates.length, 2),
      ),
    },
  });
  const type = useWatch({ control, name: "type" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const amountPaise = parseRupeesInput(values.amountRupees);
        if (amountPaise == null) {
          return;
        }
        const concessionPaise =
          values.concessionRupees.trim().length === 0
            ? 0
            : (parseRupeesInput(values.concessionRupees) ?? 0);
        const count = Number(values.count);
        const net = Math.max(0, amountPaise - concessionPaise);
        const start = new Date().toISOString().slice(0, 10);
        try {
          await onSubmit({
            type: values.type,
            amountPaise,
            concessionPaise,
            installmentCount:
              values.type === "installments" ? count : null,
            dueDates: dueDatesFor(values.type, net, count, start),
          });
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not save this Fee Plan. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="feePlanType">Type</Label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select
              items={[...TYPE_ITEMS]}
              value={field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger id="feePlanType" size="lg" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feePlanAmount">Amount (₹)</Label>
        <Input
          id="feePlanAmount"
          className="h-10"
          inputMode="decimal"
          autoComplete="off"
          {...register("amountRupees")}
        />
        <FieldError message={errors.amountRupees?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feePlanConcession">Concession (₹)</Label>
        <Input
          id="feePlanConcession"
          className="h-10"
          inputMode="decimal"
          autoComplete="off"
          {...register("concessionRupees")}
        />
        <FieldError message={errors.concessionRupees?.message} />
      </div>
      {type === "one_time" ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="feePlanCount">
            {type === "installments" ? "Number of installments" : "Months"}
          </Label>
          <Input
            id="feePlanCount"
            className="h-10"
            inputMode="numeric"
            autoComplete="off"
            {...register("count")}
          />
          <FieldError message={errors.count?.message} />
        </div>
      )}
      <Button type="submit" disabled={isSubmitting}>
        Save Fee Plan
      </Button>
    </form>
  );
}

function dueDatesFor(
  type: "one_time" | "monthly" | "installments",
  netPaise: number,
  count: number,
  start: string,
): { dueOn: string; amountPaise: number }[] {
  if (type === "one_time") {
    return [{ dueOn: start, amountPaise: netPaise }];
  }
  const n = Math.max(1, count);
  const base = Math.floor(netPaise / n);
  const remainder = netPaise - base * n;
  return Array.from({ length: n }, (_, index) => ({
    dueOn: addMonths(start, index),
    amountPaise: base + (index === 0 ? remainder : 0),
  }));
}

function addMonths(isoDate: string, months: number): string {
  const [yearText, monthText, dayText] = isoDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}
