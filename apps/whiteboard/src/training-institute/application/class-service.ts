import {
  classAt,
  clockMinutes,
  localNow,
  type ClassSlotTime,
  type ScheduledClass,
} from "../domain/class-schedule";
import { DomainError } from "../domain/errors";
import type {
  CalendarItem,
  CalendarRole,
  CalendarScheduleReader,
} from "./calendar-schedule";
import type { ClassExceptionsReader } from "./class-change-handlers";

export type ClassKey = {
  workspaceId: string;
  batchId: string;
  date: string;
  startTime: string;
};

export type ClassActor = ClassKey & {
  userId: string;
  role: CalendarRole;
  verifiedEmails?: string[];
};

export type ClassOccurrenceRecord = ClassKey & {
  id: string;
  endTime: string;
  providerMeetingId: string | null;
  status: "starting" | "live" | "ended" | "failed";
  recordingId: string | null;
  recordingStatus:
    "pending" | "requesting" | "recording" | "uploading" | "ready" | "error";
  recordingObjectKey: string | null;
};

export type ClassOccurrenceStore = {
  find(key: ClassKey): Promise<ClassOccurrenceRecord | null>;
  /**
   * Creates the occurrence under the Batch's schedule lock after `verify`
   * passes, so a Class can't be started while it is being cancelled.
   */
  claim(
    input: ClassKey & { endTime: string; startedByUserId: string },
    verify: () => Promise<void>,
  ): Promise<{ occurrence: ClassOccurrenceRecord; claimed: boolean }>;
  setMeeting(id: string, meetingId: string): Promise<void>;
  findByMeetingId(meetingId: string): Promise<ClassOccurrenceRecord | null>;
  claimRecording(id: string): Promise<boolean>;
  markEnded(id: string): Promise<void>;
  setRecordingStatus(
    id: string,
    status: ClassOccurrenceRecord["recordingStatus"],
    fields?: { recordingId?: string; objectKey?: string },
  ): Promise<void>;
};

export type MeetingGateway = {
  ensureConfigured(): void;
  createMeeting(title: string): Promise<string>;
  addParticipant(
    meetingId: string,
    input: { userId: string; name: string; host: boolean },
  ): Promise<string>;
  startRecording(
    meetingId: string,
    occurrence: ClassOccurrenceRecord,
  ): Promise<string>;
  endMeeting(meetingId: string): Promise<void>;
  deactivateMeeting(meetingId: string): Promise<void>;
};

export type ClassDetail = {
  batchId: string;
  batchName: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  meetingOption: "external" | "whiteboard";
  joinUrl: string | null;
  isHost: boolean;
  status: "scheduled" | "cancelled" | ClassOccurrenceRecord["status"];
  recordingStatus: ClassOccurrenceRecord["recordingStatus"] | null;
  recordingReady: boolean;
  /** Set when this Class won't happen at this slot. */
  classChange: {
    status: "cancelled" | "moved" | "holiday";
    reason: string | null;
    movedTo: ClassSlotTime | null;
  } | null;
  /** Set when this slot is the new time of a Moved Class. */
  rescheduledFrom: { date: string; startTime: string } | null;
};

const localDateAndMinutes = localNow;

function notHappening(scheduled: ScheduledClass): DomainError {
  const movedTo = scheduled.change?.movedTo;
  return new DomainError(
    "CLASS_CANCELLED",
    scheduled.status === "moved" && movedTo != null
      ? `This Class has moved to ${movedTo.date} at ${movedTo.startTime}.`
      : scheduled.status === "holiday"
        ? "This Class is off for a Holiday."
        : "This Class has been cancelled.",
  );
}

export class ClassService {
  constructor(
    private readonly deps: {
      schedule: CalendarScheduleReader;
      exceptions: ClassExceptionsReader;
      occurrences: ClassOccurrenceStore;
      meetings: MeetingGateway;
      now: () => Date;
    },
  ) {}

  private async context(
    input: ClassActor,
    includeClosed = false,
  ): Promise<{
    item: CalendarItem;
    scheduled: ScheduledClass;
    endTime: string;
    isHost: boolean;
  }> {
    const items = (
      await this.deps.schedule.execute({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        verifiedEmails: input.verifiedEmails,
        includeClosed,
      })
    ).filter(
      (item) => item.batchId === input.batchId && item.classMode !== "offline",
    );
    const { changes, holidays } =
      items.length === 0
        ? { changes: [], holidays: [] }
        : await this.deps.exceptions.forBatches(input.workspaceId, [
            input.batchId,
          ]);
    const found = items
      .map((item) => ({
        item,
        scheduled: classAt(
          {
            batchId: item.batchId,
            timings: item.timings,
            firstDate: localDateAndMinutes(
              new Date(item.activeFrom),
              item.timezone,
            ).date,
          },
          input,
          changes,
          holidays,
        ),
      }))
      .sort(
        (a, b) =>
          Number(b.scheduled?.status === "scheduled") -
          Number(a.scheduled?.status === "scheduled"),
      )
      .find(({ scheduled }) => scheduled != null);
    if (found?.scheduled == null)
      throw new DomainError("CLASS_NOT_FOUND", "Class not found.");
    return {
      item: found.item,
      scheduled: found.scheduled,
      endTime: found.scheduled.endTime,
      isHost: input.role === "org:admin" || input.role === "org:teacher",
    };
  }

  async get(input: ClassActor): Promise<ClassDetail> {
    const occurrence = await this.deps.occurrences.find(input);
    let item: CalendarItem;
    let endTime: string;
    let isHost: boolean;
    let scheduled: ScheduledClass | null = null;
    try {
      ({ item, endTime, isHost, scheduled } = await this.context(input, true));
    } catch (error) {
      if (
        !(error instanceof DomainError) ||
        error.code !== "CLASS_NOT_FOUND" ||
        occurrence?.recordingStatus !== "ready" ||
        (input.role !== "org:admin" && input.role !== "org:teacher")
      )
        throw error;
      const items = await this.deps.schedule.execute({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        includeClosed: true,
      });
      const historical = items.find(
        (candidate) => candidate.batchId === input.batchId,
      );
      if (historical == null) throw error;
      item = historical;
      endTime = occurrence.endTime;
      isHost = true;
    }
    const option = occurrence == null ? item.meetingOption : "whiteboard";
    return {
      batchId: item.batchId,
      batchName: item.batchName,
      courseName: item.courseName,
      date: input.date,
      startTime: input.startTime,
      endTime,
      timezone: item.timezone,
      meetingOption: option,
      // A cancelled Class offers no way in, even through its external link.
      joinUrl:
        option === "external" &&
        (scheduled == null || scheduled.status === "scheduled")
          ? item.joinUrl
          : null,
      isHost,
      status:
        occurrence?.status ??
        (scheduled != null && scheduled.status !== "scheduled"
          ? "cancelled"
          : "scheduled"),
      recordingStatus: occurrence?.recordingStatus ?? null,
      // Reaching here means this User may see the Class, so they may also
      // download its recording: a host, or a Student or Parent whose active
      // Enrollment has this Class (ADR-0031).
      recordingReady: occurrence?.recordingStatus === "ready",
      classChange:
        scheduled != null && scheduled.status !== "scheduled"
          ? {
              status: scheduled.status,
              reason: scheduled.reason,
              movedTo:
                scheduled.status === "moved"
                  ? (scheduled.change?.movedTo ?? null)
                  : null,
            }
          : null,
      rescheduledFrom:
        scheduled?.rescheduled === true && scheduled.change != null
          ? {
              date: scheduled.change.date,
              startTime: scheduled.change.startTime,
            }
          : null,
    };
  }

  async start(input: ClassActor, name: string): Promise<{ authToken: string }> {
    const { item, endTime, isHost, scheduled } = await this.context(input);
    if (scheduled.status !== "scheduled") throw notHappening(scheduled);
    if (!isHost)
      throw new DomainError(
        "CLASS_FORBIDDEN",
        "Only the Owner or assigned Teacher can start this class.",
      );
    if (item.meetingOption !== "whiteboard")
      throw new DomainError(
        "CLASS_NOT_HOSTED",
        "This Batch uses an external meeting link.",
      );
    const local = localDateAndMinutes(this.deps.now(), item.timezone);
    if (
      local.date !== input.date ||
      local.minutes < clockMinutes(input.startTime) - 15 ||
      local.minutes > clockMinutes(endTime) + 30
    ) {
      throw new DomainError(
        "CLASS_NOT_IN_PROGRESS",
        "This class can start from 15 minutes before its Timing until 30 minutes after it ends.",
      );
    }
    this.deps.meetings.ensureConfigured();
    const claim = await this.deps.occurrences.claim(
      { ...input, endTime, startedByUserId: input.userId },
      async () => {
        const current = await this.context(input);
        if (current.scheduled.status !== "scheduled")
          throw notHappening(current.scheduled);
      },
    );
    const occurrence = claim.occurrence;
    if (occurrence.status === "ended" || occurrence.status === "failed")
      throw new DomainError("CLASS_ENDED", "This class has ended.");
    let meetingId = occurrence.providerMeetingId;
    if (meetingId == null) {
      if (!claim.claimed)
        throw new DomainError(
          "CLASS_STARTING",
          "The class is starting. Please try again shortly.",
        );
      meetingId = await this.deps.meetings.createMeeting(
        `${item.courseName} · ${item.batchName}`,
      );
      await this.deps.occurrences.setMeeting(occurrence.id, meetingId);
    }
    return {
      authToken: await this.deps.meetings.addParticipant(meetingId, {
        userId: input.userId,
        name,
        host: true,
      }),
    };
  }

  async join(input: ClassActor, name: string): Promise<{ authToken: string }> {
    const { item, endTime, isHost, scheduled } = await this.context(input);
    if (scheduled.status !== "scheduled") throw notHappening(scheduled);
    if (item.meetingOption !== "whiteboard")
      throw new DomainError(
        "CLASS_NOT_HOSTED",
        "This Batch uses an external meeting link.",
      );
    const local = localDateAndMinutes(this.deps.now(), item.timezone);
    if (local.date !== input.date || local.minutes > clockMinutes(endTime) + 30)
      throw new DomainError(
        "CLASS_NOT_IN_PROGRESS",
        "This class is no longer open for joining.",
      );
    const occurrence = await this.deps.occurrences.find(input);
    if (
      occurrence?.providerMeetingId == null ||
      occurrence.status !== "live" ||
      occurrence.recordingStatus !== "recording"
    ) {
      throw new DomainError(
        "CLASS_NOT_READY",
        "Wait for the Teacher to start the recorded class.",
      );
    }
    return {
      authToken: await this.deps.meetings.addParticipant(
        occurrence.providerMeetingId,
        { userId: input.userId, name, host: isHost },
      ),
    };
  }

  async meetingStarted(meetingId: string): Promise<void> {
    const occurrence = await this.deps.occurrences.findByMeetingId(meetingId);
    if (
      occurrence == null ||
      occurrence.recordingId != null ||
      !(await this.deps.occurrences.claimRecording(occurrence.id))
    )
      return;
    try {
      const recordingId = await this.deps.meetings.startRecording(
        meetingId,
        occurrence,
      );
      await this.deps.occurrences.setRecordingStatus(occurrence.id, "pending", {
        recordingId,
      });
    } catch (error) {
      await this.deps.occurrences.setRecordingStatus(occurrence.id, "error");
      await this.deps.meetings.endMeeting(meetingId);
      throw error;
    }
  }

  async meetingEnded(meetingId: string): Promise<void> {
    const occurrence = await this.deps.occurrences.findByMeetingId(meetingId);
    if (occurrence != null) {
      await this.deps.occurrences.markEnded(occurrence.id);
      await this.deps.meetings.deactivateMeeting(meetingId);
    }
  }

  async recordingChanged(input: {
    meetingId: string;
    recordingId: string;
    status: string;
    outputFileName?: string;
  }): Promise<void> {
    const occurrence = await this.deps.occurrences.findByMeetingId(
      input.meetingId,
    );
    if (
      occurrence == null ||
      (occurrence.recordingId != null &&
        occurrence.recordingId !== input.recordingId)
    )
      return;
    if (input.status === "RECORDING")
      await this.deps.occurrences.setRecordingStatus(
        occurrence.id,
        "recording",
        { recordingId: input.recordingId },
      );
    if (input.status === "UPLOADING")
      await this.deps.occurrences.setRecordingStatus(
        occurrence.id,
        "uploading",
        { recordingId: input.recordingId },
      );
    if (input.status === "ERRORED" || input.status === "PAUSED") {
      await this.deps.occurrences.setRecordingStatus(occurrence.id, "error", {
        recordingId: input.recordingId,
      });
      if (occurrence.status !== "ended")
        await this.deps.meetings.endMeeting(input.meetingId);
    }
    if (
      input.status === "UPLOADED" &&
      input.outputFileName != null &&
      /^[A-Za-z0-9_.-]+\.mp4$/.test(input.outputFileName)
    ) {
      await this.deps.occurrences.setRecordingStatus(occurrence.id, "ready", {
        recordingId: input.recordingId,
        objectKey: `${occurrence.workspaceId}/${occurrence.id}/${input.outputFileName}`,
      });
    }
  }

  async recordingObjectKey(input: ClassActor): Promise<string> {
    if (input.role === "org:admin" || input.role === "org:teacher") {
      const items = await this.deps.schedule.execute({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        includeClosed: true,
      });
      if (!items.some((item) => item.batchId === input.batchId))
        throw new DomainError("CLASS_NOT_FOUND", "Class recording not found.");
    } else {
      // A Student or Parent may download only a Class of an active Enrollment,
      // on or after the date it began (ADR-0031).
      await this.context(input).catch((error: unknown) => {
        if (error instanceof DomainError && error.code === "CLASS_NOT_FOUND")
          throw new DomainError(
            "CLASS_NOT_FOUND",
            "Class recording not found.",
          );
        throw error;
      });
    }
    const occurrence = await this.deps.occurrences.find(input);
    if (
      occurrence?.recordingStatus !== "ready" ||
      occurrence.recordingObjectKey == null
    )
      throw new DomainError(
        "CLASS_NOT_READY",
        "The recording is not ready to download.",
      );
    return occurrence.recordingObjectKey;
  }
}
