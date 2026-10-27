"use client";

import { normalizeMobile } from "@repo/auth/construction/react";
import type { ReactNode } from "react";
import {
  Controller,
  useWatch,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";

import { FieldError } from "@/components/auth/field-error";
import { MobileField } from "@/components/auth/mobile-field";
import { FormSection } from "@/components/forms/form-section";
import { WageFields } from "@/components/wages/wage-fields";
import {
  STAFF_SALARY,
  checkWage,
  wageDefaults,
  wageErrorFields,
  wagePayload,
  wageValuesSchema,
  type SavedWage,
} from "@/components/wages/wage-schema";
import type { TeamMember } from "@/src/queries/team-members";
import { isValidAadhaar, isValidPan } from "@/src/shared-kernel/tax-ids";

/** The detail fields Add Staff and Edit Staff share (CM-111). */
export const teamMemberDetailsObject = z.object({
  memberType: z.enum(["normal", "hrms"]),
  name: z.string().trim().min(1, "Enter the name").max(100, "Name is too long"),
  mobile: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeMobile(value) != null, {
      message: "Enter a valid 10-digit mobile number",
    }),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Enter a valid email address",
    }),
  address: z.string().trim().max(500, "Address is too long"),
  aadhaar: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidAadhaar(value), {
      message: "Enter a valid 12-digit Aadhaar number",
    }),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || isValidPan(value), {
      message: "Enter a valid 10-character PAN",
    }),
  emergencyContact: z.string().trim().max(120, "Too long"),
  /** Like a Labour's wage, the amount optional (ADR CM-0033 §3). */
  salary: wageValuesSchema,
});

const MOBILE_OR_EMAIL_MESSAGE = "Enter a mobile number or an email";

/**
 * The checks across fields: a mobile or an email, either one is enough
 * (ADR CM-0030 §6), and the salary. Without Financial (`canSeeSalary`
 * false) the amounts are neither shown nor checked.
 */
export function checkDetails(canSeeSalary: boolean) {
  return (
    values: z.infer<typeof teamMemberDetailsObject>,
    ctx: z.RefinementCtx,
  ) => {
    if (values.mobile === "" && values.email === "")
      ctx.addIssue({
        code: "custom",
        path: ["mobile"],
        message: MOBILE_OR_EMAIL_MESSAGE,
      });
    checkWage(values.salary, ctx, {
      path: ["salary"],
      ...STAFF_SALARY,
      showAmounts: canSeeSalary,
    });
  };
}

export function teamMemberDetailsSchema(canSeeSalary: boolean) {
  return teamMemberDetailsObject.superRefine(checkDetails(canSeeSalary));
}

export type TeamMemberDetailsValues = z.infer<typeof teamMemberDetailsObject>;

export const EMPTY_DETAILS: TeamMemberDetailsValues = {
  memberType: "normal",
  name: "",
  mobile: "",
  email: "",
  address: "",
  aadhaar: "",
  pan: "",
  emergencyContact: "",
  salary: wageDefaults(null, STAFF_SALARY),
};

/** A saved member's salary set-up, as the Salary card holds it. */
export function savedSalary(member: TeamMember): SavedWage {
  return {
    type: member.salaryType,
    perDay: member.salaryPerDay,
    perMonth: member.salaryPerMonth,
    overtimePerHour: member.overtimeWagePerHour,
    workingHoursPerDay: member.workingHoursPerDay,
    weeklyHolidays: member.weeklyHolidays,
  };
}

/** Server error codes → the field they belong to, the salary's included. */
export function detailErrorFields(
  values: TeamMemberDetailsValues,
): Record<string, FieldPath<TeamMemberDetailsValues>> {
  return {
    MEMBER_NAME_REQUIRED: "name",
    MEMBER_NAME_TOO_LONG: "name",
    MOBILE_INVALID: "mobile",
    MOBILE_OR_EMAIL_REQUIRED: "mobile",
    MEMBER_MOBILE_IN_USE: "mobile",
    MOBILE_LOCKED: "mobile",
    EMAIL_INVALID: "email",
    MEMBER_EMAIL_IN_USE: "email",
    AADHAAR_INVALID: "aadhaar",
    PAN_INVALID: "pan",
    ADDRESS_TOO_LONG: "address",
    EMERGENCY_CONTACT_TOO_LONG: "emergencyContact",
    ...wageErrorFields("salary", values.salary),
  };
}

/**
 * The request body for the details, from form values. Without
 * `canSeeSalary` the salary type and amounts are left out, so an edit
 * keeps them (ADR CM-0032 §3).
 */
export function detailsInput(
  values: TeamMemberDetailsValues,
  options: { keepIdentifiersWhenBlank: boolean; canSeeSalary: boolean },
) {
  const identifier = (value: string) =>
    value === ""
      ? options.keepIdentifiersWhenBlank
        ? undefined
        : null
      : value;
  const salary = wagePayload(values.salary);
  return {
    memberType: values.memberType,
    name: values.name,
    mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
    email: values.email === "" ? null : values.email,
    address: values.address === "" ? null : values.address,
    aadhaar: identifier(values.aadhaar),
    pan: identifier(values.pan),
    emergencyContact:
      values.emergencyContact === "" ? null : values.emergencyContact,
    ...(options.canSeeSalary
      ? {
          salaryType: salary.type,
          salaryPerDay: salary.perDay,
          salaryPerMonth: salary.perMonth,
          overtimeWagePerHour: salary.overtimePerHour,
        }
      : {}),
    workingHoursPerDay: salary.workingHoursPerDay,
    weeklyHolidays: salary.weeklyHolidays,
  };
}

/**
 * The cards Add Staff and Edit Staff share, in one order (ADR CM-0033 §1):
 * Details, Salary, then `children` (Add Staff's Projects and Role), then
 * Sign-in.
 */
export function TeamMemberDetailsFields<
  Values extends TeamMemberDetailsValues & FieldValues,
>({
  form: wide,
  masked,
  mobileLocked = false,
  canSeeSalary,
  signIn,
  children,
}: {
  form: UseFormReturn<Values>;
  /** Financial on Staff: without it the amounts are neither shown nor sent. */
  canSeeSalary: boolean;
  /** Stored identifiers, shown as placeholders when editing. */
  masked?: { aadhaar: string | null; pan: string | null };
  mobileLocked?: boolean;
  /** Add Staff's Invite them and Set a password, under mobile and email. */
  signIn?: ReactNode;
  /** Cards between Salary and Sign-in: Add Staff's Projects and Role. */
  children?: ReactNode;
}) {
  // Only the detail fields are read here; Add Staff's form has more.
  const form = wide as unknown as UseFormReturn<TeamMemberDetailsValues>;
  const errors = form.formState.errors;
  // A mobile or an email is needed: Mobile is marked while Email is blank.
  const email = useWatch({ control: form.control, name: "email" });
  const mobileRequired = email.trim() === "";
  return (
    <div className="space-y-6">
      <FormSection title="Details">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Member type
            <RequiredIndicator />
          </legend>
          <Controller
            name="memberType"
            control={form.control}
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                }}
                className="grid gap-3 sm:grid-cols-2"
                aria-required
              >
                <Label className="bg-card has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal">
                  <RadioGroupItem
                    value="normal"
                    aria-label="Normal staff member"
                  />
                  <span className="space-y-0.5">
                    <span className="block font-semibold">Normal</span>
                    <span className="text-muted-foreground block text-xs">
                      Works on Projects. Their Role decides what they may do.
                    </span>
                  </span>
                </Label>
                <Label className="bg-card has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal">
                  <RadioGroupItem value="hrms" aria-label="HRMS staff member" />
                  <span className="space-y-0.5">
                    <span className="block font-semibold">HRMS only</span>
                    <span className="text-muted-foreground block text-xs">
                      Attendance, leave and salary. No Projects.
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            )}
          />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="member-name" required>
              Name
            </Label>
            <Input
              id="member-name"
              placeholder="Prabhu Saravanan"
              className="h-10"
              aria-required
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-aadhaar">Aadhaar</Label>
            <Input
              id="member-aadhaar"
              inputMode="numeric"
              placeholder={masked?.aadhaar ?? "1234 5678 9012"}
              className="h-10"
              {...form.register("aadhaar")}
            />
            {masked?.aadhaar != null && (
              <p className="text-muted-foreground text-xs">
                Leave blank to keep {masked.aadhaar}.
              </p>
            )}
            <FieldError message={errors.aadhaar?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-pan">PAN</Label>
            <Input
              id="member-pan"
              autoCapitalize="characters"
              placeholder={masked?.pan ?? "ABCPE1234F"}
              className="h-10 uppercase placeholder:normal-case"
              {...form.register("pan")}
            />
            {masked?.pan != null && (
              <p className="text-muted-foreground text-xs">
                Leave blank to keep {masked.pan}.
              </p>
            )}
            <FieldError message={errors.pan?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="member-address">Address</Label>
            <Input
              id="member-address"
              placeholder="Flat 4, Anna Nagar, Chennai"
              className="h-10"
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="member-emergency">Emergency contact</Label>
            <Input
              id="member-emergency"
              placeholder="Name and phone"
              className="h-10"
              {...form.register("emergencyContact")}
            />
            <FieldError message={errors.emergencyContact?.message} />
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Salary"
        hint={
          canSeeSalary
            ? "Optional, like a Labour's wage. Only people with the Financial right on Staff see the amounts."
            : "You cannot see salaries. Ask the Owner for the Financial right on Staff."
        }
      >
        <WageFields
          form={form}
          name="salary"
          idPrefix="member"
          options={STAFF_SALARY}
          showAmounts={canSeeSalary}
          showType={canSeeSalary}
        />
      </FormSection>

      {children}

      <FormSection
        title="Sign-in"
        required
        hint="A mobile number or an email. Either one is enough."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="member-mobile" required={mobileRequired}>
                Mobile
              </Label>
              <MobileField
                id="member-mobile"
                readOnly={mobileLocked}
                aria-required={mobileRequired}
                aria-describedby="member-mobile-hint"
                {...form.register("mobile")}
              />
              <p
                id="member-mobile-hint"
                className="text-muted-foreground text-xs"
              >
                {mobileLocked
                  ? "They sign in with this number; they change it in My Profile."
                  : "They can sign in with it and a password."}
              </p>
              <FieldError message={errors.mobile?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="example@example.com"
                className="h-10"
                aria-describedby="member-email-hint"
                {...form.register("email")}
              />
              <p
                id="member-email-hint"
                className="text-muted-foreground text-xs"
              >
                Where the invitation goes. They can sign in with it too.
              </p>
              <FieldError message={errors.email?.message} />
            </div>
          </div>
          {signIn}
        </div>
      </FormSection>
    </div>
  );
}
