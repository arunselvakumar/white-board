"use client";

import type { ReactNode } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
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
import { MobileField } from "@/components/auth/mobile-field";
import { FormSection } from "@/components/forms/form-section";
import { WageFields } from "@/app/app/staff/_components/wage-fields";
import { STAFF_SALARY } from "@/app/app/staff/_components/wage-schema";

import { ProjectsField } from "@/app/app/staff/office-staff/_components/projects-field";
import {
  BLOOD_GROUP_OPTIONS,
  GENDER_OPTIONS,
  type SiteEngineerFormMode,
  type SiteEngineerFormValues,
} from "./site-engineer-form-schema";

const NOT_GIVEN = "__none";

type Choice = { value: string; label: string };

function ChoiceField({
  form,
  id,
  label,
  name,
  choices,
}: {
  form: UseFormReturn<SiteEngineerFormValues>;
  id: string;
  label: string;
  name: "gender" | "bloodGroup";
  choices: readonly Choice[];
}) {
  const error = form.formState.errors[name]?.message;
  const items = [{ value: NOT_GIVEN, label: "Not given" }, ...choices];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        name={name}
        control={form.control}
        render={({ field }) => (
          <Select
            items={items}
            value={field.value === "" ? NOT_GIVEN : field.value}
            onValueChange={(value) => {
              field.onChange(value == null || value === NOT_GIVEN ? "" : value);
            }}
          >
            <SelectTrigger
              id={id}
              size="lg"
              className="w-full min-w-0"
              aria-invalid={error != null}
            >
              <SelectValue placeholder="Not given" />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              aria-label={label}
            >
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

function TextField({
  form,
  id,
  label,
  name,
  placeholder,
  hint,
  required = false,
  className,
  type,
  inputMode,
}: {
  form: UseFormReturn<SiteEngineerFormValues>;
  id: string;
  label: string;
  name:
    | "name"
    | "email"
    | "address"
    | "emergencyContact"
    | "fatherName"
    | "dateOfBirth"
    | "employeeCode"
    | "joiningDate"
    | "qualification"
    | "experienceYears"
    | "specialisation"
    | "aadhaar"
    | "pan"
    | "accountHolder"
    | "accountNumber"
    | "ifsc"
    | "bankName";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  type?: "email" | "date";
  inputMode?: "numeric";
}) {
  const error = form.formState.errors[name]?.message;
  const hintId = `${id}-hint`;
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        className={
          name === "pan" || name === "ifsc"
            ? "h-10 uppercase placeholder:normal-case"
            : "h-10"
        }
        aria-required={required || undefined}
        aria-invalid={error != null}
        aria-describedby={hint == null ? undefined : hintId}
        {...form.register(name)}
      />
      {hint != null && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

/**
 * Its own component, like `TextField`, so the fields register in page
 * order and a failed Save focuses the first one in error.
 */
function MobileInput({
  form,
  required,
  locked,
  hint,
}: {
  form: UseFormReturn<SiteEngineerFormValues>;
  required: boolean;
  locked: boolean;
  hint: string;
}) {
  const error = form.formState.errors.mobile?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="engineer-mobile" required={required}>
        Mobile
      </Label>
      <MobileField
        id="engineer-mobile"
        readOnly={locked}
        aria-required={required || undefined}
        aria-invalid={error != null}
        aria-describedby="engineer-mobile-hint"
        {...form.register("mobile")}
      />
      <p id="engineer-mobile-hint" className="text-muted-foreground text-xs">
        {hint}
      </p>
      <FieldError message={error} />
    </div>
  );
}

/** What Edit holds only masked: blank keeps it. */
export type MaskedSecrets = {
  aadhaar: string | null;
  pan: string | null;
  accountLast4: string | null;
};

/**
 * The cards Add and Edit Site Engineer share (ADR CM-0037), in order:
 * Details, `signIn`, Personal, Employment, KYC, Salary, Bank and Projects.
 * `mode` decides which show: Salary and Bank need Financial on Labours, and
 * a Site Engineer who signs in as Office Staff has no email, address, KYC,
 * Salary or Projects here.
 */
export function SiteEngineerFields({
  form,
  mode,
  masked,
  mobileLocked = false,
  signIn,
}: {
  form: UseFormReturn<SiteEngineerFormValues>;
  mode: SiteEngineerFormMode;
  masked?: MaskedSecrets;
  /** They sign in by code with this mobile, so it cannot change here. */
  mobileLocked?: boolean;
  /** The Sign-in card, or Edit's sign-in status. */
  signIn?: ReactNode;
}) {
  const email = useWatch({ control: form.control, name: "email" });
  // A mobile or an email is needed: Mobile is marked while Email is blank.
  const mobileRequired = mode.membership && email.trim() === "";

  return (
    <div className="space-y-6">
      <FormSection title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            id="engineer-name"
            label="Name"
            name="name"
            placeholder="Karthik Raja"
            required
            className="space-y-1.5 sm:col-span-2"
          />
          <MobileInput
            form={form}
            required={mobileRequired}
            locked={mobileLocked}
            hint={
              mobileLocked
                ? "They sign in with this number; they change it in My Profile."
                : mode.membership
                  ? "They can sign in with it and a password."
                  : "Shown on attendance and reports."
            }
          />
          {mode.membership && (
            <TextField
              form={form}
              id="engineer-email"
              label="Email"
              name="email"
              type="email"
              placeholder="karthik@example.com"
              hint="Where the invitation goes. They can sign in with it too."
            />
          )}
          {mode.membership && (
            <TextField
              form={form}
              id="engineer-address"
              label="Address"
              name="address"
              placeholder="12 Anna Nagar, Madurai"
              className="space-y-1.5 sm:col-span-2"
            />
          )}
          {mode.membership && (
            <TextField
              form={form}
              id="engineer-emergency"
              label="Emergency contact"
              name="emergencyContact"
              placeholder="Name and phone"
              className="space-y-1.5 sm:col-span-2"
            />
          )}
        </div>
      </FormSection>

      {signIn}

      <FormSection title="Personal">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            id="engineer-father"
            label="Father's name"
            name="fatherName"
          />
          <TextField
            form={form}
            id="engineer-dob"
            label="Date of birth"
            name="dateOfBirth"
            type="date"
          />
          <ChoiceField
            form={form}
            id="engineer-gender"
            label="Gender"
            name="gender"
            choices={GENDER_OPTIONS}
          />
          <ChoiceField
            form={form}
            id="engineer-blood-group"
            label="Blood group"
            name="bloodGroup"
            choices={BLOOD_GROUP_OPTIONS.map((group) => ({
              value: group,
              label: group,
            }))}
          />
        </div>
      </FormSection>

      <FormSection title="Employment">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            id="engineer-code"
            label="Employee code"
            name="employeeCode"
            placeholder="SE-001"
          />
          <TextField
            form={form}
            id="engineer-joining-date"
            label="Joining date"
            name="joiningDate"
            type="date"
          />
          <TextField
            form={form}
            id="engineer-qualification"
            label="Qualification"
            name="qualification"
            placeholder="B.E. Civil"
          />
          <TextField
            form={form}
            id="engineer-experience"
            label="Experience (years)"
            name="experienceYears"
            inputMode="numeric"
            placeholder="0"
            hint="Whole years in the trade before joining."
          />
          <TextField
            form={form}
            id="engineer-specialisation"
            label="Specialisation"
            name="specialisation"
            placeholder="Civil, steel / PEB, MEP"
            className="space-y-1.5 sm:col-span-2"
          />
        </div>
      </FormSection>

      {mode.membership && (
        <FormSection title="KYC">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              id="engineer-aadhaar"
              label="Aadhaar"
              name="aadhaar"
              inputMode="numeric"
              placeholder={masked?.aadhaar ?? "1234 5678 9012"}
              hint={
                masked?.aadhaar == null
                  ? undefined
                  : `Leave blank to keep ${masked.aadhaar}.`
              }
            />
            <TextField
              form={form}
              id="engineer-pan"
              label="PAN"
              name="pan"
              placeholder={masked?.pan ?? "ABCPE1234F"}
              hint={
                masked?.pan == null
                  ? undefined
                  : `Leave blank to keep ${masked.pan}.`
              }
            />
          </div>
        </FormSection>
      )}

      {mode.membership && mode.financial && (
        <FormSection
          title="Salary"
          hint="Optional, like a Labour's wage. Only people with the Financial right on Labours see it."
        >
          <WageFields
            form={form}
            name="salary"
            idPrefix="engineer"
            options={STAFF_SALARY}
          />
        </FormSection>
      )}

      {mode.financial && (
        <FormSection
          title="Bank"
          hint="Where their salary is paid. Only people with the Financial right on Labours see it."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              id="engineer-account-holder"
              label="Account holder"
              name="accountHolder"
            />
            <TextField
              form={form}
              id="engineer-account-number"
              label="Account number"
              name="accountNumber"
              placeholder={
                masked?.accountLast4 == null
                  ? "50100123456789"
                  : `Ending ${masked.accountLast4}`
              }
              hint={
                masked?.accountLast4 == null
                  ? undefined
                  : `Leave blank to keep the account ending ${masked.accountLast4}.`
              }
            />
            <TextField
              form={form}
              id="engineer-ifsc"
              label="IFSC"
              name="ifsc"
              placeholder="HDFC0001234"
            />
            <TextField
              form={form}
              id="engineer-bank-name"
              label="Bank name"
              name="bankName"
              placeholder="HDFC Bank"
            />
          </div>
        </FormSection>
      )}

      {mode.membership && (
        <FormSection title="Projects">
          <Controller
            name="projectIds"
            control={form.control}
            render={({ field }) => (
              <ProjectsField value={field.value} onChange={field.onChange} />
            )}
          />
        </FormSection>
      )}
    </div>
  );
}
