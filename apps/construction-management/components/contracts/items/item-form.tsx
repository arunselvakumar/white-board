"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
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

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MoneyInput, paiseToRupees } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  itemFormOptionsQuery,
  itemQuery,
  useCreateItem,
  useUpdateItem,
  type Item,
  type ItemFormOptions,
  type ItemInput,
} from "@/src/queries/contracts-items";

import {
  ITEMS_PATH,
  analysisTotals,
  itemErrorPath,
  itemFormDefaults,
  itemFormSchema,
  itemPayload,
  paiseOf,
  type ItemFormValues,
} from "./item-form-schema";
import { RateAnalysisTable, type UomChoice } from "./rate-analysis-table";
import { RateSummary } from "./rate-summary";

/** The Company's UoMs, plus any the Item already uses that left the list. */
function uomChoices(options: ItemFormOptions, item: Item | null): UomChoice[] {
  const choices = options.uoms.map((uom) => ({
    value: uom.id,
    label: uom.name,
  }));
  const known = new Set(choices.map((choice) => choice.value));
  const kept: [string | null, string | null][] = [
    [item?.uomId ?? null, item?.uomName ?? null],
    ...(item?.lines ?? []).map(
      (line) =>
        [line.resourceUomId, line.resourceUomName] as [
          string | null,
          string | null,
        ],
    ),
  ];
  for (const [id, name] of kept)
    if (id != null && !known.has(id)) {
      known.add(id);
      choices.push({ value: id, label: name ?? "Unavailable UoM" });
    }
  return choices;
}

/**
 * The Item form (CM-1102, ADR CM-0023 §3): code, descriptions, UoM,
 * SAC/HSN, schedule and the adopted rate; then the rate analysis with its
 * overhead and profit, and the analysed rate against the adopted one.
 */
export function ItemForm({
  item,
  options,
  onSave,
  saving,
}: {
  item: Item | null;
  options: ItemFormOptions;
  onSave: (payload: ItemInput) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: itemFormDefaults(item),
  });
  const errors = form.formState.errors;
  const [lines, overheadPercent, adoptedRate] = useWatch({
    control: form.control,
    name: ["lines", "overheadPercent", "adoptedRate"],
  });
  const totals = analysisTotals(lines, overheadPercent);
  const uoms = uomChoices(options, item);
  const labourCategories = options.labourCategories.map((row) => ({
    id: row.id,
    label: row.name,
    detail: row.skill === "skilled" ? "Skilled" : "Unskilled",
  }));
  const equipment = options.equipment.map((row) => ({
    id: row.id,
    label: `${row.name} (${row.equipmentNumber})`,
  }));

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(itemPayload(values));
      router.push(ITEMS_PATH);
    } catch (error) {
      const path = itemErrorPath(error);
      form.setError((path ?? "root") as Path<ItemFormValues>, {
        message: fieldForCode(error, {}).message,
      });
    }
  });

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <section aria-labelledby="item-details" className="space-y-4">
        <h2 id="item-details" className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="item-code" required>
              Code
            </Label>
            <Input
              id="item-code"
              className="h-10"
              autoComplete="off"
              placeholder="5.1.1"
              aria-required
              aria-invalid={errors.code != null}
              {...form.register("code")}
            />
            <FieldError message={errors.code?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-1 lg:col-span-3">
            <Label htmlFor="item-short" required>
              Short description
            </Label>
            <Input
              id="item-short"
              className="h-10"
              autoComplete="off"
              placeholder="PCC 1:4:8 in foundations"
              aria-required
              aria-invalid={errors.shortDescription != null}
              {...form.register("shortDescription")}
            />
            <FieldError message={errors.shortDescription?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="item-description">Description</Label>
            <Textarea
              id="item-description"
              rows={3}
              placeholder="The schedule's full wording"
              aria-invalid={errors.description != null}
              {...form.register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="item-uom" required>
              UoM
            </Label>
            <Controller
              name="uomId"
              control={form.control}
              render={({ field }) => (
                <Select
                  items={uoms}
                  value={field.value === "" ? null : field.value}
                  onValueChange={(next) => {
                    if (next != null) field.onChange(next);
                  }}
                >
                  <SelectTrigger
                    id="item-uom"
                    ref={field.ref}
                    size="lg"
                    className="w-full min-w-0"
                    aria-required
                    aria-invalid={errors.uomId != null}
                  >
                    <SelectValue placeholder="Choose a UoM" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="UoMs"
                  >
                    {uoms.map((uom) => (
                      <SelectItem key={uom.value} value={uom.value}>
                        {uom.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.uomId?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="item-sac">SAC/HSN</Label>
            <Input
              id="item-sac"
              className="h-10"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              placeholder="995411"
              aria-invalid={errors.sacHsn != null}
              {...form.register("sacHsn")}
            />
            <FieldError message={errors.sacHsn?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="item-schedule">Schedule</Label>
            <Input
              id="item-schedule"
              className="h-10"
              autoComplete="off"
              placeholder="CPWD DSR 2023"
              aria-invalid={errors.schedule != null}
              {...form.register("schedule")}
            />
            <FieldError message={errors.schedule?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="item-rate" required>
              Adopted rate
            </Label>
            <MoneyInput
              id="item-rate"
              className="h-10"
              placeholder="0.00"
              aria-required
              aria-invalid={errors.adoptedRate != null}
              aria-describedby="item-rate-hint"
              {...form.register("adoptedRate")}
            />
            <p id="item-rate-hint" className="text-muted-foreground text-xs">
              Per UoM: the rate you quote and copy to BOQs.
            </p>
            <FieldError message={errors.adoptedRate?.message} />
          </div>
        </div>
      </section>

      <section aria-labelledby="item-analysis" className="space-y-4">
        <div className="space-y-1">
          <h2 id="item-analysis" className="font-semibold">
            Rate analysis
          </h2>
          <p className="text-muted-foreground text-sm">
            Optional. What one unit of this Item takes; the analysed rate is
            worked out from it.
          </p>
        </div>
        <RateAnalysisTable
          control={form.control}
          register={form.register}
          setValue={form.setValue}
          errors={errors}
          uoms={uoms}
          labourCategories={labourCategories}
          equipment={equipment}
        />
        <div className="max-w-48 space-y-1.5">
          <Label htmlFor="item-overhead">Overhead and profit %</Label>
          <Input
            id="item-overhead"
            className="h-10 tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            placeholder="15"
            aria-invalid={errors.overheadPercent != null}
            {...form.register("overheadPercent")}
          />
          <FieldError message={errors.overheadPercent?.message} />
        </div>
        {lines.length === 0 ? null : (
          <RateSummary
            totals={totals}
            overheadPercent={overheadPercent}
            adoptedRate={paiseOf(adoptedRate)}
            onUseAnalysed={(paise) => {
              form.setValue("adoptedRate", paiseToRupees(paise), {
                shouldDirty: true,
                shouldValidate: errors.adoptedRate != null,
              });
            }}
          />
        )}
      </section>

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={ITEMS_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Item Library", href: ITEMS_PATH }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

/** Master records → Item Library → Add. */
export function NewItemScreen() {
  const { data: options } = useSuspenseQuery(itemFormOptionsQuery());
  const create = useCreateItem();
  return (
    <FormPage title="Add Item">
      <ItemForm
        item={null}
        options={options}
        saving={create.isPending || create.isSuccess}
        onSave={(payload) => create.mutateAsync(payload)}
      />
    </FormPage>
  );
}

/** Master records → Item Library → Edit; 409 when someone saved it since. */
export function EditItemScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(itemQuery(id));
  const { data: options } = useSuspenseQuery(itemFormOptionsQuery());
  const update = useUpdateItem(id);
  return (
    <FormPage title={`Edit ${data.code}`}>
      <ItemForm
        key={data.updatedAt}
        item={data}
        options={options}
        saving={update.isPending || update.isSuccess}
        onSave={(payload) =>
          update.mutateAsync({ ...payload, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
