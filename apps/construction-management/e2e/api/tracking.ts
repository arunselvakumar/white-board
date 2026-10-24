import type { ApiClient } from "./ApiClient";
import { unitId } from "./masters";
import { unique } from "./session";

const TRACKING = "/api/construction/tracking";

/** A Task with a total quantity of work, so worksheets can post progress. */
export async function createTask(
  api: ApiClient,
  input: {
    projectId: string;
    name?: string;
    totalWorkQty?: string;
    unit?: string;
    contractorId?: string;
    locationId?: string;
    assigneeIds?: string[];
    dueDate?: string;
  },
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Brickwork, ground floor");
  const created = await api.post<{ id: string }>(`${TRACKING}/tasks`, {
    projectId: input.projectId,
    name,
    totalWorkQty: input.totalWorkQty ?? "100",
    totalWorkUnitId: await unitId(api, input.unit ?? "sqm"),
    contractorId: input.contractorId ?? null,
    assigneeIds: input.assigneeIds ?? [],
    dueDate: input.dueDate ?? null,
    siteLocation:
      input.locationId == null
        ? null
        : { type: "location", locationId: input.locationId },
  });
  return { id: created.id, name };
}

/** An open issue on the Project, assigned to a Team Member. */
export async function createIssue(
  api: ApiClient,
  input: {
    projectId: string;
    details?: string;
    assigneeMemberId?: string;
    locationId?: string;
    issueDate: string;
  },
): Promise<{ id: string }> {
  return api.post(`${TRACKING}/issues`, {
    projectId: input.projectId,
    issueDate: input.issueDate,
    details: input.details ?? "Plaster cracks on the east wall",
    assigneeMemberId: input.assigneeMemberId ?? null,
    siteLocation:
      input.locationId == null
        ? null
        : { type: "location", locationId: input.locationId },
  });
}
