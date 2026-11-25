"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  type FieldErrors,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";

import {
  SelectField,
  TextareaField,
  TextField,
} from "@/app/(app)/preschool/_components/form-fields";
import {
  BLOOD_GROUPS,
  MAX_AUTHORISED_PICKUPS,
} from "@/src/preschool/domain/child";
import { isIsoDate, todayInIndia } from "@/src/preschool/domain/dates";
import { normaliseIndianMobile } from "@/src/preschool/domain/phone";
import type {
  AdmitPreschoolChildInput,
  PreschoolChildProfile,
} from "@/src/queries/preschool/children";

// The admission form and the Child page's section editors share these
// fields and one values shape, so a section edits exactly what admission
// wrote.

const MOBILE = "Enter a 10-digit Indian mobile number";
const text = (max: number) => z.string().trim().max(max);
const optionalMobile = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || normaliseIndianMobile(value) != null,
    MOBILE,
  );
const optionalEmail = text(320).refine(
  (value) => value === "" || z.email().safeParse(value).success,
  "Enter a valid email",
);
const optionalHttpsUrl = text(2048).refine(
  (value) => value === "" || /^https:\/\/\S+$/.test(value),
  "Enter an https:// link",
);

const parentSchema = z.object({
  name: text(200),
  phone: optionalMobile,
  email: optionalEmail,
  occupation: text(100),
});

export const childSectionSchema = z.object({
  child: z.object({
    firstName: z.string().trim().min(1, "Enter the first name").max(100),
    lastName: text(100),
    dateOfBirth: z
      .string()
      .refine(
        (value) => isIsoDate(value) && value <= todayInIndia(new Date()),
        "Enter the date of birth",
      ),
    gender: z.enum(["girl", "boy", "other"], { message: "Choose one" }),
    bloodGroup: z.string(),
    photoUrl: optionalHttpsUrl,
    motherTongue: text(60),
  }),
  address: z.object({
    line: text(300),
    city: text(100),
    state: text(100),
    pincode: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^[1-9]\d{5}$/.test(value),
        "A PIN code is 6 digits",
      ),
  }),
});

export const parentsSectionSchema = z
  .object({
    father: parentSchema,
    mother: parentSchema,
    emergency: z.object({
      name: text(200),
      phone: text(32),
      relationship: text(60),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.father.phone === "" && value.mother.phone === "")
      ctx.addIssue({
        code: "custom",
        path: ["father", "phone"],
        message: "Enter a phone number for the father or the mother",
      });
  });

export const pickupsSectionSchema = z.object({
  pickups: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Enter the name").max(200),
        relationship: z
          .string()
          .trim()
          .min(1, "Enter the relationship")
          .max(60),
        phone: z
          .string()
          .trim()
          .refine((value) => normaliseIndianMobile(value) != null, MOBILE),
        photoUrl: optionalHttpsUrl,
      }),
    )
    .max(MAX_AUTHORISED_PICKUPS),
});

export const healthSectionSchema = z.object({
  health: z.object({
    allergies: text(2000),
    medicalConditions: text(2000),
    doctorName: text(200),
    doctorPhone: text(32),
    immunisationUpToDate: z.boolean(),
  }),
  documents: z.object({
    hasBirthCertificate: z.boolean(),
    hasAadhaar: z.boolean(),
    hasImmunisationCard: z.boolean(),
    hasPhotos: z.boolean(),
    hasAddressProof: z.boolean(),
  }),
});

export const admissionSectionSchema = z.object({
  admission: z.object({
    programmeId: z.string().min(1, "Choose the Programme"),
    classroomId: z.string().min(1, "Choose the Classroom"),
    admittedOn: z.string().refine(isIsoDate, "Enter the admission date"),
  }),
});

export type ChildFormValues = z.infer<typeof childSectionSchema> &
  z.infer<typeof parentsSectionSchema> &
  z.infer<typeof pickupsSectionSchema> &
  z.infer<typeof healthSectionSchema> &
  z.infer<typeof admissionSectionSchema>;

const EMPTY_PARENT = { name: "", phone: "", email: "", occupation: "" };

export function emptyChildValues(today: string): ChildFormValues {
  return {
    child: {
      firstName: "",
      lastName: "",
      dateOfBirth: "",
      // Zod asks for a choice; the select starts empty.
      gender: "" as ChildFormValues["child"]["gender"],
      bloodGroup: "",
      photoUrl: "",
      motherTongue: "",
    },
    address: { line: "", city: "", state: "", pincode: "" },
    father: { ...EMPTY_PARENT },
    mother: { ...EMPTY_PARENT },
    emergency: { name: "", phone: "", relationship: "" },
    pickups: [],
    health: {
      allergies: "",
      medicalConditions: "",
      doctorName: "",
      doctorPhone: "",
      immunisationUpToDate: false,
    },
    documents: {
      hasBirthCertificate: false,
      hasAadhaar: false,
      hasImmunisationCard: false,
      hasPhotos: false,
      hasAddressProof: false,
    },
    admission: { programmeId: "", classroomId: "", admittedOn: today },
  };
}

export function profileToValues(
  profile: PreschoolChildProfile,
  today: string,
): ChildFormValues {
  const parent = (value: PreschoolChildProfile["father"]) => ({
    name: value.name ?? "",
    phone: value.phone ?? "",
    email: value.email ?? "",
    occupation: value.occupation ?? "",
  });
  return {
    ...emptyChildValues(today),
    child: {
      firstName: profile.firstName,
      lastName: profile.lastName ?? "",
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      bloodGroup: profile.bloodGroup ?? "",
      photoUrl: profile.photoUrl ?? "",
      motherTongue: profile.motherTongue ?? "",
    },
    address: {
      line: profile.address.line ?? "",
      city: profile.address.city ?? "",
      state: profile.address.state ?? "",
      pincode: profile.address.pincode ?? "",
    },
    father: parent(profile.father),
    mother: parent(profile.mother),
    emergency: {
      name: profile.emergencyContact.name ?? "",
      phone: profile.emergencyContact.phone ?? "",
      relationship: profile.emergencyContact.relationship ?? "",
    },
    pickups: profile.authorisedPickups.map((pickup) => ({
      name: pickup.name,
      relationship: pickup.relationship,
      phone: pickup.phone,
      photoUrl: pickup.photoUrl ?? "",
    })),
    health: {
      allergies: profile.health.allergies ?? "",
      medicalConditions: profile.health.medicalConditions ?? "",
      doctorName: profile.health.doctorName ?? "",
      doctorPhone: profile.health.doctorPhone ?? "",
      immunisationUpToDate: profile.health.immunisationUpToDate ?? false,
    },
    documents: { ...profile.documents },
  };
}

const orNull = (value: string) => (value === "" ? null : value);

export function childDetailsInput(values: ChildFormValues) {
  return {
    firstName: values.child.firstName,
    lastName: orNull(values.child.lastName),
    dateOfBirth: values.child.dateOfBirth,
    gender: values.child.gender,
    bloodGroup: orNull(values.child.bloodGroup),
    photoUrl: orNull(values.child.photoUrl),
    motherTongue: orNull(values.child.motherTongue),
    address: {
      line: orNull(values.address.line),
      city: orNull(values.address.city),
      state: orNull(values.address.state),
      pincode: orNull(values.address.pincode),
    },
  };
}

export function parentsInput(values: ChildFormValues) {
  const parent = (value: ChildFormValues["father"]) => ({
    name: orNull(value.name),
    phone: orNull(value.phone),
    email: orNull(value.email),
    occupation: orNull(value.occupation),
  });
  return {
    father: parent(values.father),
    mother: parent(values.mother),
    emergencyContact: {
      name: orNull(values.emergency.name),
      phone: orNull(values.emergency.phone),
      relationship: orNull(values.emergency.relationship),
    },
  };
}

export function pickupsInput(values: ChildFormValues) {
  return values.pickups.map((pickup) => ({
    name: pickup.name,
    relationship: pickup.relationship,
    phone: pickup.phone,
    photoUrl: orNull(pickup.photoUrl),
  }));
}

export function healthInput(values: ChildFormValues) {
  return {
    health: {
      allergies: orNull(values.health.allergies),
      medicalConditions: orNull(values.health.medicalConditions),
      doctorName: orNull(values.health.doctorName),
      doctorPhone: orNull(values.health.doctorPhone),
      immunisationUpToDate: values.health.immunisationUpToDate,
    },
    documents: values.documents,
  };
}

export function admitInput(
  values: ChildFormValues,
  centreId: string,
  enquiryId: string | undefined,
): AdmitPreschoolChildInput {
  return {
    centreId,
    child: childDetailsInput(values),
    ...parentsInput(values),
    authorisedPickups: pickupsInput(values),
    ...healthInput(values),
    admission: {
      programmeId: values.admission.programmeId,
      classroomId: values.admission.classroomId,
      admittedOn: values.admission.admittedOn,
      ...(enquiryId == null ? {} : { enquiryId }),
    },
  };
}

type Form = UseFormReturn<ChildFormValues>;

const GENDER_OPTIONS = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
  { value: "other", label: "Other" },
] as const;

const BLOOD_GROUP_OPTIONS = BLOOD_GROUPS.map((group) => ({
  value: group,
  label: group,
}));

export function ChildDetailsFields({ form }: { form: Form }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const child = errors.child;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="child-firstName"
          name="child.firstName"
          label="First name"
          required
          register={register}
          error={child?.firstName}
        />
        <TextField
          id="child-lastName"
          name="child.lastName"
          label="Last name"
          register={register}
          error={child?.lastName}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="child-dateOfBirth"
          name="child.dateOfBirth"
          label="Date of birth"
          type="date"
          required
          register={register}
          error={child?.dateOfBirth}
        />
        <SelectField
          id="child-gender"
          name="child.gender"
          label="Gender"
          required
          control={control}
          options={GENDER_OPTIONS}
          error={child?.gender}
        />
        <SelectField
          id="child-bloodGroup"
          name="child.bloodGroup"
          label="Blood group"
          control={control}
          options={BLOOD_GROUP_OPTIONS}
          error={child?.bloodGroup}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="child-motherTongue"
          name="child.motherTongue"
          label="Mother tongue"
          register={register}
          error={child?.motherTongue}
        />
        <TextField
          id="child-photoUrl"
          name="child.photoUrl"
          label="Photo URL"
          type="url"
          inputMode="url"
          placeholder="https://"
          register={register}
          error={child?.photoUrl}
        />
      </div>
    </div>
  );
}

export function AddressFields({ form }: { form: Form }) {
  const {
    register,
    formState: { errors },
  } = form;
  const address = errors.address;
  return (
    <div className="space-y-4">
      <TextField
        id="address-line"
        name="address.line"
        label="Address"
        register={register}
        error={address?.line}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="address-city"
          name="address.city"
          label="City"
          register={register}
          error={address?.city}
        />
        <TextField
          id="address-state"
          name="address.state"
          label="State"
          register={register}
          error={address?.state}
        />
        <TextField
          id="address-pincode"
          name="address.pincode"
          label="PIN code"
          inputMode="numeric"
          register={register}
          error={address?.pincode}
        />
      </div>
    </div>
  );
}

const PARENT_LABEL = { father: "Father", mother: "Mother" } as const;

export function ParentFields({
  form,
  who,
}: {
  form: Form;
  who: "father" | "mother";
}) {
  const {
    register,
    formState: { errors },
  } = form;
  const error = errors[who];
  const label = PARENT_LABEL[who];
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 font-medium">{label}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${who}-name`}
          name={`${who}.name`}
          label={`${label}'s name`}
          register={register}
          error={error?.name}
        />
        <TextField
          id={`${who}-phone`}
          name={`${who}.phone`}
          label={`${label}'s mobile`}
          type="tel"
          inputMode="tel"
          register={register}
          error={error?.phone}
        />
        <TextField
          id={`${who}-email`}
          name={`${who}.email`}
          label={`${label}'s email`}
          type="email"
          inputMode="email"
          hint="We invite this address to sign in as a Parent."
          register={register}
          error={error?.email}
        />
        <TextField
          id={`${who}-occupation`}
          name={`${who}.occupation`}
          label={`${label}'s occupation`}
          register={register}
          error={error?.occupation}
        />
      </div>
    </fieldset>
  );
}

export function EmergencyFields({ form }: { form: Form }) {
  const {
    register,
    formState: { errors },
  } = form;
  const error = errors.emergency;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TextField
        id="emergency-name"
        name="emergency.name"
        label="Name"
        register={register}
        error={error?.name}
      />
      <TextField
        id="emergency-relationship"
        name="emergency.relationship"
        label="Relationship"
        register={register}
        error={error?.relationship}
      />
      <TextField
        id="emergency-phone"
        name="emergency.phone"
        label="Phone"
        type="tel"
        inputMode="tel"
        register={register}
        error={error?.phone}
      />
    </div>
  );
}

export function PickupFields({ form }: { form: Form }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "pickups",
  });
  const rowErrors = errors.pickups as
    FieldErrors<ChildFormValues["pickups"][number]>[] | undefined;
  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Only the Parents may collect the Child until you add someone here.
        </p>
      ) : null}
      <ol className="space-y-4">
        {fields.map((field, index) => {
          const error = rowErrors?.[index];
          const n = String(index + 1);
          return (
            <li
              key={field.id}
              className="space-y-3 rounded-xl border p-3"
              aria-label={`Authorised Pickup ${n}`}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
                <TextField
                  id={`pickup-${n}-name`}
                  name={`pickups.${index}.name`}
                  label="Name"
                  required
                  register={register}
                  error={error?.name}
                />
                <TextField
                  id={`pickup-${n}-relationship`}
                  name={`pickups.${index}.relationship`}
                  label="Relationship"
                  required
                  register={register}
                  error={error?.relationship}
                />
                <TextField
                  id={`pickup-${n}-phone`}
                  name={`pickups.${index}.phone`}
                  label="Mobile"
                  required
                  type="tel"
                  inputMode="tel"
                  register={register}
                  error={error?.phone}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:mt-6"
                  aria-label={`Remove Authorised Pickup ${n}`}
                  onClick={() => {
                    remove(index);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <TextField
                id={`pickup-${n}-photoUrl`}
                name={`pickups.${index}.photoUrl`}
                label="Photo URL"
                type="url"
                inputMode="url"
                placeholder="https://"
                register={register}
                error={error?.photoUrl}
              />
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= MAX_AUTHORISED_PICKUPS}
        onClick={() => {
          append({ name: "", relationship: "", phone: "", photoUrl: "" });
        }}
      >
        <Plus aria-hidden="true" />
        Add Authorised Pickup
      </Button>
      {fields.length >= MAX_AUTHORISED_PICKUPS ? (
        <p className="text-muted-foreground text-xs">
          A Child can have at most {MAX_AUTHORISED_PICKUPS} Authorised Pickups.
        </p>
      ) : null}
    </div>
  );
}

function Tick({
  form,
  name,
  label,
}: {
  form: Form;
  name:
    | "health.immunisationUpToDate"
    | `documents.${keyof ChildFormValues["documents"]}`;
  label: string;
}) {
  const id = `tick-${name.replace(".", "-")}`;
  return (
    <Controller
      name={name}
      control={form.control}
      render={({ field }) => (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={field.value}
            onCheckedChange={(checked) => {
              field.onChange(checked);
            }}
          />
          <Label htmlFor={id}>{label}</Label>
        </div>
      )}
    />
  );
}

export function HealthFields({ form }: { form: Form }) {
  const {
    register,
    formState: { errors },
  } = form;
  const error = errors.health;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextareaField
          id="health-allergies"
          name="health.allergies"
          label="Allergies"
          rows={2}
          placeholder="Peanuts, dust"
          register={register}
          error={error?.allergies}
        />
        <TextareaField
          id="health-medicalConditions"
          name="health.medicalConditions"
          label="Medical conditions"
          rows={2}
          register={register}
          error={error?.medicalConditions}
        />
        <TextField
          id="health-doctorName"
          name="health.doctorName"
          label="Doctor"
          register={register}
          error={error?.doctorName}
        />
        <TextField
          id="health-doctorPhone"
          name="health.doctorPhone"
          label="Doctor's phone"
          type="tel"
          inputMode="tel"
          register={register}
          error={error?.doctorPhone}
        />
      </div>
      <Tick
        form={form}
        name="health.immunisationUpToDate"
        label="Immunisation up to date"
      />
    </div>
  );
}

export function DocumentFields({ form }: { form: Form }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-muted-foreground mb-2 text-sm">
        Tick what the family has shown. Nothing is uploaded or stored.
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Tick
          form={form}
          name="documents.hasBirthCertificate"
          label="Birth certificate"
        />
        <Tick form={form} name="documents.hasAadhaar" label="Aadhaar" />
        <Tick
          form={form}
          name="documents.hasImmunisationCard"
          label="Immunisation card"
        />
        <Tick form={form} name="documents.hasPhotos" label="Photos" />
        <Tick
          form={form}
          name="documents.hasAddressProof"
          label="Address proof"
        />
      </div>
    </fieldset>
  );
}

/** Server rules a field can show, by code; `details.field` names phones. */
export function fieldForError(code: string, details: unknown): string | null {
  if (code === "PARENT_PHONE_REQUIRED") return "father.phone";
  if (code === "DATE_OF_BIRTH_IN_FUTURE") return "child.dateOfBirth";
  if (code === "CLASSROOM_FULL" || code.startsWith("CLASSROOM_"))
    return "admission.classroomId";
  if (code === "PROGRAMME_ARCHIVED") return "admission.programmeId";
  if (code === "PHONE_INVALID") {
    const field =
      typeof details === "object" && details != null && "field" in details
        ? String(details.field)
        : "";
    const pickup = /^authorisedPickups\.(\d+)\.phone$/.exec(field);
    if (pickup != null) return `pickups.${pickup[1] ?? "0"}.phone`;
    if (field === "father.phone" || field === "mother.phone") return field;
  }
  return null;
}
