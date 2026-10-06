import { z } from "zod";

export const DeclareTrainingInstituteHolidayRequestModel = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: z.string().max(200).nullish(),
});

export const TrainingInstituteHolidayParamsModel = z.object({ id: z.uuid() });

export const TrainingInstituteHolidayModel = z.object({
  id: z.uuid(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: z.string().nullable(),
});
