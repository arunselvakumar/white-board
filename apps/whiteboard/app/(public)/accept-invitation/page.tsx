import { getAuth, workspaces } from "@repo/auth/server";
import type { Metadata } from "next";

import { AcceptInvitationForm } from "@/components/auth/accept-invitation-form";

export const metadata: Metadata = { title: "Join Workspace" };

type PageProps = {
  searchParams: Promise<{ id?: string | string[] }>;
};

export default async function AcceptInvitationPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [invitation, auth] = await Promise.all([
    id != null && id.length > 0 && id.length <= 128
      ? workspaces.previewInvitation(id)
      : Promise.resolve(null),
    getAuth(),
  ]);
  return (
    <AcceptInvitationForm
      invitation={
        invitation == null
          ? null
          : {
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
              workspaceName: invitation.workspaceName,
              hasAccount: invitation.hasAccount,
            }
      }
      signedInEmail={auth.user?.email ?? null}
    />
  );
}
