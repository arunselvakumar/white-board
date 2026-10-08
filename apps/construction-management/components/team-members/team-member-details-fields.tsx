"use client";

import { normalizeMobile } from "@repo/auth/construction/react";
import Link from "next/link";
import { Controller, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { MobileField } from "@/components/auth/mobile-field";
import type { DesignationOption } from "@/src/queries/team-members";
import { isValidAadhaar, isValidPan } from "@/src/shared-kernel/tax-ids";

/** Shared by Add Team Member (step 1) and Edit (CM-111). */
export const teamMemberDetailsSchema = z
  .object({
    memberType: z.enum(["normal", "hrms"]),
    name: z
      .string()
      .trim()
      .min(1, "Enter the name")
      .max(100, "Name is too long"),
    designationId: z.string().min(1, "Choose a Designation"),
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
  })
  .refine((values) => values.mobile !== "" || values.email !== "", {
    path: ["mobile"],
    message: "Enter a mobile number or an email, so they can join",
  });

export type TeamMemberDetailsValues = z.infer<typeof teamMemberDetailsSchema>;

export const EMPTY_DETAILS: TeamMemberDetailsValues = {
  memberType: "normal",
  name: "",
  designationId: "",
  mobile: "",
  email: "",
  address: "",
  aadhaar: "",
  pan: "",
  emergencyContact: "",
};

/** Server error codes → the field they belong to. */
export const DETAIL_ERROR_FIELDS: Record<
  string,
  keyof TeamMemberDetailsValues
> = {
  MEMBER_NAME_REQUIRED: "name",
  MEMBER_NAME_TOO_LONG: "name",
  DESIGNATION_REQUIRED: "designationId",
  DESIGNATION_NOT_FOUND: "designationId",
  MOBILE_INVALID: "mobile",
  MOBILE_OR_EMAIL_REQUIRED: "mobile",
  MEMBER_MOBILE_IN_USE: "mobile",
  MOBILE_LOCKED: "mobile",
  EMAIL_INVALID: "email",
  MEMBER_EMAIL_IN_USE: "email",
  AADHAAR_INVALID: "aadhaar",
  PAN_INVALID: "pan",
  ADDRESS_TOO_LONG: "address",
};

/** The request body for the details, from form values. */
export function detailsInput(
  values: TeamMemberDetailsValues,
  options: { keepIdentifiersWhenBlank: boolean },
) {
  const identifier = (value: string) =>
    value === ""
      ? options.keepIdentifiersWhenBlank
        ? undefined
        : null
      : value;
  return {
    memberType: values.memberType,
    name: values.name,
    designationId: values.designationId,
    mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
    email: values.email === "" ? null : values.email,
    address: values.address === "" ? null : values.address,
    aadhaar: identifier(values.aadhaar),
    pan: identifier(values.pan),
    emergencyContact:
      values.emergencyContact === "" ? null : values.emergencyContact,
  };
}

export function TeamMemberDetailsFields({
  form,
  designations,
  masked,
  mobileLocked = false,
}: {
  form: UseFormReturn<TeamMemberDetailsValues>;
  designations: DesignationOption[];
  /** Stored identifiers, shown as placeholders when editing. */
  masked?: { aadhaar: string | null; pan: string | null };
  mobileLocked?: boolean;
}) {
  const errors = form.formState.errors;
  const items = designations.map((item) => ({
    value: item.id,
    label: item.name,
  }));
  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Member type</legend>
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
            >
              <Label className="has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal">
                <RadioGroupItem
                  value="normal"
                  aria-label="Normal Team Member"
                />
                <span className="space-y-0.5">
                  <span className="block font-semibold">Normal</span>
                  <span className="text-muted-foreground block text-xs">
                    Works on Projects with a Permission Matrix.
                  </span>
                </span>
              </Label>
              <Label className="has-data-checked:border-primary flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal">
                <RadioGroupItem value="hrms" aria-label="HRMS Team Member" />
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
        <div className="space-y-1.5">
          <Label htmlFor="member-name">Name</Label>
          <Input
            id="member-name"
            placeholder="Suresh Kale"
            className="h-10"
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-designation">Designation</Label>
          <Controller
            name="designationId"
            control={form.control}
            render={({ field }) => (
              <Select
                items={items}
                value={field.value === "" ? null : field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="member-designation"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue placeholder="Choose a Designation" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  aria-label="Designations"
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
          {designations.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No Designations yet.{" "}
              <Link
                href="/app/masters/designations/new"
                className="text-primary underline underline-offset-4"
              >
                Add a Designation
              </Link>{" "}
              first.
            </p>
          )}
          <FieldError message={errors.designationId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-mobile">Mobile</Label>
          <MobileField
            id="member-mobile"
            readOnly={mobileLocked}
            {...form.register("mobile")}
          />
          {mobileLocked && (
            <p className="text-muted-foreground text-xs">
              They sign in with this number; they change it in My Profile.
            </p>
          )}
          <FieldError message={errors.mobile?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="member-email">Email</Label>
          <Input
            id="member-email"
            type="email"
            placeholder="suresh@example.in"
            className="h-10"
            {...form.register("email")}
          />
          <FieldError message={errors.email?.message} />
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
            placeholder="Flat 4, Baner Road, Pune"
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
    </div>
  );
}
