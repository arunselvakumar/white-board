import type { AuditRecord } from "@/src/shared-kernel/audit-reader";
import {
  auditProjectChanges,
  teamMemberProjectIdsAfter,
} from "@/src/shared-kernel/audit-reader";

/** A sign-in put on, or taken off, a Project by one audited command. */
export type SignInProjectChange = {
  memberId: string;
  projectId: string;
  change: "added" | "removed";
  /** The audit event's id. */
  eventId: string;
  occurredAt: Date;
  by: string;
};

/**
 * A sign-in's Project changes from its `team_member.*` events (ADR CM-0038
 * §1): each event that carries `after.projectIds` is compared with the set
 * before it (empty before the first). `team_member.removed` takes the
 * sign-in off every Project it was on; an event without the set (a
 * password set, a photo change) changes nothing.
 */
export function projectChangesOf(
  memberId: string,
  events: readonly AuditRecord[],
): SignInProjectChange[] {
  return auditProjectChanges(
    events,
    teamMemberProjectIdsAfter,
    (event) => event.action === "team_member.removed",
  ).map(({ projectId, change, event }) => ({
    memberId,
    projectId,
    change,
    eventId: event.id,
    occurredAt: event.occurredAt,
    by: event.actorUserId,
  }));
}

export type SignInProjectHistory = {
  /**
   * Sign-ins marked Site Engineer (`team_members.site_engineer`), removed
   * ones included, with their names.
   */
  siteEngineerSignIns(
    workspaceId: string,
  ): Promise<{ id: string; name: string }[]>;
  /**
   * Every Project change of these sign-ins, oldest first: on one Project,
   * or on every Project when `projectId` is null.
   */
  projectChanges(
    workspaceId: string,
    memberIds: readonly string[],
    projectId: string | null,
  ): Promise<SignInProjectChange[]>;
};
