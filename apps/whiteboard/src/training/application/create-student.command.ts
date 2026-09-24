import type { RawStudentDetails } from "../domain/student-details";

export type CreateStudentCommand = RawStudentDetails & {
  name: string;
  phone: string;
  email?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  idProofNote?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  workspaceId: string;
  createdByUserId: string;
};
