import { z } from "zod";

export const ClassParamsModel = z.object({
  batchId: z.uuid(),
  date: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const ClassDetailResponseModel = z.object({
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
  status: z.enum(["scheduled", "starting", "live", "ended", "failed"]),
  recordingStatus: z.enum(["pending", "requesting", "recording", "uploading", "ready", "error"]).nullable(),
  recordingReady: z.boolean(),
});

export const ClassTokenResponseModel = z.object({ authToken: z.string() });
