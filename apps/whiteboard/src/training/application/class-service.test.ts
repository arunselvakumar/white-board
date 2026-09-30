import { describe, expect, it } from "vitest";

import { ClassService, type ClassOccurrenceRecord, type ClassOccurrenceStore, type MeetingGateway } from "./class-service";
import type { CalendarItem, CalendarScheduleReader } from "./calendar-schedule";
import { DomainError } from "../domain/errors";

const item: CalendarItem = {
  id: "660e8400-e29b-41d4-a716-446655440000",
  batchId: "660e8400-e29b-41d4-a716-446655440000",
  batchName: "Morning Batch",
  courseId: "550e8400-e29b-41d4-a716-446655440000",
  courseName: "DCA",
  studentName: null,
  classMode: "online",
  room: null,
  joinUrl: "https://meet.google.com/example",
  meetingOption: "external",
  timezone: "Asia/Kolkata",
  timings: [{ daysOfWeek: [3], startTime: "09:00", endTime: "10:00" }],
  activeFrom: "2026-09-01T00:00:00.000Z",
};

function service(items: CalendarItem[] = [item], configured = true) {
  const schedule: CalendarScheduleReader = { execute: () => Promise.resolve(items) };
  const occurrences: ClassOccurrenceStore = {
    find: () => Promise.resolve(null),
    claim: () => Promise.reject(new Error("unexpected claim")),
    setMeeting: () => Promise.reject(new Error("unexpected meeting")),
    setRecordingStatus: () => Promise.reject(new Error("unexpected recording")),
    findByMeetingId: () => Promise.resolve(null),
    claimRecording: () => Promise.reject(new Error("unexpected recording")),
    markEnded: () => Promise.reject(new Error("unexpected ending")),
  };
  const meetings: MeetingGateway = {
    ensureConfigured: () => { if (!configured) throw new DomainError("CLASS_NOT_CONFIGURED", "Cloudflare setup is missing."); },
    createMeeting: () => Promise.reject(new Error("unexpected meeting")),
    addParticipant: () => Promise.reject(new Error("unexpected participant")),
    startRecording: () => Promise.reject(new Error("unexpected recording")),
    endMeeting: () => Promise.reject(new Error("unexpected ending")),
    deactivateMeeting: () => Promise.reject(new Error("unexpected ending")),
  };
  return new ClassService({ schedule, occurrences, meetings, now: () => new Date("2026-09-30T03:30:00.000Z") });
}

const input = { workspaceId: "org_1", userId: "user_1", role: "org:admin" as const, batchId: item.batchId, date: "2026-09-30", startTime: "09:00" };

describe("ClassService", () => {
  it("shows the external link on the pre-join page", async () => {
    const result = await service().get(input);
    expect(result.meetingOption).toBe("external");
    expect(result.joinUrl).toBe("https://meet.google.com/example");
  });

  it("returns 404 for a Batch absent from the User's schedule", async () => {
    await expect(service([]).get(input)).rejects.toMatchObject({ code: "CLASS_NOT_FOUND" });
  });

  it("refuses to start a Whiteboard class outside its Timing", async () => {
    const hosted = { ...item, meetingOption: "whiteboard" as const, joinUrl: null };
    await expect(service([hosted]).start({ ...input, date: "2026-10-07" }, "Teacher")).rejects.toMatchObject({ code: "CLASS_NOT_IN_PROGRESS" });
  });

  it("checks Cloudflare configuration before reserving a class occurrence", async () => {
    const hosted = { ...item, meetingOption: "whiteboard" as const, joinUrl: null };
    await expect(service([hosted], false).start(input, "Teacher")).rejects.toMatchObject({ code: "CLASS_NOT_CONFIGURED" });
  });

  it("admits Students only after recording starts and restricts downloads to hosts", async () => {
    const hosted = { ...item, meetingOption: "whiteboard" as const, joinUrl: null };
    let occurrence: ClassOccurrenceRecord | null = null;
    let recordingClaims = 0;
    let deactivated = false;
    const store: ClassOccurrenceStore = {
      find: () => Promise.resolve(occurrence),
      claim: (key) => {
        occurrence = { ...key, id: "occ_1", providerMeetingId: null, status: "starting", recordingId: null, recordingStatus: "pending", recordingObjectKey: null };
        return Promise.resolve({ occurrence, claimed: true });
      },
      setMeeting: (_id, meetingId) => { if (occurrence) occurrence.providerMeetingId = meetingId; return Promise.resolve(); },
      findByMeetingId: (meetingId) => Promise.resolve(occurrence?.providerMeetingId === meetingId ? occurrence : null),
      claimRecording: () => { recordingClaims++; return Promise.resolve(recordingClaims === 1); },
      setRecordingStatus: (_id, status, fields) => {
        if (occurrence) {
          if (status !== "pending") occurrence.recordingStatus = status;
          if (status === "recording") occurrence.status = "live";
          if (status === "ready") occurrence.status = "ended";
          if (fields?.recordingId) occurrence.recordingId = fields.recordingId;
          if (fields?.objectKey) occurrence.recordingObjectKey = fields.objectKey;
        }
        return Promise.resolve();
      },
      markEnded: () => { if (occurrence) occurrence.status = "ended"; return Promise.resolve(); },
    };
    const meetings: MeetingGateway = {
      ensureConfigured: () => undefined,
      createMeeting: () => Promise.resolve("meeting_1"),
      addParticipant: () => Promise.resolve("participant_token"),
      startRecording: () => Promise.resolve("recording_1"),
      endMeeting: () => Promise.resolve(),
      deactivateMeeting: () => { deactivated = true; return Promise.resolve(); },
    };
    const sut = new ClassService({ schedule: { execute: () => Promise.resolve([hosted]) }, occurrences: store, meetings, now: () => new Date("2026-09-30T03:30:00.000Z") });
    const student = { ...input, role: "org:student" as const, userId: "student_1" };
    expect(await sut.start(input, "Teacher")).toEqual({ authToken: "participant_token" });
    await expect(sut.join(student, "Asha")).rejects.toMatchObject({ code: "CLASS_NOT_READY" });
    await sut.meetingStarted("meeting_1");
    await sut.meetingStarted("meeting_1");
    expect(recordingClaims).toBe(1);
    await sut.recordingChanged({ meetingId: "meeting_1", recordingId: "recording_1", status: "RECORDING" });
    expect(await sut.join(student, "Asha")).toEqual({ authToken: "participant_token" });
    await sut.recordingChanged({ meetingId: "meeting_1", recordingId: "recording_1", status: "UPLOADED", outputFileName: "class.mp4" });
    await expect(sut.recordingObjectKey(student)).rejects.toMatchObject({ code: "CLASS_NOT_FOUND" });
    expect(await sut.recordingObjectKey(input)).toBe("org_1/occ_1/class.mp4");
    hosted.timings = [{ daysOfWeek: [3], startTime: "11:00", endTime: "12:00" }];
    expect(await sut.get(input)).toMatchObject({ status: "ended", recordingReady: true, startTime: "09:00" });
    expect(await sut.recordingObjectKey(input)).toBe("org_1/occ_1/class.mp4");
    await sut.meetingEnded("meeting_1");
    expect(deactivated).toBe(true);
  });
});
