"use client";

import {
  navigateInApp,
  useCompanySignOut,
} from "@repo/auth/construction/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import {
  acceptJoinRequest,
  rejectJoinRequest,
} from "@/src/queries/join-requests";

export type JoinLinkPreview = {
  id: string;
  companyName: string;
  memberName: string;
  contacts: { kind: "mobile" | "email"; masked: string }[];
};

function contactLine(preview: JoinLinkPreview): string {
  return preview.contacts.map((contact) => contact.masked).join(" or ");
}

/** What they sign in with: the email, or the number while SMS is on. */
function contactNoun(preview: JoinLinkPreview): "email" | "number" {
  return preview.contacts.some((contact) => contact.kind === "email") ||
    preview.contacts.length === 0
    ? "email"
    : "number";
}

/**
 * `/join/<token>` (CM-109): sign in with the invited email, then accept.
 * While SMS is on (ADR CM-0009) the invited number is listed too.
 */
export function JoinLinkCard({
  token,
  preview,
  signedIn,
}: {
  token: string;
  preview: JoinLinkPreview | null;
  signedIn: boolean;
}) {
  const { signOut } = useCompanySignOut();
  const acceptance = useMutation({
    mutationFn: () => acceptJoinRequest(preview?.id ?? ""),
    onSuccess: () => {
      navigateInApp("/app/projects");
    },
  });
  const rejection = useMutation({
    mutationFn: () => rejectJoinRequest(preview?.id ?? ""),
    onSuccess: () => {
      navigateInApp("/continue");
    },
  });

  if (preview == null)
    return (
      <AuthHeading
        title="This invite link has expired"
        description="It was used already or replaced by a newer one. Ask the person who invited you to share a new link."
      />
    );

  const redirect = encodeURIComponent(`/join/${token}`);
  const failure = acceptance.error ?? rejection.error;
  const notForYou =
    failure instanceof QueryHttpError &&
    failure.code === "JOIN_REQUEST_NOT_FOUND";
  const noun = contactNoun(preview);

  return (
    <>
      <AuthHeading
        title={`Join ${preview.companyName}`}
        description={`${preview.companyName} invited ${preview.memberName} to work with them on Construction Management.`}
      />
      {!signedIn ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            {preview.contacts.length === 0
              ? "This invitation has no email yet. Ask the person who invited you to add one, then sign in with it to accept."
              : `Sign in with ${contactLine(preview)} to accept.`}
          </p>
          <Link
            href={`/sign-in?redirect_url=${redirect}`}
            className={buttonVariants({ className: "h-10 w-full" })}
          >
            Sign in to accept
          </Link>
          <Link
            href={`/sign-up?redirect_url=${redirect}`}
            className={buttonVariants({
              variant: "outline",
              className: "h-10 w-full",
            })}
          >
            Create an account
          </Link>
        </div>
      ) : notForYou ? (
        <div className="space-y-3">
          <FormAlert
            message={
              preview.contacts.length === 0
                ? "This invitation has no email yet. Ask the person who invited you to add one."
                : `This invitation is for ${contactLine(preview)}. You are signed in with a different ${noun}.`
            }
          />
          <Button
            variant="outline"
            className="h-10 w-full"
            onClick={() => {
              void signOut(`/join/${token}`);
            }}
          >
            Sign out and use that {noun}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            className="h-10 w-full"
            disabled={acceptance.isPending || rejection.isPending}
            onClick={() => {
              acceptance.mutate();
            }}
          >
            {acceptance.isPending ? "Joining…" : `Join ${preview.companyName}`}
          </Button>
          <Button
            variant="ghost"
            className="h-10 w-full"
            disabled={acceptance.isPending || rejection.isPending}
            onClick={() => {
              rejection.mutate();
            }}
          >
            Decline
          </Button>
          <FormAlert
            message={
              failure == null
                ? undefined
                : failure instanceof QueryHttpError
                  ? failure.message
                  : "Something went wrong. Please try again."
            }
          />
        </div>
      )}
    </>
  );
}
