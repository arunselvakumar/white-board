import type { ApiClient } from "./ApiClient";
import { unique } from "./session";

const COMPANIES = "/api/construction/marketing/companies";

/**
 * A Prospect Company of the Active Company (ADR CM-0040), added by whoever
 * the client is signed in as, so it is theirs.
 */
export async function createProspectCompany(
  api: ApiClient,
  input: {
    name?: string;
    city?: string;
    primaryContact?: { name: string; mobile?: string };
  } = {},
): Promise<{ id: string; name: string; contactIds: string[] }> {
  const name = input.name ?? unique("Kaveri Steel");
  const created = await api.post<{
    id: string;
    name: string;
    contacts: { id: string }[];
  }>(COMPANIES, {
    name,
    city: input.city ?? "Coimbatore",
    primaryContact: input.primaryContact ?? null,
  });
  return {
    id: created.id,
    name: created.name,
    contactIds: created.contacts.map((contact) => contact.id),
  };
}

const VISITS = "/api/construction/marketing/visits";

/**
 * A Visit to a Prospect Company, planned (tomorrow unless `visitAt`) or
 * logged as completed an hour ago with the company's Contacts.
 */
export async function createVisit(
  api: ApiClient,
  input: {
    prospectCompanyId: string;
    status?: "planned" | "completed";
    visitAt?: Date;
    visitorIds?: string[];
    contactIds?: string[];
    discussion?: string;
  },
): Promise<{ id: string; number: string; updatedAt: string }> {
  const completed = input.status === "completed";
  const visitAt =
    input.visitAt ??
    new Date(Date.now() + (completed ? -1 : 24) * 60 * 60 * 1000);
  return api.post<{ id: string; number: string; updatedAt: string }>(VISITS, {
    status: input.status ?? "planned",
    prospectCompanyId: input.prospectCompanyId,
    visitAt: visitAt.toISOString(),
    purpose: "introduction",
    ...(input.visitorIds == null ? {} : { visitorIds: input.visitorIds }),
    ...(input.contactIds == null ? {} : { contactIds: input.contactIds }),
    ...(completed
      ? { discussion: input.discussion ?? "Talked about their new shed." }
      : {}),
  });
}

const FOLLOW_UPS = "/api/construction/marketing/follow-ups";

/** A Follow-up on a Prospect Company, owned by whoever the client is. */
export async function createFollowUp(
  api: ApiClient,
  input: {
    prospectCompanyId: string;
    dueDate: string;
    type?: "call" | "visit" | "email" | "send_quotation" | "other";
    note?: string;
    visitId?: string;
  },
): Promise<{ id: string; updatedAt: string }> {
  return api.post<{ id: string; updatedAt: string }>(FOLLOW_UPS, {
    prospectCompanyId: input.prospectCompanyId,
    dueDate: input.dueDate,
    type: input.type ?? "call",
    note: input.note ?? null,
    visitId: input.visitId ?? null,
  });
}
