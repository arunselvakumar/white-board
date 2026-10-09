import { SeedCompanyMastersListener } from "@/src/masters/infrastructure/seed-company-masters";
import type { DomainEventListener } from "@/src/shared-kernel/events";

/**
 * Composition root for `CompanyCreated` (root ADR-0008): every context's
 * listener that copies its seed sets to a new Company. Contexts never import
 * each other; this module is the one place that knows them all. Add a
 * context's listener here when it gains per-Company seeds.
 */
export function companyCreatedListeners(): DomainEventListener[] {
  return [new SeedCompanyMastersListener()];
}
