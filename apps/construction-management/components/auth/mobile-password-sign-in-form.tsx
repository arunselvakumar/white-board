"use client";

import {
  navigateInApp,
  normalizeMobile,
  useCompanyMobilePasswordSignIn,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";

import { authErrorMessage } from "@/lib/auth-errors";
import { continuePath } from "@/lib/safe-redirect";

import { FieldError } from "./field-error";
import { FormAlert } from "./form-alert";
import { MobileField } from "./mobile-field";
import { PasswordField } from "./password-field";

const schema = z.object({
  mobile: z
    .string()
    .trim()
    .min(1, "Enter your mobile number")
    .refine((value) => normalizeMobile(value) != null, {
      message: "Enter a valid 10-digit mobile number",
    }),
  password: z.string().min(1, "Enter your password"),
});

type Values = z.infer<typeof schema>;

/**
 * Mobile and password (ADR CM-0029 §7): for site staff whose admin set
 * their password. Works whether SMS is on or off. A forgotten password is
 * reset by the Company admin, not by a code.
 */
export function MobilePasswordSignInForm({
  redirectUrl,
}: {
  redirectUrl: string | null;
}) {
  const signIn = useCompanyMobilePasswordSignIn();
  const [forgot, setForgot] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { mobile: "", password: "" },
  });
  const busy = form.formState.isSubmitting || signIn.fetchStatus === "fetching";

  const onSubmit = async (values: Values) => {
    const mobile = normalizeMobile(values.mobile);
    if (mobile == null) return;
    const { error } = await signIn.signIn({
      mobile,
      password: values.password,
    });
    if (error == null) navigateInApp(continuePath(redirectUrl));
  };

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="sign-in-mobile" required>
          Mobile number
        </Label>
        <MobileField
          id="sign-in-mobile"
          autoComplete="username"
          aria-required
          {...form.register("mobile")}
        />
        <FieldError
          message={
            form.formState.errors.mobile?.message ??
            authErrorMessage(signIn.error, "mobile")
          }
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="sign-in-mobile-password" required>
            Password
          </Label>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm font-normal"
            aria-expanded={forgot}
            onClick={() => {
              setForgot((open) => !open);
            }}
          >
            Forgot password?
          </Button>
        </div>
        <PasswordField
          id="sign-in-mobile-password"
          autoComplete="current-password"
          placeholder="Your password"
          aria-required
          {...form.register("password")}
        />
        <FieldError message={form.formState.errors.password?.message} />
        {forgot && (
          <p
            role="status"
            className="bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-sm"
          >
            Ask your Company admin to set a new password for you. You choose
            your own the next time you sign in.
          </p>
        )}
      </div>
      <FormAlert message={authErrorMessage(signIn.error, "global")} />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
