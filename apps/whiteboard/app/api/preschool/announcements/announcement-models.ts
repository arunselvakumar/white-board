import { z } from "zod";

const Kind = z.enum(["notice", "event", "holiday"]);

export const PreschoolAnnouncementParamsModel = z.object({ id: z.uuid() });

const contentFields = {
  kind: Kind,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  startsOn: z.iso
    .date()
    .nullish()
    .describe("Required for an event or holiday; none for a notice."),
  endsOn: z.iso
    .date()
    .nullish()
    .describe("On or after startsOn; startsOn by default."),
};

export const CreatePreschoolAnnouncementRequestModel = z.object({
  centreId: z
    .uuid()
    .nullable()
    .describe("Null: every Centre (the Owner only)."),
  classroomId: z
    .uuid()
    .nullish()
    .describe("Null or left out: the whole Centre."),
  ...contentFields,
});

export const UpdatePreschoolAnnouncementRequestModel = z.object(contentFields);

export const ListPreschoolAnnouncementsRequestModel = z.object({
  centreId: z.uuid(),
  kind: Kind.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});

export const PreschoolUpcomingAnnouncementsRequestModel = z.object({
  centreId: z.uuid(),
});

export const PreschoolFamilyAnnouncementsRequestModel = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().min(1).optional(),
});

export const PreschoolAnnouncementModel = z.object({
  id: z.uuid(),
  centreId: z.uuid().nullable(),
  classroomId: z.uuid().nullable(),
  audience: z.string(),
  kind: Kind,
  title: z.string(),
  body: z.string(),
  startsOn: z.iso.date().nullable(),
  endsOn: z.iso.date().nullable(),
  publishedAt: z.iso.datetime(),
  createdByUserId: z.string(),
  createdByName: z.string(),
  updatedAt: z.iso.datetime(),
  canEdit: z.boolean(),
});

export const ListPreschoolAnnouncementsResponseModel = z.object({
  items: z.array(PreschoolAnnouncementModel),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

export const PreschoolUpcomingAnnouncementsResponseModel = z.object({
  items: z.array(PreschoolAnnouncementModel),
});

export const PreschoolFamilyAnnouncementsResponseModel =
  ListPreschoolAnnouncementsResponseModel.extend({
    upcoming: z.array(PreschoolAnnouncementModel),
  });
