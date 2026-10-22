import type { DomainEvent } from "@/src/shared-kernel/events";

import type { Side } from "./contract-terms";

/**
 * Raised after commit when a measurement sheet is submitted for its joint
 * measurement (CM-1105, ADR CM-0023 §6). Messaging turns it into
 * `measurement.submitted` for the Measurement Book Approve + Notification
 * holders on the Project, never the submitter
 * (`src/messaging/application/inbound-events.ts` keeps a copy).
 */
export type MeasurementSubmitted = DomainEvent & {
  type: "MeasurementSubmitted";
  sheetId: string;
  projectId: string;
  side: Side;
  /** `YYYY-MM-DD`. */
  measuredOn: string;
  title: string | null;
  /** The Work Order's number on the contractor side. */
  workOrderNumber: string | null;
  /** The Client or the Contractor measured with, when known. */
  partyName: string | null;
  rowCount: number;
  /** User id of the submitter; never told. */
  by: string;
};
