import { z } from "zod";

export const PreschoolObservationParamsModel = z.object({ id: z.uuid() });

export const PreschoolDevelopmentDomainModel = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export const ListPreschoolDomainsRequestModel = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .describe("The Owner may ask for archived Domains too."),
});

export const ListPreschoolDomainsResponseModel = z.object({
  items: z.array(PreschoolDevelopmentDomainModel),
});

export const SavePreschoolDomainRequestModel = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
});

export const CreatePreschoolObservationRequestModel = z.object({
  childId: z.uuid(),
  domainId: z.uuid(),
  observedOn: z.iso
    .date()
    .optional()
    .describe("Today in India by default; never a day ahead."),
  note: z.string().trim().min(1).max(2000),
});

export const UpdatePreschoolObservationRequestModel = z.object({
  domainId: z.uuid(),
  observedOn: z.iso.date(),
  note: z.string().trim().min(1).max(2000),
});

export const ListPreschoolObservationsRequestModel = z.object({
  childId: z.uuid().optional().describe("One Child's, or …"),
  classroomId: z.uuid().optional().describe("… the Classroom's roster's."),
  domainId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  cursor: z.string().min(1).optional(),
});

export const PreschoolObservationModel = z.object({
  id: z.uuid(),
  childId: z.uuid(),
  childName: z.string(),
  domainId: z.uuid(),
  domainName: z.string(),
  observedOn: z.iso.date(),
  note: z.string(),
  createdByUserId: z.string(),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  canEdit: z.boolean(),
});

export const ListPreschoolObservationsResponseModel = z.object({
  items: z.array(PreschoolObservationModel),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});
