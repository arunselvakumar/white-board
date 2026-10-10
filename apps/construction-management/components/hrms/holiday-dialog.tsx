"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  HOLIDAY_LIMITS,
  HOLIDAY_TYPES,
  HOLIDAY_TYPE_LABELS,
  isHolidayType,
} from "@/src/hrms/domain/holiday";
import {
  HRMS_HOLIDAYS_KEY,
  createHrmsHoliday,
  updateHrmsHoliday,
  type HrmsHoliday,
} from "@/src/queries/hrms-holidays";

const TYPE_ITEMS = HOLIDAY_TYPES.map((type) => ({
  value: type,
  label: HOLIDAY_TYPE_LABELS[type],
}));

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the holiday name")
    .max(HOLIDAY_LIMITS.maxNameLength, "Use at most 80 characters"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date"),
  type: z.string().refine(isHolidayType, "Choose the holiday type"),
  isOptional: z.boolean(),
  description: z
    .string()
    .trim()
    .max(HOLIDAY_LIMITS.maxDescriptionLength, "Use at most 500 characters"),
});

type FormValues = z.input<typeof schema>;
type Values = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  HOLIDAY_NAME_REQUIRED: "name",
  HOLIDAY_NAME_TOO_LONG: "name",
  HOLIDAY_DATE_INVALID: "date",
  HOLIDAY_DATE_TAKEN: "date",
  BACKDATED_CREATE_BLOCKED: "date",
  BACKDATED_EDIT_BLOCKED: "date",
  FINANCIAL_PERIOD_CLOSED: "date",
  HOLIDAY_TYPE_INVALID: "type",
  HOLIDAY_DESCRIPTION_TOO_LONG: "description",
};

/**
 * Add Holiday or edit one (CM-305): name, date, type, the optional flag
 * and a description. One holiday per date.
 */
export function HolidayDialog({
  holiday,
  defaultDate,
  onClose,
}: {
  /** Null to add. */
  holiday: HrmsHoliday | null;
  /** The date a new holiday starts on. */
  defaultDate: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<FormValues, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: holiday?.name ?? "",
      date: holiday?.date ?? defaultDate,
      type: holiday?.type ?? "",
      isOptional: holiday?.isOptional ?? false,
      description: holiday?.description ?? "",
    },
  });
  const errors = form.formState.errors;
  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = {
        ...values,
        description: values.description === "" ? null : values.description,
      };
      return holiday == null
        ? createHrmsHoliday(body)
        : updateHrmsHoliday(holiday.id, {
            ...body,
            expectedUpdatedAt: holiday.updatedAt,
          });
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_HOLIDAYS_KEY });
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
      <DialogContent className="sm:max-w-xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {holiday == null ? "Add Holiday" : `Edit ${holiday.name}`}
            </DialogTitle>
            <DialogDescription>
              A holiday is a paid day off for everyone. An optional holiday is
              shown on the calendar but stays a working day unless a member
              takes it as leave.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="holiday-name">Holiday name</Label>
              <Input
                id="holiday-name"
                className="h-10"
                autoComplete="off"
                placeholder="Pongal"
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-date">Date</Label>
              <Input
                id="holiday-date"
                type="date"
                className="h-10"
                aria-invalid={errors.date != null}
                {...form.register("date")}
              />
              <FieldError message={errors.date?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-type">Holiday type</Label>
              <Controller
                name="type"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={TYPE_ITEMS}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="holiday-type"
                      size="lg"
                      className="w-full min-w-0"
                      aria-invalid={errors.type != null}
                    >
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Holiday types"
                    >
                      {TYPE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.type?.message} />
            </div>
            <div className="flex items-start justify-between gap-4 sm:col-span-2">
              <div className="space-y-1">
                <Label htmlFor="holiday-optional">Optional holiday</Label>
                <p
                  id="holiday-optional-hint"
                  className="text-muted-foreground text-xs"
                >
                  A working day unless taken as leave.
                </p>
              </div>
              <Controller
                name="isOptional"
                control={form.control}
                render={({ field }) => (
                  <Switch
                    id="holiday-optional"
                    aria-describedby="holiday-optional-hint"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="holiday-description">
                Description (optional)
              </Label>
              <Textarea
                id="holiday-description"
                rows={2}
                aria-invalid={errors.description != null}
                {...form.register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save holiday"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
