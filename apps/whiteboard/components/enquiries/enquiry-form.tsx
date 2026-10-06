"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type UseFormSetError,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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

import {
  PageHeader,
  type PageHeaderBack,
} from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { CLASS_MODE_ITEMS } from "@/lib/class-mode";
import { QueryHttpError } from "@/src/queries/http";
import {
  findPhoneMatches,
  type CreateEnquiryInput,
  type EnquiryOptionsResponse,
  type EnquiryResponse,
  type PhoneMatchesResponse,
} from "@/src/queries/enquiries";

import { todayInKolkata } from "./enquiry-format";
import { PhoneMatchWarning } from "./phone-match-warning";

const NONE = "none";
const OTHER_SUBJECT = "other";

function enquiryFormSchema(today: string) {
  return z
    .object({
      prospectName: z
        .string()
        .trim()
        .min(1, "Prospect name is required")
        .max(200, "Name must be 200 characters or fewer"),
      phone: z
        .string()
        .trim()
        .min(1, "Phone is required")
        .max(32, "Phone must be 32 characters or fewer"),
      email: z.email("Enter a valid email").or(z.literal("")),
      guardianName: z
        .string()
        .trim()
        .max(200, "Name must be 200 characters or fewer"),
      guardianPhone: z
        .string()
        .trim()
        .max(32, "Phone must be 32 characters or fewer"),
      courseChoice: z.string(),
      subject: z
        .string()
        .trim()
        .max(200, "Subject must be 200 characters or fewer"),
      preferredClassMode: z.enum(["offline", "online", "hybrid", NONE]),
      preferredTiming: z
        .string()
        .trim()
        .max(200, "Timing must be 200 characters or fewer"),
      sourceId: z.string(),
      notes: z.string().max(2000, "Notes must be 2,000 characters or fewer"),
      nextFollowUpOn: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.courseChoice === OTHER_SUBJECT && values.subject === "") {
        ctx.addIssue({
          code: "custom",
          path: ["subject"],
          message: "Enter the subject they asked about",
        });
      }
      if (values.nextFollowUpOn !== "" && values.nextFollowUpOn < today) {
        ctx.addIssue({
          code: "custom",
          path: ["nextFollowUpOn"],
          message: "Choose today or a later date",
        });
      }
    });
}

export type EnquiryFormValues = z.infer<ReturnType<typeof enquiryFormSchema>>;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function enquiryToFormValues(
  enquiry: EnquiryResponse,
): EnquiryFormValues {
  return {
    prospectName: enquiry.prospectName,
    phone: enquiry.phone,
    email: enquiry.email ?? "",
    guardianName: enquiry.guardianName ?? "",
    guardianPhone: enquiry.guardianPhone ?? "",
    courseChoice:
      enquiry.courseId ?? (enquiry.subject != null ? OTHER_SUBJECT : NONE),
    subject: enquiry.subject ?? "",
    preferredClassMode: enquiry.preferredClassMode ?? NONE,
    preferredTiming: enquiry.preferredTiming ?? "",
    sourceId: enquiry.source?.id ?? NONE,
    notes: enquiry.notes ?? "",
    nextFollowUpOn: "",
  };
}

export function enquiryFormToInput(
  values: EnquiryFormValues,
  includeFollowUp: boolean,
): CreateEnquiryInput {
  const otherSubject = values.courseChoice === OTHER_SUBJECT;
  const courseId =
    values.courseChoice === NONE || otherSubject ? null : values.courseChoice;
  const input: CreateEnquiryInput = {
    prospectName: values.prospectName.trim(),
    phone: values.phone.trim(),
    email: emptyToNull(values.email),
    guardianName: emptyToNull(values.guardianName),
    guardianPhone: emptyToNull(values.guardianPhone),
    courseId,
    subject: otherSubject ? emptyToNull(values.subject) : null,
    preferredClassMode:
      values.preferredClassMode === NONE ? null : values.preferredClassMode,
    preferredTiming: emptyToNull(values.preferredTiming),
    sourceId: values.sourceId === NONE ? null : values.sourceId,
    notes: emptyToNull(values.notes),
  };
  if (includeFollowUp)
    input.nextFollowUpOn = emptyToNull(values.nextFollowUpOn);
  return input;
}

const FIELD_BY_CODE: Record<string, keyof EnquiryFormValues> = {
  EMAIL_INVALID: "email",
  PHONE_REQUIRED: "phone",
  PHONE_TOO_LONG: "phone",
  GUARDIAN_NAME_REQUIRED: "guardianName",
  GUARDIAN_NAME_TOO_LONG: "guardianName",
  COURSE_NOT_FOUND: "courseChoice",
  COURSE_ARCHIVED: "courseChoice",
  ENQUIRY_SOURCE_NOT_FOUND: "sourceId",
  ENQUIRY_SOURCE_RETIRED: "sourceId",
  FOLLOW_UP_IN_PAST: "nextFollowUpOn",
};

function applyEnquiryError(
  error: unknown,
  setError: UseFormSetError<EnquiryFormValues>,
) {
  const fallback = "Could not save this Enquiry. Please try again.";
  if (!(error instanceof QueryHttpError)) {
    setError("root", { message: fallback });
    return;
  }
  const field = FIELD_BY_CODE[error.code];
  if (field != null) {
    setError(field, { message: error.message });
    return;
  }
  setError("root", { message: error.message || fallback });
}

function digitsOf(phone: string): string {
  return phone.replace(/\D/g, "");
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
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

type SelectName = "courseChoice" | "preferredClassMode" | "sourceId";

function SelectField({
  name,
  label,
  items,
  control,
  error,
}: {
  name: SelectName;
  label: string;
  items: { value: string; label: string }[];
  control: Control<EnquiryFormValues>;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value}
            onValueChange={(value) => {
              if (value == null) return;
              field.onChange(value);
            }}
          >
            <SelectTrigger
              id={name}
              size="lg"
              className="w-full min-w-0"
              aria-invalid={error != null}
            >
              <SelectValue />
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
      <FieldError message={error} />
    </div>
  );
}

export function EnquiryForm({
  options,
  enquiry,
  back,
  onSubmit,
  onCancel,
  today = todayInKolkata(),
}: {
  options: EnquiryOptionsResponse;
  /** The Enquiry being edited; omit to add a new one. */
  enquiry?: EnquiryResponse;
  back?: PageHeaderBack;
  onSubmit: (input: CreateEnquiryInput) => Promise<void>;
  onCancel?: () => void;
  today?: string;
}) {
  const editing = enquiry != null;
  const initialPhone = enquiry?.phone ?? "";
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryFormValues>({
    resolver: zodResolver(enquiryFormSchema(today)),
    defaultValues:
      enquiry == null
        ? {
            prospectName: "",
            phone: "",
            email: "",
            guardianName: "",
            guardianPhone: "",
            courseChoice: NONE,
            subject: "",
            preferredClassMode: NONE,
            preferredTiming: "",
            sourceId: NONE,
            notes: "",
            nextFollowUpOn: "",
          }
        : enquiryToFormValues(enquiry),
  });
  const courseChoice = useWatch({ control, name: "courseChoice" });
  const phone = useWatch({ control, name: "phone" });

  const [checked, setChecked] = useState<{
    digits: string;
    matches: PhoneMatchesResponse;
  } | null>(null);
  const lastChecked = useRef<string | null>(null);
  const phoneCheck = useMutation({
    mutationFn: (value: string) => findPhoneMatches(value, enquiry?.id),
    onSuccess: (matches, value) => {
      setChecked({ digits: digitsOf(value), matches });
    },
  });
  const { mutate: runPhoneCheck } = phoneCheck;
  const requestPhoneCheck = (value: string) => {
    const digits = digitsOf(value);
    if (digits.length < 10) return;
    if (editing && digits === digitsOf(initialPhone)) return;
    if (lastChecked.current === digits) return;
    lastChecked.current = digits;
    runPhoneCheck(value.trim());
  };
  const requestPhoneCheckRef = useRef(requestPhoneCheck);
  useEffect(() => {
    requestPhoneCheckRef.current = requestPhoneCheck;
  });
  useEffect(() => {
    const handle = window.setTimeout(() => {
      requestPhoneCheckRef.current(phone);
    }, 600);
    return () => {
      window.clearTimeout(handle);
    };
  }, [phone]);
  const visibleMatches =
    checked?.digits === digitsOf(phone) ? checked.matches : null;

  const courseItems = [
    { value: NONE, label: "Not decided yet" },
    ...options.courses.map((course) => ({
      value: course.id,
      label: course.name,
    })),
  ];
  if (
    enquiry?.courseId != null &&
    !options.courses.some((course) => course.id === enquiry.courseId)
  ) {
    courseItems.push({
      value: enquiry.courseId,
      label: `${enquiry.courseName ?? "Course"} (archived)`,
    });
  }
  courseItems.push({ value: OTHER_SUBJECT, label: "Other subject" });

  const classModeItems = [
    { value: NONE, label: "No preference" },
    ...CLASS_MODE_ITEMS.map((mode) => ({
      value: mode.value,
      label: mode.label,
    })),
  ];

  const currentSourceId = enquiry?.source?.id;
  const sourceItems = [
    { value: NONE, label: "Not recorded" },
    ...options.sources
      .filter((source) => !source.retired || source.id === currentSourceId)
      .map((source) => ({
        value: source.id,
        label: source.retired ? `${source.name} (retired)` : source.name,
      })),
  ];
  if (
    enquiry?.source != null &&
    !sourceItems.some((item) => item.value === enquiry.source?.id)
  ) {
    sourceItems.push({
      value: enquiry.source.id,
      label: enquiry.source.retired
        ? `${enquiry.source.name} (retired)`
        : enquiry.source.name,
    });
  }

  const phoneField = register("phone");

  function textField(
    name:
      | "prospectName"
      | "email"
      | "guardianName"
      | "guardianPhone"
      | "subject"
      | "preferredTiming",
    label: string,
    extra: {
      type?: string;
      placeholder?: string;
      hint?: string;
      autoComplete?: string;
    } = {},
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          className="h-10"
          type={extra.type ?? "text"}
          placeholder={extra.placeholder}
          autoComplete={extra.autoComplete ?? "off"}
          aria-invalid={errors[name] != null}
          {...register(name)}
        />
        {extra.hint == null ? null : (
          <p className="text-muted-foreground text-xs">{extra.hint}</p>
        )}
        <FieldError message={errors[name]?.message} />
      </div>
    );
  }

  return (
    <form
      noValidate
      className="w-full"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(enquiryFormToInput(values, !editing));
        } catch (error) {
          applyEnquiryError(error, setError);
        }
      })}
    >
      <div className="w-full max-w-4xl space-y-7">
        <PageHeader
          back={back}
          title={editing ? "Edit enquiry" : "Add enquiry"}
          meta={
            editing
              ? "Update the prospect's details and what they asked about."
              : "Record who asked, what they want to learn, and when to call back. An Enquiry is not a Student until they join."
          }
        />
        <FormAlert message={errors.root?.message} />

        <FormSection
          number="01"
          title="Prospect"
          description="Who asked, and how to reach them. Add a Parent or Guardian for a minor."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              {textField("prospectName", "Prospect name", {
                placeholder: "e.g. Priya Sharma",
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                className="h-10"
                type="tel"
                autoComplete="off"
                placeholder="e.g. 98765 43210"
                aria-invalid={errors.phone != null}
                {...phoneField}
                onBlur={(event) => {
                  void phoneField.onBlur(event);
                  requestPhoneCheck(event.target.value);
                }}
              />
              <FieldError message={errors.phone?.message} />
            </div>
            {textField("email", "Email (optional)", { type: "email" })}
            {visibleMatches == null ? null : (
              <div className="sm:col-span-2">
                <PhoneMatchWarning matches={visibleMatches} />
              </div>
            )}
            {textField("guardianName", "Parent or Guardian name (optional)")}
            {textField("guardianPhone", "Parent or Guardian phone (optional)", {
              type: "tel",
            })}
          </div>
        </FormSection>

        <FormSection
          number="02"
          title="Interest"
          description="The Course or subject they asked about, and how they would like to learn."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              name="courseChoice"
              label="Course"
              items={courseItems}
              control={control}
              error={errors.courseChoice?.message}
            />
            {courseChoice === OTHER_SUBJECT ? (
              textField("subject", "Subject", {
                placeholder: "e.g. Class 10 Maths",
              })
            ) : (
              <div className="hidden sm:block" aria-hidden="true" />
            )}
            <SelectField
              name="preferredClassMode"
              label="Preferred Class Mode"
              items={classModeItems}
              control={control}
            />
            {textField("preferredTiming", "Preferred timing (optional)", {
              placeholder: "e.g. Evenings after 6",
            })}
          </div>
        </FormSection>

        <FormSection
          number="03"
          title={editing ? "Source and notes" : "Source and follow-up"}
          description={
            editing
              ? "Where this Enquiry came from, and anything staff should know."
              : "Where this Enquiry came from, and when to call back."
          }
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              name="sourceId"
              label="Source"
              items={sourceItems}
              control={control}
              error={errors.sourceId?.message}
            />
            {editing ? (
              <div className="hidden sm:block" aria-hidden="true" />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="nextFollowUpOn">
                  Next follow-up (optional)
                </Label>
                <Input
                  id="nextFollowUpOn"
                  className="h-10"
                  type="date"
                  min={today}
                  aria-invalid={errors.nextFollowUpOn != null}
                  {...register("nextFollowUpOn")}
                />
                <FieldError message={errors.nextFollowUpOn?.message} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="e.g. Wants a weekend Batch; elder sister studied DCA here"
                aria-invalid={errors.notes != null}
                {...register("notes")}
              />
              <FieldError message={errors.notes?.message} />
            </div>
          </div>
        </FormSection>

        <div className="flex flex-wrap justify-end gap-3">
          {onCancel == null ? null : (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Save enquiry"}
          </Button>
        </div>
      </div>
    </form>
  );
}
