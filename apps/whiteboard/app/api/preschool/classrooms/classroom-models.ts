import { z } from "zod";

const AcademicYearRefModel = z.object({ id: z.uuid(), name: z.string() });

export const PreschoolClassroomModel = z.object({
  id: z.uuid(),
  centreId: z.uuid(),
  academicYearId: z.uuid(),
  programmeId: z.uuid(),
  programmeName: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  childCount: z.number().int(),
  seatsLeft: z.number().int(),
  isArchived: z.boolean(),
  teachers: z.array(z.object({ staffId: z.uuid(), name: z.string() })),
});

export const PreschoolClassroomListResponseModel = z.object({
  academicYear: AcademicYearRefModel,
  items: z.array(PreschoolClassroomModel),
});

export const PreschoolClassroomDetailResponseModel =
  PreschoolClassroomModel.extend({
    roster: z.array(
      z.object({
        childId: z.uuid(),
        firstName: z.string(),
        lastName: z.string().nullable(),
        admissionNumber: z.string(),
        dateOfBirth: z.iso.date(),
        photoUrl: z.string().nullable(),
        fatherPhone: z.string().nullable(),
        motherPhone: z.string().nullable(),
      }),
    ),
  });

export const PreschoolClassroomOptionsResponseModel = z.object({
  academicYear: AcademicYearRefModel,
  programmes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      minAgeMonths: z.number().int().nullable(),
      maxAgeMonths: z.number().int().nullable(),
      isDaycare: z.boolean(),
    }),
  ),
  classrooms: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      programmeId: z.uuid(),
      programmeName: z.string(),
      capacity: z.number().int(),
      childCount: z.number().int(),
      seatsLeft: z.number().int(),
    }),
  ),
});

export const ListPreschoolClassroomsRequestModel = z.object({
  centreId: z.uuid(),
  /** Defaults to the current Academic Year. */
  academicYearId: z.uuid().optional(),
});

export const PreschoolClassroomOptionsRequestModel = z.object({
  centreId: z.uuid(),
});

export const CreatePreschoolClassroomRequestModel = z.object({
  centreId: z.uuid(),
  programmeId: z.uuid(),
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(200),
  /** Defaults to the current Academic Year. */
  academicYearId: z.uuid().optional(),
});

export const UpdatePreschoolClassroomDetailsRequestModel = z.object({
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(200),
});

export const SetPreschoolClassTeachersRequestModel = z.object({
  /** Every Class Teacher; an empty list removes them all. */
  staffIds: z.array(z.uuid()).max(20),
});

export const PreschoolClassroomParamsModel = z.object({ id: z.uuid() });
