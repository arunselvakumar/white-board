"use client";

import { KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";
import { Switch } from "@repo/ui/components/switch";

import { FieldError } from "@/components/auth/field-error";
import { PasswordField } from "@/components/auth/password-field";
import { FormSection } from "@/components/forms/form-section";
import type { EmployeeResponse } from "@/src/queries/employees";

import { MemberStatusBadge } from "@/app/app/staff/office-staff/_components/member-status-badge";
import type { EmployeeFormValues } from "./employee-form-schema";

export type EmployeeSignIn = NonNullable<EmployeeResponse["signIn"]>;

/** The mobile as typed, for a hint: "98765 43210", or null when blank. */
function typedMobile(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, "").slice(-10);
  return digits.length === 10
    ? `${digits.slice(0, 5)} ${digits.slice(5)}`
    : null;
}

function when(iso: string | null): string | null {
  if (iso == null) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** What their sign-in is today, in a sentence. */
function statusText(signIn: EmployeeSignIn, mobile: string | null): string {
  const joined = when(signIn.joinedAt);
  if (signIn.status === "active")
    return `They sign in with their mobile number and password${joined == null ? "" : `; joined on ${joined}`}.`;
  if (signIn.status === "left")
    return "They left the Company and can no longer sign in.";
  if (signIn.status === "rejected")
    return "They declined the Join Request, so they cannot sign in here.";
  if (mobile == null)
    return "They cannot sign in yet. Enter their mobile number and save, then set a password.";
  return "They cannot sign in yet. Set a password so they can sign in with their mobile number.";
}

/**
 * The Sign-in card on Add and Edit Employee (ADR CM-0055 §4). "Can sign
 * in" is off by default. Turned on for someone without a sign-in, they
 * sign in with their mobile number and the password typed here; nobody is
 * invited (ADR CM-0053). For someone who signs in already, Edit shows the
 * status and Set password, and turning it off removes the sign-in on Save.
 */
export function EmployeeSignInCard({
  form,
  roleName,
  signIn,
  mobile,
  onSetPassword,
  notice,
}: {
  form: UseFormReturn<EmployeeFormValues>;
  /** The Role chosen on the form, which their sign-in uses. */
  roleName: string | null;
  /** Their sign-in on Edit; null on Add and for one without. */
  signIn: EmployeeSignIn | null;
  /** The saved mobile (E.164), for the status line. */
  mobile: string | null;
  onSetPassword?: () => void;
  /** What Set password did, under the status. */
  notice?: ReactNode;
}) {
  const [canSignIn, typed, password] = useWatch({
    control: form.control,
    name: ["canSignIn", "mobile", "password"],
  });
  const number = typedMobile(typed);
  const error = form.formState.errors.password?.message;
  const roleLine =
    roleName == null
      ? "Signs in with the Role chosen above"
      : `Signs in with the ${roleName} Role`;

  return (
    <FormSection
      title="Sign-in"
      hint="Optional. What they may do comes from their Role's Permission Matrix."
    >
      <Controller
        name="canSignIn"
        control={form.control}
        render={({ field }) => (
          <div className="bg-card flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="employee-can-sign-in">Can sign in</Label>
              <p
                id="employee-can-sign-in-hint"
                className="text-muted-foreground text-xs"
              >
                {field.value
                  ? signIn != null
                    ? roleLine
                    : `${roleLine}, with their mobile number and a password. No invitation is sent.`
                  : signIn != null
                    ? "Saving removes their sign-in. Their records stay."
                    : "Off: they are on attendance and wages but do not sign in."}
              </p>
            </div>
            <Switch
              id="employee-can-sign-in"
              aria-describedby="employee-can-sign-in-hint"
              checked={field.value}
              onCheckedChange={(on) => {
                field.onChange(on);
                if (!on) form.clearErrors(["password", "mobile"]);
              }}
            />
          </div>
        )}
      />

      {canSignIn && signIn != null && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Status</p>
            <MemberStatusBadge status={signIn.status} />
          </div>
          <p className="text-muted-foreground text-sm">
            {statusText(signIn, mobile)}
          </p>
          {signIn.canSetPassword && onSetPassword != null ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onSetPassword}>
                <KeyRound aria-hidden="true" />
                Set password
              </Button>
            </div>
          ) : null}
          {notice}
        </div>
      )}

      {canSignIn && signIn == null && (
        <div className="bg-card space-y-4 rounded-lg border p-4">
          <label
            htmlFor="employee-mobile-login"
            className="flex items-start gap-3"
          >
            <Checkbox
              id="employee-mobile-login"
              className="mt-0.5"
              checked
              readOnly
              aria-describedby="employee-mobile-login-hint"
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-semibold">
                Use mobile number as login
              </span>
              <span
                id="employee-mobile-login-hint"
                className="text-muted-foreground block text-xs"
              >
                {number == null
                  ? "Employees always sign in with their mobile number. Enter it under Basic."
                  : `They sign in with ${number}.`}
              </span>
            </span>
          </label>
          <Separator />
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="employee-password" required>
              Password
            </Label>
            <PasswordField
              id="employee-password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-required="true"
              aria-describedby="employee-password-hint"
              aria-invalid={error != null}
              {...form.register("password")}
            />
            <p
              id="employee-password-hint"
              className="text-muted-foreground text-xs"
            >
              {password === ""
                ? "Give it to them yourself. They must change it the first time they sign in."
                : "They can sign in as soon as you save, and must change it the first time they sign in."}
            </p>
            <FieldError message={error} />
          </div>
        </div>
      )}
    </FormSection>
  );
}

/** How an Employee signs in, in one badge: their status, or No sign-in. */
export function SignInBadge({ signIn }: { signIn: EmployeeSignIn | null }) {
  if (signIn == null) return null;
  return <MemberStatusBadge status={signIn.status} />;
}
