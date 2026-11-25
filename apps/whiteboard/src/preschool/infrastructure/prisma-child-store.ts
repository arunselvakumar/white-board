import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  ChildListParams,
  ChildReader,
  ChildStore,
  LockedChild,
  PickupFields,
} from "../application/child-ports";
import type {
  AdmissionView,
  ChildListItemView,
  ChildProfileView,
  SiblingView,
} from "../application/child-views";
import { childName } from "../domain/child";
import { fromIsoDate, toIsoDate, type IsoDate } from "../domain/dates";

type Db = PrismaClient | Prisma.TransactionClient;

const activeAdmission = {
  where: { status: "active" },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: 1,
} satisfies Prisma.PreschoolChild$admissionsArgs;

const listSelect = {
  id: true,
  centreId: true,
  admissionNumber: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  dateOfBirth: true,
  gender: true,
  fatherName: true,
  fatherPhone: true,
  motherName: true,
  motherPhone: true,
  status: true,
  admissions: {
    ...activeAdmission,
    select: {
      programmeId: true,
      classroomId: true,
      programme: { select: { name: true } },
      classroom: { select: { name: true } },
    },
  },
} satisfies Prisma.PreschoolChildSelect;

const admissionSelect = {
  id: true,
  academicYearId: true,
  programmeId: true,
  classroomId: true,
  admittedOn: true,
  status: true,
  endedOn: true,
  endReason: true,
  academicYear: { select: { name: true } },
  programme: { select: { name: true } },
  classroom: { select: { name: true } },
} satisfies Prisma.PreschoolAdmissionSelect;

type AdmissionRow = Prisma.PreschoolAdmissionGetPayload<{
  select: typeof admissionSelect;
}>;

function toAdmission(row: AdmissionRow): AdmissionView {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear.name,
    programmeId: row.programmeId,
    programmeName: row.programme.name,
    classroomId: row.classroomId,
    classroomName: row.classroom.name,
    admittedOn: toIsoDate(row.admittedOn),
    status: row.status,
    endedOn: row.endedOn == null ? null : toIsoDate(row.endedOn),
    endReason: row.endReason,
  };
}

function dateField(date: IsoDate | null | undefined): Date | null | undefined {
  if (date === undefined) return undefined;
  return date == null ? null : fromIsoDate(date);
}

/** Children, Admissions and Authorised Pickups in Postgres, both sides. */
export class PrismaChildStore implements ChildStore, ChildReader {
  constructor(private readonly db: Db = prisma) {}

  transaction<T>(work: (store: ChildStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaChildStore(tx)));
  }

  async classroom(workspaceId: string, id: string) {
    const row = await this.db.preschoolClassroom.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: {
        id: true,
        centreId: true,
        programmeId: true,
        academicYearId: true,
        archivedAt: true,
        name: true,
        capacity: true,
      },
    });
    if (row == null) return null;
    const { archivedAt, ...rest } = row;
    return { ...rest, archived: archivedAt != null };
  }

  async lockSeats(classroomId: string) {
    const rows = await this.db.$queryRaw<{ capacity: number }[]>`
      SELECT capacity FROM preschool.classrooms
      WHERE id = ${classroomId}::uuid
      FOR UPDATE`;
    const filled = await this.db.preschoolAdmission.count({
      where: { classroomId, status: "active" },
    });
    return { capacity: rows[0]?.capacity ?? 0, filled };
  }

  async programme(workspaceId: string, id: string) {
    const row = await this.db.preschoolProgramme.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        minAgeMonths: true,
        maxAgeMonths: true,
        archivedAt: true,
      },
    });
    if (row == null) return null;
    const { archivedAt, ...rest } = row;
    return { ...rest, archived: archivedAt != null };
  }

  async academicYear(workspaceId: string, id: string) {
    const row = await this.db.preschoolAcademicYear.findFirst({
      where: { id, workspaceId },
      select: { id: true, startsOn: true },
    });
    return row == null
      ? null
      : { id: row.id, startsOn: toIsoDate(row.startsOn) };
  }

  async takeAdmissionSequence(workspaceId: string, centreId: string) {
    const rows = await this.db.$queryRaw<{ code: string; sequence: number }[]>`
      UPDATE preschool.centres
      SET next_admission_seq = next_admission_seq + 1
      WHERE id = ${centreId}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      RETURNING code, next_admission_seq - 1 AS sequence`;
    const row = rows[0];
    if (row == null) throw new Error("The Centre was not found.");
    return { centreCode: row.code, sequence: row.sequence };
  }

  async lockEnquiry(workspaceId: string, id: string) {
    const rows = await this.db.$queryRaw<
      { id: string; centre_id: string; status: LockedEnquiryStatus }[]
    >`
      SELECT id, centre_id, status::text AS status FROM preschool.enquiries
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`;
    const row = rows[0];
    return row == null
      ? null
      : { id: row.id, centreId: row.centre_id, status: row.status };
  }

  async markEnquiryAdmitted(
    input: Parameters<ChildStore["markEnquiryAdmitted"]>[0],
  ) {
    await this.db.preschoolEnquiry.update({
      where: { id: input.enquiryId, workspaceId: input.workspaceId },
      data: {
        status: "admitted",
        convertedChildId: input.childId,
        convertedAt: input.at,
        nextFollowUpOn: null,
      },
    });
    await this.db.preschoolEnquiryActivity.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        enquiryId: input.enquiryId,
        kind: "status_change",
        toStatus: "admitted",
        createdByUserId: input.author.userId,
        createdByName: input.author.userName,
        createdAt: input.at,
      },
    });
  }

  async insertChild(
    child: Parameters<ChildStore["insertChild"]>[0],
    pickups: PickupFields[],
  ): Promise<void> {
    await this.db.preschoolChild.create({
      data: { ...child, dateOfBirth: fromIsoDate(child.dateOfBirth) },
    });
    await this.insertPickups(child.workspaceId, child.id, pickups);
  }

  async insertAdmission(
    admission: Parameters<ChildStore["insertAdmission"]>[0],
  ): Promise<void> {
    await this.db.preschoolAdmission.create({
      data: { ...admission, admittedOn: fromIsoDate(admission.admittedOn) },
    });
  }

  async lockChild(
    workspaceId: string,
    id: string,
  ): Promise<LockedChild | null> {
    const locked = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM preschool.children
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await this.db.preschoolChild.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        centreId: true,
        status: true,
        dateOfBirth: true,
        fatherEmail: true,
        motherEmail: true,
        updatedAt: true,
        admissions: {
          ...activeAdmission,
          select: {
            id: true,
            classroomId: true,
            programmeId: true,
            academicYearId: true,
            admittedOn: true,
            academicYear: { select: { startsOn: true } },
          },
        },
      },
    });
    const current = row.admissions[0];
    return {
      id: row.id,
      centreId: row.centreId,
      status: row.status,
      dateOfBirth: toIsoDate(row.dateOfBirth),
      fatherEmail: row.fatherEmail,
      motherEmail: row.motherEmail,
      updatedAt: row.updatedAt.toISOString(),
      current:
        current == null
          ? null
          : {
              id: current.id,
              classroomId: current.classroomId,
              programmeId: current.programmeId,
              academicYearId: current.academicYearId,
              academicYearStartsOn: toIsoDate(current.academicYear.startsOn),
              admittedOn: toIsoDate(current.admittedOn),
            },
    };
  }

  async updateChild(
    id: string,
    change: Parameters<ChildStore["updateChild"]>[1],
  ): Promise<void> {
    await this.db.preschoolChild.update({
      where: { id },
      data: {
        ...change,
        dateOfBirth: dateField(change.dateOfBirth) ?? undefined,
        withdrawnOn: dateField(change.withdrawnOn),
        updatedAt: new Date(),
      },
    });
  }

  async replacePickups(
    workspaceId: string,
    childId: string,
    pickups: PickupFields[],
  ): Promise<void> {
    await this.db.preschoolAuthorisedPickup.deleteMany({
      where: { workspaceId, childId },
    });
    await this.insertPickups(workspaceId, childId, pickups);
  }

  async moveInvoices(
    fromAdmissionId: string,
    toAdmissionId: string,
  ): Promise<void> {
    await this.db.preschoolInvoice.updateMany({
      where: { admissionId: fromAdmissionId },
      data: { admissionId: toAdmissionId },
    });
  }

  async endAdmission(
    id: string,
    endedOn: IsoDate,
    reason: Parameters<ChildStore["endAdmission"]>[2],
  ): Promise<void> {
    await this.db.preschoolAdmission.update({
      where: { id },
      data: {
        status: "ended",
        endedOn: fromIsoDate(endedOn),
        endReason: reason,
      },
    });
  }

  /** In the order given: each a millisecond after the one before. */
  private async insertPickups(
    workspaceId: string,
    childId: string,
    pickups: PickupFields[],
  ): Promise<void> {
    const now = Date.now();
    await this.db.preschoolAuthorisedPickup.createMany({
      data: pickups.map((pickup, index) => ({
        ...pickup,
        id: randomUUID(),
        workspaceId,
        childId,
        createdAt: new Date(now + index),
      })),
    });
  }

  async list(params: ChildListParams) {
    const where = listWhere(params);
    const after = params.after;
    const afterWhere: Prisma.PreschoolChildWhereInput =
      after == null
        ? {}
        : {
            OR: [
              { firstName: { gt: after.key } },
              { firstName: after.key, id: { gt: after.id } },
            ],
          };
    const [rows, total] = await Promise.all([
      this.db.preschoolChild.findMany({
        where: { AND: [where, afterWhere] },
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        take: params.limit + 1,
        select: listSelect,
      }),
      this.db.preschoolChild.count({ where }),
    ]);
    return {
      rows: rows.map((row): Omit<ChildListItemView, "ageText"> => {
        const { admissions, ...rest } = row;
        const current = admissions[0];
        return {
          ...rest,
          name: childName(row.firstName, row.lastName),
          dateOfBirth: toIsoDate(row.dateOfBirth),
          programmeId: current?.programmeId ?? null,
          programmeName: current?.programme.name ?? null,
          classroomId: current?.classroomId ?? null,
          classroomName: current?.classroom.name ?? null,
        };
      }),
      total,
    };
  }

  async profile(
    workspaceId: string,
    id: string,
  ): Promise<Omit<ChildProfileView, "ageText" | "siblings"> | null> {
    const [row, enquiry] = await Promise.all([
      this.db.preschoolChild.findFirst({
        where: { id, workspaceId, deletedAt: null },
        include: {
          authorisedPickups: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              relationship: true,
              phone: true,
              photoUrl: true,
            },
          },
          admissions: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: admissionSelect,
          },
        },
      }),
      this.db.preschoolEnquiry.findFirst({
        where: { workspaceId, convertedChildId: id },
        select: { id: true },
      }),
    ]);
    if (row == null) return null;
    const admissions = row.admissions.map(toAdmission);
    return {
      id: row.id,
      centreId: row.centreId,
      admissionNumber: row.admissionNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      name: childName(row.firstName, row.lastName),
      dateOfBirth: toIsoDate(row.dateOfBirth),
      gender: row.gender,
      bloodGroup: row.bloodGroup,
      photoUrl: row.photoUrl,
      motherTongue: row.motherTongue,
      address: {
        line: row.addressLine,
        city: row.city,
        state: row.state,
        pincode: row.pincode,
      },
      father: {
        name: row.fatherName,
        phone: row.fatherPhone,
        email: row.fatherEmail,
        occupation: row.fatherOccupation,
      },
      mother: {
        name: row.motherName,
        phone: row.motherPhone,
        email: row.motherEmail,
        occupation: row.motherOccupation,
      },
      emergencyContact: {
        name: row.emergencyContactName,
        phone: row.emergencyContactPhone,
        relationship: row.emergencyContactRelationship,
      },
      health: {
        allergies: row.allergies,
        medicalConditions: row.medicalConditions,
        doctorName: row.doctorName,
        doctorPhone: row.doctorPhone,
        immunisationUpToDate: row.immunisationUpToDate,
      },
      documents: {
        hasBirthCertificate: row.hasBirthCertificate,
        hasAadhaar: row.hasAadhaar,
        hasImmunisationCard: row.hasImmunisationCard,
        hasPhotos: row.hasPhotos,
        hasAddressProof: row.hasAddressProof,
      },
      status: row.status,
      withdrawnOn: row.withdrawnOn == null ? null : toIsoDate(row.withdrawnOn),
      withdrawReason: row.withdrawReason,
      currentAdmission:
        admissions.find((admission) => admission.status === "active") ?? null,
      admissions,
      authorisedPickups: row.authorisedPickups,
      enquiryId: enquiry?.id ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async siblings(
    workspaceId: string,
    childId: string,
    match: { phones: string[]; emails: string[] },
  ): Promise<SiblingView[]> {
    if (match.phones.length === 0 && match.emails.length === 0) return [];
    const rows = await this.db.preschoolChild.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        id: { not: childId },
        OR: [
          { fatherPhone: { in: match.phones } },
          { motherPhone: { in: match.phones } },
          { fatherEmail: { in: match.emails } },
          { motherEmail: { in: match.emails } },
        ],
      },
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
      take: 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        admissions: {
          ...activeAdmission,
          select: { classroom: { select: { name: true } } },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      name: childName(row.firstName, row.lastName),
      classroomName: row.admissions[0]?.classroom.name ?? null,
      status: row.status,
    }));
  }

  async options(workspaceId: string, centreId: string) {
    const [years, programmes, classrooms] = await Promise.all([
      this.db.preschoolAcademicYear.findMany({
        where: { workspaceId },
        orderBy: { startsOn: "asc" },
        select: {
          id: true,
          name: true,
          startsOn: true,
          endsOn: true,
          isCurrent: true,
        },
      }),
      this.db.preschoolProgramme.findMany({
        where: { workspaceId, archivedAt: null },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          minAgeMonths: true,
          maxAgeMonths: true,
          isDaycare: true,
        },
      }),
      this.db.preschoolClassroom.findMany({
        where: { workspaceId, centreId, deletedAt: null, archivedAt: null },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          programmeId: true,
          academicYearId: true,
          capacity: true,
          _count: { select: { admissions: { where: { status: "active" } } } },
        },
      }),
    ]);
    const current = years.find((year) => year.isCurrent);
    if (current == null)
      throw new Error("The Preschool has no current Academic Year.");
    return {
      centreId,
      currentAcademicYearId: current.id,
      academicYears: years.map((year) => ({
        ...year,
        startsOn: toIsoDate(year.startsOn),
        endsOn: toIsoDate(year.endsOn),
      })),
      programmes,
      classrooms: classrooms.map(({ _count, ...classroom }) => ({
        ...classroom,
        filled: _count.admissions,
        seatsLeft: Math.max(0, classroom.capacity - _count.admissions),
      })),
    };
  }
}

type LockedEnquiryStatus = NonNullable<
  Awaited<ReturnType<ChildStore["lockEnquiry"]>>
>["status"];

function listWhere(params: ChildListParams): Prisma.PreschoolChildWhereInput {
  const and: Prisma.PreschoolChildWhereInput[] = [
    {
      workspaceId: params.workspaceId,
      centreId: params.centreId,
      deletedAt: null,
    },
  ];
  if (params.status != null) and.push({ status: params.status });
  if (params.activeInClassroomIds != null)
    and.push({
      admissions: {
        some: {
          status: "active",
          classroomId: { in: [...params.activeInClassroomIds] },
        },
      },
    });
  if (params.q != null) {
    const q = params.q;
    const digits = q.replace(/\D/g, "");
    const contains = { contains: q, mode: "insensitive" } as const;
    and.push({
      OR: [
        { firstName: contains },
        { lastName: contains },
        { admissionNumber: contains },
        { fatherName: contains },
        { motherName: contains },
        ...(digits.length >= 3
          ? [
              { fatherPhone: { contains: digits } },
              { motherPhone: { contains: digits } },
            ]
          : []),
      ],
    });
  }
  return { AND: and };
}
