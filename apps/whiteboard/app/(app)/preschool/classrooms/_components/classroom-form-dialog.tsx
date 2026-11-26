"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { MAX_CLASSROOM_CAPACITY } from "@/src/preschool/domain/classroom";
import { QueryHttpError } from "@/src/queries/http";
import type { PreschoolClassroom } from "@/src/queries/preschool/classrooms";

const schema = z.object({
  programmeId: z.string().min(1, "Choose the Programme"),
  name: z.string().trim().min(1, "Classroom name is required").max(100),
  capacity: z
    .string()
    .trim()
    .refine(
      (value) =>
        /^\d{1,4}$/.test(value) &&
        Number(value) >= 1 &&
        Number(value) <= MAX_CLASSROOM_CAPACITY,
      `Enter 1 to ${MAX_CLASSROOM_CAPACITY}`,
    ),
});

type FormValues = z.infer<typeof schema>;

export type ClassroomFormInput = {
  programmeId: string;
  name: string;
  capacity: number;
};

const FIELD_BY_CODE: Record<string, keyof FormValues> = {
  CLASSROOM_NAME_IN_USE: "name",
  CLASSROOM_NAME_REQUIRED: "name",
  CLASSROOM_NAME_TOO_LONG: "name",
  CLASSROOM_CAPACITY_INVALID: "capacity",
  CLASSROOM_CAPACITY_BELOW_CHILDREN: "capacity",
  PROGRAMME_ARCHIVED: "programmeId",
  PROGRAMME_NOT_FOUND: "programmeId",
};

function ClassroomForm({
  classroom,
  programmes,
  title,
  onCancel,
  onSubmit,
}: {
  classroom: PreschoolClassroom | null;
  programmes: readonly { id: string; name: string }[];
  title: string;
  onCancel: () => void;
  onSubmit: (input: ClassroomFormInput) => Promise<void>;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      programmeId: classroom?.programmeId ?? "",
      name: classroom?.name ?? "",
      capacity: classroom == null ? "20" : String(classroom.capacity),
    },
  });
  const items = programmes.map((programme) => ({
    value: programme.id,
    label: programme.name,
  }));

  return (
    <form
      noValidate
      aria-label={title}
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            programmeId: values.programmeId,
            name: values.name,
            capacity: Number(values.capacity),
          });
        } catch (error) {
          const field =
            error instanceof QueryHttpError
              ? FIELD_BY_CODE[error.code]
              : undefined;
          setError(field ?? "root", {
            message:
              error instanceof QueryHttpError
                ? error.message
                : "Could not save this Classroom. Please try again.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      {classroom == null ? (
        <div className="space-y-1.5">
          <Label htmlFor="classroom-programme" required>
            Programme
          </Label>
          <Controller
            name="programmeId"
            control={control}
            render={({ field }) => (
              <Select
                items={items}
                value={field.value === "" ? null : field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="classroom-programme"
                  size="lg"
                  aria-required
                  aria-invalid={errors.programmeId != null}
                  className="w-full min-w-0"
                >
                  <SelectValue placeholder="Select a Programme" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.programmeId?.message} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="classroom-name" required>
            Classroom name
          </Label>
          <Input
            id="classroom-name"
            className="h-10"
            aria-required
            autoComplete="off"
            placeholder="Nursery A"
            aria-invalid={errors.name != null}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="classroom-capacity" required>
            Capacity
          </Label>
          <Input
            id="classroom-capacity"
            className="h-10"
            aria-required
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={errors.capacity != null}
            {...register("capacity")}
          />
          <FieldError message={errors.capacity?.message} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Classroom"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Add a Classroom (Programme, name, capacity) or edit one's name and capacity. */
export function ClassroomFormDialog({
  open,
  classroom,
  programmes,
  academicYearName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** The Classroom to edit; null adds one. */
  classroom: PreschoolClassroom | null;
  programmes: readonly { id: string; name: string }[];
  academicYearName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ClassroomFormInput) => Promise<void>;
}) {
  const title = classroom == null ? "Add Classroom" : "Edit Classroom";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {classroom == null
              ? `For the ${academicYearName} Academic Year.`
              : `${classroom.programmeName} · ${academicYearName}`}
          </DialogDescription>
        </DialogHeader>
        <ClassroomForm
          key={classroom?.id ?? "new"}
          classroom={classroom}
          programmes={programmes}
          title={title}
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
