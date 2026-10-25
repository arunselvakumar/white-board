"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useId } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
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
import { MaterialPicker } from "@/components/procurement/material-picker";
import { fieldForCode } from "@/lib/server-errors";
import { lookupListQuery } from "@/src/queries/masters";
import {
  useWorkTypeCommand,
  type WorkTypeItem,
} from "@/src/queries/work-types";

const NAME_MAX = 120;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Work Type name")
    .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
  departmentId: z.string().min(1, "Choose a Department"),
  materials: z.array(
    z.object({
      materialId: z.string(),
      name: z.string(),
      unitName: z.string(),
      disabled: z.boolean(),
    }),
  ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  WORK_TYPE_NAME_REQUIRED: "name",
  WORK_TYPE_NAME_TOO_LONG: "name",
  WORK_TYPE_NAME_IN_USE: "name",
  DEPARTMENT_NOT_FOUND: "departmentId",
  DEPARTMENT_DISABLED: "departmentId",
  MATERIAL_NOT_FOUND: "materials",
  MATERIAL_DISABLED: "materials",
  WORK_TYPE_MATERIALS_TOO_MANY: "materials",
};

/**
 * Add a Work Type or change one (CM-601): its name, Department and the
 * Materials a worksheet offers first. The Default Work Type (RCC) keeps
 * its name and Department; its Materials can change.
 */
export function WorkTypeDialog({
  item,
  onClose,
}: {
  /** Null to add. */
  item: WorkTypeItem | null;
  onClose: () => void;
}) {
  const id = useId();
  const { data: departments } = useSuspenseQuery(
    lookupListQuery("departments"),
  );
  const command = useWorkTypeCommand();
  const locked = item?.isSeed === true;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: item?.name ?? "",
      departmentId: item?.departmentId ?? "",
      materials: (item?.materials ?? []).map((material) => ({
        materialId: material.id,
        name: material.name,
        unitName: material.unitName,
        disabled: material.disabled,
      })),
    },
  });
  const materials = useFieldArray({ control: form.control, name: "materials" });
  const errors = form.formState.errors;

  // Enabled Departments, and the one the Work Type already has.
  const departmentItems = departments.items
    .filter(
      (department) =>
        !department.disabled || department.id === item?.departmentId,
    )
    .map((department) => ({
      value: department.id,
      label: department.disabled
        ? `${department.name} (disabled)`
        : department.name,
    }));

  const submit = form.handleSubmit(async (values) => {
    const input = {
      name: values.name,
      departmentId: values.departmentId,
      materialIds: values.materials.map((material) => material.materialId),
    };
    try {
      await command.mutateAsync(
        item == null
          ? { kind: "create", input }
          : {
              kind: "update",
              id: item.id,
              input,
              expectedUpdatedAt: item.updatedAt,
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-3xl">
        <form
          noValidate
          className="flex min-h-0 flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item == null ? "Add Work Type" : `Edit ${item.name}`}
            </DialogTitle>
            <DialogDescription>
              What a crew does within a Department. Its Materials are offered
              first on a Daily Worksheet.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto">
            {locked ? (
              <p className="text-muted-foreground text-sm">
                This Default Work Type keeps its name and Department. You can
                change its Materials.
              </p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`} required>
                  Work Type name
                </Label>
                <Input
                  id={`${id}-name`}
                  className="h-10"
                  autoComplete="off"
                  aria-required
                  placeholder="Column casting"
                  readOnly={locked}
                  aria-invalid={errors.name != null}
                  {...form.register("name")}
                />
                <FieldError message={errors.name?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-department`} required>
                  Department
                </Label>
                <Controller
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <Select
                      items={departmentItems}
                      value={field.value === "" ? null : field.value}
                      disabled={locked}
                      onValueChange={(next) => {
                        if (next != null) field.onChange(next);
                      }}
                    >
                      <SelectTrigger
                        id={`${id}-department`}
                        className="w-full min-w-0"
                        aria-required
                        aria-invalid={errors.departmentId != null}
                      >
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Departments"
                      >
                        {departmentItems.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.departmentId?.message} />
              </div>
            </div>
            <section aria-labelledby={`${id}-materials`} className="space-y-3">
              <div className="space-y-1">
                <h3 id={`${id}-materials`} className="text-sm font-medium">
                  Materials
                </h3>
                <p className="text-muted-foreground text-xs">
                  Offered first when a worksheet with this Work Type records
                  material used. Any Material can still be chosen.
                </p>
              </div>
              <MaterialPicker
                id={`${id}-material-picker`}
                aria-label="Add a Material"
                value={null}
                excludeIds={materials.fields.map((field) => field.materialId)}
                onChange={(picked) => {
                  if (picked == null) return;
                  form.clearErrors("materials");
                  materials.append({
                    materialId: picked.id,
                    name: picked.name,
                    unitName: picked.uomName,
                    disabled: false,
                  });
                }}
              />
              {materials.fields.length === 0 ? (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                  No Materials assigned.
                </p>
              ) : (
                <ul
                  aria-label="Assigned Materials"
                  className="divide-y rounded-lg border"
                >
                  {materials.fields.map((field, index) => (
                    <li
                      key={field.id}
                      className="flex min-w-0 items-center gap-3 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {field.name}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {field.unitName}
                        </p>
                      </div>
                      {field.disabled ? (
                        <Badge variant="outline">Disabled</Badge>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${field.name}`}
                        onClick={() => {
                          materials.remove(index);
                        }}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <FieldError
                message={
                  errors.materials?.message ?? errors.materials?.root?.message
                }
              />
            </section>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
