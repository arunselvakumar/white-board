"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";
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
  ResourcePicker,
  type PickerOption,
} from "@/components/contracts/items/resource-picker";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { boqQuantity, BOQ_ITEM_NO_MAX } from "@/src/contracts/domain/boq";
import { isValidSacHsn } from "@/src/contracts/domain/item";
import type { VariationKind } from "@/src/contracts/domain/variation";
import {
  boqFormOptionsQuery,
  useCreateVariation,
  useUpdateVariation,
  type BoqItem,
  type Variation,
} from "@/src/queries/contracts-boq";

import { KIND_LABELS, money, quantity, quantityInput } from "./boq-format";

const REASON_MAX = 500;

const schema = z
  .object({
    kind: z.enum(["extra_item", "quantity", "rate"]),
    boqItemId: z.string(),
    sectionId: z.string(),
    itemNo: z.string().trim().max(BOQ_ITEM_NO_MAX),
    description: z.string().trim(),
    uomId: z.string(),
    sacHsn: z.string().trim(),
    newQuantity: z.string().trim(),
    newRate: z.string().trim(),
    reason: z
      .string()
      .trim()
      .min(1, "Write why the BOQ changes")
      .max(REASON_MAX, `Use at most ${String(REASON_MAX)} characters`),
  })
  .superRefine((values, context) => {
    const issue = (path: string, message: string) => {
      context.addIssue({ code: "custom", path: [path], message });
    };
    if (values.kind !== "extra_item" && values.boqItemId === "")
      issue("boqItemId", "Pick the BOQ item");
    if (values.kind === "extra_item") {
      if (values.sectionId === "") issue("sectionId", "Pick the section");
      if (values.itemNo === "") issue("itemNo", "Enter the item number");
      if (values.description === "")
        issue("description", "Enter the description");
      if (values.uomId === "") issue("uomId", "Pick the UoM");
      if (values.sacHsn !== "" && !isValidSacHsn(values.sacHsn))
        issue("sacHsn", "SAC or HSN is 4 to 8 digits");
    }
    if (values.kind !== "rate" && boqQuantity(values.newQuantity) == null)
      issue("newQuantity", "More than 0, with at most four decimals");
    if (values.kind !== "quantity" && !isRupees(values.newRate))
      issue("newRate", "Enter the rate in rupees, like 475.50");
  });

type Values = z.infer<typeof schema>;
type Field = keyof Values;

const SERVER_FIELDS: Partial<Record<string, Field>> = {
  VARIATION_REASON_REQUIRED: "reason",
  TEXT_TOO_LONG: "reason",
  VARIATION_PENDING: "boqItemId",
  BOQ_ITEM_NOT_FOUND: "boqItemId",
  BOQ_SECTION_NOT_FOUND: "sectionId",
  BOQ_ITEM_NO_TAKEN: "itemNo",
  BOQ_ITEM_UOM_INVALID: "uomId",
  SAC_HSN_INVALID: "sacHsn",
  BOQ_QUANTITY_INVALID: "newQuantity",
  BOQ_AMOUNT_TOO_LARGE: "newQuantity",
  BOQ_RATE_INVALID: "newRate",
};

/** What a "Raise variation" button fills in. */
export type VariationPrefill = {
  kind: VariationKind;
  boqItemId?: string;
  newQuantity?: string;
};

type ItemPick = PickerOption & { item: BoqItem };

/**
 * Raise or edit a Variation (CM-1103, ADR CM-0023 §4): an extra item, or a
 * new quantity or rate for a BOQ item, always with a reason. It waits for
 * the BOQ's Approve flag. Rate changes and extra items carry rates, so
 * they are offered only with BOQ Financial.
 */
export function VariationDialog({
  projectId,
  financial,
  items,
  variation,
  prefill,
  onClose,
}: {
  projectId: string;
  financial: boolean;
  /** The BOQ's live items, for the item picker. */
  items: readonly BoqItem[];
  /** Null to raise one. */
  variation: Variation | null;
  prefill?: VariationPrefill;
  onClose: () => void;
}) {
  const id = useId();
  const { data: options } = useSuspenseQuery(boqFormOptionsQuery(projectId));
  const create = useCreateVariation();
  const update = useUpdateVariation(variation?.id ?? "");
  const picks = useMemo<ItemPick[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        label: `${item.itemNo} · ${item.description}`,
        detail: `Now ${quantity(item.quantity)} ${item.uomName}${item.rate == null ? "" : ` at ${money(item.rate)}`}`,
        item,
      })),
    [items],
  );
  const kinds: VariationKind[] = financial
    ? ["quantity", "rate", "extra_item"]
    : ["quantity"];
  const kindItems = kinds.map((kind) => ({
    value: kind,
    label: KIND_LABELS[kind],
  }));

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: variation?.kind ?? prefill?.kind ?? "quantity",
      boqItemId:
        variation?.kind === "extra_item"
          ? ""
          : (variation?.boqItemId ?? prefill?.boqItemId ?? ""),
      sectionId: variation?.sectionId ?? options.sections[0]?.id ?? "",
      itemNo: variation?.kind === "extra_item" ? (variation.itemNo ?? "") : "",
      description:
        variation?.kind === "extra_item" ? (variation.description ?? "") : "",
      uomId: variation?.kind === "extra_item" ? (variation.uomId ?? "") : "",
      sacHsn: variation?.kind === "extra_item" ? (variation.sacHsn ?? "") : "",
      newQuantity:
        quantityInput(variation?.newQuantity) || (prefill?.newQuantity ?? ""),
      newRate: paiseToRupees(variation?.newRate ?? null),
      reason: variation?.reason ?? "",
    },
  });
  const errors = form.formState.errors;
  const kind = useWatch({ control: form.control, name: "kind" });
  const boqItemId = useWatch({ control: form.control, name: "boqItemId" });
  const picked = picks.find((pick) => pick.id === boqItemId) ?? null;

  const submit = form.handleSubmit(async (values) => {
    const content =
      values.kind === "extra_item"
        ? {
            sectionId: values.sectionId,
            itemNo: values.itemNo,
            description: values.description,
            uomId: values.uomId,
            sacHsn: values.sacHsn === "" ? null : values.sacHsn,
            newQuantity: values.newQuantity,
            newRate: rupeesToPaise(values.newRate),
          }
        : values.kind === "quantity"
          ? { boqItemId: values.boqItemId, newQuantity: values.newQuantity }
          : {
              boqItemId: values.boqItemId,
              newRate: rupeesToPaise(values.newRate),
            };
    try {
      if (variation == null)
        await create.mutateAsync({
          projectId,
          kind: values.kind,
          reason: values.reason,
          ...content,
        });
      else
        await update.mutateAsync({
          reason: values.reason,
          ...content,
          expectedUpdatedAt: variation.updatedAt,
        });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  const select = (
    name: "kind" | "sectionId" | "uomId",
    label: string,
    choices: { value: string; label: string }[],
    disabled = false,
  ) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`${id}-${name}`} required>
        {label}
      </Label>
      <Controller
        name={name}
        control={form.control}
        render={({ field }) => (
          <Select
            items={choices}
            value={field.value === "" ? null : field.value}
            disabled={disabled}
            onValueChange={(next) => {
              if (next == null) return;
              field.onChange(next);
            }}
          >
            <SelectTrigger
              id={`${id}-${name}`}
              size="lg"
              className="w-full min-w-0"
              aria-required
              aria-invalid={errors[name] != null}
            >
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError message={errors[name]?.message} />
    </div>
  );

  const quantityField = (label: string) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`${id}-newQuantity`} required>
        {label}
      </Label>
      <Input
        id={`${id}-newQuantity`}
        className="h-10"
        inputMode="decimal"
        autoComplete="off"
        aria-required
        aria-invalid={errors.newQuantity != null}
        {...form.register("newQuantity")}
      />
      <FieldError message={errors.newQuantity?.message} />
    </div>
  );
  const rateField = (label: string) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`${id}-newRate`} required>
        {label}
      </Label>
      <MoneyInput
        id={`${id}-newRate`}
        className="h-10"
        suffix="per UoM"
        aria-required
        aria-invalid={errors.newRate != null}
        {...form.register("newRate")}
      />
      <FieldError message={errors.newRate?.message} />
    </div>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">
              {variation == null
                ? "Raise a Variation"
                : `Edit Variation ${variation.number}`}
            </DialogTitle>
            <DialogDescription>
              It changes the BOQ once someone with Approve approves it. The item
              keeps its original figures beside the new ones.
            </DialogDescription>
          </DialogHeader>
          {select("kind", "What changes", kindItems, variation != null)}
          {kind === "extra_item" ? (
            <>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {select(
                  "sectionId",
                  "Section",
                  options.sections.map((section) => ({
                    value: section.id,
                    label: section.title,
                  })),
                )}
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-itemNo`} required>
                    Item no
                  </Label>
                  <Input
                    id={`${id}-itemNo`}
                    className="h-10"
                    autoComplete="off"
                    aria-required
                    aria-invalid={errors.itemNo != null}
                    {...form.register("itemNo")}
                  />
                  <FieldError message={errors.itemNo?.message} />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-description`} required>
                  Description
                </Label>
                <Textarea
                  id={`${id}-description`}
                  rows={2}
                  aria-required
                  aria-invalid={errors.description != null}
                  {...form.register("description")}
                />
                <FieldError message={errors.description?.message} />
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {select(
                  "uomId",
                  "UoM",
                  options.uoms.map((uom) => ({
                    value: uom.id,
                    label: uom.name,
                  })),
                )}
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${id}-sacHsn`}>SAC/HSN</Label>
                  <Input
                    id={`${id}-sacHsn`}
                    className="h-10"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={errors.sacHsn != null}
                    {...form.register("sacHsn")}
                  />
                  <FieldError message={errors.sacHsn?.message} />
                </div>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {quantityField("Quantity")}
                {rateField("Rate")}
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-item`} required>
                  BOQ item
                </Label>
                <Controller
                  name="boqItemId"
                  control={form.control}
                  render={({ field }) => (
                    <ResourcePicker<ItemPick>
                      id={`${id}-item`}
                      label="BOQ item"
                      noun="BOQ items"
                      placeholder="Search by item no or description"
                      options={picks}
                      value={
                        picks.find((pick) => pick.id === field.value) ?? null
                      }
                      onChange={(next) => {
                        field.onChange(next?.id ?? "");
                      }}
                      required
                      invalid={errors.boqItemId != null}
                    />
                  )}
                />
                <FieldError message={errors.boqItemId?.message} />
                {picked == null ? null : (
                  <p className="text-muted-foreground text-xs">
                    Original {quantity(picked.item.originalQuantity)}{" "}
                    {picked.item.uomName}
                    {picked.item.originalRate == null
                      ? ""
                      : ` at ${money(picked.item.originalRate)}`}
                    ; now {quantity(picked.item.quantity)} {picked.item.uomName}
                    {picked.item.rate == null
                      ? ""
                      : ` at ${money(picked.item.rate)}`}
                    {picked.item.measuredQuantity == null
                      ? ""
                      : `; measured ${quantity(picked.item.measuredQuantity)}`}
                    .
                  </p>
                )}
              </div>
              {kind === "quantity"
                ? quantityField("New quantity")
                : rateField("New rate")}
            </>
          )}
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-reason`} required>
              Reason
            </Label>
            <Textarea
              id={`${id}-reason`}
              rows={2}
              placeholder="Client's letter of 12 Oct asked for a deeper footing"
              aria-required
              aria-invalid={errors.reason != null}
              {...form.register("reason")}
            />
            <FieldError message={errors.reason?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                form.formState.isSubmitting ||
                create.isPending ||
                update.isPending
              }
            >
              {variation == null ? "Send for approval" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
