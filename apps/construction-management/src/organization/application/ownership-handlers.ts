import { PermissionSet } from "@/src/shared-kernel/access";
import type { VerifyActionCodeInput } from "@/src/shared-kernel/action-codes";
import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  conflict,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type { DesignationRepository } from "../domain/designation-repository";
import { OWNER_DESIGNATION } from "../domain/new-company";
import { Role } from "../domain/role";
import type { RoleRepository } from "../domain/role-repository";
import type { TeamMember } from "../domain/team-member";
import type { TeamMemberRepository } from "../domain/team-member-repository";

/** Checks and uses a code the User was sent (`src/shared-kernel/action-codes`). */
export type ActionCodeCheck = (input: VerifyActionCodeInput) => Promise<void>;

/** The Designation, and the Role, the old Owner gets (ADR CM-0030). */
export const ADMIN_DESIGNATION = "Admin";
export const ADMIN_ROLE = "Admin";

/**
 * Writes both Team Members (and a Role made for the old Owner), swaps the
 * `owner` and `member` roles in `@repo/auth`, and records the audit, in
 * one transaction.
 */
export type OwnershipTransferStore = {
  commit(input: {
    workspaceId: string;
    from: TeamMember;
    to: TeamMember;
    newRole: Role | null;
    audits: readonly AuditEvent[];
  }): Promise<void>;
};

/** Who the Owner may hand the Company to. */
export type OwnershipCandidate = {
  id: string;
  name: string;
  designation: string | null;
};

function byName(name: string) {
  const wanted = name.toLocaleLowerCase("en-IN");
  return (item: { name: string }) =>
    item.name.toLocaleLowerCase("en-IN") === wanted;
}

/**
 * "<name>'s access", as the Roles migration names a Role made for one
 * person (ADR CM-0030 §4), numbered when the name is taken.
 */
function accessRoleName(name: string, taken: ReadonlySet<string>): string {
  const base = `${name.slice(0, 80)}'s access`;
  if (!taken.has(base.toLowerCase())) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${String(index)}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Transfer ownership (CM-907, ADR CM-0021 §10): the Owner hands the
 * Company to an active, joined Normal Team Member after entering a code
 * sent to them. There is one Owner at a time (ADR CM-0002). Routes have
 * checked the caller is the Owner.
 */
export class OwnershipHandlers {
  constructor(
    private readonly members: TeamMemberRepository,
    private readonly designations: DesignationRepository,
    private readonly roles: RoleRepository,
    private readonly store: OwnershipTransferStore,
    private readonly codes: ActionCodeCheck,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Active, joined Normal Team Members other than the Owner, by name. */
  async candidates(workspaceId: string): Promise<OwnershipCandidate[]> {
    const [page, designations] = await Promise.all([
      this.members.list({
        workspaceId,
        limit: 1000,
        status: "active",
        memberType: "normal",
      }),
      this.designations.listAll(workspaceId),
    ]);
    const names = new Map(designations.map((item) => [item.id, item.name]));
    return page.items
      .filter((member) => !member.isOwner && member.userId != null)
      .map((member) => ({
        id: member.id,
        name: member.details.name,
        designation: names.get(member.details.designationId) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en-IN"));
  }

  /**
   * Makes the Team Member `memberId` the Owner. The new Owner gets the
   * Owner Designation and every right; the old Owner becomes a member
   * with the Admin Designation and the Admin Role — or, when the Company
   * has deleted that Role, a Role made for them with every right (ADR
   * CM-0030). Refusals: 404
   * `TEAM_MEMBER_NOT_FOUND`, 409 `NEW_OWNER_NOT_ACTIVE` / `OWNER_IS_NORMAL`
   * / `ALREADY_OWNER`, and the code's own refusals.
   */
  async transfer(input: {
    workspaceId: string;
    by: string;
    sessionId: string;
    memberId: string;
    code: string;
  }): Promise<{ ownerId: string }> {
    const now = this.clock();
    const from = await this.members.findByUser(input.workspaceId, input.by);
    if (!from?.isOwner)
      throw forbidden("FORBIDDEN", "Only the Owner can do this.");
    const to = await this.members.findById(input.workspaceId, input.memberId);
    if (to == null)
      throw notFound(
        "TEAM_MEMBER_NOT_FOUND",
        "This Team Member was not found.",
      );
    if (to.id === from.id)
      throw conflict("ALREADY_OWNER", "You are already the Owner.");
    const [designations, roles] = await Promise.all([
      this.designations.listAll(input.workspaceId),
      this.roles.listAll(input.workspaceId),
    ]);
    const owner = designations.find(byName(OWNER_DESIGNATION)) ?? null;
    const admin = designations.find(byName(ADMIN_DESIGNATION)) ?? null;
    const adminRole = roles.find(byName(ADMIN_ROLE)) ?? null;
    const fromRole =
      adminRole ??
      Role.create({
        id: newId(now.getTime()),
        workspaceId: input.workspaceId,
        name: accessRoleName(
          from.details.name,
          new Set(roles.map((role) => role.name.toLowerCase())),
        ),
        permissions: PermissionSet.everything(),
        by: input.by,
        now,
      });
    const before = {
      from: { designationId: from.details.designationId, isOwner: true },
      to: {
        designationId: to.details.designationId,
        isOwner: false,
        roleId: to.roleId,
      },
    };
    to.becomeOwner(owner?.id ?? null, input.by, now);
    from.stepDownAsOwner(admin?.id ?? null, fromRole.id, input.by, now);
    await this.codes({
      userId: input.by,
      purpose: "transfer_ownership",
      code: input.code,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    await this.store.commit({
      workspaceId: input.workspaceId,
      from,
      to,
      newRole: fromRole === adminRole ? null : fromRole,
      audits: [
        {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "company.ownership_transferred",
          entityType: "team_member",
          entityId: to.id,
          before,
          after: {
            from: {
              memberId: from.id,
              userId: from.userId,
              designationId: from.details.designationId,
              isOwner: false,
              roleId: from.roleId,
            },
            to: {
              memberId: to.id,
              userId: to.userId,
              designationId: to.details.designationId,
              isOwner: true,
            },
          },
          occurredAt: now,
        },
      ],
    });
    return { ownerId: to.id };
  }
}
