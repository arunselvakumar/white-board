"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import type { TeacherProfile, TeacherWriteInput } from "@/src/queries/teachers";

const kinds = [
  { value: "centre_teacher", label: "Centre Teacher" },
  { value: "visiting_tutor", label: "Visiting Tutor" },
];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().max(320).pipe(z.email("Enter a valid email")),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  phone: z.string().max(32),
  qualificationSummary: z.string().max(1000),
});
type Values = z.infer<typeof schema>;

export function TeacherForm({ teacher, onSubmit, onCancel }: {
  teacher?: TeacherProfile;
  onSubmit: (input: TeacherWriteInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: teacher?.name ?? "", email: teacher?.email ?? "", kind: teacher?.kind ?? "centre_teacher",
      phone: teacher?.phone ?? "", qualificationSummary: teacher?.qualificationSummary ?? "",
    },
  });

  return <form noValidate className="space-y-5" onSubmit={handleSubmit(async (values) => {
    try {
      await onSubmit({ name: values.name.trim(), ...(teacher ? {} : { email: values.email.trim().toLowerCase() }),
        kind: values.kind, phone: values.phone.trim() || null, qualificationSummary: values.qualificationSummary.trim() || null });
    } catch (error) { applyHttpFormError(error, setError, "Could not save this Teacher. Please try again."); }
  })}>
    <FormAlert message={errors.root?.message} />
    <div className="space-y-1.5"><Label htmlFor="teacher-name">Full name</Label><Input id="teacher-name" {...register("name")} /><FieldError message={errors.name?.message} /></div>
    <div className="space-y-1.5"><Label htmlFor="teacher-email">Email</Label><Input id="teacher-email" type="email" readOnly={teacher != null} {...register("email")} /><FieldError message={errors.email?.message} />{teacher && <p className="text-muted-foreground text-sm">The invitation email cannot be changed after creation.</p>}</div>
    <div className="space-y-1.5"><Label htmlFor="teacher-kind">Teacher type</Label>
      <Controller name="kind" control={control} render={({ field }) => <Select items={kinds} value={field.value} onValueChange={(value) => { if (value) field.onChange(value); }}>
        <SelectTrigger id="teacher-kind" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>{kinds.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>} />
    </div>
    <div className="space-y-1.5"><Label htmlFor="teacher-phone">Phone (optional)</Label><Input id="teacher-phone" type="tel" {...register("phone")} /><FieldError message={errors.phone?.message} /></div>
    <div className="space-y-1.5"><Label htmlFor="teacher-qualification">Qualification summary (optional)</Label><Textarea id="teacher-qualification" {...register("qualificationSummary")} /><FieldError message={errors.qualificationSummary?.message} /></div>
    <div className="flex gap-3"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : teacher ? "Save changes" : "Add Teacher"}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
  </form>;
}
