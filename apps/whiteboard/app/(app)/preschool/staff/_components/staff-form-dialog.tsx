"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  CheckboxList,
  type CheckboxListItem,
} from "@/app/(app)/preschool/_components/checkbox-list";
import { QueryHttpError } from "@/src/queries/http";
import type {
  PreschoolStaff,
  PreschoolStaffDetailsInput,
  PreschoolStaffRole,
} from "@/src/queries/preschool/staff";

export const STAFF_ROLE_LABEL: Record<PreschoolStaffRole, string> = {
  centre_head: "Centre Head",
  teacher: "Teacher",
  helper: "Helper",
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  role: z.enum(["centre_head", "teacher", "helper"]),
  phone: z.string().trim().max(32),
  email: z
    .string()
    .trim()
    .max(320)
    .refine(
      (value) => value === "" || z.email().safeParse(value).success,
      "Enter a valid email",
    ),
  designation: z.string().trim().max(100),
  joinedOn: z.string(),
  classroomIds: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;

export type StaffFormInput = PreschoolStaffDetailsInput & {
  /** Classrooms this member is Class Teacher of; empty for a helper. */
  classroomIds: string[];
};

const FIELD_BY_CODE: Record<string, keyof FormValues> = {
  STAFF_NAME_REQUIRED: "name",
  STAFF_NAME_TOO_LONG: "name",
  STAFF_EMAIL_INVALID: "email",
  STAFF_EMAIL_IN_USE: "email",
  CENTRE_HEAD_OWNER_ONLY: "role",
  CLASS_TEACHER_ROLE: "classroomIds",
};

function StaffForm({
  staff,
  canAddCentreHead,
  classrooms,
  title,
  onCancel,
  onSubmit,
}: {
  staff: PreschoolStaff | null;
  canAddCentreHead: boolean;
  classrooms: readonly CheckboxListItem[];
  title: string;
  onCancel: () => void;
  onSubmit: (input: StaffFormInput) => Promise<void>;
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
      name: staff?.name ?? "",
      role: staff?.role ?? "teacher",
      phone: staff?.phone ?? "",
      email: staff?.email ?? "",
      designation: staff?.designation ?? "",
      joinedOn: staff?.joinedOn ?? "",
      classroomIds: staff?.classrooms.map((classroom) => classroom.id) ?? [],
    },
  });
  const role = useWatch({ control, name: "role" });
  const roles = (["centre_head", "teacher", "helper"] as const)
    .filter((value) => canAddCentreHead || value !== "centre_head")
    .map((value) => ({ value, label: STAFF_ROLE_LABEL[value] }));
  const signsIn = role !== "helper";
  const orNull = (value: string) => (value === "" ? null : value);

  return (
    <form
      noValidate
      aria-label={title}
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            name: values.name,
            role: values.role,
            phone: orNull(values.phone),
            email: orNull(values.email),
            designation: orNull(values.designation),
            joinedOn: orNull(values.joinedOn),
            classroomIds: values.role === "helper" ? [] : values.classroomIds,
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
                : "Could not save this Staff member. Please try again.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="staff-name" required>
            Name
          </Label>
          <Input
            id="staff-name"
            className="h-10"
            aria-required
            autoComplete="off"
            aria-invalid={errors.name != null}
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-role" required>
            Role
          </Label>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <Select
                items={roles}
                value={field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="staff-role"
                  size="lg"
                  aria-required
                  aria-invalid={errors.role != null}
                  className="w-full min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {roles.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.role?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-phone">Phone</Label>
          <Input
            id="staff-phone"
            className="h-10"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            {...register("phone")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-email">Email</Label>
          <Input
            id="staff-email"
            className="h-10"
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-describedby="staff-email-hint"
            aria-invalid={errors.email != null}
            {...register("email")}
          />
          <p id="staff-email-hint" className="text-muted-foreground text-xs">
            {!signsIn
              ? "Helpers do not sign in."
              : staff == null
                ? "Needed to sign in. Saving sends an invitation to this email."
                : "Needed to sign in. Send the invitation from the Staff list."}
          </p>
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-designation">Designation</Label>
          <Input
            id="staff-designation"
            className="h-10"
            autoComplete="off"
            placeholder="Montessori teacher"
            {...register("designation")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="staff-joined">Joined on</Label>
          <Input
            id="staff-joined"
            className="h-10"
            type="date"
            {...register("joinedOn")}
          />
        </div>
      </div>
      {signsIn ? (
        <Controller
          name="classroomIds"
          control={control}
          render={({ field }) => (
            <CheckboxList
              legend="Class Teacher of"
              idPrefix="staff-classroom"
              items={classrooms}
              value={field.value}
              onChange={field.onChange}
              emptyText="This Centre has no Classrooms this Academic Year yet."
            />
          )}
        />
      ) : null}
      <FieldError message={errors.classroomIds?.message} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Staff member"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Add a Staff member to the active Centre, or edit one. */
export function StaffFormDialog({
  open,
  staff,
  canAddCentreHead,
  classrooms,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** The member to edit; null adds one. */
  staff: PreschoolStaff | null;
  /** Only the Owner adds or edits a Centre Head. */
  canAddCentreHead: boolean;
  /** This Academic Year's Classrooms of the Centre. */
  classrooms: readonly CheckboxListItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: StaffFormInput) => Promise<void>;
}) {
  const title = staff == null ? "Add Staff member" : "Edit Staff member";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Centre Heads and Teachers sign in with their email. Helpers are kept
            as records only.
          </DialogDescription>
        </DialogHeader>
        <StaffForm
          key={staff?.id ?? "new"}
          staff={staff}
          canAddCentreHead={canAddCentreHead}
          classrooms={classrooms}
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
