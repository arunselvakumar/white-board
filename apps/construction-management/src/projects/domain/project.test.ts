import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  Project,
  compareProjects,
  projectDetails,
  type ProjectDetailsInput,
} from "./project";
import { PROJECT_ORDER_VALUE_MAX } from "./project-contract-rules";

const NOW = new Date("2026-10-08T00:00:00Z");
const LATER = new Date("2026-10-09T00:00:00Z");

function project(details: Partial<ProjectDetailsInput> = {}) {
  return Project.create({
    id: "p1",
    workspaceId: "company-1",
    details: { name: "Kumari Heights", ...details },
    by: "user-1",
    now: NOW,
  });
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
  return undefined;
}

/** The code and details of the DomainError `run` throws. */
function errorOf(run: () => unknown): { code: string; details: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("Project", () => {
  it("starts Ongoing with only a name", () => {
    expect(project().details).toEqual({
      name: "Kumari Heights",
      status: "ongoing",
      address: null,
      startDate: null,
      endDate: null,
    });
  });

  it("needs a name of at most 120 characters, spaces tidied", () => {
    expect(codeOf(() => project({ name: "   " }))).toBe(
      "PROJECT_NAME_REQUIRED",
    );
    expect(codeOf(() => project({ name: "x".repeat(121) }))).toBe(
      "PROJECT_NAME_TOO_LONG",
    );
    expect(project({ name: "  Kumari   Heights " }).name).toBe(
      "Kumari Heights",
    );
    expect(project({ name: "x".repeat(120) }).name).toHaveLength(120);
  });

  it("keeps an address of at most 500 characters; blank is none", () => {
    expect(
      project({ address: "  Plot 12, Vadasery, Nagercoil " }).address,
    ).toBe("Plot 12, Vadasery, Nagercoil");
    expect(project({ address: "   " }).address).toBeNull();
    expect(codeOf(() => project({ address: "a".repeat(501) }))).toBe(
      "PROJECT_ADDRESS_TOO_LONG",
    );
  });

  it("accepts only the four statuses", () => {
    expect(project({ status: "on_hold" }).status).toBe("on_hold");
    expect(codeOf(() => project({ status: "cancelled" }))).toBe(
      "PROJECT_STATUS_INVALID",
    );
  });

  it("refuses an end date before the start date", () => {
    expect(
      codeOf(() =>
        projectDetails({
          name: "A",
          startDate: "2026-10-08",
          endDate: "2026-10-07",
        }),
      ),
    ).toBe("PROJECT_DATES_INVALID");
    expect(
      projectDetails({
        name: "A",
        startDate: "2026-10-08",
        endDate: "2026-10-08",
      }),
    ).toMatchObject({ startDate: "2026-10-08", endDate: "2026-10-08" });
    // Either date alone is fine.
    expect(projectDetails({ name: "A", endDate: "2027-03-31" }).endDate).toBe(
      "2027-03-31",
    );
  });

  it("refuses a date that is not a calendar date", () => {
    expect(codeOf(() => project({ startDate: "2026-02-30" }))).toBe(
      "PROJECT_DATE_INVALID",
    );
    expect(codeOf(() => project({ endDate: "08/10/2026" }))).toBe(
      "PROJECT_DATE_INVALID",
    );
    expect(project({ startDate: "" }).startDate).toBeNull();
  });

  it("updates every field and stamps who and when", () => {
    const item = project();
    item.update(
      {
        name: "Kumari Heights Phase 2",
        status: "completed",
        address: "Vadasery",
        startDate: "2025-04-01",
        endDate: "2026-09-30",
      },
      "user-2",
      LATER,
    );
    expect(item.details).toEqual({
      name: "Kumari Heights Phase 2",
      status: "completed",
      address: "Vadasery",
      startDate: "2025-04-01",
      endDate: "2026-09-30",
    });
    expect(item.updatedBy).toBe("user-2");
    expect(item.updatedAt).toEqual(LATER);
    expect(item.createdAt).toEqual(NOW);
  });

  it("is deleted once", () => {
    const item = project();
    item.delete("user-2", LATER);
    expect(item.deletedAt).toEqual(LATER);
    expect(
      codeOf(() => {
        item.delete("user-2", LATER);
      }),
    ).toBe("PROJECT_NOT_FOUND");
  });

  it("orders by status (Ongoing, Not started, On hold, Completed), then name", () => {
    const items = [
      { status: "completed" as const, name: "Alpha" },
      { status: "ongoing" as const, name: "tower 10" },
      { status: "on_hold" as const, name: "Beta" },
      { status: "ongoing" as const, name: "Tower 9" },
      { status: "not_started" as const, name: "Gamma" },
    ];
    expect(items.sort(compareProjects).map((item) => item.name)).toEqual([
      "Tower 9",
      "tower 10",
      "Gamma",
      "Beta",
      "Alpha",
    ]);
  });
});

const FULL_CONTRACT = {
  clientName: "  Sri   Balaji Developers ",
  clientPhone: "98431 22110",
  tenderRef: " SBD/T/2026/031 ",
  quotationNo: "SBD/Q/2026/114",
  quotationDate: "2026-02-10",
  loaNo: "SBD/LOA/2026/022",
  loaDate: "2026-03-05",
  clientOrderNo: "SBD/WO/2026/057",
  // A PO may be dated before its quotation: no order between the papers.
  clientOrderDate: "2026-01-20",
  agreementNo: "SBD/AGR/2026/009",
  agreementDate: "2026-03-20",
  orderValue: 4_85_00_000_00,
} satisfies Partial<ProjectDetailsInput>;

describe("Project contract details (CM-413)", () => {
  it("has none on a new Project unless typed", () => {
    const item = project();
    expect(item.contract).toEqual({
      clientName: null,
      clientPhone: null,
      tenderRef: null,
      quotationNo: null,
      quotationDate: null,
      loaNo: null,
      loaDate: null,
      clientOrderNo: null,
      clientOrderDate: null,
      agreementNo: null,
      agreementDate: null,
      orderValue: null,
    });
    expect(item.customFields).toEqual([]);
  });

  it("tidies the text, stores the phone as E.164 and keeps dates and paise", () => {
    expect(project(FULL_CONTRACT).contract).toEqual({
      clientName: "Sri Balaji Developers",
      clientPhone: "+919843122110",
      tenderRef: "SBD/T/2026/031",
      quotationNo: "SBD/Q/2026/114",
      quotationDate: "2026-02-10",
      loaNo: "SBD/LOA/2026/022",
      loaDate: "2026-03-05",
      clientOrderNo: "SBD/WO/2026/057",
      clientOrderDate: "2026-01-20",
      agreementNo: "SBD/AGR/2026/009",
      agreementDate: "2026-03-20",
      orderValue: 4_85_00_000_00,
    });
    expect(
      project({ clientPhone: "+91-98431-22110" }).contract.clientPhone,
    ).toBe("+919843122110");
    expect(project({ clientName: "   ", loaNo: "" }).contract).toMatchObject({
      clientName: null,
      loaNo: null,
    });
  });

  it("limits the client name and the reference numbers", () => {
    expect(
      project({ clientName: "x".repeat(120) }).contract.clientName,
    ).toHaveLength(120);
    expect(codeOf(() => project({ clientName: "x".repeat(121) }))).toBe(
      "PROJECT_CLIENT_NAME_TOO_LONG",
    );
    expect(
      project({ agreementNo: "x".repeat(60) }).contract.agreementNo,
    ).toHaveLength(60);
    for (const field of [
      "tenderRef",
      "quotationNo",
      "loaNo",
      "clientOrderNo",
      "agreementNo",
    ] as const)
      expect(errorOf(() => project({ [field]: "x".repeat(61) }))).toEqual({
        code: "PROJECT_REFERENCE_TOO_LONG",
        details: { field },
      });
  });

  it("needs an Indian mobile for the client phone", () => {
    for (const phone of ["12345", "+1 415 555 0100", "58431 22110"])
      expect(codeOf(() => project({ clientPhone: phone }))).toBe(
        "PROJECT_CLIENT_PHONE_INVALID",
      );
  });

  it("names the date field that is not a calendar date", () => {
    for (const field of [
      "quotationDate",
      "loaDate",
      "clientOrderDate",
      "agreementDate",
    ] as const)
      expect(errorOf(() => project({ [field]: "2026-02-30" }))).toEqual({
        code: "PROJECT_DATE_INVALID",
        details: { field },
      });
    expect(project({ loaDate: " " }).contract.loaDate).toBeNull();
  });

  it("takes an order value of 0 to ₹1,000 crore in whole paise", () => {
    expect(project({ orderValue: 0 }).contract.orderValue).toBe(0);
    expect(
      project({ orderValue: PROJECT_ORDER_VALUE_MAX }).contract.orderValue,
    ).toBe(PROJECT_ORDER_VALUE_MAX);
    for (const orderValue of [-1, 1.5, PROJECT_ORDER_VALUE_MAX + 1])
      expect(codeOf(() => project({ orderValue }))).toBe(
        "PROJECT_ORDER_VALUE_INVALID",
      );
  });

  it("keeps what an edit leaves out and clears what it sends as null or blank", () => {
    const item = project({
      ...FULL_CONTRACT,
      customFields: [{ label: "Site engineer", value: "Prabhu Saravanan" }],
    });
    item.update({ name: "Kumari Heights", status: "on_hold" }, "user-2", LATER);
    expect(item.contract).toEqual(project(FULL_CONTRACT).contract);
    expect(item.customFields).toEqual([
      { label: "Site engineer", value: "Prabhu Saravanan" },
    ]);

    item.update(
      {
        name: "Kumari Heights",
        clientName: null,
        clientPhone: "",
        quotationNo: "  ",
        loaDate: null,
        orderValue: null,
        customFields: [],
      },
      "user-2",
      LATER,
    );
    expect(item.contract).toMatchObject({
      clientName: null,
      clientPhone: null,
      quotationNo: null,
      loaDate: null,
      orderValue: null,
      // Left out, so kept.
      tenderRef: "SBD/T/2026/031",
      agreementDate: "2026-03-20",
    });
    expect(item.customFields).toEqual([]);
  });

  it("checks an edit's contract details too", () => {
    const item = project();
    expect(
      errorOf(() => {
        item.update(
          { name: "Kumari Heights", loaNo: "x".repeat(61) },
          "user-2",
          LATER,
        );
      }),
    ).toEqual({
      code: "PROJECT_REFERENCE_TOO_LONG",
      details: { field: "loaNo" },
    });
    expect(item.contract.loaNo).toBeNull();
  });
});

describe("Project custom fields (CM-413)", () => {
  const withFields = (customFields: { label: string; value: string }[]) =>
    project({ customFields });

  it("keeps the order typed, tidies labels and drops empty rows", () => {
    expect(
      withFields([
        { label: "  Site   engineer ", value: " Prabhu Saravanan " },
        { label: "", value: "  " },
        { label: "Client architect", value: "Meenakshi Associates,\nMadurai" },
      ]).customFields,
    ).toEqual([
      { label: "Site engineer", value: "Prabhu Saravanan" },
      { label: "Client architect", value: "Meenakshi Associates,\nMadurai" },
    ]);
  });

  it("needs a label and a value, naming the row as sent", () => {
    expect(
      errorOf(() =>
        withFields([
          { label: "", value: "" },
          { label: " ", value: "Prabhu Saravanan" },
        ]),
      ),
    ).toEqual({
      code: "PROJECT_CUSTOM_FIELD_LABEL_REQUIRED",
      details: { index: 1 },
    });
    expect(
      errorOf(() =>
        withFields([
          { label: "Site engineer", value: "Prabhu Saravanan" },
          { label: "Client architect", value: " " },
        ]),
      ),
    ).toEqual({
      code: "PROJECT_CUSTOM_FIELD_VALUE_REQUIRED",
      details: { index: 1 },
    });
  });

  it("limits a label to 60 characters and a value to 500", () => {
    expect(
      withFields([{ label: "x".repeat(60), value: "y".repeat(500) }])
        .customFields,
    ).toHaveLength(1);
    expect(
      errorOf(() => withFields([{ label: "x".repeat(61), value: "y" }])),
    ).toEqual({
      code: "PROJECT_CUSTOM_FIELD_TOO_LONG",
      details: { index: 0, field: "label" },
    });
    expect(
      errorOf(() =>
        withFields([
          { label: "Site engineer", value: "Prabhu" },
          { label: "Notes", value: "y".repeat(501) },
        ]),
      ),
    ).toEqual({
      code: "PROJECT_CUSTOM_FIELD_TOO_LONG",
      details: { index: 1, field: "value" },
    });
  });

  it("refuses the later of two labels that differ only in case", () => {
    expect(
      errorOf(() =>
        withFields([
          { label: "Site engineer", value: "Prabhu Saravanan" },
          { label: "Client architect", value: "Meenakshi Associates" },
          { label: "SITE  Engineer", value: "Karthik" },
        ]),
      ),
    ).toEqual({
      code: "PROJECT_CUSTOM_FIELD_DUPLICATE",
      details: { index: 2 },
    });
  });

  it("allows 20 fields, not counting empty rows, and no more", () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        label: `Field ${String(index + 1)}`,
        value: "Yes",
      }));
    expect(
      withFields([...rows(20), { label: "", value: "" }]).customFields,
    ).toHaveLength(20);
    expect(errorOf(() => withFields(rows(21)))).toEqual({
      code: "PROJECT_CUSTOM_FIELDS_LIMIT",
      details: { max: 20 },
    });
  });
});
