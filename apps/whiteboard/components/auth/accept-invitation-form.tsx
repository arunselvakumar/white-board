"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { clerkFieldMessage, clerkGlobalMessage } from "@/lib/clerk-errors";
import { navigateAfterAuth } from "@/lib/navigate-after-auth";
import { workspaceEntryPath } from "@/lib/workspace-entry";

const signupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

export function AcceptInvitationForm({
  ticket,
  status,
}: {
  ticket: string | null;
  status: string | null;
}) {
  const router = useRouter();
  const { signIn, errors: signInErrors } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus } = useSignUp();
  const attemptedTicket = useRef<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const form = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  useEffect(() => {
    if (
      ticket == null ||
      status !== "sign_in" ||
      attemptedTicket.current === ticket
    )
      return;
    attemptedTicket.current = ticket;
    void (async () => {
      const { error } = await signIn.ticket({ ticket });
      if (error != null) {
        setSignInError(
          "Could not accept this invitation. Please try the link again.",
        );
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: navigateAfterAuth(router, workspaceEntryPath("/")),
        });
      } else {
        setSignInError(
          "Could not finish signing in. Please try the link again.",
        );
      }
    })();
  }, [router, signIn, status, ticket]);

  const onSubmit = async (values: SignupValues) => {
    if (ticket == null) return;
    const { error } = await signUp.create({
      strategy: "ticket",
      ticket,
      username: values.username,
      password: values.password,
    });
    if (error != null) return;
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: navigateAfterAuth(router, workspaceEntryPath("/")),
      });
    }
  };

  if (ticket == null || (status !== "sign_in" && status !== "sign_up")) {
    return (
      <>
        <AuthHeading
          title="Invitation unavailable"
          description="This invitation link is missing or has expired."
        />
        <Link href="/login">Go to Sign-in</Link>
      </>
    );
  }

  if (status === "sign_in") {
    return (
      <>
        <AuthHeading
          title="Joining your Workspace"
          description="Signing you in with your invitation."
        />
        {signInError == null ? (
          <p role="status">Accepting invitation…</p>
        ) : (
          <FormAlert message={signInError} />
        )}
        <FormAlert message={clerkGlobalMessage(signInErrors.global)} />
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Join your Workspace"
        description="Create your sign-in to accept the invitation."
      />
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="invite-username">Username</Label>
          <Input
            id="invite-username"
            autoComplete="username"
            className="h-10"
            {...form.register("username")}
          />
          <FieldError
            message={
              form.formState.errors.username?.message ??
              clerkFieldMessage(signUpErrors.fields.username)
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-password">Password</Label>
          <PasswordField
            id="invite-password"
            autoComplete="new-password"
            {...form.register("password")}
          />
          <FieldError
            message={
              form.formState.errors.password?.message ??
              clerkFieldMessage(signUpErrors.fields.password)
            }
          />
        </div>
        <div id="clerk-captcha" />
        <FormAlert message={clerkGlobalMessage(signUpErrors.global)} />
        <Button
          type="submit"
          className="h-10 w-full"
          disabled={form.formState.isSubmitting || fetchStatus === "fetching"}
        >
          {form.formState.isSubmitting ? "Joining…" : "Join Workspace"}
        </Button>
      </form>
    </>
  );
}
