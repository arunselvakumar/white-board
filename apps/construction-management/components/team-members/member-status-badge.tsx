import { Badge } from "@repo/ui/components/badge";

import type { TeamMemberStatus } from "@/src/queries/team-members";

const LABELS: Record<TeamMemberStatus, string> = {
  joining_pending: "Joining Pending",
  active: "Active",
  rejected: "Declined",
};

const VARIANTS = {
  joining_pending: "secondary",
  active: "default",
  rejected: "outline",
} as const satisfies Record<TeamMemberStatus, string>;

export function MemberStatusBadge({ status }: { status: TeamMemberStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}

export const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "joining_pending", label: "Joining Pending" },
  { value: "rejected", label: "Declined" },
] as const;
