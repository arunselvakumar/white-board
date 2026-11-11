"use client";

import { ExternalLink, KeyRound, Send, Share2 } from "lucide-react";
import Link from "next/link";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
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
import { signInWays } from "@/app/app/staff/office-staff/_components/sign-in-options";
import {
  inviteAvailable,
  type SiteEngineerFormValues,
} from "./site-engineer-form-schema";

const ROLE_LINE = "Signs in with the Site Engineer Role";

/**
 * How a new Site Engineer signs in (ADR CM-0037): always on the Site
 * Engineer Role, invited (needs an email) or with a Temporary Password, at
 * least one of the two.
 */
export function SignInChoice({
  form,
  companyName,
}: {
  form: UseFormReturn<SiteEngineerFormValues>;
  companyName: string;
}) {
  const [email, mobile, password, invite] = useWatch({
    control: form.control,
    name: ["email", "mobile", "password", "invite"],
  });
  const hasPassword = password !== "";
  const canInvite = inviteAvailable({ email, password });
  const inviting = canInvite && invite;
  const error = form.formState.errors.password?.message;

  return (
    <FormSection
      title="Sign-in"
      required
      hint="Invite them, or set a password for them. One of the two is needed."
    >
      <p className="text-sm font-medium">{ROLE_LINE}</p>
      <div className="bg-card space-y-4 rounded-lg border p-4">
        <Controller
          name="invite"
          control={form.control}
          // Ticking Invite them can clear the error on the password.
          rules={{ deps: ["password"] }}
          render={({ field }) => (
            <label
              htmlFor="engineer-invite"
              className={
                canInvite
                  ? "flex cursor-pointer items-start gap-3"
                  : "flex items-start gap-3"
              }
            >
              <Checkbox
                id="engineer-invite"
                className="mt-0.5"
                checked={inviting}
                disabled={!canInvite}
                aria-describedby="engineer-invite-hint"
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
              />
              <span className="space-y-0.5">
                <span
                  className={
                    canInvite
                      ? "block text-sm font-semibold"
                      : "text-muted-foreground block text-sm font-semibold"
                  }
                >
                  Invite them
                </span>
                <span
                  id="engineer-invite-hint"
                  className="text-muted-foreground block text-xs"
                >
                  {hasPassword
                    ? "Not needed: they sign in with the password you set."
                    : email.trim() === ""
                      ? "Type an email to invite them."
                      : `We email them a link to join ${companyName}. They show as Joining Pending until they accept.`}
                </span>
              </span>
            </label>
          )}
        />
        <Separator />
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="engineer-password">Set a password</Label>
          <PasswordField
            id="engineer-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-describedby="engineer-password-hint"
            aria-invalid={error != null}
            {...form.register("password")}
          />
          <p
            id="engineer-password-hint"
            className="text-muted-foreground text-xs"
          >
            {hasPassword
              ? `They can sign in now with ${signInWays({ mobile, email })} and this password. They must change it the first time they sign in.`
              : "For a Site Engineer without an email: they sign in with their mobile straight away, no invitation needed."}
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
 * status, and the invitation and password actions it allows.
 */
export function SignInStatus({
  signIn,
  contact,
  canShare,
  resending,
  onResend,
  onSetPassword,
  onShare,
}: {
  signIn: OwnSignIn;
  contact: { mobile: string | null; email: string | null };
  /** An invite link and an email to send it with. */
  canShare: boolean;
  resending: boolean;
  onResend: () => void;
  onSetPassword: () => void;
  onShare: () => void;
}) {
  const pending = signIn.status === "joining_pending";
  const canResend = pending || signIn.status === "rejected";
  const invited = when(signIn.invitedAt);
  const joined = when(signIn.joinedAt);
  let text: string;
  if (pending)
    text = `${invited == null ? "Invited" : `Invited on ${invited}`}. They show as Joining Pending until they accept.`;
  else if (signIn.status === "active")
    text = `They sign in with ${signInWays(contact)}${joined == null ? "" : `; joined on ${joined}`}.`;
  else if (signIn.status === "rejected")
    text = "They declined the invitation. You can invite them again.";
  else text = "They left the Company and can no longer sign in.";

  return (
    <FormSection title="Sign-in">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{ROLE_LINE}</p>
        <MemberStatusBadge status={signIn.status} />
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
      {canResend || signIn.canSetPassword ? (
        <div className="flex flex-wrap gap-2">
          {canResend && (
            <Button
              type="button"
              variant="outline"
              disabled={resending}
              onClick={onResend}
            >
              <Send aria-hidden="true" />
              {pending ? "Resend invite" : "Invite again"}
            </Button>
          )}
          {pending && canShare && (
            <Button type="button" variant="outline" onClick={onShare}>
              <Share2 aria-hidden="true" />
              Share invite link
            </Button>
          )}
          {signIn.canSetPassword && (
            <Button type="button" variant="outline" onClick={onSetPassword}>
              <KeyRound aria-hidden="true" />
              Set password
            </Button>
          )}
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
