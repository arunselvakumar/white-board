import type {
  CheckInContext,
  CheckInDayReadModel,
  CheckInEntryReadModel,
  CheckInPersonReadModel,
  CheckInViewer,
} from "@/src/labour/application/check-in-handlers";
import { createCheckInHandlers } from "@/src/labour/infrastructure/check-in-factory";
import { can, type MemberAccess } from "@/src/shared-kernel/access";

import type {
  ConstructionLabourCheckInDayResponseModel,
  ConstructionLabourCheckInEntryResponseModel,
  ConstructionLabourCheckInPersonResponseModel,
} from "./check-in-models";

/** One set of Check-In handlers for every route. */
export const checkInHandlers = createCheckInHandlers();

/** What the member may do on the Project's Check-In. */
export function viewerOf(
  access: MemberAccess,
  projectId: string,
): CheckInViewer {
  return {
    canCheckIn: can(access, "labour.attendance", "create", { projectId }),
    canVoid: can(access, "labour.attendance", "delete", { projectId }),
    canVoidLabour:
      can(access, "labour.attendance", "delete", { projectId }) &&
      can(access, "labour.attendance", "update", { projectId }),
  };
}

export function toContextResponse(context: CheckInContext & CheckInViewer) {
  return {
    now: context.now.toISOString(),
    timeZone: context.timeZone,
    today: context.today,
    siteFence: context.siteFence,
    canCheckIn: context.canCheckIn,
    canVoid: context.canVoid,
    canVoidLabour: context.canVoidLabour,
  };
}

export function toPersonResponse(
  person: CheckInPersonReadModel,
): ConstructionLabourCheckInPersonResponseModel {
  return {
    kind: person.kind,
    id: person.id,
    name: person.name,
    role: person.role,
    code: person.code,
    phone: person.phone,
    hasPhoto: person.hasPhoto,
    state: {
      status: person.state.status,
      since: person.state.since?.toISOString() ?? null,
    },
    entriesToday: person.entriesToday,
  };
}

export function toEntryResponse(
  entry: CheckInEntryReadModel,
): ConstructionLabourCheckInEntryResponseModel {
  return {
    id: entry.id,
    projectId: entry.projectId,
    kind: entry.kind,
    personId: entry.personId,
    personName: entry.personName,
    role: entry.role,
    action: entry.action,
    at: entry.at.toISOString(),
    date: entry.date,
    hasPhoto: entry.hasPhoto,
    location: entry.location,
    fence: entry.fence,
    metresOutside: entry.metresOutside,
    recordedBy: entry.recordedBy,
    voided:
      entry.voided == null
        ? null
        : {
            at: entry.voided.at.toISOString(),
            by: entry.voided.by,
            reason: entry.voided.reason,
          },
  };
}

export function toDayResponse(
  day: CheckInDayReadModel | null,
): ConstructionLabourCheckInDayResponseModel | null {
  return day == null ? null : { ...day };
}
