import type { StaffRole } from "../domain/staff";

/** A Staff member. `joinedOn` is YYYY-MM-DD; `invitedAt` is an ISO instant. */
export type StaffView = {
  id: string;
  centreId: string;
  name: string;
  role: StaffRole;
  status: "active" | "inactive";
  phone: string | null;
  email: string | null;
  designation: string | null;
  joinedOn: string | null;
  /** When the last invitation to sign in was sent; null if none was. */
  invitedAt: string | null;
  /** Centre Heads and Teachers sign in; helpers do not. */
  canSignIn: boolean;
  /** Classrooms this member is Class Teacher of. */
  classrooms: { id: string; name: string }[];
};

export type StaffListView = { items: StaffView[] };

/**
 * - `sent`: a Workspace invitation was emailed.
 * - `already_member`: the email already belongs to a Workspace member, who can sign in now.
 * - `failed`: sending failed; the Staff record was still saved. Try `/invite` again.
 * - `not_sent`: nothing to send (a helper, or no email).
 */
export type StaffInvitationOutcome =
  "sent" | "already_member" | "failed" | "not_sent";

export type StaffInvitationView = {
  staff: StaffView;
  invitation: StaffInvitationOutcome;
};
