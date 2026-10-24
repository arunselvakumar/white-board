"use client";

import {
  IMPERSONATION_ADMIN_DOMAIN,
  isImpersonationAdminEmail,
  navigateInApp,
  useCompanyImpersonation,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { authErrorMessage } from "@/lib/auth-errors";

import { AuthHeading } from "./auth-heading";
import { CodeForm } from "./code-form";
import { FieldError } from "./field-error";
import { FormAlert } from "./form-alert";

const schema = z.object({
  customerEmail: z.email("Enter the customer's email address"),
  adminEmail: z
    .string()
    .refine(
      isImpersonationAdminEmail,
      `Use your @${IMPERSONATION_ADMIN_DOMAIN} email`,
    ),
});

type Values = z.infer<typeof schema>;

type Emails = { customerEmail: string; adminEmail: string };

/**
 * Sign in as a customer (ADR CM-0029): the customer's email and a
 * `@white-board.io` email, then the code sent to that mailbox. Signs this
 * browser in as the customer, with the impersonation banner on every page.
 */
export function SignInAsForm() {
  const impersonation = useCompanyImpersonation();
  const [sent, setSent] = useState<Emails | null>(null);
  const busy = impersonation.fetchStatus === "fetching";

  return (
    <>
      <AuthHeading
        title="Sign in as a customer"
        description={
          sent == null
            ? `For White Board staff. We'll email a code to your @${IMPERSONATION_ADMIN_DOMAIN} address.`
            : `Enter the code to sign in as ${sent.customerEmail}.`
        }
      />
      {sent == null ? (
        <EmailsStep
          impersonation={impersonation}
          onSent={(emails) => {
            setSent(emails);
          }}
        />
      ) : (
        <CodeForm
          sentTo={sent.adminEmail}
          submitLabel="Sign in as customer"
          busy={busy}
          serverError={
            authErrorMessage(impersonation.error, "code") ??
            authErrorMessage(impersonation.error, "global") ??
            authErrorMessage(impersonation.error, "email")
          }
          onSubmit={async (code) => {
            const result = await impersonation.verifyCode({ ...sent, code });
            if (result.error == null) navigateInApp("/continue");
          }}
          onResend={async () => {
            const result = await impersonation.sendCode(sent);
            return result.error == null;
          }}
          onChangeDestination={() => {
            impersonation.clearError();
            setSent(null);
          }}
          changeLabel="Change emails"
        />
      )}
      <p className="text-muted-foreground text-center text-sm font-light">
        Not White Board staff?{" "}
        <Link
          href="/sign-in"
          className="text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

function EmailsStep({
  impersonation,
  onSent,
}: {
  impersonation: ReturnType<typeof useCompanyImpersonation>;
  onSent: (emails: Emails) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { customerEmail: "", adminEmail: "" },
  });
  const busy =
    form.formState.isSubmitting || impersonation.fetchStatus === "fetching";

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const emails = {
            customerEmail: values.customerEmail.trim(),
            adminEmail: values.adminEmail.trim(),
          };
          const result = await impersonation.sendCode(emails);
          if (result.error == null) onSent(emails);
        })(event);
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="customer-email" required>
          Customer email
        </Label>
        <Input
          id="customer-email"
          type="email"
          autoComplete="off"
          placeholder="customer@example.com"
          className="h-10"
          aria-required
          {...form.register("customerEmail")}
        />
        <FieldError message={form.formState.errors.customerEmail?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="admin-email" required>
          Your White Board email
        </Label>
        <Input
          id="admin-email"
          type="email"
          autoComplete="email"
          placeholder={`you@${IMPERSONATION_ADMIN_DOMAIN}`}
          className="h-10"
          aria-required
          {...form.register("adminEmail")}
        />
        <FieldError
          message={
            form.formState.errors.adminEmail?.message ??
            authErrorMessage(impersonation.error, "email")
          }
        />
      </div>
      <FormAlert message={authErrorMessage(impersonation.error, "global")} />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Sending…" : "Send code"}
      </Button>
    </form>
  );
}
