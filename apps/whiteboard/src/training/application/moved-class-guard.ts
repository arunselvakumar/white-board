import {
  localNow,
  orphanedMoves,
  type ScheduleSlot,
} from "../domain/class-schedule";
import { DomainError } from "../domain/errors";
import type { ClassChangeStore } from "./class-change-handlers";

/**
 * Refuses Timing edits that would drop the original slot of an upcoming Moved
 * Class. Without its original slot, the Rescheduled slot would vanish from
 * every screen while its Class Change stayed active (ADR-0028).
 */
export class MovedClassGuard {
  constructor(
    private readonly deps: {
      store: Pick<ClassChangeStore, "findBatch" | "activeChanges">;
      now: () => Date;
    },
  ) {}

  async assertTimingsKeepMovedClasses(input: {
    workspaceId: string;
    batchId: string;
    /** New Batch Timings, when the Batch schedule is edited. */
    batchTimings?: readonly ScheduleSlot[];
    /** New Student-specific Timings for one Enrollment; null inherits the Batch. */
    enrollment?: { id: string; timings: readonly ScheduleSlot[] | null };
  }): Promise<void> {
    const [batch, changes] = await Promise.all([
      this.deps.store.findBatch(input.workspaceId, input.batchId),
      this.deps.store.activeChanges(input.workspaceId, input.batchId),
    ]);
    if (batch == null || changes.length === 0) return;
    const sources = batch.sources
      .filter(
        (source) =>
          input.enrollment == null ||
          source.enrollmentId !== input.enrollment.id,
      )
      .map((source) =>
        source.enrollmentId == null && input.batchTimings != null
          ? { ...source, timings: input.batchTimings }
          : source,
      );
    if (input.enrollment?.timings != null)
      sources.push({
        batchId: batch.id,
        timings: input.enrollment.timings,
        enrollmentId: input.enrollment.id,
      });
    const orphaned = orphanedMoves(
      changes.map((change) => change.toFact()),
      sources,
      localNow(this.deps.now(), batch.timezone),
    );
    if (orphaned.length > 0)
      throw new DomainError(
        "BATCH_HAS_CLASS_CHANGES",
        `These Timings would drop upcoming Moved Classes. Restore them first: ${orphaned
          .map(
            (change) =>
              `${change.date} ${change.startTime} (moved to ${change.movedTo?.date} ${change.movedTo?.startTime})`,
          )
          .join(", ")}.`,
      );
  }
}
