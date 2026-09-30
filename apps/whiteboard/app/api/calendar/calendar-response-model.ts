import { z } from "zod";

export const CalendarItemModel = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  batchName: z.string(),
  courseId: z.uuid(),
  courseName: z.string(),
  studentName: z.string().nullable(),
  classMode: z.enum(["offline", "online", "hybrid"]),
  room: z.string().nullable(),
  joinUrl: z.string().nullable(),
  meetingOption: z.enum(["external", "whiteboard"]),
  timezone: z.string(),
  timings: z.array(z.object({ daysOfWeek: z.array(z.number().int().min(0).max(6)), startTime: z.string(), endTime: z.string() })),
  activeFrom: z.iso.datetime(),
});

export const CalendarResponseModel = z.object({ items: z.array(CalendarItemModel) });
