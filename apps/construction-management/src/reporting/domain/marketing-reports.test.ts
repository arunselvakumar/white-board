import { describe, expect, it } from "vitest";

import {
  buildCompanyPipeline,
  buildPersonSummary,
  buildVisitRegister,
  type PipelineRow,
  type VisitRegisterRow,
} from "./marketing-reports";

const VISIT: VisitRegisterRow = {
  number: "MV-0002",
  when: "12 Nov 2026, 10:30",
  company: "Kaveri Steel",
  city: "Coimbatore",
  contacts: "Lakshmi",
  visitedBy: "Ravi, Asha",
  purpose: "Quotation",
  status: "Completed",
  discussion: "Needs a 40 m PEB shed. Outcome: Quote by Friday",
  interest: "Hot",
  value: 2_500_000,
  nextFollowUp: "2026-11-20",
  checkedIn: true,
};

describe("the Marketing report layouts (ADR CM-0040 §13)", () => {
  it("lays out the Visit register with a count by status", () => {
    const body = buildVisitRegister({
      visits: [VISIT, { ...VISIT, number: "MV-0001", status: "Missed" }],
      own: true,
      filters: ["Purpose: Quotation."],
    });
    const [visits, byStatus] = body.tables;
    expect(visits?.columns.map((col) => col.label)).toEqual([
      "Visit No.",
      "Date and time",
      "Prospect Company",
      "City",
      "Contacts met",
      "Visited by",
      "Purpose",
      "Status",
      "Discussion / outcome",
      "Interest",
      "Approx. value",
      "Next Follow-up",
      "Checked in",
    ]);
    // Whole rupees go into the money column as paise.
    expect(visits?.rows[0]).toEqual([
      "MV-0002",
      "12 Nov 2026, 10:30",
      "Kaveri Steel",
      "Coimbatore",
      "Lakshmi",
      "Ravi, Asha",
      "Quotation",
      "Completed",
      "Needs a 40 m PEB shed. Outcome: Quote by Friday",
      "Hot",
      250_000_000,
      "20 Nov 2026",
      "Yes",
    ]);
    expect(visits?.totals?.slice(0, 2)).toEqual(["Total", "2 Visits"]);
    expect(byStatus?.rows).toEqual([
      ["Planned", 0],
      ["Missed", 1],
      ["Completed", 1],
      ["Cancelled", 0],
    ]);
    expect(body.notes).toContain("Purpose: Quotation.");
    expect(body.notes.join(" ")).toContain("you do not have View all");
  });

  it("totals the summary but not the targets", () => {
    const person = {
      active: true,
      target: 10,
      completed: 4,
      missed: 1,
      newCompanies: 2,
      followUpsDone: 3,
      followUpsOverdue: 1,
      won: 1,
    };
    const body = buildPersonSummary({
      people: [
        { ...person, name: "Ravi" },
        { ...person, name: "Asha", active: false, target: null },
      ],
      own: false,
    });
    const [table] = body.tables;
    expect(table?.rows[1]).toEqual(["Asha", "No", null, 4, 1, 2, 3, 1, 1]);
    expect(table?.totals).toEqual(["Total", null, null, 8, 2, 4, 6, 2, 2]);
    expect(body.notes.join(" ")).not.toContain("your own row");
  });

  it("lays out the pipeline with the count and value by Stage", () => {
    const row: PipelineRow = {
      company: "Kaveri Steel",
      stage: "Quotation sent",
      assignedTo: "Ravi",
      city: "Coimbatore",
      lastVisit: "2026-11-12",
      nextFollowUp: null,
      value: 2_500_000,
    };
    const body = buildCompanyPipeline({
      companies: [
        row,
        { ...row, company: "Pandian Mills", value: null },
        { ...row, company: "Sri Ram Foundry", stage: "Won", value: 1_000 },
      ],
      stages: ["Quotation sent", "Won"],
      own: false,
      filters: [],
    });
    const [companies, byStage] = body.tables;
    expect(companies?.rows[0]).toEqual([
      "Kaveri Steel",
      "Quotation sent",
      "Ravi",
      "Coimbatore",
      "12 Nov 2026",
      null,
      250_000_000,
    ]);
    expect(companies?.totals).toEqual([
      "Total",
      "3 companies",
      null,
      null,
      null,
      null,
      250_100_000,
    ]);
    expect(byStage?.rows).toEqual([
      ["Quotation sent", 2, 250_000_000],
      ["Won", 1, 100_000],
    ]);
  });
});
