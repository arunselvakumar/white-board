export type StudentInvitee = {
  emailAddress: string;
  role: "student" | "parent";
};

type EmailContact = { email?: string | null };

export function studentInvitees(student: {
  email?: string | null;
  details: {
    father: EmailContact;
    mother: EmailContact;
    guardians: EmailContact[];
  };
}): StudentInvitee[] {
  const recipients = new Map<string, StudentInvitee>();
  const add = (
    email: string | null | undefined,
    role: StudentInvitee["role"],
  ) => {
    const address = email?.trim().toLowerCase();
    if (address && !recipients.has(address)) {
      recipients.set(address, { emailAddress: address, role });
    }
  };

  add(student.email, "student");
  add(student.details.father.email, "parent");
  add(student.details.mother.email, "parent");
  for (const guardian of student.details.guardians) {
    add(guardian.email, "parent");
  }
  return [...recipients.values()];
}
