export type UpdateStudentProfileCommand = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  photoUrl?: string | null;
  address?: string | null;
  idProofNote?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  workspaceId: string;
};
