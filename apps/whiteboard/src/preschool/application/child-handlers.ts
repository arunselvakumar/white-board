import {
  ageRangeText,
  assertClassroomFor,
  assertClassroomMove,
  assertEndsAfterAdmission,
  assertPromotionYear,
  assertSeatAvailable,
  programmeAgeWarning,
} from "../domain/admission";
import {
  addedParentEmails,
  ageText,
  assertChildActive,
  assertParentPhone,
  assertPickupCount,
  formatAdmissionNumber,
  normaliseEmail,
  type ChildStatus,
  type Gender,
} from "../domain/child";
import { todayInIndia, type IsoDate } from "../domain/dates";
import { assertCanAdmitEnquiry } from "../domain/enquiry";
import { conflict, forbidden, invalid, notFound } from "../domain/errors";
import { indianMobile, optionalIndianMobile } from "../domain/phone";
import {
  assertCentre,
  assertManagerOf,
  canReadChild,
  type PreschoolActor,
} from "./access";
import type {
  AdmissionInvoicer,
  AdmittedChild,
  ChildDetailsFields,
  ChildHealthFields,
  ChildParentFields,
  ChildReader,
  ChildStore,
  ClassroomRecord,
  LockedChild,
  ParentInviter,
  PickupFields,
} from "./child-ports";
import type {
  AdmitChildView,
  ChildFormOptionsView,
  ChildPageView,
  ChildProfileView,
} from "./child-views";
import { decodeCursor, DEFAULT_PAGE_SIZE, pageFrom } from "./list-cursor";

export type ChildDetailsInput = {
  firstName: string;
  lastName?: string | null;
  dateOfBirth: IsoDate;
  gender: Gender;
  bloodGroup?: string | null;
  photoUrl?: string | null;
  motherTongue?: string | null;
  address?: {
    line?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
  } | null;
};

export type ParentInput = {
  name?: string | null;
  /** An Indian mobile number in any common spelling; stored as 10 digits. */
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
};

export type EmergencyContactInput = {
  name?: string | null;
  phone?: string | null;
  relationship?: string | null;
};

export type HealthInput = {
  allergies?: string | null;
  medicalConditions?: string | null;
  doctorName?: string | null;
  doctorPhone?: string | null;
  immunisationUpToDate?: boolean | null;
};

export type DocumentsInput = {
  hasBirthCertificate?: boolean;
  hasAadhaar?: boolean;
  hasImmunisationCard?: boolean;
  hasPhotos?: boolean;
  hasAddressProof?: boolean;
};

export type PickupInput = {
  name: string;
  relationship: string;
  phone: string;
  photoUrl?: string | null;
};

export type ParentsInput = {
  father?: ParentInput | null;
  mother?: ParentInput | null;
  emergencyContact?: EmergencyContactInput | null;
};

export type AdmitChildInput = ParentsInput & {
  centreId: string;
  child: ChildDetailsInput;
  authorisedPickups?: PickupInput[];
  health?: HealthInput | null;
  documents?: DocumentsInput | null;
  admission: {
    programmeId: string;
    classroomId: string;
    /** Today in India when left out. */
    admittedOn?: IsoDate;
    /** The Classroom's Academic Year when left out; must match it. */
    academicYearId?: string;
    /** An open Enquiry of the same Centre, set Admitted by this admission. */
    enquiryId?: string;
  };
};

/** The `updatedAt` the form loaded; a newer save answers 409 `CHILD_CHANGED`. */
type Versioned = { updatedAt?: string };

export type UpdateChildProfileInput = ChildDetailsInput & Versioned;
export type UpdateChildParentsInput = ParentsInput & Versioned;
export type UpdateChildHealthInput = {
  health?: HealthInput | null;
  documents?: DocumentsInput | null;
} & Versioned;
export type ReplacePickupsInput = {
  authorisedPickups: PickupInput[];
} & Versioned;

export type ListChildrenInput = {
  centreId: string;
  classroomId?: string;
  /** Active when left out; `all` for every status. */
  status?: ChildStatus | "all";
  q?: string;
  limit?: number;
  cursor?: string;
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function childNotFound() {
  return notFound("CHILD_NOT_FOUND", "Child not found.");
}

/** Children, Admissions and Authorised Pickups of a Centre. */
export class ChildHandlers {
  constructor(
    private readonly deps: {
      store: ChildStore;
      reader: ChildReader;
      invoicer: AdmissionInvoicer;
      inviter: ParentInviter;
      now: () => Date;
      newId?: () => string;
    },
  ) {}

  private today(): IsoDate {
    return todayInIndia(this.deps.now());
  }

  private id(): string {
    return (this.deps.newId ?? (() => crypto.randomUUID()))();
  }

  /**
   * Staff of the Centre. A Teacher sees only Children with an active
   * Admission in their Classrooms.
   */
  async list(
    actor: PreschoolActor,
    input: ListChildrenInput,
  ): Promise<ChildPageView> {
    assertCentre(actor, input.centreId);
    let classroomIds: readonly string[] | null =
      input.classroomId == null ? null : [input.classroomId];
    if (actor.role === "teacher") {
      if (
        input.classroomId != null &&
        !actor.classroomIds.includes(input.classroomId)
      )
        throw forbidden(
          "CLASSROOM_FORBIDDEN",
          "You do not have access to this Classroom.",
        );
      classroomIds ??= actor.classroomIds;
    }
    const status = input.status ?? "active";
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    const { rows, total } = await this.deps.reader.list({
      workspaceId: actor.workspaceId,
      centreId: input.centreId,
      activeInClassroomIds: classroomIds,
      status: status === "all" ? null : status,
      q: text(input.q),
      limit,
      after: input.cursor == null ? null : decodeCursor(input.cursor),
    });
    const today = this.today();
    const page = pageFrom(rows, limit, total, (row) => ({
      key: row.firstName,
      id: row.id,
    }));
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        ageText: ageText(row.dateOfBirth, today),
      })),
    };
  }

  /**
   * Managers of the Centre; a Teacher for a Child in their Classroom; a
   * Parent for their own Child.
   */
  async get(actor: PreschoolActor, id: string): Promise<ChildProfileView> {
    const profile = await this.deps.reader.profile(actor.workspaceId, id);
    if (profile == null) throw childNotFound();
    if (!canReadChild(actor, profile))
      throw actor.role === "parent"
        ? forbidden("CHILD_FORBIDDEN", "This is not your Child.")
        : forbidden(
            "CENTRE_FORBIDDEN",
            "You do not have access to this Centre.",
          );
    if (
      actor.role === "teacher" &&
      (profile.currentAdmission == null ||
        !actor.classroomIds.includes(profile.currentAdmission.classroomId))
    )
      throw forbidden(
        "CHILD_FORBIDDEN",
        "This Child is not in one of your Classrooms.",
      );
    const phones = [profile.father.phone, profile.mother.phone].filter(
      (phone) => phone != null,
    );
    const emails = [profile.father.email, profile.mother.email].filter(
      (email) => email != null,
    );
    const siblings = await this.deps.reader.siblings(actor.workspaceId, id, {
      phones,
      emails,
    });
    return {
      ...profile,
      ageText: ageText(profile.dateOfBirth, this.today()),
      siblings:
        actor.role === "parent"
          ? siblings.filter((sibling) => actor.childIds.includes(sibling.id))
          : siblings,
    };
  }

  async options(
    actor: PreschoolActor,
    centreId: string,
  ): Promise<ChildFormOptionsView> {
    assertManagerOf(actor, centreId);
    const options = await this.deps.reader.options(actor.workspaceId, centreId);
    return {
      ...options,
      programmes: options.programmes.map((programme) => ({
        ...programme,
        ageRangeText: ageRangeText(
          programme.minAgeMonths,
          programme.maxAgeMonths,
        ),
      })),
    };
  }

  /**
   * The whole admission form in one transaction: the Child, Authorised
   * Pickups, the Admission with the Centre's next admission number, and the
   * Enquiry it came from set Admitted. Then Invoices are raised and Parents
   * invited; neither failing undoes the admission.
   */
  async admit(
    actor: PreschoolActor,
    input: AdmitChildInput,
  ): Promise<AdmitChildView> {
    const { centreId, admission } = input;
    assertManagerOf(actor, centreId);
    const details = this.detailsFields(input.child);
    const parents = parentFields(input);
    const health = healthFields(input);
    const pickups = pickupFields(input.authorisedPickups ?? []);
    const childId = this.id();
    const admissionId = this.id();
    const admittedOn = admission.admittedOn ?? this.today();

    const { academicYearId, ageWarning } = await this.deps.store.transaction(
      async (store) => {
        const { classroom, programme } = await this.placement(store, actor, {
          centreId,
          programmeId: admission.programmeId,
          classroomId: admission.classroomId,
          academicYearId: admission.academicYearId,
        });
        const year = await this.yearOf(store, actor, classroom);
        if (admission.enquiryId != null) {
          const enquiry = await store.lockEnquiry(
            actor.workspaceId,
            admission.enquiryId,
          );
          if (enquiry == null)
            throw notFound("ENQUIRY_NOT_FOUND", "Enquiry not found.");
          assertCanAdmitEnquiry(enquiry, centreId);
        }
        assertSeatAvailable(await store.lockSeats(classroom.id));
        const { centreCode, sequence } = await store.takeAdmissionSequence(
          actor.workspaceId,
          centreId,
        );
        await store.insertChild(
          {
            ...details,
            ...parents,
            ...health,
            id: childId,
            workspaceId: actor.workspaceId,
            centreId,
            admissionNumber: formatAdmissionNumber(centreCode, sequence),
          },
          pickups,
        );
        await store.insertAdmission({
          id: admissionId,
          workspaceId: actor.workspaceId,
          centreId,
          childId,
          academicYearId: classroom.academicYearId,
          programmeId: programme.id,
          classroomId: classroom.id,
          admittedOn,
        });
        if (admission.enquiryId != null)
          await store.markEnquiryAdmitted({
            workspaceId: actor.workspaceId,
            enquiryId: admission.enquiryId,
            childId,
            at: this.deps.now(),
            author: { userId: actor.userId, userName: actor.userName },
          });
        return {
          academicYearId: classroom.academicYearId,
          ageWarning: programmeAgeWarning({
            dateOfBirth: details.dateOfBirth,
            academicYearStartsOn: year.startsOn,
            programme,
          }),
        };
      },
    );

    await this.afterAdmission({
      workspaceId: actor.workspaceId,
      admissionId,
      childId,
      centreId,
      programmeId: admission.programmeId,
      academicYearId,
      admittedOn,
    });
    await this.inviteParents(
      actor,
      childId,
      addedParentEmails([], [parents.fatherEmail, parents.motherEmail]),
    );
    return { child: await this.get(actor, childId), ageWarning };
  }

  async updateProfile(
    actor: PreschoolActor,
    id: string,
    input: UpdateChildProfileInput,
  ): Promise<ChildProfileView> {
    const details = this.detailsFields(input);
    await this.withChild(actor, id, input, async (store) => {
      await store.updateChild(id, details);
    });
    return this.get(actor, id);
  }

  /** Replaces father, mother and emergency contact; new parent emails are invited. */
  async updateParents(
    actor: PreschoolActor,
    id: string,
    input: UpdateChildParentsInput,
  ): Promise<ChildProfileView> {
    const parents = parentFields(input);
    const invite = await this.withChild(
      actor,
      id,
      input,
      async (store, child) => {
        await store.updateChild(id, parents);
        return addedParentEmails(
          [child.fatherEmail, child.motherEmail],
          [parents.fatherEmail, parents.motherEmail],
        );
      },
    );
    await this.inviteParents(actor, id, invite);
    return this.get(actor, id);
  }

  async updateHealth(
    actor: PreschoolActor,
    id: string,
    input: UpdateChildHealthInput,
  ): Promise<ChildProfileView> {
    const health = healthFields(input);
    await this.withChild(actor, id, input, async (store) => {
      await store.updateChild(id, health);
    });
    return this.get(actor, id);
  }

  async replacePickups(
    actor: PreschoolActor,
    id: string,
    input: ReplacePickupsInput,
  ): Promise<ChildProfileView> {
    const pickups = pickupFields(input.authorisedPickups);
    await this.withChild(actor, id, input, async (store) => {
      await store.replacePickups(actor.workspaceId, id, pickups);
      await store.updateChild(id, {});
    });
    return this.get(actor, id);
  }

  /**
   * Into another Classroom of the same Programme and Academic Year: the
   * current Admission ends `classroom_changed` and a new one starts the same
   * day, so the history shows the move.
   */
  async moveClassroom(
    actor: PreschoolActor,
    id: string,
    input: { classroomId: string; movedOn?: IsoDate },
  ): Promise<ChildProfileView> {
    await this.withChild(actor, id, {}, async (store, child) => {
      const current = activeAdmission(child);
      const target = await this.classroomOf(store, actor, input.classroomId);
      assertClassroomMove(current, target);
      assertClassroomFor(target, {
        centreId: child.centreId,
        programmeId: current.programmeId,
      });
      const movedOn = input.movedOn ?? this.today();
      assertEndsAfterAdmission(current.admittedOn, movedOn);
      assertSeatAvailable(await store.lockSeats(target.id));
      await store.endAdmission(current.id, movedOn, "classroom_changed");
      await store.insertAdmission({
        id: this.id(),
        workspaceId: actor.workspaceId,
        centreId: child.centreId,
        childId: id,
        academicYearId: target.academicYearId,
        programmeId: target.programmeId,
        classroomId: target.id,
        admittedOn: movedOn,
      });
      await store.updateChild(id, {});
    });
    return this.get(actor, id);
  }

  /**
   * Into a Programme and Classroom of a later Academic Year: the current
   * Admission ends `promoted` today and the new one starts on `admittedOn`
   * (default: today or the year's first day, whichever is later).
   */
  async promote(
    actor: PreschoolActor,
    id: string,
    input: {
      programmeId: string;
      classroomId: string;
      academicYearId?: string;
      admittedOn?: IsoDate;
    },
  ): Promise<AdmitChildView> {
    const admissionId = this.id();
    const today = this.today();
    const admitted = await this.withChild(
      actor,
      id,
      {},
      async (store, child) => {
        const current = activeAdmission(child);
        const { classroom, programme } = await this.placement(store, actor, {
          centreId: child.centreId,
          programmeId: input.programmeId,
          classroomId: input.classroomId,
          academicYearId: input.academicYearId,
        });
        const year = await this.yearOf(store, actor, classroom);
        assertPromotionYear(current.academicYearStartsOn, year.startsOn);
        assertEndsAfterAdmission(current.admittedOn, today);
        const admittedOn =
          input.admittedOn ?? (year.startsOn > today ? year.startsOn : today);
        assertSeatAvailable(await store.lockSeats(classroom.id));
        await store.endAdmission(current.id, today, "promoted");
        await store.insertAdmission({
          id: admissionId,
          workspaceId: actor.workspaceId,
          centreId: child.centreId,
          childId: id,
          academicYearId: classroom.academicYearId,
          programmeId: programme.id,
          classroomId: classroom.id,
          admittedOn,
        });
        await store.updateChild(id, {});
        return {
          admission: {
            workspaceId: actor.workspaceId,
            admissionId,
            childId: id,
            centreId: child.centreId,
            programmeId: programme.id,
            academicYearId: classroom.academicYearId,
            admittedOn,
          },
          ageWarning: programmeAgeWarning({
            dateOfBirth: child.dateOfBirth,
            academicYearStartsOn: year.startsOn,
            programme,
          }),
        };
      },
    );
    await this.afterAdmission(admitted.admission);
    return {
      child: await this.get(actor, id),
      ageWarning: admitted.ageWarning,
    };
  }

  /** The Child leaves: status `withdrawn`, the active Admission ended `withdrawn`. */
  async withdraw(
    actor: PreschoolActor,
    id: string,
    input: { withdrawnOn: IsoDate; reason: string },
  ): Promise<ChildProfileView> {
    const reason = text(input.reason);
    if (reason == null)
      throw invalid(
        "WITHDRAW_REASON_REQUIRED",
        "Say why the Child is leaving.",
      );
    await this.withChild(actor, id, {}, async (store, child) => {
      if (child.current != null) {
        assertEndsAfterAdmission(child.current.admittedOn, input.withdrawnOn);
        await store.endAdmission(
          child.current.id,
          input.withdrawnOn,
          "withdrawn",
        );
      }
      await store.updateChild(id, {
        status: "withdrawn",
        withdrawnOn: input.withdrawnOn,
        withdrawReason: reason,
      });
    });
    return this.get(actor, id);
  }

  private detailsFields(input: ChildDetailsInput): ChildDetailsFields {
    if (input.dateOfBirth > this.today())
      throw invalid(
        "DATE_OF_BIRTH_IN_FUTURE",
        "The date of birth cannot be in the future.",
      );
    return {
      firstName: input.firstName.trim(),
      lastName: text(input.lastName),
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      bloodGroup: text(input.bloodGroup),
      photoUrl: text(input.photoUrl),
      motherTongue: text(input.motherTongue),
      addressLine: text(input.address?.line),
      city: text(input.address?.city),
      state: text(input.address?.state),
      pincode: text(input.address?.pincode),
    };
  }

  /** The Classroom and Programme for a new Admission, checked against each other. */
  private async placement(
    store: ChildStore,
    actor: PreschoolActor,
    want: {
      centreId: string;
      programmeId: string;
      classroomId: string;
      academicYearId?: string;
    },
  ) {
    const programme = await store.programme(
      actor.workspaceId,
      want.programmeId,
    );
    if (programme == null)
      throw notFound("PROGRAMME_NOT_FOUND", "Programme not found.");
    if (programme.archived)
      throw conflict("PROGRAMME_ARCHIVED", "The Programme is archived.");
    const classroom = await this.classroomOf(store, actor, want.classroomId);
    assertClassroomFor(classroom, want);
    return { classroom, programme };
  }

  private async classroomOf(
    store: ChildStore,
    actor: PreschoolActor,
    id: string,
  ): Promise<ClassroomRecord> {
    const classroom = await store.classroom(actor.workspaceId, id);
    if (classroom == null)
      throw notFound("CLASSROOM_NOT_FOUND", "Classroom not found.");
    return classroom;
  }

  private async yearOf(
    store: ChildStore,
    actor: PreschoolActor,
    classroom: ClassroomRecord,
  ) {
    const year = await store.academicYear(
      actor.workspaceId,
      classroom.academicYearId,
    );
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    return year;
  }

  /** Locks the Child, checks the manager, that it is active and unchanged, then runs `work`. */
  private withChild<T>(
    actor: PreschoolActor,
    id: string,
    version: Versioned,
    work: (store: ChildStore, child: LockedChild) => Promise<T>,
  ): Promise<T> {
    return this.deps.store.transaction(async (store) => {
      const child = await store.lockChild(actor.workspaceId, id);
      if (child == null) throw childNotFound();
      assertManagerOf(actor, child.centreId);
      assertChildActive(child.status);
      if (version.updatedAt != null && version.updatedAt !== child.updatedAt)
        throw conflict(
          "CHILD_CHANGED",
          "Someone else saved this Child since you opened it. Reload and try again.",
          { updatedAt: child.updatedAt },
        );
      return work(store, child);
    });
  }

  private async afterAdmission(admission: AdmittedChild): Promise<void> {
    try {
      await this.deps.invoicer.onAdmitted(admission);
    } catch (error) {
      console.error(
        "Raising Invoices for an Admission failed",
        { admissionId: admission.admissionId },
        error,
      );
    }
  }

  private async inviteParents(
    actor: PreschoolActor,
    childId: string,
    emails: string[],
  ): Promise<void> {
    for (const email of emails) {
      try {
        await this.deps.inviter.invite({
          workspaceId: actor.workspaceId,
          inviterUserId: actor.userId,
          email,
        });
      } catch (error) {
        console.error("Parent invitation failed", { childId }, error);
      }
    }
  }
}

function activeAdmission(
  child: LockedChild,
): NonNullable<LockedChild["current"]> {
  if (child.current == null)
    throw conflict(
      "NO_ACTIVE_ADMISSION",
      "This Child has no active Admission.",
    );
  return child.current;
}

function parentFields(input: ParentsInput): ChildParentFields {
  const father = input.father ?? {};
  const mother = input.mother ?? {};
  const emergency = input.emergencyContact ?? {};
  const fields: ChildParentFields = {
    fatherName: text(father.name),
    fatherPhone: optionalIndianMobile(father.phone, "father.phone"),
    fatherEmail: normaliseEmail(father.email),
    fatherOccupation: text(father.occupation),
    motherName: text(mother.name),
    motherPhone: optionalIndianMobile(mother.phone, "mother.phone"),
    motherEmail: normaliseEmail(mother.email),
    motherOccupation: text(mother.occupation),
    emergencyContactName: text(emergency.name),
    emergencyContactPhone: text(emergency.phone),
    emergencyContactRelationship: text(emergency.relationship),
  };
  assertParentPhone(fields);
  return fields;
}

function healthFields(input: {
  health?: HealthInput | null;
  documents?: DocumentsInput | null;
}): ChildHealthFields {
  const health = input.health ?? {};
  const documents = input.documents ?? {};
  return {
    allergies: text(health.allergies),
    medicalConditions: text(health.medicalConditions),
    doctorName: text(health.doctorName),
    doctorPhone: text(health.doctorPhone),
    immunisationUpToDate: health.immunisationUpToDate ?? null,
    hasBirthCertificate: documents.hasBirthCertificate ?? false,
    hasAadhaar: documents.hasAadhaar ?? false,
    hasImmunisationCard: documents.hasImmunisationCard ?? false,
    hasPhotos: documents.hasPhotos ?? false,
    hasAddressProof: documents.hasAddressProof ?? false,
  };
}

function pickupFields(pickups: PickupInput[]): PickupFields[] {
  assertPickupCount(pickups.length);
  return pickups.map((pickup, index) => ({
    name: pickup.name.trim(),
    relationship: pickup.relationship.trim(),
    phone: indianMobile(
      pickup.phone,
      `authorisedPickups.${String(index)}.phone`,
    ),
    photoUrl: text(pickup.photoUrl),
  }));
}
