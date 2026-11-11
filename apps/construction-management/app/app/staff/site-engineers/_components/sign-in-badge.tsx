import { Badge } from "@repo/ui/components/badge";

import type { SiteEngineerSignIn } from "@/src/queries/site-engineers";

import { MemberStatusBadge } from "@/app/app/staff/office-staff/_components/member-status-badge";

/**
 * How a Site Engineer signs in, in one badge: their own sign-in's status
 * (Active, Joining Pending …), Office Staff, or No sign-in.
 */
export function SignInBadge({ signIn }: { signIn: SiteEngineerSignIn }) {
  switch (signIn.kind) {
    case "site_engineer":
      return <MemberStatusBadge status={signIn.status} />;
    case "office_staff":
      return <Badge variant="secondary">Office Staff</Badge>;
    case "none":
      return <Badge variant="outline">No sign-in</Badge>;
  }
}
