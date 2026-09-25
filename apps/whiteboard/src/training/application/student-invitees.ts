export type StudentInvitee = {
  emailAddress: string;
  role: "org:student" | "org:parent";
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
  const add = (email: string | null | undefined, role: StudentInvitee["role"]) => {
    const address = email?.trim().toLowerCase();
    if (address && !recipients.has(address)) {
      recipients.set(address, { emailAddress: address, role });
    }
  };

  add(student.email, "org:student");
  add(student.details.father.email, "org:parent");
  add(student.details.mother.email, "org:parent");
  for (const guardian of student.details.guardians) {
    add(guardian.email, "org:parent");
  }
  return [...recipients.values()];
}
