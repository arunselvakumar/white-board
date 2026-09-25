import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";
import { workspaceEntryPath } from "@/lib/workspace-entry";

export const metadata: Metadata = { title: "Join Workspace" };

type PageProps = {
  searchParams: Promise<{
    __clerk_ticket?: string | string[];
    __clerk_status?: string | string[];
  }>;
};

export default async function AcceptInvitationPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const ticket = Array.isArray(params.__clerk_ticket)
    ? (params.__clerk_ticket[0] ?? null)
    : (params.__clerk_ticket ?? null);
  const status = Array.isArray(params.__clerk_status)
    ? (params.__clerk_status[0] ?? null)
    : (params.__clerk_status ?? null);
  if (status === "complete") redirect(workspaceEntryPath("/"));
  return <AcceptInvitationForm ticket={ticket} status={status} />;
}
