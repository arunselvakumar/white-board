import { companyDeletionDueAt } from "@/src/shared-kernel/company-deletion";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

export type CompanyDeletionProps = {
  id: string;
  workspaceId: string;
  companyName: string;
  ownerUserId: string;
  requestedAt: Date;
  scheduledFor: Date;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  completedAt: Date | null;
  /** Rows deleted per table (`schema.table` → count), once purged. */
  summary: Record<string, number> | null;
};

/** How a typed Company name is compared: spaces tidied, case ignored. */
function comparable(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

/**
 * The Owner's request to delete a Company (CM-907, ADR CM-0021 §10): a
 * 30-day cooling-off while the Company is read-only, then the daily job
 * purges it. The record is kept after the purge.
 */
export class CompanyDeletion {
  private constructor(private props: CompanyDeletionProps) {}

  /**
   * Schedules the deletion. 400 `COMPANY_NAME_MISMATCH` unless `typedName`
   * is the Company's name.
   */
  static schedule(input: {
    id: string;
    workspaceId: string;
    companyName: string;
    typedName: string;
    ownerUserId: string;
    now: Date;
  }): CompanyDeletion {
    if (comparable(input.typedName) !== comparable(input.companyName))
      throw new DomainError(
        "COMPANY_NAME_MISMATCH",
        "Type the Company's name exactly as it is shown.",
      );
    return new CompanyDeletion({
      id: input.id,
      workspaceId: input.workspaceId,
      companyName: input.companyName,
      ownerUserId: input.ownerUserId,
      requestedAt: input.now,
      scheduledFor: companyDeletionDueAt(input.now),
      cancelledAt: null,
      cancelledBy: null,
      completedAt: null,
      summary: null,
    });
  }

  static reconstitute(props: CompanyDeletionProps): CompanyDeletion {
    return new CompanyDeletion(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get companyName(): string {
    return this.props.companyName;
  }
  get ownerUserId(): string {
    return this.props.ownerUserId;
  }
  get requestedAt(): Date {
    return this.props.requestedAt;
  }
  get scheduledFor(): Date {
    return this.props.scheduledFor;
  }
  get cancelledAt(): Date | null {
    return this.props.cancelledAt;
  }
  get cancelledBy(): string | null {
    return this.props.cancelledBy;
  }
  get completedAt(): Date | null {
    return this.props.completedAt;
  }
  get summary(): Record<string, number> | null {
    return this.props.summary;
  }

  get isPending(): boolean {
    return this.props.cancelledAt == null && this.props.completedAt == null;
  }

  isDue(now: Date): boolean {
    return this.isPending && this.props.scheduledFor.getTime() <= now.getTime();
  }

  /** The Owner changed their mind during the cooling-off. */
  cancel(by: string, now: Date): void {
    if (!this.isPending)
      throw conflict(
        "NO_COMPANY_DELETION",
        "This Company is not scheduled for deletion.",
      );
    this.props = { ...this.props, cancelledAt: now, cancelledBy: by };
  }

  /** The daily job purged the Company. */
  complete(summary: Record<string, number>, now: Date): void {
    this.props = { ...this.props, completedAt: now, summary };
  }
}
