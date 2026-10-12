import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs, newCompany } from "@/test/companies";

import { POST as updateContractor } from "./[id]/update/route";
import { POST as createContractor } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/masters/contractors";

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type Contractor = {
  id: string;
  updatedAt: string;
  tds: {
    applicable: boolean;
    lowerRate: string | null;
    note: string | null;
    payeeKind: string;
    payeeLabel: string;
  } | null;
};

describe("Contractor TDS settings (CM-706)", () => {
  it("keeps TDS settings with the payee kind from the PAN", async () => {
    const company = await newCompany();
    actAs({
      userId: company.ownerId,
      workspaceId: company.workspaceId,
      role: "owner",
    });
    const plain = await createContractor(post("", { name: "Velan Works" }));
    expect(plain.status).toBe(StatusCodes.CREATED);
    expect(((await plain.json()) as Contractor).tds).toEqual({
      applicable: true,
      lowerRate: null,
      note: null,
      payeeKind: "no_pan",
      payeeLabel: "No PAN — 20%",
    });

    const invalid = await createContractor(
      post("", { name: "Murugan Works", tdsLowerRate: "120" }),
    );
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(((await invalid.json()) as { code: string }).code).toBe(
      "TDS_LOWER_RATE_INVALID",
    );

    const created = await createContractor(
      post("", {
        name: "Murugan Works",
        pan: "ABCPK1234F",
        tdsApplicable: true,
        tdsLowerRate: "0.5",
        tdsNote: "197 certificate",
      }),
    );
    const contractor = (await created.json()) as Contractor;
    expect(contractor.tds).toEqual({
      applicable: true,
      lowerRate: "0.50",
      note: "197 certificate",
      payeeKind: "individual_huf",
      payeeLabel: "Individual / HUF — 1%",
    });

    // An edit that leaves the settings out keeps them.
    const kept = await updateContractor(
      post(`/${contractor.id}/update`, {
        name: "Murugan Works",
        pan: "ABCFK1234F",
        expectedUpdatedAt: contractor.updatedAt,
      }),
      { params: Promise.resolve({ id: contractor.id }) },
    );
    expect(kept.status).toBe(StatusCodes.OK);
    const after = (await kept.json()) as Contractor;
    expect(after.tds).toMatchObject({
      lowerRate: "0.50",
      note: "197 certificate",
      payeeKind: "other",
    });

    const off = await updateContractor(
      post(`/${contractor.id}/update`, {
        name: "Murugan Works",
        tdsApplicable: false,
        tdsLowerRate: null,
        tdsNote: null,
        expectedUpdatedAt: after.updatedAt,
      }),
      { params: Promise.resolve({ id: contractor.id }) },
    );
    expect(((await off.json()) as Contractor).tds).toMatchObject({
      applicable: false,
      lowerRate: null,
      payeeKind: "no_pan",
    });
  });
});
