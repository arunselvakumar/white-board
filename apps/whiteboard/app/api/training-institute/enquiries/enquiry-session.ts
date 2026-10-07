import { requireAttendanceSession } from "@/app/api/_lib/require-attendance-session";
import { isResponse, requireSession } from "@/app/api/_lib/require-session";
import type { EnquiryActor } from "@/src/training-institute/application/enquiry-views";

/** Owner or Teacher. Students and Parents get 403. */
export async function requireEnquiryStaff(): Promise<EnquiryActor | Response> {
  return requireAttendanceSession();
}

/** Owner only: convert, Enquiry Sources, and the monthly summary. */
export async function requireEnquiryOwner(): Promise<EnquiryActor | Response> {
  const session = await requireSession();
  if (isResponse(session)) return session;
  return {
    workspaceId: session.workspaceId,
    userId: session.userId,
    role: "owner",
  };
}

export type IdContext = { params: Promise<{ id: string }> };
