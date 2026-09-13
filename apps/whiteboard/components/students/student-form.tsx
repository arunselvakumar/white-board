"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import type { StudentResponse, StudentWriteInput } from "@/src/queries/students";

const studentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Student name is required")
    .max(200, "Student name must be 200 characters or fewer"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .max(32, "Phone must be 32 characters or fewer"),
  email: z
    .string()
    .max(320)
    .refine((value) => value.trim().length === 0 || value.includes("@"), {
      message: "Enter a valid email",
    }),
  address: z.string().max(4000),
  idProofNote: z.string().max(4000),
  guardianName: z.string().max(200),
  guardianPhone: z.string().max(32),
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function studentToFormValues(
  student: StudentResponse,
): StudentFormValues {
  return {
    name: student.name,
    phone: student.phone,
    email: student.email ?? "",
    address: student.address ?? "",
    idProofNote: student.idProofNote ?? "",
    guardianName: student.guardianName ?? "",
    guardianPhone: student.guardianPhone ?? "",
  };
}

export function studentFormToWriteInput(
  values: StudentFormValues,
): StudentWriteInput {
  return {
    name: values.name,
    phone: values.phone,
    email: emptyToNull(values.email),
    address: emptyToNull(values.address),
    idProofNote: emptyToNull(values.idProofNote),
    guardianName: emptyToNull(values.guardianName),
    guardianPhone: emptyToNull(values.guardianPhone),
  };
}

export function StudentForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues?: Partial<StudentFormValues>;
  submitLabel: string;
  onSubmit: (input: StudentWriteInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      address: "",
      idProofNote: "",
      guardianName: "",
      guardianPhone: "",
      ...defaultValues,
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(studentFormToWriteInput(values));
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not save this Student. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" className="h-10" autoComplete="off" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" className="h-10" autoComplete="off" {...register("phone")} />
        <FieldError message={errors.phone?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" className="h-10" autoComplete="off" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guardianName">Guardian name</Label>
        <Input
          id="guardianName"
          className="h-10"
          autoComplete="off"
          {...register("guardianName")}
        />
        <FieldError message={errors.guardianName?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guardianPhone">Guardian phone</Label>
        <Input
          id="guardianPhone"
          className="h-10"
          autoComplete="off"
          {...register("guardianPhone")}
        />
        <FieldError message={errors.guardianPhone?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" rows={3} {...register("address")} />
        <FieldError message={errors.address?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="idProofNote">ID proof note</Label>
        <Textarea id="idProofNote" rows={2} {...register("idProofNote")} />
        <FieldError message={errors.idProofNote?.message} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel != null ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
