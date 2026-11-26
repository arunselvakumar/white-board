"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  useForm,
  useWatch,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import {
  SelectField,
  TextField,
} from "@/app/(app)/preschool/_components/form-fields";
import { plural } from "@/app/(app)/preschool/_components/preschool-format";
import {
  AddressFields,
  admissionSectionSchema,
  admitInput,
  ChildDetailsFields,
  childSectionSchema,
  DocumentFields,
  EmergencyFields,
  fieldForError,
  healthSectionSchema,
  HealthFields,
  ParentFields,
  parentsSectionSchema,
  PickupFields,
  pickupsSectionSchema,
  type ChildFormValues,
} from "@/app/(app)/preschool/children/_components/child-form-fields";
import { programmeAgeWarning } from "@/src/preschool/domain/admission";
import { isIsoDate } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import type {
  AdmitPreschoolChildInput,
  PreschoolChildFormOptions,
} from "@/src/queries/preschool/children";

const schema = childSectionSchema
  .and(parentsSectionSchema)
  .and(pickupsSectionSchema)
  .and(healthSectionSchema)
  .and(admissionSectionSchema);

type Form = UseFormReturn<ChildFormValues>;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4" aria-labelledby={`${id}-heading`}>
      <div className="space-y-1">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {title}
        </h2>
        {description == null ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Programme, then a Classroom of it this year, the date, and the age check. */
function AdmissionFields({
  form,
  options,
}: {
  form: Form;
  options: PreschoolChildFormOptions;
}) {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = form;
  const [programmeId, classroomId, dateOfBirth] = useWatch({
    control,
    name: [
      "admission.programmeId",
      "admission.classroomId",
      "child.dateOfBirth",
    ],
  });
  const year = options.academicYears.find(
    (entry) => entry.id === options.currentAcademicYearId,
  );
  const classrooms = options.classrooms.filter(
    (room) =>
      room.programmeId === programmeId &&
      room.academicYearId === options.currentAcademicYearId,
  );
  const previous = useRef(programmeId);
  useEffect(() => {
    if (previous.current === programmeId) return;
    previous.current = programmeId;
    if (!classrooms.some((room) => room.id === classroomId))
      setValue("admission.classroomId", "");
  }, [classroomId, classrooms, programmeId, setValue]);

  const programme = options.programmes.find(
    (entry) => entry.id === programmeId,
  );
  const warning =
    programme != null && year != null && isIsoDate(dateOfBirth)
      ? programmeAgeWarning({
          dateOfBirth,
          academicYearStartsOn: year.startsOn,
          programme,
        })
      : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          id="admission-programmeId"
          name="admission.programmeId"
          label="Programme"
          required
          control={control}
          options={options.programmes.map((entry) => ({
            value: entry.id,
            label: entry.name,
            tag: entry.ageRangeText ?? undefined,
          }))}
          error={errors.admission?.programmeId}
        />
        <SelectField
          id="admission-classroomId"
          name="admission.classroomId"
          label="Classroom"
          required
          control={control}
          disabled={programmeId === ""}
          placeholder={
            programmeId === ""
              ? "Choose the Programme first"
              : classrooms.length === 0
                ? "No Classroom this year"
                : "Choose…"
          }
          options={classrooms.map((room) => ({
            value: room.id,
            label: room.name,
            tag:
              room.seatsLeft === 0
                ? "Full"
                : plural(room.seatsLeft, "seat left", "seats left"),
          }))}
          error={errors.admission?.classroomId}
        />
        <TextField
          id="admission-admittedOn"
          name="admission.admittedOn"
          label="Admission date"
          type="date"
          required
          register={register}
          error={errors.admission?.admittedOn}
        />
      </div>
      {warning == null ? null : (
        <Alert aria-live="polite">
          <AlertTitle>Age outside the Programme</AlertTitle>
          <AlertDescription>
            {warning} You can still admit the Child.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function swapParents(form: Form) {
  const { getValues, setValue } = form;
  const father = getValues("father");
  const mother = getValues("mother");
  setValue("father", mother, { shouldDirty: true });
  setValue("mother", father, { shouldDirty: true });
}

/** The whole admission form; the server answers the Child and an age warning. */
export function AdmissionForm({
  defaultValues,
  options,
  centreId,
  enquiryId,
  onSubmit,
  onCancel,
}: {
  defaultValues: ChildFormValues;
  options: PreschoolChildFormOptions;
  centreId: string;
  enquiryId?: string;
  onSubmit: (input: AdmitPreschoolChildInput) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<ChildFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });
  const {
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;
  return (
    <form
      noValidate
      aria-label="Admission form"
      className="space-y-10"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(admitInput(values, centreId, enquiryId));
        } catch (error) {
          if (error instanceof QueryHttpError) {
            const field = fieldForError(error.code, error.details);
            const seats =
              error.code === "CLASSROOM_FULL" &&
              typeof error.details === "object" &&
              error.details != null &&
              "capacity" in error.details
                ? ` (${String((error.details as { capacity: number }).capacity)} seats, all taken)`
                : "";
            if (field != null) {
              setError(field as Path<ChildFormValues>, {
                message: `${error.message}${seats}`,
              });
              return;
            }
          }
          setError("root", {
            message:
              error instanceof QueryHttpError && error.message !== ""
                ? error.message
                : "Could not admit the Child. Please try again.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <Section id="admission-child" title="Child">
        <ChildDetailsFields form={form} />
      </Section>
      <Section
        id="admission-admission"
        title="Admission"
        description="The age is checked against the Programme on the Academic Year's first day."
      >
        <AdmissionFields form={form} options={options} />
      </Section>
      <Section
        id="admission-parents"
        title="Parents"
        description="Enter a mobile number for at least one parent."
      >
        <div className="space-y-6">
          <ParentFields form={form} who="father" />
          <ParentFields form={form} who="mother" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              swapParents(form);
            }}
          >
            <ArrowLeftRight aria-hidden="true" />
            Swap father and mother
          </Button>
        </div>
      </Section>
      <Section id="admission-address" title="Address">
        <AddressFields form={form} />
      </Section>
      <Section id="admission-emergency" title="Emergency contact">
        <EmergencyFields form={form} />
      </Section>
      <Section
        id="admission-pickups"
        title="Authorised Pickups"
        description="People other than the Parents who may collect the Child."
      >
        <PickupFields form={form} />
      </Section>
      <Section id="admission-health" title="Health">
        <HealthFields form={form} />
      </Section>
      <Section id="admission-documents" title="Documents">
        <DocumentFields form={form} />
      </Section>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Admitting…" : "Admit Child"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
