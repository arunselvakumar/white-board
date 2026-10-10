import { newId } from "@/src/shared-kernel/ids";

import {
  billingAddressDetails,
  billingAddressNotFound,
  type BillingAddress,
  type BillingAddressDetails,
  type BillingAddressInput,
} from "../domain/billing-address";

/**
 * The Company's billing addresses. Every write runs in one transaction,
 * serialised per Company, and appends its audit event.
 */
export type BillingAddressStore = {
  /** Live addresses, the default first, then by name. */
  list(workspaceId: string): Promise<BillingAddress[]>;
  find(workspaceId: string, id: string): Promise<BillingAddress | null>;
  /**
   * Inserts; the Company's first live address becomes the default. 409
   * `BILLING_ADDRESS_NAME_IN_USE` for a live name, ignoring case.
   */
  insert(input: {
    id: string;
    workspaceId: string;
    details: BillingAddressDetails;
    by: string;
    now: Date;
  }): Promise<BillingAddress>;
  /**
   * Replaces the details; 404 when gone, 409 `BILLING_ADDRESS_CHANGED` when
   * the stored `updatedAt` is not `expectedUpdatedAt`, 409 name in use.
   */
  update(input: {
    workspaceId: string;
    id: string;
    details: BillingAddressDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<BillingAddress>;
  /** Moves the default to this address (a no-op when it already is). */
  makeDefault(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<BillingAddress>;
  /**
   * Tombstones; when it was the default, the oldest remaining live address
   * becomes the default.
   */
  delete(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void>;
};

/** Manage billing addresses (CM-501). Access is checked by the caller. */
export class BillingAddressHandlers {
  constructor(
    private readonly store: BillingAddressStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(workspaceId: string): Promise<BillingAddress[]> {
    return this.store.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<BillingAddress> {
    const found = await this.store.find(workspaceId, id);
    if (found == null) throw billingAddressNotFound();
    return found;
  }

  create(input: {
    workspaceId: string;
    details: BillingAddressInput;
    by: string;
  }): Promise<BillingAddress> {
    const details = billingAddressDetails(input.details);
    const now = this.clock();
    return this.store.insert({
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      details,
      by: input.by,
      now,
    });
  }

  update(input: {
    workspaceId: string;
    id: string;
    details: BillingAddressInput;
    expectedUpdatedAt: Date;
    by: string;
  }): Promise<BillingAddress> {
    const details = billingAddressDetails(input.details);
    return this.store.update({
      workspaceId: input.workspaceId,
      id: input.id,
      details,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.by,
      now: this.clock(),
    });
  }

  makeDefault(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<BillingAddress> {
    return this.store.makeDefault({ ...input, now: this.clock() });
  }

  delete(input: {
    workspaceId: string;
    id: string;
    by: string;
  }): Promise<void> {
    return this.store.delete({ ...input, now: this.clock() });
  }
}
