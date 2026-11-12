import { describe, expect, it } from "vitest";

import {
  contactDetails,
  isProspectCompanyVisible,
  manualStageMove,
  prospectCompanyDetails,
  prospectCompanyNameKey,
} from "./prospect-company";

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("Prospect Company details (PRD §3.3)", () => {
  it("tidies the form and takes the state from the GSTIN", () => {
    expect(
      prospectCompanyDetails({
        name: "  Anugraha   Steel  ",
        city: " Coimbatore ",
        pin: "641 004",
        phone: "0422-2345678",
        gstin: "33aapfa0939f1zm",
        website: "anugraha.in",
        email: "",
        source: "tender_notice",
      }),
    ).toEqual({
      name: "Anugraha Steel",
      industry: null,
      address: null,
      city: "Coimbatore",
      stateCode: "33",
      pin: "641004",
      phone: "0422-2345678",
      email: null,
      website: "anugraha.in",
      gstin: "33AAPFA0939F1ZM",
      source: "tender_notice",
      remarks: null,
    });
  });

  it("needs a name", () => {
    expect(code(() => prospectCompanyDetails({ name: "  " }))).toBe(
      "PROSPECT_COMPANY_NAME_REQUIRED",
    );
  });

  it("refuses a bad GSTIN, PIN, phone, website or email", () => {
    expect(
      code(() =>
        prospectCompanyDetails({ name: "A", gstin: "33AAPFA0939F1ZW" }),
      ),
    ).toBe("PROSPECT_COMPANY_GSTIN_INVALID");
    expect(code(() => prospectCompanyDetails({ name: "A", pin: "6410" }))).toBe(
      "PROSPECT_COMPANY_PIN_INVALID",
    );
    expect(
      code(() => prospectCompanyDetails({ name: "A", phone: "call me" })),
    ).toBe("PROSPECT_COMPANY_PHONE_INVALID");
    expect(
      code(() => prospectCompanyDetails({ name: "A", website: "not a site" })),
    ).toBe("PROSPECT_COMPANY_WEBSITE_INVALID");
    expect(
      code(() => prospectCompanyDetails({ name: "A", email: "a@b" })),
    ).toBe("PROSPECT_COMPANY_EMAIL_INVALID");
  });

  it("refuses a state other than the GSTIN's", () => {
    expect(
      code(() =>
        prospectCompanyDetails({
          name: "A",
          gstin: "33AAPFA0939F1ZM",
          stateCode: "29",
        }),
      ),
    ).toBe("PROSPECT_COMPANY_GSTIN_STATE_MISMATCH");
    expect(
      code(() => prospectCompanyDetails({ name: "A", stateCode: "99" })),
    ).toBe("PROSPECT_COMPANY_STATE_INVALID");
  });

  it("compares names ignoring case and spacing", () => {
    expect(prospectCompanyNameKey("  Sri  Balaji BUILDERS ")).toBe(
      prospectCompanyNameKey("sri balaji builders"),
    );
  });
});

describe("Contact details", () => {
  it("normalises the mobile and needs a name", () => {
    expect(
      contactDetails({ name: " Ravi  Kumar ", mobile: "98765 43210" }),
    ).toEqual({
      name: "Ravi Kumar",
      jobTitle: null,
      mobile: "+919876543210",
      email: null,
      remarks: null,
    });
    expect(code(() => contactDetails({ name: "" }))).toBe(
      "CONTACT_NAME_REQUIRED",
    );
    expect(code(() => contactDetails({ name: "R", mobile: "12" }))).toBe(
      "CONTACT_MOBILE_INVALID",
    );
  });
});

describe("Stage moved by hand (ADR CM-0040 §11)", () => {
  it("moves to any later Stage, in any order", () => {
    expect(manualStageMove("new", { stage: "quotation_sent" })).toEqual({
      stage: "quotation_sent",
      lostReason: null,
      lostReasonText: null,
    });
    expect(manualStageMove("won", { stage: "negotiation" }).stage).toBe(
      "negotiation",
    );
  });

  it("leaves New and Contacted to the system", () => {
    expect(code(() => manualStageMove("won", { stage: "contacted" }))).toBe(
      "STAGE_NOT_MANUAL",
    );
    expect(code(() => manualStageMove("won", { stage: "new" }))).toBe(
      "STAGE_NOT_MANUAL",
    );
  });

  it("refuses the Stage the company is at", () => {
    expect(code(() => manualStageMove("won", { stage: "won" }))).toBe(
      "STAGE_UNCHANGED",
    );
  });

  it("needs a Lost Reason, and words for Other", () => {
    expect(code(() => manualStageMove("negotiation", { stage: "lost" }))).toBe(
      "LOST_REASON_REQUIRED",
    );
    expect(
      code(() =>
        manualStageMove("negotiation", { stage: "lost", lostReason: "other" }),
      ),
    ).toBe("LOST_REASON_TEXT_REQUIRED");
    expect(
      manualStageMove("negotiation", {
        stage: "lost",
        lostReason: "other",
        lostReasonText: " Project shelved ",
      }),
    ).toEqual({
      stage: "lost",
      lostReason: "other",
      lostReasonText: "Project shelved",
    });
    // Words are kept only for Other.
    expect(
      manualStageMove("negotiation", {
        stage: "lost",
        lostReason: "price",
        lostReasonText: "Too high",
      }).lostReasonText,
    ).toBeNull();
  });
});

describe("Who sees a Prospect Company (ADR CM-0040 §5)", () => {
  const company = { createdBy: "user-1", assignedMemberId: "member-2" };

  it("shows every company with View all", () => {
    expect(isProspectCompanyVisible(company, null)).toBe(true);
  });

  it("shows the creator and the assigned person, and no one else", () => {
    expect(
      isProspectCompanyVisible(company, { userId: "user-1", memberId: null }),
    ).toBe(true);
    expect(
      isProspectCompanyVisible(company, {
        userId: "user-9",
        memberId: "member-2",
      }),
    ).toBe(true);
    expect(
      isProspectCompanyVisible(company, {
        userId: "user-9",
        memberId: "member-9",
      }),
    ).toBe(false);
    expect(
      isProspectCompanyVisible(
        { createdBy: "user-1", assignedMemberId: null },
        { userId: "user-9", memberId: null },
      ),
    ).toBe(false);
  });
});
