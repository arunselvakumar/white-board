import { z } from "zod";

export const PreschoolAcademicYearModel = z.object({
  id: z.uuid(),
  name: z.string(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  isCurrent: z.boolean(),
});

export const PreschoolAcademicYearListResponseModel = z.object({
  items: z.array(PreschoolAcademicYearModel),
});

export const PreschoolAcademicYearParamsModel = z.object({ id: z.uuid() });
