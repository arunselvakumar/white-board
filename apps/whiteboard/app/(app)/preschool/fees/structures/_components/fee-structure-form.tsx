"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { DialogFooter } from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { paiseToRupeesInput, parseRupeesInput } from "@/lib/money";
import { frequencyOptions } from "@/lib/preschool-fees";
import { QueryHttpError } from "@/src/queries/http";
import type {
  PreschoolFeeFrequency,
  PreschoolFeeHead,
  PreschoolFeeStructure,
  SavePreschoolFeeStructureInput,
} from "@/src/queries/preschool/fees";

const FREQUENCIES = [
  "one_time",
  "monthly",
  "quarterly",
  "term",
  "annual",
] as const;

const schema = z.object({
  rows: z.array(
    z.object({
      feeHeadId: z.string(),
      amountRupees: z
        .string()
        .trim()
        .refine(
          (value) => value === "" || parseRupeesInput(value) != null,
          "Enter rupees, up to 2 decimal places",
        ),
      frequency: z.enum(FREQUENCIES),
    }),
  ),
});

type Values = z.infer<typeof schema>;

/**
 * The heads a structure can list: those not archived, and any archived head
 * the structure already charges.
 */
function headsFor(
  heads: readonly PreschoolFeeHead[],
  structure: PreschoolFeeStructure | null,
): PreschoolFeeHead[] {
  const charged = new Set(structure?.items.map((item) => item.feeHeadId));
  return heads.filter((head) => !head.isArchived || charged.has(head.id));
}

function defaultFrequency(head: PreschoolFeeHead): PreschoolFeeFrequency {
  return head.kind === "one_time" ? "one_time" : "monthly";
}

/**
 * One row per Fee Head: an amount per instalment and how often it is
 * charged. A blank or zero amount is not charged.
 */
export function FeeStructureForm({
  programmeName,
  heads,
  structure,
  onSave,
  onCancel,
}: {
  programmeName: string;
  heads: readonly PreschoolFeeHead[];
  /** The lines to start from. */
  structure: PreschoolFeeStructure | null;
  onSave: (items: SavePreschoolFeeStructureInput["items"]) => Promise<void>;
  onCancel: () => void;
}) {
  const rowsHeads = headsFor(heads, structure);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      rows: rowsHeads.map((head) => {
        const line = structure?.items.find(
          (item) => item.feeHeadId === head.id,
        );
        return {
          feeHeadId: head.id,
          amountRupees:
            line == null || line.amountPaise === 0
              ? ""
              : paiseToRupeesInput(line.amountPaise),
          frequency: line?.frequency ?? defaultFrequency(head),
        };
      }),
    },
  });
  return (
    <form
      noValidate
      aria-label={`${programmeName} fees`}
      className="grid gap-4"
      onSubmit={handleSubmit(async (values) => {
        const items = values.rows.flatMap((row) => {
          const amountPaise = parseRupeesInput(row.amountRupees) ?? 0;
          return amountPaise > 0
            ? [
                {
                  feeHeadId: row.feeHeadId,
                  amountPaise,
                  frequency: row.frequency,
                },
              ]
            : [];
        });
        try {
          await onSave(items);
        } catch (error) {
          setError("root", {
            message:
              error instanceof QueryHttpError
                ? error.message
                : "Could not save the Fee Structure.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="text-muted-foreground hidden grid-cols-[1fr_8rem_9rem] gap-3 text-xs sm:grid">
        <span>Fee Head</span>
        <span>Amount (₹)</span>
        <span>Charged</span>
      </div>
      {rowsHeads.map((head, index) => {
        const options = frequencyOptions(head.kind);
        const rowErrors = errors.rows?.[index];
        return (
          <div
            key={head.id}
            className="grid grid-cols-2 items-start gap-3 sm:grid-cols-[1fr_8rem_9rem]"
          >
            <div className="col-span-2 flex flex-wrap items-center gap-1.5 pt-2 sm:col-span-1">
              <span className="font-medium">{head.name}</span>
              {head.isArchived ? (
                <Badge variant="outline">Archived</Badge>
              ) : null}
            </div>
            <div className="space-y-1">
              <Input
                aria-label={`${head.name} amount (₹)`}
                inputMode="decimal"
                placeholder="Not charged"
                className="h-10"
                aria-invalid={rowErrors?.amountRupees != null}
                {...register(`rows.${index}.amountRupees`)}
              />
              <FieldError message={rowErrors?.amountRupees?.message} />
            </div>
            <Controller
              name={`rows.${index}.frequency`}
              control={control}
              render={({ field }) => (
                <Select
                  items={options}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    size="lg"
                    aria-label={`${head.name} charged`}
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        );
      })}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Save Fee Structure
        </Button>
      </DialogFooter>
    </form>
  );
}
