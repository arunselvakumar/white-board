import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";

import {
  ENQUIRY_STAGE_LABELS,
  type PhoneMatchesResponse,
} from "@/src/queries/enquiries";

export function hasPhoneMatches(
  matches: PhoneMatchesResponse | null | undefined,
): matches is PhoneMatchesResponse {
  return (
    matches != null &&
    (matches.students.length > 0 || matches.enquiries.length > 0)
  );
}

/** Non-blocking: staff can still save a second Enquiry for the same phone. */
export function PhoneMatchWarning({
  matches,
}: {
  matches: PhoneMatchesResponse | null | undefined;
}) {
  if (!hasPhoneMatches(matches)) return null;
  return (
    <Alert
      role="status"
      aria-label="This phone is already on record"
      className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>This phone is already on record</AlertTitle>
      <AlertDescription className="text-amber-900/80 dark:text-amber-100/80">
        <ul className="mt-1 space-y-1">
          {matches.students.map((student) => (
            <li key={student.id}>
              Already a Student:{" "}
              <Link href={`/students/${student.id}`} className="font-medium">
                {student.name}
              </Link>
            </li>
          ))}
          {matches.enquiries.map((enquiry) => (
            <li key={enquiry.id}>
              Open Enquiry:{" "}
              <Link href={`/enquiries/${enquiry.id}`} className="font-medium">
                {enquiry.prospectName}
              </Link>{" "}
              ({ENQUIRY_STAGE_LABELS[enquiry.stage]})
            </li>
          ))}
        </ul>
        <p className="mt-2">You can still save this Enquiry.</p>
      </AlertDescription>
    </Alert>
  );
}
