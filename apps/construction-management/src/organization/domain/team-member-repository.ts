import type { AuditEvent } from "@/src/shared-kernel/audit";

import type { TeamMember, TeamMemberStatus } from "./team-member";

export type TeamMemberListParams = {
  workspaceId: string;
  limit: number;
  after?: { createdAt: Date; id: string };
  before?: { createdAt: Date; id: string };
  search?: string;
  status?: TeamMemberStatus;
  memberType?: "normal" | "hrms";
};

export type TeamMemberListPage = {
  items: TeamMember[];
  total: number;
  hasMore: boolean;
};

export type TeamMemberRepository = {
  /** Writes the member, its projects, its matrix and the audit event atomically. */
  save(member: TeamMember, audit?: AuditEvent): Promise<void>;
  findById(workspaceId: string, id: string): Promise<TeamMember | null>;
  findByUser(workspaceId: string, userId: string): Promise<TeamMember | null>;
  findByInviteToken(token: string): Promise<TeamMember | null>;
  /** Pending Join Requests in any Company for this verified mobile or email. */
  findPendingFor(contact: {
    mobile: string | null;
    email: string | null;
  }): Promise<TeamMember[]>;
  list(params: TeamMemberListParams): Promise<TeamMemberListPage>;
  /** Live Team Members of a type, for plan usage (CM-116). */
  countLive(
    workspaceId: string,
    memberType: "normal" | "hrms",
  ): Promise<number>;
  /** Whether any live Team Member holds this Designation. */
  usesDesignation(workspaceId: string, designationId: string): Promise<boolean>;
};
