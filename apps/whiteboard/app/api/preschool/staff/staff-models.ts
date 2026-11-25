import { z } from "zod";

const StaffRoleModel = z.enum(["centre_head", "teacher", "helper"]);

export const PreschoolStaffModel = z.object({
  id: z.uuid(),
  centreId: z.uuid(),
  name: z.string(),
  role: StaffRoleModel,
  status: z.enum(["active", "inactive"]),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  designation: z.string().nullable(),
  joinedOn: z.iso.date().nullable(),
  invitedAt: z.iso.datetime().nullable(),
  canSignIn: z.boolean(),
  classrooms: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export const PreschoolStaffListResponseModel = z.object({
  items: z.array(PreschoolStaffModel),
});

export const PreschoolStaffInvitationResponseModel = z.object({
  staff: PreschoolStaffModel,
  invitation: z.enum(["sent", "already_member", "failed", "not_sent"]),
});

export const ListPreschoolStaffRequestModel = z.object({ centreId: z.uuid() });

/** Blank or omitted optional fields are cleared. */
export const PreschoolStaffDetailsRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  role: StaffRoleModel,
  phone: z.string().trim().max(32).nullable().optional(),
  /** Needed for a Centre Head or Teacher to sign in. */
  email: z
    .union([z.string().trim().max(320).pipe(z.email()), z.literal("")])
    .nullable()
    .optional(),
  designation: z.string().trim().max(100).nullable().optional(),
  joinedOn: z.iso.date().nullable().optional(),
});

export const CreatePreschoolStaffRequestModel =
  PreschoolStaffDetailsRequestModel.extend({
    centreId: z.uuid(),
    /** Classrooms of the same Centre this member is Class Teacher of. */
    classroomIds: z.array(z.uuid()).max(20).optional(),
  });

export const PreschoolStaffParamsModel = z.object({ id: z.uuid() });
