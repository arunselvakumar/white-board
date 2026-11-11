import type { AuditRecord } from "@/src/shared-kernel/audit-reader";
import { teamMemberProjectIdsAfter } from "@/src/shared-kernel/audit-reader";

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
  const ordered = [...events].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const changes: SignInProjectChange[] = [];
  let current = new Set<string>();
  for (const event of ordered) {
    const next =
      event.action === "team_member.removed"
        ? new Set<string>()
        : new Set(teamMemberProjectIdsAfter(event) ?? current);
    const change = (projectId: string, kind: "added" | "removed") => {
      changes.push({
        memberId,
        projectId,
        change: kind,
        eventId: event.id,
        occurredAt: event.occurredAt,
        by: event.actorUserId,
      });
    };
    for (const projectId of next)
      if (!current.has(projectId)) change(projectId, "added");
    for (const projectId of current)
      if (!next.has(projectId)) change(projectId, "removed");
    current = next;
  }
  return changes;
}

export type SignInProjectHistory = {
  /**
   * Sign-ins marked Site Engineer (`team_members.site_engineer`), removed
   * ones included, with their names.
   */
  siteEngineerSignIns(
    workspaceId: string,
  ): Promise<{ id: string; name: string }[]>;
  /** Every Project change of these sign-ins on one Project, oldest first. */
  projectChanges(
    workspaceId: string,
    memberIds: readonly string[],
    projectId: string,
  ): Promise<SignInProjectChange[]>;
};
