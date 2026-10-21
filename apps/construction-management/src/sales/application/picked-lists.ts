import { DomainError } from "@/src/shared-kernel/domain-error";

import type { SalesTx } from "./ports";
import type {
  SalesListStore,
  StoredSalesListItem,
} from "./sales-settings-handlers";

/**
 * The Funnel Stage and Lead Source an inquiry write picks (CM-1003,
 * CM-1004). The handlers check them before the transaction so a mistake
 * fails fast, and again inside it under a `FOR SHARE` lock (review of
 * #93): a Settings delete or disable locks the Project's rows `FOR
 * UPDATE`, so it either waits for the write and then sees the inquiry
 * using the row, or commits first and the row reads as deleted here.
 */

function refused(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

/** 400 `FUNNEL_STAGE_NOT_FOUND` unless a live stage of the Project. */
export function assertPickedStage(
  stage: StoredSalesListItem | undefined,
  projectId: string,
  field: string,
): void {
  if (stage == null || stage.deletedAt != null || stage.projectId !== projectId)
    throw refused(
      "FUNNEL_STAGE_NOT_FOUND",
      "This Funnel Stage was not found.",
      field,
    );
}

/**
 * 400 `LEAD_SOURCE_NOT_FOUND` unless a live Lead Source of the Project,
 * `LEAD_SOURCE_DISABLED` for a disabled one.
 */
export function assertPickedLeadSource(
  source: StoredSalesListItem | undefined,
  projectId: string,
): void {
  if (
    source == null ||
    source.deletedAt != null ||
    source.projectId !== projectId
  )
    throw refused(
      "LEAD_SOURCE_NOT_FOUND",
      "This Lead Source was not found.",
      "leadSourceId",
    );
  if (!source.isActive)
    throw refused(
      "LEAD_SOURCE_DISABLED",
      "This Lead Source is disabled. Choose another.",
      "leadSourceId",
    );
}

/**
 * Inside the write transaction: locks the newly picked rows `FOR SHARE`
 * and checks them again. Null means nothing new was picked.
 */
export async function lockPickedLists(
  lists: SalesListStore,
  tx: SalesTx,
  workspaceId: string,
  projectId: string,
  picked: {
    funnelStageId: string | null;
    leadSourceId: string | null;
    /** The request field a stale stage is reported on. */
    stageField: string;
  },
): Promise<void> {
  if (picked.leadSourceId != null) {
    const sources = await lists.share(tx, workspaceId, "lead_source", [
      picked.leadSourceId,
    ]);
    assertPickedLeadSource(sources.get(picked.leadSourceId), projectId);
  }
  if (picked.funnelStageId != null) {
    const stages = await lists.share(tx, workspaceId, "funnel_stage", [
      picked.funnelStageId,
    ]);
    assertPickedStage(
      stages.get(picked.funnelStageId),
      projectId,
      picked.stageField,
    );
  }
}
