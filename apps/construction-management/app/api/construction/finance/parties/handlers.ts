import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import {
  requireAccess,
  requireAnyAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { partyFinance } from "@/src/composition/party-finance";
import { PARTIES_MENU } from "@/src/finance/application/party-common";
import type { PartyType } from "@/src/finance/domain/ledger";
import { placeFromInput, type PartyPlace } from "@/src/finance/domain/party";
import type { Flag } from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

export { PARTIES_MENU };

/** One party money engine for every route (CM-705, CM-706, CM-708). */
export const finance = partyFinance();

function storeDenied(): Response {
  return jsonError(
    StatusCodes.FORBIDDEN,
    "PERMISSION_DENIED",
    "Only the Owner records a Store's supplier invoices and payments.",
  );
}

/**
 * The Session plus `flag` on Parties at a place: the Project's Permission
 * Matrix cell, or the Owner alone for a Store (ADR CM-0017 §14).
 */
export async function requirePlaceAccess(
  request: Request,
  flag: Flag,
  place: PartyPlace,
): Promise<AccessSession | Response> {
  const session = await requireAccess(
    request,
    PARTIES_MENU,
    flag,
    place.kind === "project" ? { projectId: place.id } : {},
  );
  if (isResponse(session)) return session;
  if (place.kind === "store" && session.role !== "owner") return storeDenied();
  return session;
}

/** `requirePlaceAccess` for an action more than one flag allows. */
export async function requirePlaceAnyAccess(
  request: Request,
  flags: readonly [Flag, ...Flag[]],
  place: PartyPlace,
): Promise<AccessSession | Response> {
  const session = await requireAnyAccess(
    request,
    PARTIES_MENU,
    flags,
    place.kind === "project" ? { projectId: place.id } : {},
  );
  if (isResponse(session)) return session;
  if (place.kind === "store" && session.role !== "owner") return storeDenied();
  return session;
}

/**
 * The place a collection request is for, read before the rest of the
 * request is validated (access first). A Store needs a Supplier.
 */
export function requestPlace(
  raw: unknown,
  partyType: PartyType = "supplier",
): PartyPlace {
  const value = (raw ?? {}) as { projectId?: unknown; storeId?: unknown };
  const uuid = (item: unknown) =>
    typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item) ? item : null;
  const projectId = uuid(value.projectId);
  const storeId = uuid(value.storeId);
  if (value.projectId != null && projectId == null)
    throw new DomainError("VALIDATION_ERROR", "projectId is not a valid id.", {
      details: { field: "projectId" },
    });
  if (value.storeId != null && storeId == null)
    throw new DomainError("VALIDATION_ERROR", "storeId is not a valid id.", {
      details: { field: "storeId" },
    });
  return placeFromInput(partyType, { projectId, storeId });
}

export function requestPartyType(raw: unknown): PartyType {
  const value = (raw ?? {}) as { partyType?: unknown };
  return value.partyType === "contractor" ||
    value.partyType === "other_party" ||
    value.partyType === "client"
    ? value.partyType
    : "supplier";
}

/**
 * The Session plus `flag` on the place of one document: it is loaded
 * first (404 for another Company's or a deleted one), then checked.
 */
export async function requireDocumentAccess<T extends { place: PartyPlace }>(
  request: Request,
  flag: Flag,
  load: (workspaceId: string) => Promise<T>,
): Promise<(AccessSession & { target: T }) | Response> {
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  const target = await load(session.workspaceId);
  const access = await requirePlaceAccess(request, flag, target.place);
  if (isResponse(access)) return access;
  return { ...access, target };
}

/** List paging: cursors of the first and last item, as M5/M6 lists do. */
export function cursors(
  page: {
    items: readonly { id: string; createdAt: Date }[];
    hasMore: boolean;
  },
  model: { after?: string; before?: string },
): { nextCursor: string | null; prevCursor: string | null } {
  const first = page.items[0];
  const last = page.items.at(-1);
  const backwards = model.before != null;
  const moreAfter = backwards || page.hasMore;
  const moreBefore = backwards ? page.hasMore : model.after != null;
  return {
    nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
    prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
  };
}

export function pageParams(model: {
  limit: number;
  after?: string;
  before?: string;
}) {
  return {
    limit: model.limit,
    after: model.after == null ? undefined : decodeListCursor(model.after),
    before: model.before == null ? undefined : decodeListCursor(model.before),
  };
}
