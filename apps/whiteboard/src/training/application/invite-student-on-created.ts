import type { DomainEvent } from "../domain/events";
import { studentInvitees, type StudentInvitee } from "./student-invitees";

type StudentForInvitation = {
  email: string | null;
  details: {
    father: { email: string | null };
    mother: { email: string | null };
    guardians: { email: string | null }[];
  };
  createdByUserId: string;
};

export type InvitationSender = {
  send(input: StudentInvitee & {
    organizationId: string;
    inviterUserId: string;
  }): Promise<void>;
};

export class InviteStudentOnCreated {
  constructor(
    private readonly loadStudent: (
      studentId: string,
      workspaceId: string,
    ) => Promise<StudentForInvitation | null>,
    private readonly invitations: InvitationSender,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    if (event.type !== "StudentCreated") return;
    const student = await this.loadStudent(event.studentId, event.workspaceId);
    if (student == null) return;

    for (const invitee of studentInvitees(student)) {
      try {
        await this.invitations.send({
          ...invitee,
          organizationId: event.workspaceId,
          inviterUserId: student.createdByUserId,
        });
      } catch (error) {
        console.error("Student invitation failed", {
          studentId: event.studentId,
          role: invitee.role,
        }, error);
      }
    }
  }
}
