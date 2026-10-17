import { SeedProjectSalesListener } from "@/src/sales/infrastructure/seed-project-sales";
import type { DomainEventListener } from "@/src/shared-kernel/events";

/**
 * Composition root for `ProjectCreated` (ADR CM-0022 §2): every context's
 * listener that copies its per-Project seed sets to a new Project. Add a
 * context's listener here when it gains per-Project seeds.
 */
export function projectCreatedListeners(): DomainEventListener[] {
  return [new SeedProjectSalesListener()];
}
