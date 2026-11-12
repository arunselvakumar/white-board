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
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Kaveri Steel");
  const created = await api.post<{ id: string; name: string }>(COMPANIES, {
    name,
    city: input.city ?? "Coimbatore",
    primaryContact: input.primaryContact ?? null,
  });
  return { id: created.id, name: created.name };
}
