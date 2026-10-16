import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { CompanyDeletion } from "../domain/company-deletion";
import type { CompanyProfileReader } from "./company-profile-reader";
import type { ActionCodeCheck } from "./ownership-handlers";

/** `construction_organization.company_deletions`. */
export type CompanyDeletionStore = {
  /** The Company's pending request, if any. */
  findPending(workspaceId: string): Promise<CompanyDeletion | null>;
  save(deletion: CompanyDeletion, audit?: AuditEvent): Promise<void>;
  /** Pending requests whose day has come, oldest first. */
  listDue(now: Date, limit: number): Promise<CompanyDeletion[]>;
};

export type CompanyDeletionView = {
  requestedAt: Date;
  scheduledFor: Date;
};

function view(deletion: CompanyDeletion): CompanyDeletionView {
  return {
    requestedAt: deletion.requestedAt,
    scheduledFor: deletion.scheduledFor,
  };
}

/**
 * Delete Company (CM-907, ADR CM-0021 §10): the Owner types the Company's
 * name and enters a code; the Company is read-only for 30 days (the write
 * guard in `requireCompanySession`), the Owner may cancel, and the daily
 * job purges it on the day. Routes have checked the caller is the Owner.
 */
export class CompanyDeletionHandlers {
  constructor(
    private readonly store: CompanyDeletionStore,
    private readonly profiles: CompanyProfileReader,
    private readonly codes: ActionCodeCheck,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The pending deletion, for the banner; null when none. */
  async status(workspaceId: string): Promise<CompanyDeletionView | null> {
    const pending = await this.store.findPending(workspaceId);
    return pending == null ? null : view(pending);
  }

  /**
   * Refusals: 409 `COMPANY_DELETION_SCHEDULED` when one is pending, 400
   * `COMPANY_NAME_MISMATCH`, then the code's own refusals.
   */
  async schedule(input: {
    workspaceId: string;
    by: string;
    sessionId: string;
    /** The Company's name as the switcher shows it, when it has no profile. */
    fallbackName: string;
    typedName: string;
    code: string;
  }): Promise<CompanyDeletionView> {
    const now = this.clock();
    const pending = await this.store.findPending(input.workspaceId);
    if (pending != null)
      throw conflict(
        "COMPANY_DELETION_SCHEDULED",
        "This Company is already scheduled for deletion.",
        { scheduledFor: pending.scheduledFor.toISOString() },
      );
    const profile = await this.profiles.findByWorkspace(input.workspaceId);
    const deletion = CompanyDeletion.schedule({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      companyName: profile?.name ?? input.fallbackName,
      typedName: input.typedName,
      ownerUserId: input.by,
      now,
    });
    await this.codes({
      userId: input.by,
      purpose: "delete_company",
      code: input.code,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    await this.store.save(deletion, {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: "company.deletion_scheduled",
      entityType: "company",
      entityId: input.workspaceId,
      after: {
        deletionId: deletion.id,
        scheduledFor: deletion.scheduledFor.toISOString(),
      },
      occurredAt: now,
    });
    return view(deletion);
  }

  /** 409 `NO_COMPANY_DELETION` when none is pending. */
  async cancel(input: { workspaceId: string; by: string }): Promise<void> {
    const now = this.clock();
    const pending = await this.store.findPending(input.workspaceId);
    if (pending == null)
      throw conflict(
        "NO_COMPANY_DELETION",
        "This Company is not scheduled for deletion.",
      );
    pending.cancel(input.by, now);
    await this.store.save(pending, {
      workspaceId: input.workspaceId,
      actorUserId: input.by,
      action: "company.deletion_cancelled",
      entityType: "company",
      entityId: input.workspaceId,
      before: { scheduledFor: pending.scheduledFor.toISOString() },
      occurredAt: now,
    });
  }
}
