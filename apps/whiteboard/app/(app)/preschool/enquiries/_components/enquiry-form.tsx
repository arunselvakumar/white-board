"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useForm, useWatch, type Control } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  SelectField,
  TextareaField,
  TextField,
} from "@/app/(app)/preschool/_components/form-fields";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { ageText } from "@/src/preschool/domain/child";
import {
  addMonths,
  ageInMonths,
  isIsoDate,
} from "@/src/preschool/domain/dates";
import { normaliseIndianMobile } from "@/src/preschool/domain/phone";
import { QueryHttpError } from "@/src/queries/http";
import type { PreschoolChildFormOptions } from "@/src/queries/preschool/children";
import {
  PRESCHOOL_ENQUIRY_SOURCE_LABELS,
  PRESCHOOL_ENQUIRY_STATUS_LABELS,
  preschoolEnquiryPhoneMatchesQueryOptions,
  type PreschoolEnquiry,
  type PreschoolEnquiryInput,
  type PreschoolEnquirySource,
} from "@/src/queries/preschool/enquiries";

import { todayHere } from "./enquiry-actions";

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email",
  );

const schema = z.object({
  childName: z.string().trim().min(1, "Enter the child's name").max(200),
  childDateOfBirth: z
    .string()
    .refine(
      (value) => value === "" || (isIsoDate(value) && value <= todayHere()),
      "Enter a date of birth that is not ahead",
    ),
  childGender: z.enum(["", "girl", "boy", "other"]),
  parentName: z.string().trim().min(1, "Enter the parent's name").max(200),
  parentPhone: z
    .string()
    .trim()
    .refine(
      (value) => normaliseIndianMobile(value) != null,
      "Enter a 10-digit Indian mobile number",
    ),
  parentEmail: optionalEmail,
  programmeId: z.string(),
  source: z.enum([
    "walk_in",
    "referral",
    "google",
    "social_media",
    "flyer",
    "head_office",
    "other",
  ]),
  notes: z.string().trim().max(2000),
  nextFollowUpOn: z.string(),
});

export type EnquiryFormValues = z.infer<typeof schema>;

const GENDER_OPTIONS = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
  { value: "other", label: "Other" },
] as const;

const SOURCE_OPTIONS = (
  Object.entries(PRESCHOOL_ENQUIRY_SOURCE_LABELS) as [
    PreschoolEnquirySource,
    string,
  ][]
).map(([value, label]) => ({ value, label }));

export function enquiryToValues(enquiry: PreschoolEnquiry): EnquiryFormValues {
  return {
    childName: enquiry.childName,
    childDateOfBirth: enquiry.childDateOfBirth ?? "",
    childGender: enquiry.childGender ?? "",
    parentName: enquiry.parentName,
    parentPhone: enquiry.parentPhone,
    parentEmail: enquiry.parentEmail ?? "",
    programmeId: enquiry.programmeId ?? "",
    source: enquiry.source,
    notes: enquiry.notes ?? "",
    nextFollowUpOn: enquiry.nextFollowUpOn ?? "",
  };
}

const EMPTY: EnquiryFormValues = {
  childName: "",
  childDateOfBirth: "",
  childGender: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  programmeId: "",
  source: "walk_in",
  notes: "",
  nextFollowUpOn: "",
};

function toInput(values: EnquiryFormValues): PreschoolEnquiryInput {
  const orNull = (value: string) => (value === "" ? null : value);
  return {
    childName: values.childName,
    childDateOfBirth: orNull(values.childDateOfBirth),
    childGender: values.childGender === "" ? null : values.childGender,
    parentName: values.parentName,
    parentPhone: values.parentPhone,
    parentEmail: orNull(values.parentEmail),
    programmeId: orNull(values.programmeId),
    source: values.source,
    notes: orNull(values.notes),
  };
}

/**
 * The Programme a child of this age fits, on the first day of this
 * Academic Year or of the next one.
 */
export function programmeFit(
  dateOfBirth: string,
  options: PreschoolChildFormOptions,
): string | null {
  const current = options.academicYears.find(
    (year) => year.id === options.currentAcademicYearId,
  );
  if (current == null) return null;
  const years = [
    { name: current.name, startsOn: current.startsOn },
    ...options.academicYears
      .filter((year) => year.startsOn > current.startsOn)
      .slice(0, 1),
  ];
  if (years.length === 1)
    years.push({
      name: "next year",
      startsOn: addMonths(current.startsOn, 12),
    });
  for (const year of years) {
    const months = ageInMonths(dateOfBirth, year.startsOn);
    const programme = options.programmes.find(
      (entry) =>
        !entry.isDaycare &&
        (entry.minAgeMonths == null || months >= entry.minAgeMonths) &&
        (entry.maxAgeMonths == null || months <= entry.maxAgeMonths),
    );
    if (programme != null)
      return year === years[0]
        ? `Fits ${programme.name} this year (${year.name}).`
        : `Fits ${programme.name} in ${year.name}.`;
  }
  return "No Programme fits this age; Daycare takes any age.";
}

function AgeHint({
  control,
  options,
}: {
  control: Control<EnquiryFormValues>;
  options: PreschoolChildFormOptions;
}) {
  const dateOfBirth = useWatch({ control, name: "childDateOfBirth" });
  if (!isIsoDate(dateOfBirth) || dateOfBirth > todayHere()) return null;
  return (
    <p className="text-muted-foreground text-xs" aria-live="polite">
      {ageText(dateOfBirth, todayHere())} today.{" "}
      {programmeFit(dateOfBirth, options)}
    </p>
  );
}

/** "An open Enquiry / a Child with this number already exists", with links. */
function PhoneMatches({
  control,
  centreId,
  excludeEnquiryId,
}: {
  control: Control<EnquiryFormValues>;
  centreId: string;
  excludeEnquiryId?: string;
}) {
  const phone = normaliseIndianMobile(
    useWatch({ control, name: "parentPhone" }),
  );
  const { data } = useQuery({
    ...preschoolEnquiryPhoneMatchesQueryOptions(
      centreId,
      phone ?? "",
      excludeEnquiryId,
    ),
    enabled: phone != null,
  });
  if (phone == null || data == null) return null;
  if (data.enquiries.length === 0 && data.children.length === 0) return null;
  return (
    <Alert>
      <AlertTitle>
        {data.enquiries.length > 0
          ? "An open Enquiry with this number already exists"
          : "A Child with this number already exists"}
      </AlertTitle>
      <AlertDescription>
        <ul className="space-y-1">
          {data.enquiries.map((match) => (
            <li key={match.id}>
              <Link
                href={`/preschool/enquiries/${match.id}`}
                className="underline underline-offset-4"
              >
                {match.childName}
              </Link>{" "}
              · {match.parentName} ·{" "}
              {PRESCHOOL_ENQUIRY_STATUS_LABELS[match.status]}
            </li>
          ))}
          {data.children.map((match) => (
            <li key={match.id}>
              <Link
                href={`/preschool/children/${match.id}`}
                className="underline underline-offset-4"
              >
                {match.name}
              </Link>{" "}
              · {match.admissionNumber}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

const FIELD_BY_CODE: Record<string, keyof EnquiryFormValues> = {
  PHONE_INVALID: "parentPhone",
  DATE_OF_BIRTH_IN_FUTURE: "childDateOfBirth",
  PROGRAMME_ARCHIVED: "programmeId",
  PROGRAMME_NOT_FOUND: "programmeId",
};

/** Add or edit an Enquiry. Editing leaves the follow-up date to Log follow-up. */
export function EnquiryForm({
  mode,
  defaultValues,
  enquiryId,
  options,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  defaultValues?: EnquiryFormValues;
  enquiryId?: string;
  options: PreschoolChildFormOptions;
  onSubmit: (
    input: PreschoolEnquiryInput & { nextFollowUpOn?: string | null },
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const { centre } = useActiveCentre();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EnquiryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? EMPTY,
  });
  const programmes = options.programmes.map((programme) => ({
    value: programme.id,
    label: programme.name,
    tag: programme.ageRangeText ?? undefined,
  }));
  return (
    <form
      noValidate
      aria-label={mode === "create" ? "Add Enquiry" : "Edit Enquiry"}
      className="space-y-8"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            ...toInput(values),
            ...(mode === "create"
              ? {
                  nextFollowUpOn:
                    values.nextFollowUpOn === "" ? null : values.nextFollowUpOn,
                }
              : {}),
          });
        } catch (error) {
          const field =
            error instanceof QueryHttpError
              ? FIELD_BY_CODE[error.code]
              : undefined;
          if (field != null && error instanceof QueryHttpError)
            setError(field, { message: error.message });
          else
            applyHttpFormError(
              error,
              setError,
              "Could not save this Enquiry. Please try again.",
            );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <section className="space-y-4" aria-labelledby="enquiry-child-heading">
        <h2 id="enquiry-child-heading" className="text-lg font-semibold">
          Child
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="enquiry-childName"
            name="childName"
            label="Child's name"
            required
            register={register}
            error={errors.childName}
          />
          <div className="space-y-1.5">
            <TextField
              id="enquiry-childDateOfBirth"
              name="childDateOfBirth"
              label="Date of birth"
              type="date"
              register={register}
              error={errors.childDateOfBirth}
              className="space-y-1.5"
            />
            <AgeHint control={control} options={options} />
          </div>
          <SelectField
            id="enquiry-childGender"
            name="childGender"
            label="Gender"
            control={control}
            options={GENDER_OPTIONS}
            error={errors.childGender}
          />
        </div>
        <SelectField
          id="enquiry-programmeId"
          name="programmeId"
          label="Programme"
          control={control}
          options={programmes}
          error={errors.programmeId}
          className="space-y-1.5 sm:max-w-sm"
        />
      </section>
      <section className="space-y-4" aria-labelledby="enquiry-parent-heading">
        <h2 id="enquiry-parent-heading" className="text-lg font-semibold">
          Parent
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="enquiry-parentName"
            name="parentName"
            label="Parent's name"
            required
            register={register}
            error={errors.parentName}
          />
          <TextField
            id="enquiry-parentPhone"
            name="parentPhone"
            label="Mobile number"
            required
            type="tel"
            inputMode="tel"
            placeholder="98400 12345"
            register={register}
            error={errors.parentPhone}
          />
          <TextField
            id="enquiry-parentEmail"
            name="parentEmail"
            label="Email"
            type="email"
            inputMode="email"
            register={register}
            error={errors.parentEmail}
          />
        </div>
        <PhoneMatches
          control={control}
          centreId={centre.id}
          excludeEnquiryId={enquiryId}
        />
      </section>
      <section className="space-y-4" aria-labelledby="enquiry-more-heading">
        <h2 id="enquiry-more-heading" className="text-lg font-semibold">
          Source and follow-up
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="enquiry-source"
            name="source"
            label="How they heard of us"
            required
            control={control}
            options={SOURCE_OPTIONS}
            error={errors.source}
          />
          {mode === "create" ? (
            <TextField
              id="enquiry-nextFollowUpOn"
              name="nextFollowUpOn"
              label="Next follow-up"
              type="date"
              register={register}
              error={errors.nextFollowUpOn}
            />
          ) : null}
        </div>
        <TextareaField
          id="enquiry-notes"
          name="notes"
          label="Notes"
          register={register}
          error={errors.notes}
        />
      </section>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving…"
            : mode === "create"
              ? "Save Enquiry"
              : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
