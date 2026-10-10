import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteContractor } from "./contractors/[id]/delete/route";
import { POST as createContractor } from "./contractors/route";
import { GET as listAllQuotations } from "./quotations/route";
import { POST as deleteSupplier } from "./suppliers/[id]/delete/route";
import { POST as deleteQuotation } from "./suppliers/[id]/quotations/[quotationId]/delete/route";
import { GET as readQuotation } from "./suppliers/[id]/quotations/[quotationId]/route";
import {
  GET as listQuotations,
  POST as completeQuotation,
} from "./suppliers/[id]/quotations/route";
import { POST as receiveQuotation } from "./suppliers/[id]/quotations/uploads/app/route";
import { POST as startQuotation } from "./suppliers/[id]/quotations/uploads/route";
import { POST as updateSupplier } from "./suppliers/[id]/update/route";
import { POST as createSupplier } from "./suppliers/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const SUPPLIERS = `${BASE}/suppliers`;
const CONTRACTORS = `${BASE}/contractors`;

type Party = {
  id: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  stateName: string | null;
  contactPerson2: string | null;
  mobile2: string | null;
  updatedAt: string;
};

type Quotation = {
  id: string;
  partyKind: string;
  partyId: string;
  partyName: string;
  fileName: string;
  contentType: string;
  bytes: number;
  url: string;
  createdByName: string | null;
};

type Started = {
  key: string;
  upload: { via: "app"; url: string } | { via: "blob" };
};

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

const PDF = new TextEncoder().encode(
  "%PDF-1.7\n%âãÏÓ\nQuotation for TMT bars\n%%EOF",
);
const ZIP = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 8, 0]);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function fileParams(id: string, quotationId: string) {
  return { params: Promise.resolve({ id, quotationId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function supplier(
  company: Company,
  body: Record<string, unknown>,
): Promise<Response> {
  return createSupplier(jsonRequest(SUPPLIERS, company.cookie, body));
}

async function upload(
  company: { cookie: string },
  partyId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<Response> {
  const base = `${SUPPLIERS}/${partyId}/quotations`;
  const started = await startQuotation(
    jsonRequest(`${base}/uploads`, company.cookie, {
      fileName,
      bytes: bytes.byteLength,
    }),
    params(partyId),
  );
  if (started.status !== StatusCodes.CREATED) return started;
  const body = await json<Started>(started);
  if (body.upload.via !== "app") throw new Error("Expected an app upload");
  const sent = await receiveQuotation(
    new Request(`${TEST_ORIGIN}${body.upload.url}`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        cookie: company.cookie,
      },
      body: Uint8Array.from(bytes),
    }),
    params(partyId),
  );
  expect(sent.status).toBe(StatusCodes.NO_CONTENT);
  return completeQuotation(
    jsonRequest(base, company.cookie, { key: body.key, fileName }),
    params(partyId),
  );
}

describe("Party GST state, second contact, usage and quotations (CM-501)", () => {
  it("derives the GST state from the GSTIN, or takes the one picked", async () => {
    const owner = await ownerWithCompany();
    const fromGstin = await supplier(owner, {
      name: "Sri Murugan Traders",
      gstin: "33aabcu9603r1zu",
    });
    expect(fromGstin.status).toBe(StatusCodes.CREATED);
    expect(await json<Party>(fromGstin)).toMatchObject({
      gstin: "33AABCU9603R1ZU",
      stateCode: "33",
      stateName: "Tamil Nadu",
    });

    const mismatch = await supplier(owner, {
      name: "Bengaluru Steels",
      gstin: "33AABCU9603R1ZU",
      stateCode: "29",
    });
    expect(mismatch.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(mismatch)).toBe("GSTIN_STATE_MISMATCH");

    const picked = await supplier(owner, {
      name: "Local Sand Supplier",
      stateCode: "32",
    });
    const local = await json<Party>(picked);
    expect(local).toMatchObject({ stateCode: "32", stateName: "Kerala" });

    const invalid = await supplier(owner, { name: "Nowhere", stateCode: "99" });
    expect(await code(invalid)).toBe("GST_STATE_INVALID");

    // Edit: a GSTIN added later sets the state; clearing both clears it.
    const withGstin = await updateSupplier(
      jsonRequest(`${SUPPLIERS}/${local.id}/update`, owner.cookie, {
        name: "Local Sand Supplier",
        gstin: "33AABCU9603R1ZU",
        expectedUpdatedAt: local.updatedAt,
      }),
      params(local.id),
    );
    const edited = await json<Party>(withGstin);
    expect(edited.stateCode).toBe("33");
    const cleared = await updateSupplier(
      jsonRequest(`${SUPPLIERS}/${local.id}/update`, owner.cookie, {
        name: "Local Sand Supplier",
        gstin: null,
        stateCode: null,
        expectedUpdatedAt: edited.updatedAt,
      }),
      params(local.id),
    );
    expect((await json<Party>(cleared)).stateCode).toBeNull();
  });

  it("gives a Contractor a second contact", async () => {
    const owner = await ownerWithCompany();
    const created = await createContractor(
      jsonRequest(CONTRACTORS, owner.cookie, {
        name: "Velan Constructions",
        contactPerson2: "  Muthu  Kumar ",
        mobile2: "77081 65767",
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    expect(await json<Party>(created)).toMatchObject({
      contactPerson2: "Muthu Kumar",
      mobile2: "+917708165767",
    });
    const bad = await createContractor(
      jsonRequest(CONTRACTORS, owner.cookie, {
        name: "Arasu Builders",
        mobile2: "12345",
      }),
    );
    expect(await code(bad)).toBe("MOBILE_2_INVALID");
    // A Supplier has no second contact: ignored.
    const sup = await supplier(owner, {
      name: "Ramco Dealers",
      contactPerson2: "Ignored",
    });
    expect(await json<Party>(sup)).toMatchObject({ contactPerson2: null });
  });

  it("refuses to delete a Supplier on a Purchase Order or Goods Receipt, a Contractor on a Material Request", async () => {
    const owner = await ownerWithCompany();
    const { id: supplierId } = await json<Party>(
      await supplier(owner, { name: "Kaveri Hardware" }),
    );
    const { id: contractorId } = await json<Party>(
      await createContractor(
        jsonRequest(CONTRACTORS, owner.cookie, { name: "Selvam & Sons" }),
      ),
    );
    // Plain rows in procurement's tables (that context's routes are not under test here).
    await prisma.$executeRaw`
      INSERT INTO construction_procurement.goods_receipts
        (id, workspace_id, number, location_kind, location_id, supplier_id, supplier_name, receipt_date, inventory_date, created_by, updated_by)
      VALUES (${randomUUID()}::uuid, ${owner.workspaceId}, ${`GRN-${randomUUID().slice(0, 6)}`}, 'project', ${randomUUID()}::uuid, ${supplierId}::uuid, 'Kaveri Hardware', '2026-10-01', '2026-10-01', 'test', 'test')
    `;
    const refused = await deleteSupplier(
      jsonRequest(`${SUPPLIERS}/${supplierId}/delete`, owner.cookie, {}),
      params(supplierId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("SUPPLIER_IN_USE");

    await prisma.$executeRaw`
      INSERT INTO construction_procurement.material_requests
        (id, workspace_id, number, project_id, store_id, contractor_id, request_date, created_by, updated_by)
      VALUES (${randomUUID()}::uuid, ${owner.workspaceId}, ${`MR-${randomUUID().slice(0, 6)}`}, ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${contractorId}::uuid, '2026-10-01', 'test', 'test')
    `;
    const contractorRefused = await deleteContractor(
      jsonRequest(`${CONTRACTORS}/${contractorId}/delete`, owner.cookie, {}),
      params(contractorId),
    );
    expect(await code(contractorRefused)).toBe("CONTRACTOR_IN_USE");

    const { id: freeId } = await json<Party>(
      await supplier(owner, { name: "Unused Supplier" }),
    );
    const deleted = await deleteSupplier(
      jsonRequest(`${SUPPLIERS}/${freeId}/delete`, owner.cookie, {}),
      params(freeId),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("uploads, lists, opens and removes quotations, and lists them all on View Quotations", async () => {
    const owner = await ownerWithCompany();
    const party = await json<Party>(
      await supplier(owner, { name: "Sri Murugan Traders" }),
    );
    const added = await upload(owner, party.id, "TMT quote.pdf", PDF);
    expect(added.status).toBe(StatusCodes.CREATED);
    const quotation = await json<Quotation>(added);
    expect(quotation).toMatchObject({
      partyKind: "supplier",
      partyId: party.id,
      partyName: "Sri Murugan Traders",
      fileName: "TMT quote.pdf",
      contentType: "application/pdf",
      bytes: PDF.byteLength,
    });
    const image = await upload(owner, party.id, "rates.png", pngBytes());
    expect(image.status).toBe(StatusCodes.CREATED);

    const zip = await upload(owner, party.id, "rates.zip", ZIP);
    expect(zip.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(zip)).toBe("FILE_TYPE_NOT_ALLOWED");
    const tooBig = await startQuotation(
      jsonRequest(`${SUPPLIERS}/${party.id}/quotations/uploads`, owner.cookie, {
        fileName: "huge.pdf",
        bytes: 10 * 1024 * 1024 + 1,
      }),
      params(party.id),
    );
    expect(await code(tooBig)).toBe("FILE_TOO_LARGE");

    const listed = await json<{ items: Quotation[] }>(
      await listQuotations(
        jsonRequest(`${SUPPLIERS}/${party.id}/quotations`, owner.cookie),
        params(party.id),
      ),
    );
    expect(listed.items.map((item) => item.fileName)).toEqual([
      "rates.png",
      "TMT quote.pdf",
    ]);

    const opened = await readQuotation(
      jsonRequest(`${TEST_ORIGIN}${quotation.url}`, owner.cookie),
      fileParams(party.id, quotation.id),
    );
    expect(opened.status).toBe(StatusCodes.OK);
    expect(opened.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await opened.arrayBuffer())).toEqual(PDF);

    // View Quotations: a member with only that menu sees and opens them.
    const viewer = await memberWith(owner, {
      "masters.quotations": ["read"],
    });
    const all = await listAllQuotations(
      jsonRequest(`${BASE}/quotations?q=murugan`, viewer.cookie),
    );
    expect(all.status).toBe(StatusCodes.OK);
    const page = await json<{ items: Quotation[]; total: number }>(all);
    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ partyName: "Sri Murugan Traders" });
    const byFile = await json<{ total: number }>(
      await listAllQuotations(
        jsonRequest(`${BASE}/quotations?q=TMT`, viewer.cookie),
      ),
    );
    expect(byFile.total).toBe(1);
    const contractorsOnly = await json<{ total: number }>(
      await listAllQuotations(
        jsonRequest(`${BASE}/quotations?partyKind=contractor`, viewer.cookie),
      ),
    );
    expect(contractorsOnly.total).toBe(0);
    const viewerOpens = await readQuotation(
      jsonRequest(`${TEST_ORIGIN}${quotation.url}`, viewer.cookie),
      fileParams(party.id, quotation.id),
    );
    expect(viewerOpens.status).toBe(StatusCodes.OK);
    const viewerUploads = await upload(viewer, party.id, "x.pdf", PDF);
    expect(viewerUploads.status).toBe(StatusCodes.FORBIDDEN);
    const outsider = await memberWith(owner, { "masters.units": ["read"] });
    const refused = await listAllQuotations(
      jsonRequest(`${BASE}/quotations`, outsider.cookie),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    // Another Company sees none of it.
    const other = await ownerWithCompany();
    const foreign = await listQuotations(
      jsonRequest(`${SUPPLIERS}/${party.id}/quotations`, other.cookie),
      params(party.id),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);

    const removed = await deleteQuotation(
      jsonRequest(
        `${SUPPLIERS}/${party.id}/quotations/${quotation.id}/delete`,
        owner.cookie,
        {},
      ),
      fileParams(party.id, quotation.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await readQuotation(
      jsonRequest(`${TEST_ORIGIN}${quotation.url}`, owner.cookie),
      fileParams(party.id, quotation.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: party.id },
      select: { action: true },
    });
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "supplier.quotation_added",
        "supplier.quotation_deleted",
      ]),
    );
    const stored = await prisma.constructionOrganizationStoredFile.findFirst({
      where: { workspaceId: owner.workspaceId, kind: "party_quotation" },
    });
    expect(stored).not.toBeNull();
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, Record<string, unknown>> }>(
      getOpenApi(),
    );
    expect(spec.paths["/api/construction/masters/quotations"]).toHaveProperty(
      "get",
    );
    for (const kind of ["suppliers", "contractors"]) {
      const base = `/api/construction/masters/${kind}/{id}/quotations`;
      expect(spec.paths[base]).toHaveProperty("get");
      expect(spec.paths[`${base}/uploads`]).toHaveProperty("post");
      expect(spec.paths[`${base}/{quotationId}/delete`]).toHaveProperty("post");
    }
  });
});
