import {
  createBackdatedPolicy,
  referencedDesignationIds,
  type BackdatedPolicy,
  type BackdatedPolicyInput,
} from "@/src/shared-kernel/backdated-policy";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { DesignationRepository } from "../domain/designation-repository";

export type StoredBackdatedPolicy = {
  policy: BackdatedPolicy;
  /** Null until the Company first saves its policy. */
  updatedAt: Date | null;
};

export type BackdatedPolicyStore = {
  /** The Company's policy, or the no-limits default when none is saved. */
  find(workspaceId: string): Promise<StoredBackdatedPolicy>;
  /**
   * Upserts the row and appends the audit event (with the stored policy as
   * `before`) in one transaction. Throws 409 `BACKDATED_POLICY_CHANGED` when
   * the stored `updatedAt` is not `expectedUpdatedAt` (null = never saved).
   */
  save(input: {
    workspaceId: string;
    policy: BackdatedPolicy;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
};

/** Read and replace the Company's Back-dated Entry policy (CM-113). Access is checked by the caller. */
export class BackdatedPolicyHandlers {
  constructor(
    private readonly store: BackdatedPolicyStore,
    private readonly designations: DesignationRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  get(workspaceId: string): Promise<StoredBackdatedPolicy> {
    return this.store.find(workspaceId);
  }

  async update(input: {
    workspaceId: string;
    policy: BackdatedPolicyInput;
    /** The `updatedAt` the caller loaded; null when it loaded the never-saved default. */
    expectedUpdatedAt: Date | null;
    by: string;
  }): Promise<StoredBackdatedPolicy> {
    const policy = createBackdatedPolicy(input.policy);
    const named = referencedDesignationIds(policy);
    if (named.length > 0) {
      const live = new Set(
        (await this.designations.listAll(input.workspaceId)).map(
          (designation) => designation.id,
        ),
      );
      const missing = named.filter((id) => !live.has(id));
      if (missing.length > 0)
        throw new DomainError(
          "DESIGNATION_NOT_FOUND",
          "Some override Designations no longer exist. Choose them again.",
          { details: { designationIds: missing } },
        );
    }
    const now = this.clock();
    await this.store.save({
      workspaceId: input.workspaceId,
      policy,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.by,
      now,
    });
    return { policy, updatedAt: now };
  }
}
