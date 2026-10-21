import type { ProjectCreated } from "@/src/projects/domain/events";
import {
  SeedProjectSalesListener,
  type InboundProjectCreated,
} from "@/src/sales/infrastructure/seed-project-sales";
import type { DomainEventListener } from "@/src/shared-kernel/events";

type Fits<Real extends Inbound, Inbound> = Real;

/**
 * Compile-time check that projects' real `ProjectCreated` still fits the
 * copy sales reads; if the event loses or renames a field, this file stops
 * compiling instead of new Projects quietly getting no sales lists.
 */
export type ProjectCreatedContracts = [
  Fits<ProjectCreated, InboundProjectCreated>,
];

/**
 * Composition root for `ProjectCreated` (ADR CM-0022 §2): every context's
 * listener that copies its per-Project seed sets to a new Project. Add a
 * context's listener here when it gains per-Project seeds.
 */
export function projectCreatedListeners(): DomainEventListener[] {
  return [new SeedProjectSalesListener()];
}
