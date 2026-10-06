import { z } from "zod";

export const TrainingInstituteClassParamsModel = z.object({
  batchId: z.uuid(),
  date: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const TrainingInstituteClassDetailResponseModel = z.object({
  batchId: z.uuid(),
  batchName: z.string(),
  courseName: z.string(),
  date: z.iso.date(),
  startTime: z.string(),
  endTime: z.string(),
  timezone: z.string(),
  meetingOption: z.enum(["external", "whiteboard"]),
  joinUrl: z.string().nullable(),
  isHost: z.boolean(),
  status: z
    .enum(["scheduled", "cancelled", "starting", "live", "ended", "failed"])
    .describe(
      "`cancelled` means the Class is not happening at this slot: cancelled, moved away, or on a Holiday. `classChange.status` says which.",
    ),
  recordingStatus: z
    .enum(["pending", "requesting", "recording", "uploading", "ready", "error"])
    .nullable(),
  recordingReady: z.boolean(),
  classChange: z
    .object({
      status: z.enum(["cancelled", "moved", "holiday"]),
      reason: z.string().nullable(),
      movedTo: z
        .object({
          date: z.iso.date(),
          startTime: z.string(),
          endTime: z.string(),
        })
        .nullable(),
    })
    .nullable(),
  rescheduledFrom: z
    .object({ date: z.iso.date(), startTime: z.string() })
    .nullable(),
});

export const TrainingInstituteClassTokenResponseModel = z.object({
  authToken: z.string(),
});
