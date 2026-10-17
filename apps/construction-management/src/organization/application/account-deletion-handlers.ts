import type { AuditEvent } from "@/src/shared-kernel/audit";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type { TeamMember } from "../domain/team-member";
import type { TeamMemberRepository } from "../domain/team-member-repository";
import type { ActionCodeCheck } from "./ownership-handlers";

/** What the User typed to confirm. */
export const DELETE_ACCOUNT_CONFIRMATION = "DELETE";

export const DELETE_ACCOUNT_REASON_MAX = 500;

/** A Company as Delete My Account names it. */
export type AccountCompany = { id: string; name: string };

/** The User's Companies in `@repo/auth`. */
export type AccountCompanies = {
  /** Companies the User owns: Delete My Account is refused while there are any. */
  owned(userId: string): Promise<AccountCompany[]>;
  /** Companies the User is a member of (not the Owner). */
  memberOf(userId: string): Promise<AccountCompany[]>;
};

/**
 * Erases the account in one transaction: leaves every Company in
 * `@repo/auth`, writes the Left Team Members and their audit, deletes the
 * User's messaging data (push, notifications, preferences) through the
 * composition root, erases the identity and its sessions, and keeps an
 * `account_deletions` record.
 */
export type AccountDeletionStore = {
  erase(input: {
    id: string;
    userId: string;
    reason: string | null;
    members: readonly TeamMember[];
    audits: readonly AuditEvent[];
    now: Date;
  }): Promise<void>;
};

/**
 * Delete My Account (CM-907, ADR CM-0021 §10). An Owner must first hand
 * their Companies over or delete them. Everyone else leaves every
 * Company: each Team Member record stays as the Company's own, marked
 * Left, no longer linked to the User; names show "Deleted user".
 */
export class AccountDeletionHandlers {
  constructor(
    private readonly companies: AccountCompanies,
    private readonly members: TeamMemberRepository,
    private readonly store: AccountDeletionStore,
    private readonly codes: ActionCodeCheck,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** What the Privacy section needs before offering the action. */
  async status(userId: string): Promise<{ ownedCompanies: AccountCompany[] }> {
    return { ownedCompanies: await this.companies.owned(userId) };
  }

  /**
   * Refusals, in order: 400 `CONFIRMATION_MISMATCH` unless `confirmation`
   * is DELETE, 400 `REASON_TOO_LONG`, 409 `OWNER_MUST_HAND_OVER` (details
   * name the Companies), then the code's own refusals.
   */
  async deleteAccount(input: {
    userId: string;
    reason?: string | null;
    confirmation: string;
    code: string;
  }): Promise<void> {
    if (input.confirmation.trim() !== DELETE_ACCOUNT_CONFIRMATION)
      throw new DomainError(
        "CONFIRMATION_MISMATCH",
        "Type DELETE in capital letters to confirm.",
      );
    const reason = input.reason?.trim() ?? "";
    if (reason.length > DELETE_ACCOUNT_REASON_MAX)
      throw new DomainError(
        "REASON_TOO_LONG",
        `Keep the reason under ${String(DELETE_ACCOUNT_REASON_MAX)} characters.`,
      );
    const owned = await this.companies.owned(input.userId);
    if (owned.length > 0)
      throw conflict(
        "OWNER_MUST_HAND_OVER",
        "You own a Company. Transfer ownership to another Team Member, or delete the Company, before deleting your account.",
        { companies: owned },
      );
    await this.codes({
      userId: input.userId,
      purpose: "delete_account",
      code: input.code,
    });
    const now = this.clock();
    const companies = await this.companies.memberOf(input.userId);
    const members: TeamMember[] = [];
    const audits: AuditEvent[] = [];
    for (const company of companies) {
      const member = await this.members.findByUser(company.id, input.userId);
      if (member == null) continue;
      const previous = member.status;
      member.leave(now);
      members.push(member);
      audits.push({
        workspaceId: company.id,
        actorUserId: input.userId,
        action: "team_member.account_deleted",
        entityType: "team_member",
        entityId: member.id,
        before: { status: previous, userId: input.userId },
        after: { status: member.status, userId: null },
        occurredAt: now,
      });
    }
    await this.store.erase({
      id: newId(now.getTime()),
      userId: input.userId,
      reason: reason.length === 0 ? null : reason,
      members,
      audits,
      now,
    });
  }
}
