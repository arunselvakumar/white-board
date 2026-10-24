"use client";

import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";
import { Separator } from "@repo/ui/components/separator";

import { FieldError } from "@/components/auth/field-error";
import { PasswordField } from "@/components/auth/password-field";

import {
  MOBILE_OR_EMAIL_MESSAGE,
  hasMobileOrEmail,
  teamMemberDetailsObject,
} from "./team-member-details-fields";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** A Temporary Password an admin sets: 8 to 128 characters, not trimmed. */
export const temporaryPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${String(PASSWORD_MIN)} characters`)
  .max(PASSWORD_MAX, `Use at most ${String(PASSWORD_MAX)} characters`);

/** Add User's details step: the details plus how they will sign in. */
export const addUserSchema = teamMemberDetailsObject
  .extend({
    invite: z.boolean(),
    // Blank means no password; otherwise a Temporary Password.
    password: z.union([z.literal(""), temporaryPassword]),
  })
  .refine(hasMobileOrEmail, {
    path: ["mobile"],
    message: MOBILE_OR_EMAIL_MESSAGE,
  });

export type AddUserValues = z.infer<typeof addUserSchema>;

/**
 * What they can sign in with, in words: "their mobile or email" when they
 * have both.
 */
export function signInWays(contact: {
  mobile: string | null;
  email: string | null;
}): string {
  const mobile = (contact.mobile ?? "").trim() !== "";
  const email = (contact.email ?? "").trim() !== "";
  if (mobile && !email) return "their mobile";
  if (email && !mobile) return "their email";
  return "their mobile or email";
}

/** Whether Invite them can be ticked: it needs an email and no password. */
export function inviteAvailable(values: {
  email: string;
  password: string;
}): boolean {
  return values.email.trim() !== "" && values.password === "";
}

/**
 * Add User's three outcomes (ADR CM-0029 §6): Invite them (needs an email;
 * ticked by default once one is typed), Set a password (they sign in at
 * once and change it the first time), or neither (a record until invited).
 */
export function SignInOptions({
  form,
  companyName,
}: {
  form: UseFormReturn<AddUserValues>;
  companyName: string;
}) {
  const [email, mobile, password, invite] = useWatch({
    control: form.control,
    name: ["email", "mobile", "password", "invite"],
  });
  const hasPassword = password !== "";
  const canInvite = inviteAvailable({ email, password });
  const inviting = canInvite && invite;
  const errors = form.formState.errors;

  return (
    <div className="bg-card space-y-4 rounded-lg border p-4">
      <Controller
        name="invite"
        control={form.control}
        render={({ field }) => (
          <label
            htmlFor="member-invite"
            className={
              canInvite
                ? "flex cursor-pointer items-start gap-3"
                : "flex items-start gap-3"
            }
          >
            <Checkbox
              id="member-invite"
              className="mt-0.5"
              checked={inviting}
              disabled={!canInvite}
              aria-describedby="member-invite-hint"
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
                id="member-invite-hint"
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
        <Label htmlFor="member-password">Set a password</Label>
        <PasswordField
          id="member-password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          aria-describedby="member-password-hint"
          aria-invalid={errors.password != null}
          {...form.register("password")}
        />
        <p id="member-password-hint" className="text-muted-foreground text-xs">
          {hasPassword
            ? `They can sign in now with ${signInWays({ mobile, email })} and this password. They must change it the first time they sign in.`
            : "Optional. For staff without an email: they sign in with their mobile straight away, no invitation needed."}
        </p>
        <FieldError message={errors.password?.message} />
      </div>
      {!inviting && !hasPassword ? (
        <p className="text-muted-foreground border-t pt-3 text-sm">
          They are a record until you invite them or set a password. You can do
          either later from Edit User.
        </p>
      ) : null}
    </div>
  );
}
