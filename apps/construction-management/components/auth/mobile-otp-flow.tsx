"use client";

import {
  formatMobile,
  navigateInApp,
  normalizeMobile,
  useCompanyMobileOtp,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { authErrorMessage } from "@/lib/auth-errors";
import { continuePath } from "@/lib/safe-redirect";

import { CodeForm } from "./code-form";
import { FieldError } from "./field-error";
import { FormAlert } from "./form-alert";
import { MobileField } from "./mobile-field";

function schemaFor(mode: "sign-in" | "sign-up") {
  return z
    .object({
      mobile: z
        .string()
        .trim()
        .min(1, "Enter your mobile number")
        .refine((value) => normalizeMobile(value) != null, {
          message: "Enter a valid 10-digit mobile number",
        }),
      name: z.string().trim().max(100, "Name is too long"),
    })
    .superRefine((values, ctx) => {
      if (mode === "sign-up" && values.name.length === 0)
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: "Enter your name",
        });
    });
}

type SignUpValues = z.infer<ReturnType<typeof schemaFor>>;

/**
 * Mobile OTP (ADR CM-0002): the number, then the texted code. Sign-up also
 * asks for a name and saves it once the code is verified.
 */
export function MobileOtpFlow({
  mode,
  redirectUrl,
}: {
  mode: "sign-in" | "sign-up";
  redirectUrl: string | null;
}) {
  const otp = useCompanyMobileOtp();
  const [sent, setSent] = useState<{ mobile: string; name: string } | null>(
    null,
  );
  const schema = useMemo(() => schemaFor(mode), [mode]);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(schema),
    defaultValues: { mobile: "", name: "" },
  });

  const busy = form.formState.isSubmitting || otp.fetchStatus === "fetching";

  const sendCode = async (values: SignUpValues) => {
    const mobile = normalizeMobile(values.mobile);
    if (mobile == null) return;
    const result = await otp.sendCode(mobile);
    if (result.error == null) setSent({ mobile, name: values.name });
  };

  const verify = async (code: string) => {
    if (sent == null) return;
    const result = await otp.verifyCode({ mobile: sent.mobile, code });
    if (result.error != null) return;
    if (mode === "sign-up" && sent.name.trim().length > 0)
      await otp.setName(sent.name);
    navigateInApp(continuePath(redirectUrl));
  };

  if (sent != null) {
    return (
      <CodeForm
        sentTo={formatMobile(sent.mobile)}
        submitLabel={mode === "sign-up" ? "Create account" : "Sign in"}
        busy={busy}
        serverError={
          authErrorMessage(otp.error, "code") ??
          authErrorMessage(otp.error, "global")
        }
        onSubmit={verify}
        onResend={async () => {
          otp.clearError();
          const result = await otp.sendCode(sent.mobile);
          return result.error == null;
        }}
        onChangeDestination={() => {
          otp.clearError();
          setSent(null);
        }}
        changeLabel="Change number"
      />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(sendCode)(event);
      }}
      className="space-y-4"
      noValidate
    >
      {mode === "sign-up" && (
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Ramesh Patil"
            className="h-10"
            {...form.register("name")}
          />
          <FieldError message={form.formState.errors.name?.message} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="mobile">Mobile number</Label>
        <MobileField
          id="mobile"
          autoFocus={mode === "sign-in"}
          {...form.register("mobile")}
        />
        <FieldError
          message={
            form.formState.errors.mobile?.message ??
            authErrorMessage(otp.error, "mobile")
          }
        />
      </div>
      <FormAlert message={authErrorMessage(otp.error, "global")} />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Sending code…" : "Send code"}
      </Button>
    </form>
  );
}
