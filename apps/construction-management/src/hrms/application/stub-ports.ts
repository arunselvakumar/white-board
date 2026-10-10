import type { MonthKey } from "../domain/calendar";
import type { LeaveDay, LeaveDaySource } from "./ports";

/**
 * Stand-ins for ports whose tickets have not landed, so the app compiles
 * and runs end to end. Each says which ticket replaces it; that ticket
 * writes the real implementation and swaps it in
 * `infrastructure/create-hrms-ports.ts`.
 */

// Replaced by CM-312 (leave requests).
/** No approved leave. */
export class NoLeaveDaySource implements LeaveDaySource {
  approvedForMonth(
    _workspaceId: string,
    memberIds: readonly string[],
    _month: MonthKey,
  ): Promise<Map<string, LeaveDay[]>> {
    return Promise.resolve(new Map(memberIds.map((id) => [id, []])));
  }
}
