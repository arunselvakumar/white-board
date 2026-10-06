import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { StudentId } from "../domain/student-id";
import type { StudentRepository } from "../domain/student-repository";
import { WorkspaceId } from "../domain/workspace-id";
import { toEnrollmentReadModel } from "./enrollment-read-model";
import type { GetStudentQuery } from "./get-student.query";
import { StudentNotFoundError } from "./not-found-error";
import {
  toStudentReadModel,
  type StudentReadModel,
} from "./student-read-model";

export class GetStudentHandler {
  constructor(
    private readonly students: StudentRepository,
    private readonly enrollments?: EnrollmentRepository,
    private readonly payments?: FeePaymentRepository,
  ) {}

  async execute(query: GetStudentQuery): Promise<StudentReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId);
    const student = await this.students.findByIdInWorkspace(
      StudentId.create(query.id),
      workspaceId,
    );
    if (student == null) {
      throw new StudentNotFoundError();
    }
    const enrollmentsRepo = this.enrollments;
    const payments = this.payments;
    if (enrollmentsRepo == null || payments == null) {
      return toStudentReadModel(student);
    }
    const page = await enrollmentsRepo.listInWorkspace({
      workspaceId,
      studentId: student.id,
      limit: 100,
    });
    const enrollments = await Promise.all(
      page.items.map(async (enrollment) => {
        const paid = await payments.sumAmountPaiseForEnrollment(
          enrollment.id,
          workspaceId,
        );
        return toEnrollmentReadModel(enrollment, paid);
      }),
    );
    return toStudentReadModel(student, enrollments);
  }
}
