import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * A Project exists (ADR CM-0022 §2). Raised after the creating transaction
 * commits; other contexts copy their per-Project seed sets on it.
 */
export type ProjectCreated = DomainEvent & {
  type: "ProjectCreated";
  projectId: string;
  createdBy: string;
};

export type ProjectEvent = ProjectCreated;
