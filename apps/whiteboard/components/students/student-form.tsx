"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, UserRound } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { z } from "zod";

import { Button } from "@repo/ui/components/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
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
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import type {
  StudentResponse,
  StudentWriteInput,
  StudentSalutation,
  StudentGender,
  StudentEducationStatus,
} from "@/src/queries/students";

const optionalEmail = z.email("Enter a valid email").or(z.literal(""));
const optionalPhone = z
  .string()
  .trim()
  .max(32, "Phone must be 32 characters or fewer");
const optionalName = z.string().trim().max(200);
const salutationSchema = z.enum([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
  "",
]);
const studentFormSchema = z.object({
  salutation: salutationSchema,
  gender: z.enum(["female", "male", "non_binary", "prefer_not_to_say", ""]),
  name: z.string().trim().min(1, "Student name is required").max(200),
  phone: z.string().trim().min(1, "Phone is required").max(32),
  email: optionalEmail,
  photoUrl: z.string().trim().max(2048),
  dateOfBirth: z.string(),
  address: z.string().max(4000),
  educationStatus: z.enum(["school", "completed", "other", ""]),
  currentInstitution: optionalName,
  currentGrade: z.string().trim().max(100),
  schoolBoard: z.string().trim().max(100),
  highestQualification: optionalName,
  fatherSalutation: salutationSchema,
  fatherGender: z.enum([
    "female",
    "male",
    "non_binary",
    "prefer_not_to_say",
    "",
  ]),
  fatherName: optionalName,
  fatherPhone: optionalPhone,
  fatherAlternatePhone: optionalPhone,
  fatherOccupation: optionalName,
  fatherEmail: optionalEmail,
  motherSalutation: salutationSchema,
  motherGender: z.enum([
    "female",
    "male",
    "non_binary",
    "prefer_not_to_say",
    "",
  ]),
  motherName: optionalName,
  motherPhone: optionalPhone,
  motherAlternatePhone: optionalPhone,
  motherOccupation: optionalName,
  motherEmail: optionalEmail,
  guardians: z.array(
    z.object({
      salutation: salutationSchema,
      gender: z.enum(["female", "male", "non_binary", "prefer_not_to_say", ""]),
      name: z.string().trim().min(1, "Guardian name is required").max(200),
      relationship: z.string().trim().max(100),
      phone: optionalPhone,
      email: optionalEmail,
    }),
  ),
  emergencyPhone: optionalPhone,
  idProofNote: z.string().max(4000),
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;
type TextFieldName = Exclude<keyof StudentFormValues, "guardians">;

const SALUTATION_OPTIONS = [
  { value: "mr", label: "Mr." },
  { value: "mrs", label: "Mrs." },
  { value: "ms", label: "Ms." },
  { value: "miss", label: "Miss" },
  { value: "mx", label: "Mx." },
  { value: "dr", label: "Dr." },
  { value: "prof", label: "Prof." },
];

const GENDER_OPTIONS = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const EDUCATION_OPTIONS = [
  { value: "school", label: "Studying at school or college" },
  { value: "completed", label: "Completed studies or working" },
  { value: "other", label: "Other" },
];

const initialValues: StudentFormValues = {
  salutation: "",
  gender: "",
  name: "",
  phone: "",
  email: "",
  photoUrl: "",
  dateOfBirth: "",
  address: "",
  educationStatus: "",
  currentInstitution: "",
  currentGrade: "",
  schoolBoard: "",
  highestQualification: "",
  fatherSalutation: "",
  fatherGender: "",
  fatherName: "",
  fatherPhone: "",
  fatherAlternatePhone: "",
  fatherOccupation: "",
  fatherEmail: "",
  motherSalutation: "",
  motherGender: "",
  motherName: "",
  motherPhone: "",
  motherAlternatePhone: "",
  motherOccupation: "",
  motherEmail: "",
  guardians: [],
  emergencyPhone: "",
  idProofNote: "",
};

function emptyToNull(value: string): string | null {
  return value.trim() || null;
}

export function studentToFormValues(
  student: StudentResponse,
): StudentFormValues {
  const details = student.details;
  return {
    salutation: details.salutation ?? "",
    gender: details.gender ?? "",
    name: student.name,
    phone: student.phone,
    email: student.email ?? "",
    photoUrl: student.photoUrl ?? "",
    dateOfBirth: details.dateOfBirth ?? "",
    address: student.address ?? "",
    educationStatus: details.educationStatus ?? "",
    currentInstitution: details.currentInstitution ?? "",
    currentGrade: details.currentGrade ?? "",
    schoolBoard: details.schoolBoard ?? "",
    highestQualification: details.highestQualification ?? "",
    fatherSalutation: details.father.salutation ?? "",
    fatherGender: details.father.gender ?? "",
    fatherName: details.father.name ?? "",
    fatherPhone: details.father.primaryPhone ?? "",
    fatherAlternatePhone: details.father.alternatePhone ?? "",
    fatherOccupation: details.father.occupation ?? "",
    fatherEmail: details.father.email ?? "",
    motherSalutation: details.mother.salutation ?? "",
    motherGender: details.mother.gender ?? "",
    motherName: details.mother.name ?? "",
    motherPhone: details.mother.primaryPhone ?? "",
    motherAlternatePhone: details.mother.alternatePhone ?? "",
    motherOccupation: details.mother.occupation ?? "",
    motherEmail: details.mother.email ?? "",
    guardians: details.guardians.map((guardian) => ({
      salutation: guardian.salutation ?? "",
      gender: guardian.gender ?? "",
      name: guardian.name,
      relationship: guardian.relationship ?? "",
      phone: guardian.phone ?? "",
      email: guardian.email ?? "",
    })),
    emergencyPhone: details.emergencyPhone ?? "",
    idProofNote: student.idProofNote ?? "",
  };
}

export function studentFormToWriteInput(
  values: StudentFormValues,
): StudentWriteInput {
  const parent = (which: "father" | "mother") => ({
    salutation: emptyToNull(
      values[`${which}Salutation`],
    ) as StudentSalutation | null,
    gender: emptyToNull(values[`${which}Gender`]) as StudentGender | null,
    name: emptyToNull(values[`${which}Name`]),
    primaryPhone: emptyToNull(values[`${which}Phone`]),
    alternatePhone: emptyToNull(values[`${which}AlternatePhone`]),
    occupation: emptyToNull(values[`${which}Occupation`]),
    email: emptyToNull(values[`${which}Email`]),
  });
  const guardians = values.guardians.map((guardian) => ({
    salutation: emptyToNull(guardian.salutation) as StudentSalutation | null,
    gender: emptyToNull(guardian.gender) as StudentGender | null,
    name: guardian.name.trim(),
    relationship: emptyToNull(guardian.relationship),
    phone: emptyToNull(guardian.phone),
    email: emptyToNull(guardian.email),
  }));
  return {
    salutation: emptyToNull(values.salutation) as StudentSalutation | null,
    gender: emptyToNull(values.gender) as StudentGender | null,
    name: values.name.trim(),
    phone: values.phone.trim(),
    email: emptyToNull(values.email),
    photoUrl: emptyToNull(values.photoUrl),
    dateOfBirth: emptyToNull(values.dateOfBirth),
    address: emptyToNull(values.address),
    educationStatus: emptyToNull(
      values.educationStatus,
    ) as StudentEducationStatus | null,
    currentInstitution: emptyToNull(values.currentInstitution),
    currentGrade: emptyToNull(values.currentGrade),
    schoolBoard: emptyToNull(values.schoolBoard),
    highestQualification: emptyToNull(values.highestQualification),
    father: parent("father"),
    mother: parent("mother"),
    guardians,
    guardianName: guardians[0]?.name ?? null,
    guardianPhone: guardians[0]?.phone ?? null,
    emergencyPhone: emptyToNull(values.emergencyPhone),
    idProofNote: emptyToNull(values.idProofNote),
  };
}

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex items-start gap-4 border-b pb-5">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
          {number}
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

type DropdownName =
  | "salutation"
  | "gender"
  | "educationStatus"
  | "fatherSalutation"
  | "fatherGender"
  | "motherSalutation"
  | "motherGender"
  | `guardians.${number}.salutation`
  | `guardians.${number}.gender`;

function DropdownField({
  name,
  label,
  options,
  control,
}: {
  name: DropdownName;
  label: string;
  options: { value: string; label: string }[];
  control: Control<StudentFormValues>;
}) {
  const id = name.replaceAll(".", "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            items={options}
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value ?? "");
            }}
          >
            <SelectTrigger id={id} size="lg" className="w-full">
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

export function StudentForm({
  defaultValues,
  submitLabel = "Save Student",
  onSubmit,
  onCancel,
  preview = false,
}: {
  defaultValues?: Partial<StudentFormValues>;
  submitLabel?: string;
  onSubmit?: (input: StudentWriteInput) => Promise<void>;
  onCancel?: () => void;
  preview?: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: { ...initialValues, ...defaultValues },
  });
  const {
    fields: guardians,
    append,
    remove,
  } = useFieldArray({
    control,
    name: "guardians",
  });
  const educationStatus = useWatch({ control, name: "educationStatus" });
  const photoUrl = useWatch({ control, name: "photoUrl" });

  function field(
    name: TextFieldName,
    label: string,
    options: { type?: string; placeholder?: string } = {},
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          className="h-10"
          type={options.type ?? "text"}
          placeholder={options.placeholder}
          {...register(name)}
        />
        <FieldError message={getFieldState(name).error?.message} />
      </div>
    );
  }

  return (
    <form
      noValidate
      className="bg-background min-h-screen px-4 py-8 sm:px-6 lg:py-12"
      onSubmit={handleSubmit(async (values) => {
        if (preview || onSubmit == null) return;
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
      <div className="max-w-4xl space-y-7">
        <FormAlert message={errors.root?.message} />
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-primary mb-2 text-xs font-semibold tracking-[0.18em] uppercase">
              Student register
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {defaultValues == null ? "Add Student" : "Edit Student"}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              {defaultValues == null
                ? "Record the Student and their contacts. Email addresses entered here receive Workspace invitations when you save. Course and Batch details are added with an Enrollment."
                : "Update the Student and their contacts. Course and Batch details are managed through Enrollments."}
            </p>
          </div>
          {preview ? (
            <span className="bg-muted text-muted-foreground w-fit rounded-full px-3 py-1 text-xs font-medium">
              Form preview
            </span>
          ) : null}
        </header>

        <Section
          number="01"
          title="Student details"
          description="Start with the details staff use to identify and contact this Student."
        >
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="grid gap-5 sm:grid-cols-2">
              <DropdownField
                name="salutation"
                label="Salutation"
                options={SALUTATION_OPTIONS}
                control={control}
              />
              <div className="sm:col-span-2">{field("name", "Full name")}</div>
              <DropdownField
                name="gender"
                label="Gender"
                options={GENDER_OPTIONS}
                control={control}
              />
              {field("phone", "Phone number", { type: "tel" })}
              {field("email", "Email address", { type: "email" })}
              {field("dateOfBirth", "Date of birth", { type: "date" })}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" rows={2} {...register("address")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="photoUrl">Student photo</Label>
              <div className="bg-muted/40 text-muted-foreground flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-xs">
                <Avatar className="size-20">
                  {photoUrl.trim() === "" ? null : (
                    <AvatarImage src={photoUrl} alt="Student photo preview" />
                  )}
                  <AvatarFallback>
                    <UserRound className="size-8" aria-hidden="true" />
                  </AvatarFallback>
                </Avatar>
              </div>
              <Input
                id="photoUrl"
                className="h-10"
                placeholder="Photo URL"
                {...register("photoUrl")}
              />
              <p className="text-muted-foreground text-xs">
                Paste a hosted photo URL.
              </p>
            </div>
          </div>
        </Section>

        <Section
          number="02"
          title="Education"
          description="School details fit tuition Students; qualifications fit adult learners."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <DropdownField
                name="educationStatus"
                label="Current education status"
                options={EDUCATION_OPTIONS}
                control={control}
              />
            </div>
            {educationStatus === "school" ? (
              <>
                {field("currentInstitution", "Current school or college")}
                {field("currentGrade", "Current class or grade", {
                  placeholder: "e.g. Class 10",
                })}
                {field("schoolBoard", "School board", {
                  placeholder: "e.g. CBSE",
                })}
              </>
            ) : educationStatus === "completed" ? (
              field("highestQualification", "Highest qualification")
            ) : (
              <p className="text-muted-foreground text-sm sm:col-span-2">
                Select a status to show relevant education fields.
              </p>
            )}
          </div>
        </Section>

        {(["father", "mother"] as const).map((parent, index) => (
          <Section
            key={parent}
            number={String(index + 3).padStart(2, "0")}
            title={`${parent === "father" ? "Father" : "Mother"} details`}
            description="Add the contact details available for this Student."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <DropdownField
                name={`${parent}Salutation`}
                label="Salutation"
                options={SALUTATION_OPTIONS}
                control={control}
              />
              <DropdownField
                name={`${parent}Gender`}
                label="Gender"
                options={GENDER_OPTIONS}
                control={control}
              />
              {field(`${parent}Name`, "Full name")}
              {field(`${parent}Occupation`, "Occupation")}
              {field(`${parent}Phone`, "Primary phone", { type: "tel" })}
              {field(`${parent}AlternatePhone`, "Alternate contact number", {
                type: "tel",
              })}
              {field(`${parent}Email`, "Email address", { type: "email" })}
            </div>
          </Section>
        ))}

        <Section
          number="05"
          title="Guardians"
          description="Add any other people who care for this Student, such as grandparents."
        >
          <div className="space-y-4">
            {guardians.length === 0 ? (
              <div className="bg-muted/30 rounded-xl border border-dashed p-5 text-sm">
                <p className="font-medium">No additional Guardians yet</p>
                <p className="text-muted-foreground mt-1">
                  Add as many as needed. Each Guardian has their own
                  relationship and contact details.
                </p>
              </div>
            ) : null}
            {guardians.map((guardian, index) => (
              <div key={guardian.id} className="rounded-xl border p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Guardian {index + 1}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove Guardian ${index + 1}`}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <DropdownField
                    name={`guardians.${index}.salutation`}
                    label="Salutation"
                    options={SALUTATION_OPTIONS}
                    control={control}
                  />
                  <DropdownField
                    name={`guardians.${index}.gender`}
                    label="Gender"
                    options={GENDER_OPTIONS}
                    control={control}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-${index}-name`}>Full name</Label>
                    <Input
                      id={`guardian-${index}-name`}
                      className="h-10"
                      {...register(`guardians.${index}.name`)}
                    />
                    <FieldError
                      message={
                        getFieldState(`guardians.${index}.name`).error?.message
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-${index}-relationship`}>
                      Relationship to Student
                    </Label>
                    <Input
                      id={`guardian-${index}-relationship`}
                      className="h-10"
                      placeholder="e.g. Grandmother"
                      {...register(`guardians.${index}.relationship`)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-${index}-phone`}>
                      Phone number
                    </Label>
                    <Input
                      id={`guardian-${index}-phone`}
                      className="h-10"
                      type="tel"
                      {...register(`guardians.${index}.phone`)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`guardian-${index}-email`}>
                      Email address
                    </Label>
                    <Input
                      id={`guardian-${index}-email`}
                      className="h-10"
                      type="email"
                      {...register(`guardians.${index}.email`)}
                    />
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                append({
                  salutation: "",
                  gender: "",
                  name: "",
                  relationship: "",
                  phone: "",
                  email: "",
                });
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add Guardian
            </Button>
          </div>
        </Section>

        <Section
          number="06"
          title="Emergency & records"
          description="A number staff can reach quickly, plus any identification note."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {field("emergencyPhone", "Emergency phone number", { type: "tel" })}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="idProofNote">ID proof note</Label>
              <Textarea
                id="idProofNote"
                rows={2}
                placeholder="e.g. Document checked at admission"
                {...register("idProofNote")}
              />
            </div>
          </div>
        </Section>

        {preview ? (
          <div className="text-muted-foreground rounded-xl border border-dashed px-5 py-4 text-sm">
            This is a UI preview. Fields entered here are not saved.
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            {onCancel != null ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
