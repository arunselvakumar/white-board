import { DomainError } from "./errors";
import type { DomainEvent } from "./events";
import { EmailAddress } from "./email-address";
import { OptionalText } from "./optional-text";
import { Phone } from "./phone";
import type { StudentId } from "./student-id";
import { StudentName } from "./student-name";
import type { UserId } from "./user-id";
import type { WorkspaceId } from "./workspace-id";

export type StudentProps = {
  id: StudentId;
  workspaceId: WorkspaceId;
  createdByUserId: UserId;
  name: StudentName;
  phone: Phone;
  email: EmailAddress | null;
  photoUrl: OptionalText | null;
  address: OptionalText | null;
  idProofNote: OptionalText | null;
  guardianName: OptionalText | null;
  guardianPhone: Phone | null;
  droppedAt: Date | null;
  droppedByUserId: UserId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: UserId | null;
};

export type StudentProfileInput = {
  name: StudentName;
  phone: Phone;
  email: EmailAddress | null;
  photoUrl: OptionalText | null;
  address: OptionalText | null;
  idProofNote: OptionalText | null;
  guardianName: OptionalText | null;
  guardianPhone: Phone | null;
};

export function studentPhotoUrl(raw: string | null | undefined): OptionalText | null {
  return OptionalText.create(
    raw,
    2048,
    "PHOTO_URL_TOO_LONG",
    "Photo URL must be at most 2048 characters.",
  );
}

export function studentAddress(raw: string | null | undefined): OptionalText | null {
  return OptionalText.create(
    raw,
    4000,
    "ADDRESS_TOO_LONG",
    "Address must be at most 4000 characters.",
  );
}

export function studentIdProofNote(
  raw: string | null | undefined,
): OptionalText | null {
  return OptionalText.create(
    raw,
    4000,
    "ID_PROOF_NOTE_TOO_LONG",
    "ID proof note must be at most 4000 characters.",
  );
}

export function studentGuardianName(
  raw: string | null | undefined,
): OptionalText | null {
  return OptionalText.create(
    raw,
    200,
    "GUARDIAN_NAME_TOO_LONG",
    "Guardian name must be at most 200 characters.",
  );
}

export class Student {
  private events: DomainEvent[] = [];

  private constructor(private props: StudentProps) {}

  static create(input: {
    id: StudentId;
    workspaceId: WorkspaceId;
    createdByUserId: UserId;
    profile: StudentProfileInput;
    now: Date;
  }): Student {
    const student = new Student({
      id: input.id,
      workspaceId: input.workspaceId,
      createdByUserId: input.createdByUserId,
      ...input.profile,
      droppedAt: null,
      droppedByUserId: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
    student.events.push({
      type: "StudentCreated",
      studentId: input.id.value,
      workspaceId: input.workspaceId.value,
      occurredAt: input.now,
    });
    return student;
  }

  static reconstitute(props: StudentProps): Student {
    return new Student(props);
  }

  get id(): StudentId {
    return this.props.id;
  }

  get workspaceId(): WorkspaceId {
    return this.props.workspaceId;
  }

  get createdByUserId(): UserId {
    return this.props.createdByUserId;
  }

  get name(): StudentName {
    return this.props.name;
  }

  get phone(): Phone {
    return this.props.phone;
  }

  get email(): EmailAddress | null {
    return this.props.email;
  }

  get photoUrl(): OptionalText | null {
    return this.props.photoUrl;
  }

  get address(): OptionalText | null {
    return this.props.address;
  }

  get idProofNote(): OptionalText | null {
    return this.props.idProofNote;
  }

  get guardianName(): OptionalText | null {
    return this.props.guardianName;
  }

  get guardianPhone(): Phone | null {
    return this.props.guardianPhone;
  }

  get droppedAt(): Date | null {
    return this.props.droppedAt;
  }

  get droppedByUserId(): UserId | null {
    return this.props.droppedByUserId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get deletedByUserId(): UserId | null {
    return this.props.deletedByUserId;
  }

  updateProfile(profile: StudentProfileInput, now: Date): void {
    this.props = {
      ...this.props,
      ...profile,
      updatedAt: now,
    };
    this.events.push({
      type: "StudentProfileUpdated",
      studentId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      occurredAt: now,
    });
  }

  assertCanEnroll(): void {
    if (this.props.droppedAt != null) {
      throw new DomainError(
        "STUDENT_DROPPED",
        "Dropped Student cannot be enrolled.",
      );
    }
  }

  drop(droppedByUserId: UserId, now: Date): void {
    if (this.props.droppedAt != null) {
      throw new DomainError(
        "STUDENT_ALREADY_DROPPED",
        "Student is already dropped.",
      );
    }
    this.props = {
      ...this.props,
      droppedAt: now,
      droppedByUserId,
      updatedAt: now,
    };
    this.events.push({
      type: "StudentDropped",
      studentId: this.props.id.value,
      workspaceId: this.props.workspaceId.value,
      droppedByUserId: droppedByUserId.value,
      occurredAt: now,
    });
  }

  pullDomainEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}

export const StudentProfile = {
  fromRaw(raw: {
    name: string;
    phone: string;
    email?: string | null;
    photoUrl?: string | null;
    address?: string | null;
    idProofNote?: string | null;
    guardianName?: string | null;
    guardianPhone?: string | null;
  }): StudentProfileInput {
    return {
      name: StudentName.create(raw.name),
      phone: Phone.create(raw.phone, "STUDENT_PHONE_REQUIRED"),
      email: EmailAddress.create(raw.email),
      photoUrl: studentPhotoUrl(raw.photoUrl),
      address: studentAddress(raw.address),
      idProofNote: studentIdProofNote(raw.idProofNote),
      guardianName: studentGuardianName(raw.guardianName),
      guardianPhone: Phone.createOptional(raw.guardianPhone),
    };
  },
};
