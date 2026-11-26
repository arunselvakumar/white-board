"use client";

import { ExternalLink, KeyRound } from "lucide-react";
import Link from "next/link";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";

import { FieldError } from "@/components/auth/field-error";
import { PasswordField } from "@/components/auth/password-field";
import { FormSection } from "@/components/forms/form-section";
import { staffPath } from "@/lib/staff-nav";
import type { SiteEngineerSignIn } from "@/src/queries/site-engineers";

import { MemberStatusBadge } from "@/app/app/staff/office-staff/_components/member-status-badge";
import type { SiteEngineerFormValues } from "./site-engineer-form-schema";

const ROLE_LINE = "Signs in with the Site Engineer Role";

/** The mobile as typed, for a hint: "98765 43210", or null when blank. */
function typedMobile(mobile: string): string | null {
  const digits = mobile.replace(/\D/g, "").slice(-10);
  return digits.length === 10
    ? `${digits.slice(0, 5)} ${digits.slice(5)}`
    : null;
}

/**
 * How a new Site Engineer signs in (ADR CM-0053): with their mobile number
 * and the password set here, on the Site Engineer Role. Nobody is invited,
 * so "Use mobile number as login" is always ticked and the password is
 * required.
 */
export function SignInChoice({
  form,
}: {
  form: UseFormReturn<SiteEngineerFormValues>;
}) {
  const [mobile, password] = useWatch({
    control: form.control,
    name: ["mobile", "password"],
  });
  const number = typedMobile(mobile);
  const error = form.formState.errors.password?.message;

  return (
    <FormSection
      title="Sign-in"
      required
      hint="They sign in with their mobile number and the password you set here. No invitation is sent."
    >
      <p className="text-sm font-medium">{ROLE_LINE}</p>
      <div className="bg-card space-y-4 rounded-lg border p-4">
        <label
          htmlFor="engineer-mobile-login"
          className="flex items-start gap-3"
        >
          <Checkbox
            id="engineer-mobile-login"
            className="mt-0.5"
            checked
            readOnly
            aria-describedby="engineer-mobile-login-hint"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-semibold">
              Use mobile number as login
            </span>
            <span
              id="engineer-mobile-login-hint"
              className="text-muted-foreground block text-xs"
            >
              {number == null
                ? "Site Engineers always sign in with their mobile number. Enter it under Details."
                : `They sign in with ${number}.`}
            </span>
          </span>
        </label>
        <Separator />
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="engineer-password" required>
            Password
          </Label>
          <PasswordField
            id="engineer-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-required="true"
            aria-describedby="engineer-password-hint"
            aria-invalid={error != null}
            {...form.register("password")}
          />
          <p
            id="engineer-password-hint"
            className="text-muted-foreground text-xs"
          >
            {password === ""
              ? "Give it to them yourself. They must change it the first time they sign in."
              : "They can sign in as soon as you save, and must change it the first time they sign in."}
          </p>
          <FieldError message={error} />
        </div>
      </div>
    </FormSection>
  );
}

function when(iso: string | null): string | null {
  if (iso == null) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

type OwnSignIn = Extract<SiteEngineerSignIn, { kind: "site_engineer" }>;

/**
 * Edit's sign-in card for a Site Engineer with their own sign-in: the
 * status, and Set password (ADR CM-0053). There are no invitations; one
 * invited before still shows as Joining Pending until a password is set or
 * they accept.
 */
export function SignInStatus({
  signIn,
  mobile,
  onSetPassword,
}: {
  signIn: OwnSignIn;
  /** E.164, or null for an older one without it. */
  mobile: string | null;
  onSetPassword: () => void;
}) {
  const joined = when(signIn.joinedAt);
  let text: string;
  if (signIn.status === "active")
    text = `They sign in with their mobile number and password${joined == null ? "" : `; joined on ${joined}`}.`;
  else if (signIn.status === "left")
    text = "They left the Company and can no longer sign in.";
  else if (mobile == null)
    text =
      "They cannot sign in yet. Enter their mobile number and save, then set a password.";
  else
    text =
      "They cannot sign in yet. Set a password so they can sign in with their mobile number.";

  return (
    <FormSection title="Sign-in">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{ROLE_LINE}</p>
        <MemberStatusBadge status={signIn.status} />
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
      {signIn.canSetPassword ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onSetPassword}>
            <KeyRound aria-hidden="true" />
            Set password
          </Button>
        </div>
      ) : null}
    </FormSection>
  );
}

/** A Site Engineer linked to an Office Staff member signs in as them. */
export function OfficeStaffSignIn({
  signIn,
}: {
  signIn: Extract<SiteEngineerSignIn, { kind: "office_staff" }>;
}) {
  return (
    <FormSection title="Sign-in">
      <p className="text-muted-foreground text-sm">
        They sign in as the Office Staff member {signIn.name}. Their email,
        address, KYC, salary, Projects and Role are kept there.
      </p>
      <Link
        href={staffPath(signIn.memberId)}
        className={buttonVariants({ variant: "outline" })}
      >
        <ExternalLink aria-hidden="true" />
        Open {signIn.name} on Office Staff
      </Link>
    </FormSection>
  );
}
