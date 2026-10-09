import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import type { PartyType } from "@/src/labour/domain/ledger";
import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  paymentFinancial,
  paymentMenu,
  permissionDenied,
  wagePaymentHandlers as handlers,
} from "./handlers";
import {
  ListConstructionLabourWagePaymentsRequestModel,
  RecordConstructionLabourWagePaymentRequestModel,
  toWagePaymentResponse,
  type ListConstructionLabourWagePaymentsResponseModel,
} from "./payment-models";

export const dynamic = "force-dynamic";

const PARTY_TYPES: PartyType[] = ["labour", "vendor"];

/**
 * Recorded payments of a Project, newest recorded first, by party type,
 * party, kind and payment date (CM-216). Labour payments need Labour read
 * on the Project and vendor payments Vendor read; without `partyType` the
 * list holds the types the caller may read. Amounts need Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionLabourWagePaymentsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const scope = { projectId: model.projectId };
    const partyTypes = (
      model.partyType == null ? PARTY_TYPES : [model.partyType]
    ).filter((type) => can(access, paymentMenu(type), "read", scope));
    if (partyTypes.length === 0) return permissionDenied();
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      partyTypes,
      partyId: model.partyId,
      from: model.from,
      to: model.to,
      kind: model.kind,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const financial = new Map(
      partyTypes.map((type) => [
        type,
        paymentFinancial(access, type, model.projectId),
      ]),
    );
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionLabourWagePaymentsResponseModel = {
      items: page.items.map((item) =>
        toWagePaymentResponse(item, financial.get(item.partyType) === true),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      totalAmount: [...financial.values()].every(Boolean)
        ? page.totalAmount
        : null,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Records a payment or an advance to a labourer (Labour create on the
 * Project) or a vendor (Vendor create), posting one negative ledger entry
 * in the same transaction (CM-215). A payment is never edited: cancel it
 * and record it again. The amount may be entered without Financial; it is
 * null in the response.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RecordConstructionLabourWagePaymentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      paymentMenu(model.partyType),
      "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const payment = await handlers.record({
      actor: {
        workspaceId: session.workspaceId,
        userId: session.userId,
        role: session.role,
      },
      partyType: model.partyType,
      partyId: model.partyId,
      projectId: model.projectId,
      paymentDate: model.paymentDate,
      kind: model.kind,
      mode: model.mode,
      amount: model.amount,
      reference: model.reference,
      paidByMemberId: model.paidByMemberId,
      remarks: model.remarks,
    });
    return Response.json(
      toWagePaymentResponse(
        payment,
        paymentFinancial(session.access, model.partyType, model.projectId),
      ),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
