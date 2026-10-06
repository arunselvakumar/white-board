import { z } from "zod";

import { TrainingInstituteClassChangeModel } from "../classes/class-change-models";
import { TrainingInstituteHolidayModel } from "../holidays/holiday-models";

export const TrainingInstituteCalendarItemModel = z.object({
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
  timings: z.array(
    z.object({
      daysOfWeek: z.array(z.number().int().min(0).max(6)),
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
  activeFrom: z.iso.datetime(),
});

export const TrainingInstituteCalendarResponseModel = z.object({
  items: z.array(TrainingInstituteCalendarItemModel),
  classChanges: z.array(TrainingInstituteClassChangeModel),
  holidays: z.array(TrainingInstituteHolidayModel),
  permissions: z.object({
    changeClasses: z.boolean(),
    manageHolidays: z.boolean(),
  }),
});
