// Which Students a signed-in Student or Parent may see (ADR-0027, ADR-0031).
// A Student User is linked through the Student email address; a Parent User
// through the father, mother, or a Guardian email address. Only verified
// email addresses count.

export type FamilyRole = "org:student" | "org:parent";

type ProfileDetails = {
  father?: { email?: unknown };
  mother?: { email?: unknown };
  guardians?: { email?: unknown }[];
};

export function normalizedEmail(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : null;
}

export function familyEmails(verifiedEmails: readonly string[]): Set<string> {
  return new Set(
    verifiedEmails
      .map(normalizedEmail)
      .filter((email): email is string => email != null),
  );
}

export function isLinkedStudent(
  student: { email: string | null; profileDetails: unknown },
  role: FamilyRole,
  emails: ReadonlySet<string>,
): boolean {
  if (role === "org:student")
    return emails.has(normalizedEmail(student.email) ?? "");
  const details = student.profileDetails as ProfileDetails | null;
  const contacts = [
    details?.father?.email,
    details?.mother?.email,
    ...(Array.isArray(details?.guardians)
      ? details.guardians.map((guardian) => guardian.email)
      : []),
  ];
  return contacts.some((email) => emails.has(normalizedEmail(email) ?? ""));
}
