import { DomainError } from "./errors";
import { Phone } from "./phone";
import { OptionalText } from "./optional-text";
import { parseUuid } from "./uuid";
import {
  teacherDetailsFromRaw,
  type RawTeacherDetails,
  type TeacherDetails,
} from "./teacher-details";

export const TEACHER_KINDS = ["centre_teacher", "visiting_tutor"] as const;
export type TeacherKind = (typeof TEACHER_KINDS)[number];
export type TeacherInvitationStatus =
  "not_sent" | "sent" | "failed" | "accepted";

export type TeacherProps = {
  id: string;
  workspaceId: string;
  createdByUserId: string;
  name: string;
  email: string;
  kind: TeacherKind;
  phone: string | null;
  qualificationSummary: string | null;
  details: TeacherDetails;
  photoMimeType: string | null;
  photoUpdatedAt: Date | null;
  idNumberLast4: string | null;
  bankAccountLast4: string | null;
  userId: string | null;
  invitationId: string | null;
  invitationStatus: TeacherInvitationStatus;
  deactivatedAt: Date | null;
  deactivatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: string | null;
};

function teacherName(raw: string): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new DomainError("TEACHER_NAME_REQUIRED", "Teacher name is required.");
  }
  if (value.length > 200) {
    throw new DomainError("TEACHER_NAME_TOO_LONG", "Teacher name is too long.");
  }
  return value;
}

function teacherEmail(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) {
    throw new DomainError(
      "TEACHER_EMAIL_REQUIRED",
      "Teacher email is required.",
    );
  }
  if (value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new DomainError("TEACHER_EMAIL_INVALID", "Teacher email is invalid.");
  }
  return value;
}

function teacherKind(raw: string): TeacherKind {
  if (!TEACHER_KINDS.includes(raw as TeacherKind)) {
    throw new DomainError("TEACHER_KIND_INVALID", "Teacher type is invalid.");
  }
  return raw as TeacherKind;
}

function optionalQualification(raw: string | null | undefined): string | null {
  return (
    OptionalText.create(
      raw,
      1000,
      "TEACHER_QUALIFICATION_TOO_LONG",
      "Qualification summary must be at most 1000 characters.",
    )?.value ?? null
  );
}

export class Teacher {
  private constructor(private props: TeacherProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    createdByUserId: string;
    name: string;
    email: string;
    kind: string;
    phone?: string | null;
    qualificationSummary?: string | null;
    details?: RawTeacherDetails;
    now: Date;
  }): Teacher {
    return new Teacher({
      id: parseUuid(input.id, "TEACHER_ID_INVALID", "Teacher ID is invalid."),
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      name: teacherName(input.name),
      email: teacherEmail(input.email),
      kind: teacherKind(input.kind),
      phone: Phone.createOptional(input.phone)?.value ?? null,
      qualificationSummary: optionalQualification(input.qualificationSummary),
      details: teacherDetailsFromRaw(input.details, input.now),
      photoMimeType: null,
      photoUpdatedAt: null,
      idNumberLast4: null,
      bankAccountLast4: null,
      userId: null,
      invitationId: null,
      invitationStatus: "not_sent",
      deactivatedAt: null,
      deactivatedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
  }

  static reconstitute(props: TeacherProps): Teacher {
    return new Teacher(props);
  }

  get id() {
    return this.props.id;
  }
  get workspaceId() {
    return this.props.workspaceId;
  }
  get createdByUserId() {
    return this.props.createdByUserId;
  }
  get name() {
    return this.props.name;
  }
  get email() {
    return this.props.email;
  }
  get kind() {
    return this.props.kind;
  }
  get phone() {
    return this.props.phone;
  }
  get qualificationSummary() {
    return this.props.qualificationSummary;
  }
  get details() {
    return this.props.details;
  }
  get photoMimeType() {
    return this.props.photoMimeType;
  }
  get photoUpdatedAt() {
    return this.props.photoUpdatedAt;
  }
  get idNumberLast4() {
    return this.props.idNumberLast4;
  }
  get bankAccountLast4() {
    return this.props.bankAccountLast4;
  }
  get userId() {
    return this.props.userId;
  }
  get invitationId() {
    return this.props.invitationId;
  }
  get invitationStatus() {
    return this.props.invitationStatus;
  }
  get deactivatedAt() {
    return this.props.deactivatedAt;
  }
  get deactivatedByUserId() {
    return this.props.deactivatedByUserId;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }
  get deletedAt() {
    return this.props.deletedAt;
  }
  get deletedByUserId() {
    return this.props.deletedByUserId;
  }
  get isActive() {
    return this.props.deactivatedAt == null && this.props.deletedAt == null;
  }

  updateProfile(input: {
    name: string;
    kind: string;
    phone?: string | null;
    qualificationSummary?: string | null;
    details?: RawTeacherDetails;
    now: Date;
  }): void {
    this.assertActive();
    this.props = {
      ...this.props,
      name: teacherName(input.name),
      kind: teacherKind(input.kind),
      phone: Phone.createOptional(input.phone)?.value ?? null,
      qualificationSummary: optionalQualification(input.qualificationSummary),
      details:
        input.details == null
          ? this.props.details
          : teacherDetailsFromRaw(input.details, input.now, this.props.details),
      updatedAt: input.now,
    };
  }

  attachPhoto(mimeType: string, now: Date): void {
    this.assertActive();
    this.props = {
      ...this.props,
      photoMimeType: mimeType,
      photoUpdatedAt: now,
      updatedAt: now,
    };
  }

  recordPrivateNumberMasks(
    input: { idNumber?: string | null; bankAccountNumber?: string | null },
    now: Date,
  ): void {
    this.assertActive();
    const last4 = (
      value: string | null | undefined,
      label: string,
    ): string | null | undefined => {
      if (value === undefined) return undefined;
      if (value === null || value.trim() === "") return null;
      const normalized = value.replace(/[\s-]/g, "");
      if (!/^[A-Za-z0-9]{4,64}$/.test(normalized)) {
        throw new DomainError(
          "TEACHER_PRIVATE_NUMBER_INVALID",
          `${label} must be 4 to 64 letters or digits.`,
        );
      }
      return normalized.slice(-4);
    };
    const idNumberLast4 = last4(input.idNumber, "ID number");
    const bankAccountLast4 = last4(
      input.bankAccountNumber,
      "Bank account number",
    );
    this.props = {
      ...this.props,
      idNumberLast4:
        idNumberLast4 === undefined ? this.props.idNumberLast4 : idNumberLast4,
      bankAccountLast4:
        bankAccountLast4 === undefined
          ? this.props.bankAccountLast4
          : bankAccountLast4,
      updatedAt: now,
    };
  }

  markInvited(invitationId: string, now: Date): void {
    this.assertActive();
    if (this.props.userId != null) {
      throw new DomainError(
        "TEACHER_ALREADY_ACTIVE",
        "Teacher has already joined.",
      );
    }
    this.props = {
      ...this.props,
      invitationId,
      invitationStatus: "sent",
      updatedAt: now,
    };
  }

  markInvitationFailed(now: Date): void {
    this.assertActive();
    this.props = { ...this.props, invitationStatus: "failed", updatedAt: now };
  }

  activate(userId: string, now: Date): void {
    this.assertActive();
    if (this.props.userId != null && this.props.userId !== userId) {
      throw new DomainError(
        "TEACHER_ALREADY_LINKED",
        "Teacher is linked to another User.",
      );
    }
    this.props = {
      ...this.props,
      userId,
      invitationStatus: "accepted",
      updatedAt: now,
    };
  }

  deactivate(userId: string, now: Date): void {
    this.assertActive();
    this.props = {
      ...this.props,
      deactivatedAt: now,
      deactivatedByUserId: userId,
      updatedAt: now,
    };
  }

  private assertActive(): void {
    if (!this.isActive) {
      throw new DomainError("TEACHER_INACTIVE", "Teacher is inactive.");
    }
  }
}
