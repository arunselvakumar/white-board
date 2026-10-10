"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  categoryOptionsQuery,
  useMaterialMasterCommand,
  type MaterialCategoryItem,
  type MeasurementUnitItem,
  type TermsConditionItem,
} from "@/src/queries/material-masters";

function MasterDialog({
  title,
  description,
  pending,
  rootError,
  onClose,
  onSubmit,
  children,
  wide = false,
}: {
  title: string;
  description: string;
  pending: boolean;
  rootError: string | undefined;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={wide ? "sm:max-w-xl" : "sm:max-w-md"}>
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <FormAlert message={rootError} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const unitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the unit name")
    .max(100, "Use at most 100 characters"),
});

/** Add a Measurement Unit, or rename a Company-made one. */
export function MeasurementUnitDialog({
  item,
  onClose,
}: {
  item: MeasurementUnitItem | null;
  onClose: () => void;
}) {
  const command = useMaterialMasterCommand("measurement-units");
  const form = useForm<z.infer<typeof unitSchema>>({
    resolver: zodResolver(unitSchema),
    defaultValues: { name: item?.name ?? "" },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync(
        item == null
          ? { kind: "create", input: { name: values.name } }
          : {
              kind: "update",
              id: item.id,
              input: { name: values.name, expectedUpdatedAt: item.updatedAt },
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        MEASUREMENT_UNIT_NAME_REQUIRED: "name",
        MEASUREMENT_UNIT_NAME_TOO_LONG: "name",
        MEASUREMENT_UNIT_NAME_IN_USE: "name",
      });
      form.setError(field ?? "root", { message });
    }
  });
  return (
    <MasterDialog
      title={item == null ? "Add Measurement Unit" : `Rename ${item.name}`}
      description="A unit Materials are counted in."
      pending={command.isPending}
      rootError={errors.root?.message}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="unit-name">Unit name</Label>
        <Input
          id="unit-name"
          className="h-10"
          autoComplete="off"
          placeholder="Running metre"
          aria-invalid={errors.name != null}
          {...form.register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
    </MasterDialog>
  );
}

const NO_PARENT = "none";

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the category name")
    .max(100, "Use at most 100 characters"),
  parentId: z.string(),
});

/**
 * Add or edit a Material Category: a name and, optionally, a top-level
 * parent. A category with sub-categories stays top-level.
 */
export function MaterialCategoryDialog({
  item,
  onClose,
}: {
  item: MaterialCategoryItem | null;
  onClose: () => void;
}) {
  const command = useMaterialMasterCommand("material-categories");
  const { data: parents = [] } = useQuery(
    categoryOptionsQuery({ topLevel: true }),
  );
  const form = useForm<z.infer<typeof categorySchema>>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: item?.name ?? "",
      parentId: item?.parentId ?? NO_PARENT,
    },
  });
  const errors = form.formState.errors;
  const hasChildren = (item?.childCount ?? 0) > 0;
  const choices = [
    { value: NO_PARENT, label: "None (top-level)" },
    ...parents
      .filter((parent) => parent.id !== item?.id)
      .map((parent) => ({ value: parent.id, label: parent.name })),
    // A parent disabled since stays choosable for its children.
    ...(item?.parentId != null &&
    !parents.some((parent) => parent.id === item.parentId)
      ? [{ value: item.parentId, label: item.parentName ?? "Current parent" }]
      : []),
  ];
  const submit = form.handleSubmit(async (values) => {
    const parentId = values.parentId === NO_PARENT ? null : values.parentId;
    try {
      await command.mutateAsync(
        item == null
          ? { kind: "create", input: { name: values.name, parentId } }
          : {
              kind: "update",
              id: item.id,
              input: {
                name: values.name,
                parentId,
                expectedUpdatedAt: item.updatedAt,
              },
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        MATERIAL_CATEGORY_NAME_REQUIRED: "name",
        MATERIAL_CATEGORY_NAME_TOO_LONG: "name",
        MATERIAL_CATEGORY_NAME_IN_USE: "name",
        MATERIAL_CATEGORY_PARENT_INVALID: "parentId",
        MATERIAL_CATEGORY_NOT_FOUND: "parentId",
        MATERIAL_CATEGORY_DISABLED: "parentId",
        MATERIAL_CATEGORY_HAS_CHILDREN: "parentId",
      });
      form.setError(field ?? "root", { message });
    }
  });
  return (
    <MasterDialog
      title={item == null ? "Add Material Category" : `Edit ${item.name}`}
      description="A group of Materials. A category can sit under one top-level category."
      pending={command.isPending}
      rootError={errors.root?.message}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="category-name">Category name</Label>
        <Input
          id="category-name"
          className="h-10"
          autoComplete="off"
          placeholder="Cement"
          aria-invalid={errors.name != null}
          {...form.register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category-parent">Parent category</Label>
        <Controller
          name="parentId"
          control={form.control}
          render={({ field }) => (
            <Select
              items={choices}
              value={field.value}
              disabled={hasChildren}
              onValueChange={(value) => {
                if (value != null) field.onChange(value);
              }}
            >
              <SelectTrigger
                id="category-parent"
                ref={field.ref}
                size="lg"
                className="w-full min-w-0"
                aria-invalid={errors.parentId != null}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                aria-label="Parent categories"
              >
                {choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {hasChildren ? (
          <p className="text-muted-foreground text-xs">
            It has sub-categories, so it stays top-level.
          </p>
        ) : null}
        <FieldError message={errors.parentId?.message} />
      </div>
    </MasterDialog>
  );
}

const termsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter the title")
    .max(120, "Use at most 120 characters"),
  body: z
    .string()
    .trim()
    .min(1, "Enter the terms")
    .max(5000, "Use at most 5,000 characters"),
});

/** Add or edit Terms & Conditions: a title and the text POs copy. */
export function TermsConditionDialog({
  item,
  onClose,
}: {
  item: TermsConditionItem | null;
  onClose: () => void;
}) {
  const command = useMaterialMasterCommand("terms-conditions");
  const form = useForm<z.infer<typeof termsSchema>>({
    resolver: zodResolver(termsSchema),
    defaultValues: { title: item?.title ?? "", body: item?.body ?? "" },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync(
        item == null
          ? { kind: "create", input: values }
          : {
              kind: "update",
              id: item.id,
              input: { ...values, expectedUpdatedAt: item.updatedAt },
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        TERMS_CONDITION_TITLE_REQUIRED: "title",
        TERMS_CONDITION_TITLE_TOO_LONG: "title",
        TERMS_CONDITION_NAME_IN_USE: "title",
        TERMS_CONDITION_BODY_REQUIRED: "body",
        TERMS_CONDITION_BODY_TOO_LONG: "body",
      });
      form.setError(field ?? "root", { message });
    }
  });
  return (
    <MasterDialog
      wide
      title={item == null ? "Add Terms & Conditions" : `Edit ${item.title}`}
      description="Picked on Purchase Orders, which keep the text as it was when they were saved."
      pending={command.isPending}
      rootError={errors.root?.message}
      onClose={onClose}
      onSubmit={() => {
        void submit();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="terms-title">Title</Label>
        <Input
          id="terms-title"
          className="h-10"
          autoComplete="off"
          placeholder="Delivery"
          aria-invalid={errors.title != null}
          {...form.register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="terms-body">Terms</Label>
        <Textarea
          id="terms-body"
          rows={6}
          placeholder="Material to be delivered at site between 9 am and 6 pm. Unloading at the supplier's cost."
          aria-invalid={errors.body != null}
          {...form.register("body")}
        />
        <FieldError message={errors.body?.message} />
      </div>
    </MasterDialog>
  );
}
