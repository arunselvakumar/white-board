import { z } from "zod";

const Gender = z.enum(["girl", "boy", "other"]);
const ChildStatus = z.enum(["active", "withdrawn", "graduated"]);
const BloodGroup = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
const OptionalText = (max: number) => z.string().trim().max(max).nullish();
const Phone = z
  .string()
  .trim()
  .max(32)
  .describe("Indian mobile: 10 digits, optionally +91 or 0 first.");
const UpdatedAt = z.iso
  .datetime()
  .optional()
  .describe(
    "The updatedAt the form loaded; a newer save answers 409 CHILD_CHANGED.",
  );

export const PreschoolChildParamsModel = z.object({ id: z.uuid() });

const childDetailsFields = {
  firstName: z.string().trim().min(1).max(100),
  lastName: OptionalText(100),
  dateOfBirth: z.iso.date(),
  gender: Gender,
  bloodGroup: BloodGroup.nullish(),
  photoUrl: z.url().max(2048).nullish(),
  motherTongue: OptionalText(60),
  address: z
    .object({
      line: OptionalText(300),
      city: OptionalText(100),
      state: OptionalText(100),
      pincode: OptionalText(10),
    })
    .nullish(),
};

export const PreschoolChildDetailsModel = z.object(childDetailsFields);

export const PreschoolParentInputModel = z.object({
  name: OptionalText(200),
  phone: Phone.nullish(),
  email: z.email().max(320).nullish(),
  occupation: OptionalText(100),
});

export const PreschoolEmergencyContactInputModel = z.object({
  name: OptionalText(200),
  phone: OptionalText(32),
  relationship: OptionalText(60),
});

export const PreschoolChildHealthInputModel = z.object({
  allergies: OptionalText(2000),
  medicalConditions: OptionalText(2000),
  doctorName: OptionalText(200),
  doctorPhone: OptionalText(32),
  immunisationUpToDate: z.boolean().nullish(),
});

export const PreschoolChildDocumentsInputModel = z.object({
  hasBirthCertificate: z.boolean().optional(),
  hasAadhaar: z.boolean().optional(),
  hasImmunisationCard: z.boolean().optional(),
  hasPhotos: z.boolean().optional(),
  hasAddressProof: z.boolean().optional(),
});

export const PreschoolAuthorisedPickupInputModel = z.object({
  name: z.string().trim().min(1).max(200),
  relationship: z.string().trim().min(1).max(60),
  phone: Phone.min(1),
  photoUrl: z.url().max(2048).nullish(),
});

const Pickups = z.array(PreschoolAuthorisedPickupInputModel).max(6);

const parentsFields = {
  father: PreschoolParentInputModel.nullish(),
  mother: PreschoolParentInputModel.nullish(),
  emergencyContact: PreschoolEmergencyContactInputModel.nullish(),
};

export const AdmitPreschoolChildRequestModel = z.object({
  centreId: z.uuid(),
  child: PreschoolChildDetailsModel,
  ...parentsFields,
  authorisedPickups: Pickups.optional(),
  health: PreschoolChildHealthInputModel.nullish(),
  documents: PreschoolChildDocumentsInputModel.nullish(),
  admission: z.object({
    programmeId: z.uuid(),
    classroomId: z.uuid(),
    admittedOn: z.iso.date().optional().describe("Today in India by default."),
    academicYearId: z
      .uuid()
      .optional()
      .describe("The Classroom's Academic Year by default; must match it."),
    enquiryId: z
      .uuid()
      .optional()
      .describe("An open Enquiry of the same Centre; it becomes Admitted."),
  }),
});

export const UpdatePreschoolChildProfileRequestModel = z.object({
  ...childDetailsFields,
  updatedAt: UpdatedAt,
});

export const UpdatePreschoolChildParentsRequestModel = z.object({
  ...parentsFields,
  updatedAt: UpdatedAt,
});

export const UpdatePreschoolChildHealthRequestModel = z.object({
  health: PreschoolChildHealthInputModel.nullish(),
  documents: PreschoolChildDocumentsInputModel.nullish(),
  updatedAt: UpdatedAt,
});

export const ReplacePreschoolChildPickupsRequestModel = z.object({
  authorisedPickups: Pickups,
  updatedAt: UpdatedAt,
});

export const MovePreschoolChildClassroomRequestModel = z.object({
  classroomId: z.uuid(),
  movedOn: z.iso.date().optional().describe("Today in India by default."),
});

export const PromotePreschoolChildRequestModel = z.object({
  programmeId: z.uuid(),
  classroomId: z.uuid(),
  academicYearId: z.uuid().optional(),
  admittedOn: z.iso
    .date()
    .optional()
    .describe("Today or the year's first day, whichever is later, by default."),
});

export const WithdrawPreschoolChildRequestModel = z.object({
  withdrawnOn: z.iso.date(),
  reason: z.string().trim().min(1).max(300),
});

export const ListPreschoolChildrenRequestModel = z.object({
  centreId: z.uuid(),
  classroomId: z.uuid().optional(),
  status: z
    .enum(["active", "withdrawn", "graduated", "all"])
    .optional()
    .default("active"),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  cursor: z.string().min(1).optional(),
});

export const PreschoolChildOptionsRequestModel = z.object({
  centreId: z.uuid(),
});

const AdmissionModel = z.object({
  id: z.uuid(),
  academicYearId: z.uuid(),
  academicYearName: z.string(),
  programmeId: z.uuid(),
  programmeName: z.string(),
  classroomId: z.uuid(),
  classroomName: z.string(),
  admittedOn: z.iso.date(),
  status: z.enum(["active", "ended"]),
  endedOn: z.iso.date().nullable(),
  endReason: z
    .enum(["promoted", "withdrawn", "classroom_changed", "graduated"])
    .nullable(),
});

const ParentModel = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  occupation: z.string().nullable(),
});

export const PreschoolChildListItemModel = z.object({
  id: z.uuid(),
  centreId: z.uuid(),
  admissionNumber: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  name: z.string(),
  photoUrl: z.string().nullable(),
  dateOfBirth: z.iso.date(),
  ageText: z.string(),
  gender: Gender,
  programmeId: z.uuid().nullable(),
  programmeName: z.string().nullable(),
  classroomId: z.uuid().nullable(),
  classroomName: z.string().nullable(),
  fatherName: z.string().nullable(),
  fatherPhone: z.string().nullable(),
  motherName: z.string().nullable(),
  motherPhone: z.string().nullable(),
  status: ChildStatus,
});

export const ListPreschoolChildrenResponseModel = z.object({
  items: z.array(PreschoolChildListItemModel),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

export const PreschoolChildProfileModel = z.object({
  id: z.uuid(),
  centreId: z.uuid(),
  admissionNumber: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  name: z.string(),
  dateOfBirth: z.iso.date(),
  ageText: z.string(),
  gender: Gender,
  bloodGroup: z.string().nullable(),
  photoUrl: z.string().nullable(),
  motherTongue: z.string().nullable(),
  address: z.object({
    line: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    pincode: z.string().nullable(),
  }),
  father: ParentModel,
  mother: ParentModel,
  emergencyContact: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    relationship: z.string().nullable(),
  }),
  health: z.object({
    allergies: z.string().nullable(),
    medicalConditions: z.string().nullable(),
    doctorName: z.string().nullable(),
    doctorPhone: z.string().nullable(),
    immunisationUpToDate: z.boolean().nullable(),
  }),
  documents: z.object({
    hasBirthCertificate: z.boolean(),
    hasAadhaar: z.boolean(),
    hasImmunisationCard: z.boolean(),
    hasPhotos: z.boolean(),
    hasAddressProof: z.boolean(),
  }),
  status: ChildStatus,
  withdrawnOn: z.iso.date().nullable(),
  withdrawReason: z.string().nullable(),
  currentAdmission: AdmissionModel.nullable(),
  admissions: z.array(AdmissionModel),
  authorisedPickups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      relationship: z.string(),
      phone: z.string(),
      photoUrl: z.string().nullable(),
    }),
  ),
  siblings: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      classroomName: z.string().nullable(),
      status: ChildStatus,
    }),
  ),
  enquiryId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AdmitPreschoolChildResponseModel = z.object({
  child: PreschoolChildProfileModel,
  ageWarning: z.string().nullable(),
});

export const PreschoolChildOptionsResponseModel = z.object({
  centreId: z.uuid(),
  currentAcademicYearId: z.uuid(),
  academicYears: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      startsOn: z.iso.date(),
      endsOn: z.iso.date(),
      isCurrent: z.boolean(),
    }),
  ),
  programmes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      minAgeMonths: z.number().int().nullable(),
      maxAgeMonths: z.number().int().nullable(),
      ageRangeText: z.string().nullable(),
      isDaycare: z.boolean(),
    }),
  ),
  classrooms: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      programmeId: z.uuid(),
      academicYearId: z.uuid(),
      capacity: z.number().int(),
      filled: z.number().int(),
      seatsLeft: z.number().int(),
    }),
  ),
});
