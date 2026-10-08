import { getCompanyAuth } from "@repo/auth/construction/server";
import type { Metadata } from "next";

import {
  JoinLinkCard,
  type JoinLinkPreview,
} from "@/components/join/join-link-card";
import { createJoinRequestHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import { DomainError } from "@/src/shared-kernel/domain-error";

export const metadata: Metadata = { title: "Join a Company" };

const handlers = createJoinRequestHandlers();

async function previewFor(token: string): Promise<JoinLinkPreview | null> {
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  try {
    return await handlers.preview(token);
  } catch (error) {
    if (error instanceof DomainError && error.kind === "not_found") return null;
    throw error;
  }
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [preview, auth] = await Promise.all([
    previewFor(token),
    getCompanyAuth(),
  ]);
  return (
    <JoinLinkCard
      token={token}
      preview={preview}
      signedIn={auth.isAuthenticated}
    />
  );
}
