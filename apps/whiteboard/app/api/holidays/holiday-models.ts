import { z } from "zod";

export const DeclareHolidayRequestModel = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: z.string().max(200).nullish(),
});

export const HolidayParamsModel = z.object({ id: z.uuid() });

export const HolidayModel = z.object({
  id: z.uuid(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  reason: z.string().nullable(),
});
