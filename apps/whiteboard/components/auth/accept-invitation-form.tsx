"use client";

import {
  navigateInApp,
  useAcceptInvitation,
  useSignIn,
  useSignOut,
  useSignUp,
} from "@repo/auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthHeading } from "@/components/auth/auth-heading";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleButton } from "@/components/auth/google-button";
import { PasswordField } from "@/components/auth/password-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { workspaceEntryPath } from "@/lib/workspace-entry";

export type InvitationSummary = {
  id: string;
  email: string;
  role: "teacher" | "student" | "parent";
  workspaceName: string;
  hasAccount: boolean;
};

const ROLE_NOUN: Record<InvitationSummary["role"], string> = {
  teacher: "a Teacher",
  student: "a Student",
  parent: "a Parent",
};

const signupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_.]+$/,
      "Use letters, numbers, underscores, and dots only",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

const signinSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

type SigninValues = z.infer<typeof signinSchema>;

function invitationPath(id: string): string {
  return `/accept-invitation?id=${encodeURIComponent(id)}`;
}

/**
 * Joining a Workspace from an invitation link (ADR-0034). The invited email
 * must be the signed-in User's verified email, so a new User verifies the
 * emailed code before the invitation is accepted.
 */
export function AcceptInvitationForm({
  invitation,
  signedInEmail,
}: {
  invitation: InvitationSummary | null;
  signedInEmail: string | null;
}) {
  if (invitation == null) {
    return (
      <>
        <AuthHeading
          title="Invitation unavailable"
          description="This invitation link is invalid, has expired, or was already used."
        />
        <p className="text-muted-foreground text-center text-sm font-light">
          <Link href="/login" className="text-primary hover:underline">
            Go to Sign-in
          </Link>
        </p>
      </>
    );
  }

  if (signedInEmail == null) {
    return <SignedOutInvitation invitation={invitation} />;
  }

  if (signedInEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <WrongAccount invitation={invitation} signedInEmail={signedInEmail} />
    );
  }

  return <AcceptAsSignedIn invitation={invitation} />;
}

/** The invited User is signed in: accept straight away. */
function AcceptAsSignedIn({ invitation }: { invitation: InvitationSummary }) {
  const { accept, error } = useAcceptInvitation();
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (attempted.current === invitation.id) return;
    attempted.current = invitation.id;
    void accept(invitation.id).then((result) => {
      if (result.error == null) navigateInApp(workspaceEntryPath("/"));
    });
  }, [accept, invitation.id]);

  return (
    <>
      <AuthHeading
        title="Joining your Workspace"
        description={`Joining ${invitation.workspaceName} as ${ROLE_NOUN[invitation.role]}.`}
      />
      {error == null ? (
        <p role="status" className="text-muted-foreground text-sm">
          Accepting invitation…
        </p>
      ) : (
        <FormAlert message={authErrorMessage(error, "global")} />
      )}
    </>
  );
}

function WrongAccount({
  invitation,
  signedInEmail,
}: {
  invitation: InvitationSummary;
  signedInEmail: string;
}) {
  const { signOut, fetchStatus } = useSignOut();
  return (
    <>
      <AuthHeading
        title="Use a different account"
        description={`This invitation to ${invitation.workspaceName} is for ${invitation.email}. You're signed in as ${signedInEmail}.`}
      />
      <Button
        type="button"
        className="h-10 w-full"
        disabled={fetchStatus === "fetching"}
        onClick={() => {
          void signOut(invitationPath(invitation.id));
        }}
      >
        Sign out and continue
      </Button>
    </>
  );
}

/** Signed out: sign in (existing account) or create a sign-in, then accept. */
function SignedOutInvitation({
  invitation,
}: {
  invitation: InvitationSummary;
}) {
  const { accept, error: acceptError } = useAcceptInvitation();
  const [verifying, setVerifying] = useState(false);

  const acceptAndEnter = async () => {
    const result = await accept(invitation.id);
    if (result.error == null) navigateInApp(workspaceEntryPath("/"));
  };

  const heading = (
    <AuthHeading
      title={`Join ${invitation.workspaceName}`}
      description={
        verifying
          ? "Enter the 6-digit code we emailed you"
          : invitation.hasAccount
            ? `Sign in to join as ${ROLE_NOUN[invitation.role]}.`
            : `Create your sign-in to join as ${ROLE_NOUN[invitation.role]}.`
      }
    />
  );

  if (verifying) {
    return (
      <>
        {heading}
        <EmailCodeForm
          email={invitation.email}
          submitLabel="Verify and join"
          onVerified={acceptAndEnter}
        />
        <FormAlert message={authErrorMessage(acceptError, "global")} />
      </>
    );
  }

  return (
    <>
      {heading}
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          value={invitation.email}
          readOnly
          aria-readonly
          className="bg-muted/50 h-10"
        />
      </div>
      {invitation.hasAccount ? (
        <InvitationSignIn
          invitation={invitation}
          onSignedIn={acceptAndEnter}
          onNeedsVerification={() => {
            setVerifying(true);
          }}
        />
      ) : (
        <InvitationSignUp
          invitation={invitation}
          onCreated={() => {
            setVerifying(true);
          }}
        />
      )}
      <FormAlert message={authErrorMessage(acceptError, "global")} />
    </>
  );
}

function InvitationSignIn({
  invitation,
  onSignedIn,
  onNeedsVerification,
}: {
  invitation: InvitationSummary;
  onSignedIn: () => Promise<void>;
  onNeedsVerification: () => void;
}) {
  const signIn = useSignIn();
  const verification = useSignUp();
  const form = useForm<SigninValues>({ resolver: zodResolver(signinSchema) });
  const busy =
    form.formState.isSubmitting ||
    signIn.fetchStatus === "fetching" ||
    verification.fetchStatus === "fetching";

  const onSubmit = async (values: SigninValues) => {
    const { error } = await signIn.password({
      identifier: invitation.email,
      password: values.password,
    });
    if (error == null) {
      await onSignedIn();
      return;
    }
    if (error.code !== "EMAIL_NOT_VERIFIED") return;
    signIn.clearError();
    const sent = await verification.sendEmailCode(invitation.email);
    if (sent.error == null) onNeedsVerification();
  };

  return (
    <>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="invite-password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-primary text-xs hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordField
            id="invite-password"
            autoComplete="current-password"
            autoFocus
            {...form.register("password")}
          />
          <FieldError
            message={
              form.formState.errors.password?.message ??
              authErrorMessage(signIn.error, "password")
            }
          />
        </div>
        <FormAlert
          message={
            authErrorMessage(signIn.error, "global") ??
            authErrorMessage(verification.error, "global")
          }
        />
        <Button type="submit" className="h-10 w-full" disabled={busy}>
          {form.formState.isSubmitting ? "Joining…" : "Sign in and join"}
        </Button>
      </form>
      <AuthDivider />
      <GoogleButton
        label="Continue with Google"
        disabled={busy}
        onClick={() => {
          void signIn.google(invitationPath(invitation.id));
        }}
      />
    </>
  );
}

function InvitationSignUp({
  invitation,
  onCreated,
}: {
  invitation: InvitationSummary;
  onCreated: () => void;
}) {
  const signUp = useSignUp();
  const form = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupValues) => {
    const { error } = await signUp.create({
      username: values.username,
      email: invitation.email,
      password: values.password,
    });
    if (error == null) onCreated();
  };

  return (
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
          autoFocus
          className="h-10"
          {...form.register("username")}
        />
        <FieldError
          message={
            form.formState.errors.username?.message ??
            authErrorMessage(signUp.error, "username")
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
            authErrorMessage(signUp.error, "password")
          }
        />
      </div>
      <FormAlert
        message={
          authErrorMessage(signUp.error, "global") ??
          authErrorMessage(signUp.error, "email")
        }
      />
      <Button
        type="submit"
        className="h-10 w-full"
        disabled={
          form.formState.isSubmitting || signUp.fetchStatus === "fetching"
        }
      >
        {form.formState.isSubmitting ? "Creating…" : "Create sign-in"}
      </Button>
    </form>
  );
}
