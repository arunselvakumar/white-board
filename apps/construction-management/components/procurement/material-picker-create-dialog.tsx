"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
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
  categoryOptionsQuery,
  categoryPath,
  unitOptionsQuery,
  useCreateMaterial,
  type MaterialItem,
} from "@/src/queries/material-masters";
import type { MaterialOption } from "@/src/queries/material-options";

const NAME_MAX = 120;
/** The category select's "none" row (Base UI selects need a value). */
const NO_CATEGORY = "none";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the material name")
    .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
  uomId: z.string().min(1, "Choose the Measurement Unit"),
  categoryId: z.string(),
});

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  MATERIAL_NAME_REQUIRED: "name",
  MATERIAL_NAME_TOO_LONG: "name",
  MATERIAL_NAME_IN_USE: "name",
  MEASUREMENT_UNIT_REQUIRED: "uomId",
  MEASUREMENT_UNIT_NOT_FOUND: "uomId",
  MEASUREMENT_UNIT_DISABLED: "uomId",
  MATERIAL_CATEGORY_NOT_FOUND: "categoryId",
  MATERIAL_CATEGORY_DISABLED: "categoryId",
};

/** The picker's row for a Material the master just created. */
export function toMaterialOption(material: MaterialItem): MaterialOption {
  return {
    id: material.id,
    name: material.name,
    specification: material.specification,
    uomId: material.uomId,
    uomName: material.uomName,
    categoryId: material.categoryId,
    categoryName: material.categoryName,
    unitRate: material.unitRate,
    discount: material.discount,
    gstRate: material.gstRate,
    hsnCode: material.hsnCode,
    minStockQty: material.minStockQty,
  };
}

function messageOf(error: unknown): string | undefined {
  return error == null ? undefined : fieldForCode(error, {}).message;
}

/**
 * The material picker's Create New (CM-501): adds a Material to the master
 * with a name, its Measurement Unit and an optional Material Category, then
 * hands it back for the line. Rate Details stay on the Materials screen.
 */
export function CreateMaterialDialog({
  name,
  onCreated,
  onClose,
}: {
  /** What was typed in the picker. */
  name: string;
  onCreated: (material: MaterialOption) => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const units = useQuery(unitOptionsQuery);
  const categories = useQuery(categoryOptionsQuery());
  const create = useCreateMaterial();
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: { name, uomId: "", categoryId: NO_CATEGORY },
  });
  const errors = form.formState.errors;

  const unitItems = (units.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const categoryItems = [
    { value: NO_CATEGORY, label: "No category" },
    ...(categories.data ?? []).map((item) => ({
      value: item.id,
      label: categoryPath(item),
    })),
  ];
  const loadError = messageOf(units.error) ?? messageOf(categories.error);

  const submit = async (values: Parsed) => {
    try {
      const created = await create.mutateAsync({
        name: values.name,
        uomId: values.uomId,
        categoryId:
          values.categoryId === NO_CATEGORY ? null : values.categoryId,
      });
      onCreated(toMaterialOption(created));
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            // The picker sits inside a procurement form: React bubbles this
            // portalled submit up to it, which must not submit too.
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Create new material</DialogTitle>
            <DialogDescription>
              Adds it to the Materials master for every Project. Rate Details
              can be set later on the Materials screen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`${baseId}-name`}>Material name</Label>
            <Input
              id={`${baseId}-name`}
              className="h-10"
              autoComplete="off"
              placeholder="Fly Ash Bricks"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${baseId}-unit`}>Measurement Unit</Label>
              <Controller
                name="uomId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={unitItems}
                    value={field.value === "" ? null : field.value}
                    disabled={units.isPending}
                    onValueChange={(next) => {
                      if (next != null) field.onChange(next);
                    }}
                  >
                    <SelectTrigger
                      id={`${baseId}-unit`}
                      ref={field.ref}
                      size="lg"
                      className="w-full min-w-0"
                      aria-invalid={errors.uomId != null}
                    >
                      <SelectValue
                        placeholder={
                          units.isPending ? "Loading units…" : "Choose a unit"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Measurement Units"
                    >
                      {unitItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.uomId?.message} />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${baseId}-category`}>
                Material Category{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Controller
                name="categoryId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={categoryItems}
                    value={field.value}
                    disabled={categories.isPending}
                    onValueChange={(next) => {
                      if (next != null) field.onChange(next);
                    }}
                  >
                    <SelectTrigger
                      id={`${baseId}-category`}
                      size="lg"
                      className="w-full min-w-0"
                      aria-invalid={errors.categoryId != null}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Material Categories"
                    >
                      {categoryItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.categoryId?.message} />
            </div>
          </div>

          <FormAlert message={errors.root?.message ?? loadError} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create material"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
