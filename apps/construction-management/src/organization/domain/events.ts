import type { DomainEvent } from "@/src/shared-kernel/events";

/** A Company exists with its Owner and profile. Other contexts copy their seed sets on it. */
export type CompanyCreated = DomainEvent & {
  type: "CompanyCreated";
  ownerUserId: string;
  country: string;
};

export type OrganizationEvent = CompanyCreated;
