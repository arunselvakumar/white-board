import { Prisma, type PrismaClient } from "@repo/db";

import type {
  ClassKey,
  ClassOccurrenceRecord,
  ClassOccurrenceStore,
} from "../application/class-service";

type Row = NonNullable<
  Awaited<ReturnType<PrismaClient["classOccurrence"]["findFirst"]>>
>;

function toRecord(row: Row): ClassOccurrenceRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    batchId: row.batchId,
    date: row.classDate.toISOString().slice(0, 10),
    startTime: row.startTime,
    endTime: row.endTime,
    providerMeetingId: row.providerMeetingId,
    status: row.status as ClassOccurrenceRecord["status"],
    recordingId: row.recordingId,
    recordingStatus:
      row.recordingStatus as ClassOccurrenceRecord["recordingStatus"],
    recordingObjectKey: row.recordingObjectKey,
  };
}

function dateValue(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export class PrismaClassOccurrenceStore implements ClassOccurrenceStore {
  constructor(private readonly db: PrismaClient) {}

  async find(key: ClassKey): Promise<ClassOccurrenceRecord | null> {
    const row = await this.db.classOccurrence.findFirst({
      where: {
        workspaceId: key.workspaceId,
        batchId: key.batchId,
        classDate: dateValue(key.date),
        startTime: key.startTime,
      },
    });
    return row == null ? null : toRecord(row);
  }

  async claim(
    input: ClassKey & { endTime: string; startedByUserId: string },
  ): Promise<{ occurrence: ClassOccurrenceRecord; claimed: boolean }> {
    try {
      const row = await this.db.classOccurrence.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          batchId: input.batchId,
          classDate: dateValue(input.date),
          startTime: input.startTime,
          endTime: input.endTime,
          startedByUserId: input.startedByUserId,
        },
      });
      return { occurrence: toRecord(row), claimed: true };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
      const existing = await this.find(input);
      if (existing == null) throw error;
      if (
        existing.providerMeetingId == null &&
        existing.status === "starting"
      ) {
        const reclaimed = await this.db.classOccurrence.updateMany({
          where: {
            id: existing.id,
            providerMeetingId: null,
            status: "starting",
            startedAt: { lt: new Date(Date.now() - 30_000) },
          },
          data: {
            startedAt: new Date(),
            startedByUserId: input.startedByUserId,
          },
        });
        if (reclaimed.count === 1)
          return { occurrence: existing, claimed: true };
      }
      return { occurrence: existing, claimed: false };
    }
  }

  async setMeeting(id: string, meetingId: string): Promise<void> {
    await this.db.classOccurrence.update({
      where: { id },
      data: { providerMeetingId: meetingId },
    });
  }

  async findByMeetingId(
    meetingId: string,
  ): Promise<ClassOccurrenceRecord | null> {
    const row = await this.db.classOccurrence.findUnique({
      where: { providerMeetingId: meetingId },
    });
    return row == null ? null : toRecord(row);
  }

  async claimRecording(id: string): Promise<boolean> {
    const result = await this.db.classOccurrence.updateMany({
      where: { id, recordingId: null, recordingStatus: "pending" },
      data: { recordingStatus: "requesting" },
    });
    return result.count === 1;
  }

  async markEnded(id: string): Promise<void> {
    await this.db.classOccurrence.updateMany({
      where: { id, status: { in: ["starting", "live"] } },
      data: { status: "ended", endedAt: new Date() },
    });
  }

  async setRecordingStatus(
    id: string,
    status: ClassOccurrenceRecord["recordingStatus"],
    fields: { recordingId?: string; objectKey?: string } = {},
  ): Promise<void> {
    if (status === "pending") {
      await this.db.classOccurrence.update({
        where: { id },
        data: { recordingId: fields.recordingId },
      });
      return;
    }
    const classStatus =
      status === "recording"
        ? "live"
        : status === "error"
          ? "failed"
          : status === "uploading" || status === "ready"
            ? "ended"
            : "starting";
    await this.db.classOccurrence.updateMany({
      where: {
        id,
        ...(status === "recording"
          ? {
              status: "starting",
              recordingStatus: { in: ["pending", "requesting"] },
            }
          : {}),
        ...(status === "uploading" || status === "error"
          ? { recordingStatus: { not: "ready" } }
          : {}),
      },
      data: {
        recordingStatus: status,
        status: classStatus,
        ...(fields.recordingId ? { recordingId: fields.recordingId } : {}),
        ...(fields.objectKey ? { recordingObjectKey: fields.objectKey } : {}),
        ...(classStatus === "ended" ? { endedAt: new Date() } : {}),
      },
    });
  }
}
